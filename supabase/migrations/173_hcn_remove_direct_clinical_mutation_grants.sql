-- Clinical privileges must not rely solely on RLS.
-- Anonymous callers lose direct PHI SELECT/INSERT/UPDATE/DELETE.
-- Authenticated callers preserve RLS-scoped SELECT/INSERT but cannot mutate
-- append-only clinical history through direct UPDATE or DELETE.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE
 public.patient_diagnoses,public.patient_allergies,public.patient_vitals,public.patient_care_plans
 FROM anon;
REVOKE UPDATE, DELETE ON TABLE
 public.patient_diagnoses,public.patient_allergies,public.patient_vitals,public.patient_care_plans
 FROM authenticated;
