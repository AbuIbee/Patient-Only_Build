-- Append-only wellness provenance. Historical records remain explicitly
-- unattributed; never infer an author from a mutable display string.
ALTER TABLE public.mood_entries
  ADD COLUMN IF NOT EXISTS author_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS author_role text,
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'legacy_unattributed',
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS supersedes_entry_id uuid REFERENCES public.mood_entries(id);

DO $$ BEGIN
  ALTER TABLE public.mood_entries ADD CONSTRAINT hcn_wellness_provenance_v1 CHECK (
    entry_source='legacy_unattributed' AND author_user_id IS NULL AND author_role IS NULL
    OR author_user_id IS NOT NULL AND author_role IS NOT NULL AND author_role IN ('patient','caregiver','medical_professional','therapist','clinical_supervisor')
      AND entry_source IN ('patient_reported','caregiver_observed','professional_observed')
      AND created_at IS NOT NULL
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION hcn_private.stamp_wellness_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); selected_org uuid:=NEW.organization_id;
  actual_role text; actual_source text; candidates uuid[]; prior public.mood_entries;
BEGIN
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'Wellness entries are append-only; create an attributed revision' USING ERRCODE='42501';
  END IF;
  IF actor IS NULL THEN
    -- Trusted seed/maintenance inserts cannot invent a verified human author.
    -- Anonymous/ordinary Data API callers may never use this path.
    IF current_setting('role',true) IN ('anon','authenticated')
      OR NEW.author_user_id IS NOT NULL OR NEW.author_role IS NOT NULL
      OR NEW.entry_source<>'legacy_unattributed' OR NEW.supersedes_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'Authenticated wellness author required' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT hcn_private.current_identity_v1() THEN
    RAISE EXCEPTION 'Current authenticated identity required' USING ERRCODE='42501';
  END IF;
  IF actor=NEW.patient_id THEN
    actual_role:='patient'; actual_source:='patient_reported';
    IF selected_org IS NULL THEN
      SELECT array_agg(c.organization_id) INTO candidates FROM public.covered_patient_memberships c
        JOIN public.organization_licenses l ON l.organization_id=c.organization_id AND l.status='active'
        WHERE c.patient_id=NEW.patient_id AND c.status='active';
      IF cardinality(candidates)>1 THEN RAISE EXCEPTION 'Choose the patient organization explicitly'; END IF;
      selected_org:=candidates[1];
    ELSIF NOT EXISTS (SELECT 1 FROM public.covered_patient_memberships c
      JOIN public.organization_licenses l ON l.organization_id=c.organization_id AND l.status='active'
      WHERE c.organization_id=selected_org AND c.patient_id=NEW.patient_id AND c.status='active') THEN
      RAISE EXCEPTION 'Patient organization is not actively covered' USING ERRCODE='42501';
    END IF;
  ELSE
    IF selected_org IS NULL THEN
      SELECT array_agg(DISTINCT a.organization_id) INTO candidates FROM public.staff_patient_assignments a
        WHERE a.user_id=actor AND a.patient_id=NEW.patient_id
          AND hcn_private.current_staff_patient_v1(a.organization_id,a.patient_id,a.org_role);
      IF cardinality(candidates)>1 THEN RAISE EXCEPTION 'Choose the observation organization explicitly'; END IF;
      selected_org:=candidates[1];
    END IF;
    IF selected_org IS NOT NULL AND hcn_private.current_staff_patient_v1(selected_org,NEW.patient_id,NULL) THEN
      SELECT m.org_role INTO actual_role FROM public.organization_memberships m
        WHERE m.organization_id=selected_org AND m.user_id=actor AND m.status='active';
    ELSIF selected_org IS NULL AND EXISTS (SELECT 1 FROM public.caregiver_patients c
        WHERE c.caregiver_id=actor AND c.patient_id=NEW.patient_id) THEN
      actual_role:='caregiver'; -- separately authorized residential relationship
    ELSE
      RAISE EXCEPTION 'Current patient-specific care authorization required' USING ERRCODE='42501';
    END IF;
    actual_source:=CASE WHEN actual_role='caregiver' THEN 'caregiver_observed' ELSE 'professional_observed' END;
  END IF;
  IF actual_role IS NULL OR actual_role NOT IN ('patient','caregiver','medical_professional','therapist','clinical_supervisor') THEN
    RAISE EXCEPTION 'Current authorized wellness role required' USING ERRCODE='42501';
  END IF;
  IF (NEW.author_user_id IS NOT NULL AND NEW.author_user_id<>actor)
    OR (NEW.author_role IS NOT NULL AND NEW.author_role<>actual_role)
    OR (NEW.entry_source<>'legacy_unattributed' AND NEW.entry_source<>actual_source) THEN
    RAISE EXCEPTION 'Wellness author or source cannot be impersonated' USING ERRCODE='42501';
  END IF;
  IF NEW.supersedes_entry_id IS NOT NULL THEN
    SELECT * INTO prior FROM public.mood_entries WHERE id=NEW.supersedes_entry_id;
    IF NOT FOUND OR prior.patient_id<>NEW.patient_id OR prior.author_user_id IS DISTINCT FROM actor
      OR prior.organization_id IS DISTINCT FROM selected_org OR prior.entry_source<>actual_source THEN
      RAISE EXCEPTION 'Only the original author may append a same-scope revision' USING ERRCODE='42501';
    END IF;
  END IF;
  NEW.author_user_id:=actor; NEW.author_role:=actual_role; NEW.entry_source:=actual_source;
  NEW.organization_id:=selected_org; NEW.created_at:=statement_timestamp(); NEW.timestamp:=NEW.created_at;
  NEW.recorded_by:=CASE WHEN actual_source='patient_reported' THEN 'Patient report'
    WHEN actual_source='caregiver_observed' THEN 'Caregiver observation' ELSE 'Professional observation' END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION hcn_private.stamp_wellness_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS hcn_wellness_provenance_v1 ON public.mood_entries;
CREATE TRIGGER hcn_wellness_provenance_v1 BEFORE INSERT OR UPDATE ON public.mood_entries
FOR EACH ROW EXECUTE FUNCTION hcn_private.stamp_wellness_v1();
COMMENT ON COLUMN public.mood_entries.supersedes_entry_id IS
  'Append-only correction: original remains unchanged; only the original authenticated author can revise.';

-- New organization-associated observations must not inherit the legacy
-- patient-wide staff read path when a patient is covered by two organizations.
-- Patient self-access and separately authorized residential paths are unchanged.
ALTER POLICY "Assigned org staff can view mood entries for their patients"
ON public.mood_entries TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.staff_patient_assignments spa
  WHERE spa.patient_id=mood_entries.patient_id AND spa.user_id=auth.uid()
    AND (mood_entries.organization_id IS NULL OR spa.organization_id=mood_entries.organization_id)
    AND (spa.is_active AND hcn_private.current_staff_patient_v1(spa.organization_id,spa.patient_id,spa.org_role))
));
