-- MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave C — Therapist
-- end-to-end journey. CONFIRMED FINDING (DEFECT-THERAPIST-INVITED-
-- PATIENT-MISSING-FROM-THERAPY-OFFICE), fixed here.
--
-- Two historically separate mechanisms both grant a therapist real,
-- legitimate access to a specific patient, but only one of them ever
-- populated the patient list the NEW /Professional/Therapy dashboard
-- (ClinicalOfficeDashboard.tsx, built this engagement) actually reads:
--
--   (1) staff_patient_assignments with org_role='therapist' — created
--       only by a Director via assign_staff_to_patient(). This is what
--       get_my_staff_patients() (migration 078) reads.
--   (2) therapist_relationships — created by the pre-existing, older
--       caregiver_invite_therapist() -> respond_to_therapist_invite()
--       workflow, which a caregiver (not a director) initiates per
--       patient. This is what is_authorized_for_patient() already
--       recognizes (so an accepted therapist CAN message about the
--       patient, confirmed by this session's own cross-office
--       communication matrix test), but get_my_staff_patients() never
--       looked at it.
--
-- Net effect before this fix: a therapist who accepted a real,
-- legitimate patient-connection invitation saw ZERO patients in "My
-- Therapy Patients" on the real /Professional/Therapy dashboard, even
-- though they were fully authorized to message about and had accepted
-- a connection to that patient. Confirmed live (see the companion
-- regression test) before this fix, and not anywhere disclosed in the
-- historical traceability matrix (which predates the /Professional
-- Therapy office entirely).
--
-- Fix: get_my_staff_patients() now also includes every patient the
-- caller holds an active therapist_relationships row for, labeled with
-- a NULL organization (these connections are organization-independent
-- by design, unlike staff_patient_assignments) and a literal
-- organization_name the frontend can render as-is. If a patient
-- appears via BOTH mechanisms, the staff_patient_assignments row wins
-- (DISTINCT ON prefers the org-scoped source) so an org-assigned
-- therapist's row is never silently replaced by the organization-free
-- one.
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
RETURNS TABLE (
  organization_id UUID, organization_name TEXT, patient_id UUID,
  first_name TEXT, last_name TEXT, preferred_name TEXT, org_role TEXT,
  address TEXT, location TEXT
) AS $$
  SELECT DISTINCT ON (patient_id) organization_id, organization_name, patient_id, first_name, last_name, preferred_name, org_role, address, location
  FROM (
    SELECT spa.organization_id, o.name AS organization_name, p.id AS patient_id, p.first_name, p.last_name, p.preferred_name, spa.org_role,
      p.address, p.location, 1 AS source_priority
    FROM staff_patient_assignments spa
    JOIN organizations o ON o.id = spa.organization_id
    JOIN patients p ON p.id = spa.patient_id
    WHERE spa.user_id = auth.uid() AND spa.is_active = true

    UNION ALL

    SELECT NULL::UUID AS organization_id, 'Direct Patient Connection' AS organization_name, p.id AS patient_id, p.first_name, p.last_name, p.preferred_name, 'therapist' AS org_role,
      p.address, p.location, 2 AS source_priority
    FROM therapist_relationships tr
    JOIN patients p ON p.id = tr.patient_id
    WHERE tr.therapist_id = auth.uid() AND tr.is_active = true
  ) combined
  ORDER BY patient_id, source_priority ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_patients() TO authenticated;
