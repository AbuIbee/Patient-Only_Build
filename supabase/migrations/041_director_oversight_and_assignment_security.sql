-- 041_director_oversight_and_assignment_security.sql
-- FINAL INTEGRATION CORRECTIONS items 1 (hardening) & 3 (Director/Admin
-- dashboard: staff-to-patient assignment management, Therapist Office
-- communications oversight).
--
-- Security fix found while wiring "patient coverage management, including
-- existing registered patients": cover_patient_via_staff_registration()
-- let ANY active caregiver-role org member cover ANY patient_id they
-- supplied, with no check that they actually already have a
-- caregiver_patients relationship with that patient. That is exactly the
-- "never allow access solely because a UUID appears" failure mode —
-- fixed by requiring the caller to already be that patient's registered
-- caregiver before this RPC will cover them under the organization.
--
-- Oversight feature: get_org_communications_overview() gives a director
-- AGGREGATE counts only (active conversations touching their org's staff,
-- unresolved follow-ups) — never message content, and never a
-- conversation the director was not themselves added to. This is a
-- deliberate, narrow interpretation of "Therapist Office communications
-- inbox" for a director: administrative oversight of volume, not a
-- backdoor into content nobody added them to. "Do not broaden visibility
-- to all care-team members automatically" applies to the director's own
-- dashboard exactly as much as anyone else's.
--
-- get_org_staff_patient_assignments() is a plain read helper for the
-- existing assign_staff_to_patient()/unassign_staff_from_patient() RPCs
-- (migration 035, untouched here) so the Director dashboard can render
-- and manage them.
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE OR REPLACE FUNCTION public.cover_patient_via_staff_registration(p_org_id UUID, p_patient_id UUID)
RETURNS covered_patient_memberships AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Only an active member of this organization may register a covered patient for it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active' AND org_role = 'caregiver'
  ) THEN
    RAISE EXCEPTION 'Only an active caregiver member of this organization may register a covered patient';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caregiver_patients WHERE caregiver_id = auth.uid() AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'You may only bring your own registered patients under this organization''s coverage';
  END IF;
  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used).', v_active_count, COALESCE(v_capacity, 0);
  END IF;
  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;
  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, auth.uid(), p_patient_id, 'caregiver', auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET is_active = true, updated_at = now();
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_org_staff_patient_assignments(p_org_id UUID)
RETURNS TABLE (
  user_id UUID, first_name TEXT, last_name TEXT, patient_id UUID, patient_first_name TEXT,
  patient_last_name TEXT, patient_preferred_name TEXT, org_role TEXT, is_active BOOLEAN
) AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may view staff-patient assignments';
  END IF;
  RETURN QUERY
  SELECT spa.user_id, pr.first_name, pr.last_name, spa.patient_id, p.first_name, p.last_name, p.preferred_name, spa.org_role, spa.is_active
  FROM staff_patient_assignments spa
  JOIN profiles pr ON pr.id = spa.user_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.organization_id = p_org_id
  ORDER BY spa.is_active DESC, pr.first_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_org_staff_patient_assignments(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_staff_patient_assignments(UUID) TO authenticated;

-- Aggregate-only communications oversight: counts, never content.
CREATE OR REPLACE FUNCTION public.get_org_communications_overview(p_org_id UUID)
RETURNS TABLE (
  active_conversations BIGINT,
  patients_with_conversations BIGINT,
  unresolved_follow_ups BIGINT
) AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may view this overview';
  END IF;
  RETURN QUERY
  SELECT
    count(DISTINCT c.id),
    count(DISTINCT c.patient_id),
    count(DISTINCT ma.id) FILTER (WHERE ma.follow_up_requested AND NOT ma.follow_up_resolved)
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id
  JOIN staff_patient_assignments spa ON spa.user_id = cp.user_id AND spa.patient_id = c.patient_id AND spa.organization_id = p_org_id AND spa.is_active = true
  LEFT JOIN messages m ON m.conversation_id = c.id
  LEFT JOIN message_acknowledgments ma ON ma.message_id = m.id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_org_communications_overview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_communications_overview(UUID) TO authenticated;
