-- Codex MMA-CODEX-17 — multiple organizations / distinct relationships.
-- "Preserve distinct legitimate patient-role relationships. Do not
-- deduplicate distinct authorization relationships by patient ID
-- alone."
--
-- CONFIRMED ISSUE WITH THIS SESSION'S OWN EARLIER FIX: migration 086
-- extended get_my_staff_patients() with `DISTINCT ON (patient_id)` to
-- avoid double-listing a therapist who held BOTH an org-assigned
-- staff_patient_assignments row and a direct therapist_relationships
-- connection for the same patient. That collapsing has a real,
-- previously-undisclosed cost this Codex finding correctly names:
-- DISTINCT ON (patient_id) alone also collapses the genuinely distinct
-- case of the SAME user holding staff_patient_assignments rows for the
-- SAME patient_id under TWO DIFFERENT organizations (e.g. a caregiver
-- contracted through two separate agencies that both independently
-- cover the same client) — an arbitrary one of the two tied rows would
-- be kept and the other organization's real, independent relationship
-- silently dropped from the caller's own patient list.
--
-- Fix: stop deduplicating by patient_id at all. The two source
-- branches (staff_patient_assignments, organization-scoped;
-- therapist_relationships, organization-independent by design) are
-- already structurally distinct from each other and from any other
-- organization's own row — a caller legitimately connected to the
-- same patient through N distinct organizations or mechanisms now
-- sees all N rows, each correctly labeled with its own
-- organization_id, rather than one arbitrarily chosen survivor.
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
RETURNS TABLE (
  organization_id UUID, organization_name TEXT, patient_id UUID,
  first_name TEXT, last_name TEXT, preferred_name TEXT, org_role TEXT,
  address TEXT, location TEXT
) AS $$
  SELECT spa.organization_id, o.name AS organization_name, p.id AS patient_id, p.first_name, p.last_name, p.preferred_name, spa.org_role,
    p.address, p.location
  FROM staff_patient_assignments spa
  JOIN organizations o ON o.id = spa.organization_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.user_id = auth.uid() AND spa.is_active = true

  UNION

  SELECT NULL::UUID AS organization_id, 'Direct Patient Connection' AS organization_name, p.id AS patient_id, p.first_name, p.last_name, p.preferred_name, 'therapist' AS org_role,
    p.address, p.location
  FROM therapist_relationships tr
  JOIN patients p ON p.id = tr.patient_id
  WHERE tr.therapist_id = auth.uid() AND tr.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_patients() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_staff_patients() FROM anon;
