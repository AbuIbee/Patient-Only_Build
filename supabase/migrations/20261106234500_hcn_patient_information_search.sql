-- HCN-CARE-INFO-SEARCH-001: patient information dossier (additive, organization scoped).
-- Existing patient, intake, diagnosis, allergy, representative and provider records remain authoritative.
-- New fields only for information not already represented by those records.
CREATE TABLE IF NOT EXISTS public.hcn_patient_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_email text,
  home_phone text,
  mobile_phone text,
  street_address text,
  city text,
  state text,
  postal_code text,
  medical_care_needs text,
  mental_health_needs text,
  physical_care_needs text,
  additional_emergency_name text,
  additional_emergency_relationship text,
  additional_emergency_phone text,
  additional_emergency_mobile text,
  additional_emergency_email text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (patient_id,organization_id)
);
ALTER TABLE public.hcn_patient_information ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_patient_information FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_patient_information TO authenticated;
GRANT ALL ON public.hcn_patient_information TO service_role;

-- Include the distinct home/mobile contact fields without changing representative approval rules.
ALTER TABLE public.patient_representatives
  ADD COLUMN IF NOT EXISTS mobile_phone text,
  ADD COLUMN IF NOT EXISTS home_phone text;

CREATE OR REPLACE FUNCTION public.hcn_can_access_patient_information(p_org_id uuid,p_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $check$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.covered_patient_memberships c
      JOIN public.organization_licenses l ON l.organization_id=c.organization_id
         AND l.status='active' AND l.license_number IS NOT NULL
      WHERE c.organization_id=p_org_id AND c.patient_id=p_patient_id AND c.status='active'
    )
    AND (
      public.is_active_org_director(p_org_id)
      OR EXISTS (
        SELECT 1 FROM public.staff_patient_assignments a
        JOIN public.organization_memberships m ON m.organization_id=a.organization_id
          AND m.user_id=a.user_id AND m.org_role=a.org_role AND m.status='active'
        WHERE a.organization_id=p_org_id AND a.patient_id=p_patient_id
          AND a.user_id=auth.uid() AND a.is_active
      )
      OR auth.uid()=p_patient_id
      OR EXISTS (
        SELECT 1 FROM public.patient_representatives r
        WHERE r.organization_id=p_org_id AND r.patient_id=p_patient_id
          AND r.representative_user_id=auth.uid()
          AND r.status='active' AND r.verification_status='verified'
      )
    );
