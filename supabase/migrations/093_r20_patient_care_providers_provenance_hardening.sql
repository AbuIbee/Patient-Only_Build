-- Codex MMA-CODEX-06 — clinical provenance.
--
-- CONFIRMED DEFECT (reproduced live before this fix, both halves —
-- see tests/integration/round7MasterCorrectiveSecurity.test.ts,
-- "patient_care_providers source provenance was never hardened"):
-- patient_care_providers (migration 072) was never included in
-- migration 076's SEC-03 RESTRICTIVE-policy hardening pass (which
-- covered patient_diagnoses/patient_allergies/patient_vitals), and its
-- own record_patient_provider() RPC gate only ever checked
-- p_source = 'professional_observation', never 'verified_source' — the
-- exact two-tier gap SEC-03's own follow-up
-- (44_MASTERCORRECTIVE2_FINDING_REGISTER.md) found and fixed in three
-- OTHER RPCs, left unfixed here. Confirmed live: an ordinary caregiver
-- claiming p_source='verified_source' through the RPC succeeded
-- (HTTP 200), and a direct POST to /rest/v1/patient_care_providers
-- claiming source='professional_observation' bypassed the RPC
-- entirely and persisted (HTTP 201) — the base table's own INSERT
-- policy only ever checked author_id/has_patient_access(), never the
-- source column.
--
-- Fix: the identical two-part pattern migration 076 already proved for
-- the other three clinical tables — (1) the RPC checks BOTH
-- provenance tiers, not one; (2) a RESTRICTIVE INSERT policy enforces
-- the same tier check at the table level, closing the direct-REST
-- bypass regardless of how the row is written.
CREATE OR REPLACE FUNCTION public.record_patient_provider(
  p_patient_id UUID, p_provider_name TEXT, p_provider_role TEXT,
  p_phone TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_care_providers AS $$
DECLARE
  v_row patient_care_providers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
  END IF;
  INSERT INTO patient_care_providers (patient_id, provider_name, provider_role, phone, email, notes, source, author_id)
  VALUES (p_patient_id, p_provider_name, p_provider_role, p_phone, p_email, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_patient_provider(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_provider(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_patient_provider(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;

DO $$ BEGIN
  CREATE POLICY "Only professional staff may claim a verified or professional_observation source"
    ON patient_care_providers AS RESTRICTIVE FOR INSERT
    WITH CHECK (source NOT IN ('verified_source', 'professional_observation') OR public.is_professional_staff_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
