-- HCN-CARE-MASTER-001/002: shared, editable patient healthcare directory.
-- Additive migration. Existing patient_care_providers records and clinical RPCs are preserved.
ALTER TABLE public.patient_care_providers
  ADD COLUMN IF NOT EXISTS alternate_phone text,
  ADD COLUMN IF NOT EXISTS practice_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS is_preferred_hospital boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- No client-side UPDATE privilege is granted: all writes go through the
-- authenticated, version-checked and patient-scoped RPC below.
CREATE UNIQUE INDEX IF NOT EXISTS hcn_one_preferred_hospital_per_patient
  ON public.patient_care_providers (patient_id)
  WHERE (is_active AND is_preferred_hospital);

CREATE TABLE IF NOT EXISTS public.hcn_patient_contact_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  actor_user_id uuid,
  action_type text NOT NULL CHECK (action_type IN ('created','updated')),
  old_value jsonb,
  new_value jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hcn_patient_contact_history_patient_idx
  ON public.hcn_patient_contact_history(patient_id,occurred_at DESC);
ALTER TABLE public.hcn_patient_contact_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_patient_contact_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hcn_patient_contact_history TO authenticated;
GRANT ALL ON public.hcn_patient_contact_history TO service_role;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='patient_care_providers'
      AND policyname='HCN active directors read patient healthcare contacts'
  ) THEN
    CREATE POLICY "HCN active directors read patient healthcare contacts"
    ON public.patient_care_providers FOR SELECT TO authenticated
    USING (public.is_org_director_for_patient((select auth.uid()),patient_id));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='hcn_patient_contact_history'
      AND policyname='HCN patient contacts history authorized read'
  ) THEN
    CREATE POLICY "HCN patient contacts history authorized read"
    ON public.hcn_patient_contact_history FOR SELECT TO authenticated
    USING (
      public.has_patient_access(patient_id)
      OR public.is_org_director_for_patient((select auth.uid()),patient_id)
    );
  END IF;
END;
$policy$;

CREATE OR REPLACE FUNCTION public.hcn_audit_patient_contact()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.hcn_patient_contact_history
      (patient_id,provider_id,actor_user_id,action_type,old_value,new_value)
    VALUES
      (NEW.patient_id,NEW.id,coalesce(auth.uid(),NEW.author_id),'created',NULL,to_jsonb(NEW));
  ELSIF TG_OP='UPDATE' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    INSERT INTO public.hcn_patient_contact_history
      (patient_id,provider_id,actor_user_id,action_type,old_value,new_value)
    VALUES
      (NEW.patient_id,NEW.id,coalesce(auth.uid(),NEW.updated_by),'updated',to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_audit_patient_contact() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS hcn_patient_contact_audit ON public.patient_care_providers;
CREATE TRIGGER hcn_patient_contact_audit
  AFTER INSERT OR UPDATE ON public.patient_care_providers
  FOR EACH ROW EXECUTE FUNCTION public.hcn_audit_patient_contact();

CREATE OR REPLACE FUNCTION public.hcn_save_patient_contact(
  p_patient_id uuid,
  p_provider_id uuid DEFAULT NULL,
  p_provider_name text DEFAULT NULL,
  p_provider_role text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_alternate_phone text DEFAULT NULL,
  p_practice_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_preferred_contact_method text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_preferred_hospital boolean DEFAULT false,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.patient_care_providers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_existing public.patient_care_providers;
  v_result public.patient_care_providers;
  v_source text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT (
    public.has_patient_access(p_patient_id)
    OR public.is_org_director_for_patient(v_actor,p_patient_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_provider_name,''))) NOT BETWEEN 1 AND 150
     OR length(btrim(coalesce(p_provider_role,''))) NOT BETWEEN 1 AND 100
     OR length(coalesce(p_phone,''))>40
     OR length(coalesce(p_email,''))>254
     OR length(coalesce(p_alternate_phone,''))>40
     OR length(coalesce(p_practice_name,''))>200
     OR length(coalesce(p_address,''))>500
     OR length(coalesce(p_preferred_contact_method,''))>100
     OR length(coalesce(p_notes,''))>1000
  THEN
    RAISE EXCEPTION 'Healthcare contact fields are missing or exceed permitted lengths';
  END IF;
  IF p_is_preferred_hospital AND btrim(lower(p_provider_role)) NOT LIKE '%hospital%'
  THEN
    RAISE EXCEPTION 'Only a hospital contact may be marked preferred';
  END IF;
  -- Never infer verification from the identity of an editor.
  -- Reported changes remain unverified until an independent verification workflow.
  v_source := CASE
    WHEN public.is_professional_staff_for_patient(p_patient_id) THEN 'professional_observation'
    WHEN v_actor=p_patient_id OR EXISTS (
      SELECT 1 FROM public.patient_representatives r
      WHERE r.patient_id=p_patient_id AND r.representative_user_id=v_actor
        AND r.status='active'
    ) THEN 'unknown'
    ELSE 'caregiver_report'
  END;

  IF p_provider_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.patient_care_providers
    WHERE id=p_provider_id AND patient_id=p_patient_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Healthcare contact not found for this patient';
    END IF;
    IF p_expected_version IS NULL OR p_expected_version <> v_existing.version THEN
      RAISE EXCEPTION 'This contact changed since you opened it. Refresh and try again.'
        USING ERRCODE='40001';
    END IF;
  END IF;

  IF p_is_preferred_hospital THEN
    -- Cleared rows are independently recorded by the history trigger.
    UPDATE public.patient_care_providers
       SET is_preferred_hospital=false, updated_at=now(),
           updated_by=v_actor, version=version+1
     WHERE patient_id=p_patient_id AND is_active AND is_preferred_hospital
       AND (p_provider_id IS NULL OR id<>p_provider_id);
  END IF;

  IF p_provider_id IS NULL THEN
    INSERT INTO public.patient_care_providers
      (patient_id,provider_name,provider_role,phone,email,alternate_phone,
       practice_name,address,preferred_contact_method,notes,is_preferred_hospital,
       source,author_id,updated_by,verification_status)
    VALUES
      (p_patient_id,btrim(p_provider_name),btrim(p_provider_role),nullif(btrim(p_phone),''),
       nullif(btrim(p_email),''),nullif(btrim(p_alternate_phone),''),
       nullif(btrim(p_practice_name),''),nullif(btrim(p_address),''),
       nullif(btrim(p_preferred_contact_method),''),nullif(btrim(p_notes),''),
       p_is_preferred_hospital,v_source,v_actor,v_actor,'unverified')
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.patient_care_providers
       SET provider_name=btrim(p_provider_name),provider_role=btrim(p_provider_role),
           phone=nullif(btrim(p_phone),''),email=nullif(btrim(p_email),''),
           alternate_phone=nullif(btrim(p_alternate_phone),''),
           practice_name=nullif(btrim(p_practice_name),''),
           address=nullif(btrim(p_address),''),
           preferred_contact_method=nullif(btrim(p_preferred_contact_method),''),
           notes=nullif(btrim(p_notes),''),
           is_preferred_hospital=p_is_preferred_hospital,
           source=v_source,verification_status='unverified',
           updated_at=now(),updated_by=v_actor,version=version+1
     WHERE id=p_provider_id AND patient_id=p_patient_id
    RETURNING * INTO v_result;
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_save_patient_contact(uuid,uuid,text,text,text,text,text,text,text,text,text,boolean,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_save_patient_contact(uuid,uuid,text,text,text,text,text,text,text,text,text,boolean,integer)
  TO authenticated,service_role;