$check$;
REVOKE ALL ON FUNCTION public.hcn_can_access_patient_information(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_access_patient_information(uuid,uuid) TO authenticated,service_role;

CREATE POLICY "HCN scoped patient information read" ON public.hcn_patient_information
  FOR SELECT TO authenticated USING (
    public.hcn_can_access_patient_information(organization_id,patient_id)
  );

CREATE TABLE IF NOT EXISTS public.hcn_patient_information_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  previous_values jsonb,
  updated_values jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hcn_patient_information_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_patient_information_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hcn_patient_information_audit TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_get_patient_information(p_org_id uuid,p_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE v_patient jsonb; v_intake jsonb; v_extra jsonb; v_reps jsonb; v_providers jsonb;
  v_diagnoses jsonb; v_allergies jsonb; v_careplans jsonb;
BEGIN
  IF NOT public.hcn_can_access_patient_information(p_org_id,p_patient_id) THEN
    RAISE EXCEPTION 'Not authorized for patient information' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(p) INTO v_patient FROM public.patients p WHERE p.id=p_patient_id;
  IF v_patient IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;

  SELECT to_jsonb(i) INTO v_intake FROM public.patient_intake i
    WHERE i.patient_profile_id=p_patient_id
    ORDER BY i.updated_at DESC NULLS LAST, i.created_at DESC LIMIT 1;
  SELECT to_jsonb(e) INTO v_extra FROM public.hcn_patient_information e
    WHERE e.organization_id=p_org_id AND e.patient_id=p_patient_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',concat_ws(' ',r.legal_first_name,r.legal_middle_name,r.legal_last_name),
    'relationship',r.relationship_to_patient,'email',r.contact_email,
    'phone',r.contact_phone,'home_phone',r.home_phone,'mobile_phone',r.mobile_phone,
    'address',r.residential_address,'status',r.status,
    'verification_status',r.verification_status,'authorization_basis',r.authorization_basis,
    'verified_at',r.verified_at
  ) ORDER BY CASE WHEN r.status='active' THEN 0 ELSE 1 END,r.created_at DESC),'[]'::jsonb)
  INTO v_reps FROM public.patient_representatives r
  WHERE r.patient_id=p_patient_id AND r.organization_id=p_org_id
    AND r.status IN ('active','pending_verification');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',c.id,'name',c.provider_name,'role',c.provider_role,
     'phone',c.phone,'alternate_phone',c.alternate_phone,'email',c.email,
     'practice_name',c.practice_name,'address',c.address,
     'is_preferred_hospital',c.is_preferred_hospital,
     'verification_status',c.verification_status,'updated_at',c.updated_at
    ) ORDER BY c.provider_role,c.provider_name),'[]'::jsonb)
  INTO v_providers FROM public.patient_care_providers c
  WHERE c.patient_id=p_patient_id AND c.is_active;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'condition_name',d.condition_name,'diagnosed_date',d.diagnosed_date,
     'notes',d.notes,'source',d.source,'created_at',d.created_at
    ) ORDER BY d.created_at DESC),'[]'::jsonb)
  INTO v_diagnoses FROM public.patient_diagnoses d
  WHERE d.patient_id=p_patient_id AND d.is_active;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'allergen',a.allergen,'reaction',a.reaction,'severity',a.severity,
     'source',a.source,'notes',a.notes,'created_at',a.created_at
    ) ORDER BY a.created_at DESC),'[]'::jsonb)
  INTO v_allergies FROM public.patient_allergies a WHERE a.patient_id=p_patient_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'goals',cp.goals,'permitted_tasks',cp.permitted_tasks,
     'effective_date',cp.effective_date,'version',cp.version
    ) ORDER BY cp.effective_date DESC),'[]'::jsonb)
  INTO v_careplans FROM public.patient_care_plans cp
  WHERE cp.patient_id=p_patient_id AND cp.is_current;

  RETURN jsonb_build_object(
    'patient',v_patient,'intake',coalesce(v_intake,'{}'::jsonb),
    'details',coalesce(v_extra,'{}'::jsonb),'representatives',v_reps,
    'providers',v_providers,'diagnoses',v_diagnoses,'allergies',v_allergies,
    'care_plans',v_careplans,'as_of',now()
  );
