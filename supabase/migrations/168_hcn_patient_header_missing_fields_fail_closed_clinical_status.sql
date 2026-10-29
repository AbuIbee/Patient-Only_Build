-- HCN P0 patient header: staging lacked column subset of legacy migration 075.
-- Patch is deliberately additive; it never overwrites patient RLS or invents
-- verified code status. Code status is 'unknown' until independent evidence
-- validation and clinical release acceptance is implemented.

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS communication_needs text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS communication_needs_source text CHECK (communication_needs_source IS NULL OR communication_needs_source IN ('verified_source','caregiver_report','professional_observation','unknown'));
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS communication_needs_updated_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS preferred_hospital text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS safety_response_instructions text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS code_status text NOT NULL DEFAULT 'unknown' CHECK (code_status IN ('unknown','full_code','dnr'));
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS code_status_source text NOT NULL DEFAULT 'unknown' CHECK (code_status_source IN ('verified_source','caregiver_report','professional_observation','unknown'));
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS code_status_updated_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text DEFAULT 'caregiver_report'::text)
 RETURNS patients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.patients;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_patient_access(p_patient_id) THEN
   RAISE EXCEPTION 'Not authorized for this patient' USING ERRCODE='42501';
 END IF;
 IF p_source IS NULL OR p_source NOT IN ('verified_source','caregiver_report','professional_observation','unknown') THEN
   RAISE EXCEPTION 'Invalid communication provenance source' USING ERRCODE='22023';
 END IF;
 IF p_source IN ('verified_source','professional_observation')
   AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
   RAISE EXCEPTION 'An assigned verified professional is required for professional provenance' USING ERRCODE='42501';
 END IF;
 UPDATE public.patients SET communication_needs=p_communication_needs,
 communication_needs_source=p_source,communication_needs_updated_by=auth.uid(),updated_at=now()
 WHERE id=p_patient_id RETURNING * INTO v_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'Patient not found' USING ERRCODE='22023'; END IF;
 RETURN v_row;
END $function$;
REVOKE ALL ON FUNCTION public.record_communication_needs(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_communication_needs(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text DEFAULT NULL::text, p_safety_response_instructions text DEFAULT NULL::text, p_code_status text DEFAULT NULL::text, p_code_status_source text DEFAULT 'caregiver_report'::text)
 RETURNS patients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.patients;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_patient_access(p_patient_id) THEN
   RAISE EXCEPTION 'Not authorized for this patient' USING ERRCODE='42501';
 END IF;
 IF p_code_status IS NOT NULL THEN
   RAISE EXCEPTION 'Code-status changes require an independently verified evidence workflow' USING ERRCODE='42501';
 END IF;
 UPDATE public.patients SET preferred_hospital=COALESCE(p_preferred_hospital,preferred_hospital),
 safety_response_instructions=COALESCE(p_safety_response_instructions,safety_response_instructions),
 updated_at=now() WHERE id=p_patient_id RETURNING * INTO v_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'Patient not found' USING ERRCODE='22023'; END IF;
 RETURN v_row;
END $function$;
REVOKE ALL ON FUNCTION public.record_patient_safety_plan(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_patient_safety_plan(uuid,text,text,text,text) TO authenticated;
