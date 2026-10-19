-- 052_residential_therapist_patient_list.sql
-- CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 — a plain residential
-- therapist (connected via the new invite/accept workflow, migration
-- 051, with NO Enterprise organization involved at all) had no
-- reachable dashboard anywhere in this app once connected: they are not
-- an org member, so EnterpriseDashboardRouter has nowhere to route them
-- except the ordinary CaregiverPortal, which has no concept of "patients
-- I am the therapist for." This read helper is the minimum needed for a
-- small, dedicated residential-therapist view (separate commit) to list
-- their own accepted patients and actually reach Care Communications —
-- "preserve direct patient-caregiver-therapist communication" as a real,
-- reachable screen, not only a backend capability already proven at the
-- RPC level.
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE OR REPLACE FUNCTION public.get_my_therapist_patients()
RETURNS TABLE (
  patient_id UUID, first_name TEXT, last_name TEXT, preferred_name TEXT, relationship_type TEXT
) AS $$
  SELECT p.id, p.first_name, p.last_name, p.preferred_name, tr.relationship_type
  FROM therapist_relationships tr
  JOIN patients p ON p.id = tr.patient_id
  WHERE tr.therapist_id = auth.uid() AND tr.is_active = true
  ORDER BY p.first_name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_therapist_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_therapist_patients() TO authenticated;