END;
$body$;
REVOKE ALL ON FUNCTION public.hcn_get_patient_information(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_patient_information(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_save_patient_information(
  p_org_id uuid,p_patient_id uuid,p_changes jsonb,p_expected_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE v_prior public.hcn_patient_information; v_saved public.hcn_patient_information;
  v_key text; v_value jsonb;
BEGIN
  IF NOT public.hcn_can_access_patient_information(p_org_id,p_patient_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this patient' USING ERRCODE='42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb THEN
    RAISE EXCEPTION 'No patient information changes supplied';
  END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_changes) LOOP
    IF v_key NOT IN ('patient_email','home_phone','mobile_phone','street_address',
      'city','state','postal_code','medical_care_needs','mental_health_needs',
      'physical_care_needs','additional_emergency_name','additional_emergency_relationship',
      'additional_emergency_phone','additional_emergency_mobile','additional_emergency_email')
    THEN RAISE EXCEPTION 'Unknown patient information field';
    END IF;
    IF jsonb_typeof(v_value) NOT IN ('string','null') OR length(v_value #>> '{}')>2000 THEN
      RAISE EXCEPTION 'Invalid patient information field';
    END IF;
  END LOOP;
  -- Prevent concurrent first-writer races as well as stale overwrite on existing rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_patient_id::text,0));
  SELECT * INTO v_prior FROM public.hcn_patient_information
    WHERE organization_id=p_org_id AND patient_id=p_patient_id FOR UPDATE;
  IF FOUND AND (p_expected_version IS NULL OR p_expected_version<>v_prior.version) THEN
    RAISE EXCEPTION 'Patient information changed. Refresh before saving.'
      USING ERRCODE='40001';
  END IF;
  IF NOT FOUND AND p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'Patient information changed. Refresh before saving.'
      USING ERRCODE='40001';
  END IF;

  IF v_prior.id IS NULL THEN
    INSERT INTO public.hcn_patient_information (organization_id,patient_id,updated_by)
    VALUES (p_org_id,p_patient_id,auth.uid()) RETURNING * INTO v_prior;
    -- First write version is still 1; this row will now be filled below.
  END IF;

  UPDATE public.hcn_patient_information
  SET patient_email=CASE WHEN p_changes?'patient_email' THEN nullif(btrim(p_changes->>'patient_email'),'') ELSE patient_email END,
    home_phone=CASE WHEN p_changes?'home_phone' THEN nullif(btrim(p_changes->>'home_phone'),'') ELSE home_phone END,
    mobile_phone=CASE WHEN p_changes?'mobile_phone' THEN nullif(btrim(p_changes->>'mobile_phone'),'') ELSE mobile_phone END,
    street_address=CASE WHEN p_changes?'street_address' THEN nullif(btrim(p_changes->>'street_address'),'') ELSE street_address END,
    city=CASE WHEN p_changes?'city' THEN nullif(btrim(p_changes->>'city'),'') ELSE city END,
    state=CASE WHEN p_changes?'state' THEN nullif(btrim(p_changes->>'state'),'') ELSE state END,
    postal_code=CASE WHEN p_changes?'postal_code' THEN nullif(btrim(p_changes->>'postal_code'),'') ELSE postal_code END,
    medical_care_needs=CASE WHEN p_changes?'medical_care_needs' THEN nullif(btrim(p_changes->>'medical_care_needs'),'') ELSE medical_care_needs END,
    mental_health_needs=CASE WHEN p_changes?'mental_health_needs' THEN nullif(btrim(p_changes->>'mental_health_needs'),'') ELSE mental_health_needs END,
    physical_care_needs=CASE WHEN p_changes?'physical_care_needs' THEN nullif(btrim(p_changes->>'physical_care_needs'),'') ELSE physical_care_needs END,
    additional_emergency_name=CASE WHEN p_changes?'additional_emergency_name' THEN nullif(btrim(p_changes->>'additional_emergency_name'),'') ELSE additional_emergency_name END,
    additional_emergency_relationship=CASE WHEN p_changes?'additional_emergency_relationship' THEN nullif(btrim(p_changes->>'additional_emergency_relationship'),'') ELSE additional_emergency_relationship END,
    additional_emergency_phone=CASE WHEN p_changes?'additional_emergency_phone' THEN nullif(btrim(p_changes->>'additional_emergency_phone'),'') ELSE additional_emergency_phone END,
    additional_emergency_mobile=CASE WHEN p_changes?'additional_emergency_mobile' THEN nullif(btrim(p_changes->>'additional_emergency_mobile'),'') ELSE additional_emergency_mobile END,
    additional_emergency_email=CASE WHEN p_changes?'additional_emergency_email' THEN nullif(btrim(p_changes->>'additional_emergency_email'),'') ELSE additional_emergency_email END,
    version=version+CASE WHEN v_prior.updated_by=auth.uid() AND v_prior.version=1 AND v_prior.updated_at >= now()-interval '2 seconds' AND p_expected_version IS NULL THEN 0 ELSE 1 END,
    updated_by=auth.uid(),updated_at=now()
  WHERE organization_id=p_org_id AND patient_id=p_patient_id RETURNING * INTO v_saved;

  INSERT INTO public.hcn_patient_information_audit
    (organization_id,patient_id,actor_user_id,previous_values,updated_values)
  VALUES (p_org_id,p_patient_id,auth.uid(),to_jsonb(v_prior),to_jsonb(v_saved));
  RETURN to_jsonb(v_saved);
END;
$body$;
REVOKE ALL ON FUNCTION public.hcn_save_patient_information(uuid,uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_save_patient_information(uuid,uuid,jsonb,integer) TO authenticated,service_role;
