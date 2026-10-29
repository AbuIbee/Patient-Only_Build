-- HCN P0 clinical INSERT restrictions, idempotent for environments
-- where a previous migration already installed a matching policy.
-- These restrictions do not grant a new SELECT or INSERT capability.
-- Other Specialist remains clinical-denied by default.

DO $hcn_clinical$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_allergies' AND policyname='Only professional staff may claim a verified or professional_ob' AND cmd='INSERT' AND permissive='RESTRICTIVE') THEN
    EXECUTE $clinical_0$CREATE POLICY "Only professional staff may claim a verified or professional_ob" ON public."patient_allergies" AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((source <> ALL (ARRAY['verified_source'::text, 'professional_observation'::text])) OR is_professional_staff_for_patient(patient_id)));$clinical_0$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_care_plans' AND policyname='Only professional staff may author or supersede a care plan' AND cmd='INSERT' AND permissive='RESTRICTIVE') THEN
    EXECUTE $clinical_1$CREATE POLICY "Only professional staff may author or supersede a care plan" ON public."patient_care_plans" AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_professional_staff_for_patient(patient_id));$clinical_1$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_diagnoses' AND policyname='Only professional staff may claim a verified or professional_ob' AND cmd='INSERT' AND permissive='RESTRICTIVE') THEN
    EXECUTE $clinical_2$CREATE POLICY "Only professional staff may claim a verified or professional_ob" ON public."patient_diagnoses" AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((source <> ALL (ARRAY['verified_source'::text, 'professional_observation'::text])) OR is_professional_staff_for_patient(patient_id)));$clinical_2$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_vitals' AND policyname='Only professional staff may claim a verified or professional_ob' AND cmd='INSERT' AND permissive='RESTRICTIVE') THEN
    EXECUTE $clinical_3$CREATE POLICY "Only professional staff may claim a verified or professional_ob" ON public."patient_vitals" AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((source <> ALL (ARRAY['verified_source'::text, 'professional_observation'::text])) OR is_professional_staff_for_patient(patient_id)));$clinical_3$;
  END IF;
END $hcn_clinical$;
