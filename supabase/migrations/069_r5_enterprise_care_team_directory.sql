-- ROUND 5 — ENTERPRISE CAREGIVER PORTAL: care team directory
-- (H16 Care Team Directory, O04 My Care Team, N11 My Care Team, W09
-- Supervisor Contact's lookup target).
--
-- CONFIRMED GAP, found while planning the dashboard UI for these items:
-- organization_memberships' only SELECT policies (migration 035) are
-- "a member sees their own row" and "a director sees every row in
-- their own org." An ORDINARY staff member (caregiver/therapist/
-- medical_professional, not director) has no RLS path to see ANY
-- colleague's membership row at all — the exact same class of defect
-- migration 067 fixed for base clinical tables (a UI assuming access
-- that RLS silently denies, returning empty rather than an authorized
-- result).
--
-- FIX: two read-only RPCs, bypassing membership RLS safely inside a
-- SECURITY DEFINER function that independently re-verifies the
-- caller's own active membership first — never exposing another
-- organization's roster, and never exposing a REVOKED/DECLINED
-- colleague as current.
--
-- get_my_care_team(): "colleagues" is defined narrowly and
-- non-speculatively — the org's active director(s) (always reachable,
-- for supervisor escalation/contact) PLUS any other active staff
-- member who shares at least one active staff_patient_assignments
-- patient with the caller. This is NOT "every member of the
-- organization" (which would over-expose colleagues with zero shared
-- patients) and NOT "every member of the care team for one specific
-- patient" (that is P06/get_org_staff_patient_assignments' job) — it
-- is the cross-patient "people I actually work with" directory the
-- locked requirement describes.
CREATE OR REPLACE FUNCTION public.get_my_care_team(p_org_id UUID)
RETURNS TABLE (member_user_id UUID, first_name TEXT, last_name TEXT, org_role TEXT, is_director BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are not an active member of this organization';
  END IF;

  RETURN QUERY
  SELECT om.user_id, pr.first_name, pr.last_name, om.org_role, true AS is_director
  FROM organization_memberships om
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.organization_id = p_org_id AND om.status = 'active' AND om.org_role = 'director' AND om.user_id != auth.uid()
  UNION
  SELECT om.user_id, pr.first_name, pr.last_name, om.org_role, false AS is_director
  FROM organization_memberships om
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.organization_id = p_org_id AND om.status = 'active' AND om.org_role != 'director' AND om.user_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM staff_patient_assignments mine
      JOIN staff_patient_assignments theirs
        ON theirs.organization_id = mine.organization_id AND theirs.patient_id = mine.patient_id AND theirs.is_active = true
      WHERE mine.organization_id = p_org_id AND mine.user_id = auth.uid() AND mine.is_active = true
        AND theirs.user_id = om.user_id
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_care_team(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_care_team(UUID) TO authenticated;

-- get_my_org_supervisor(): the narrow, single-purpose "find my
-- director to escalate to" lookup (W09). Deliberately separate from
-- get_my_care_team() above — W09 needs exactly one, unambiguous
-- escalation target even when get_my_care_team() might (in a
-- multi-director org) return more than one row.
CREATE OR REPLACE FUNCTION public.get_my_org_supervisor(p_org_id UUID)
RETURNS TABLE (member_user_id UUID, first_name TEXT, last_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are not an active member of this organization';
  END IF;

  RETURN QUERY
  SELECT om.user_id, pr.first_name, pr.last_name
  FROM organization_memberships om
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.organization_id = p_org_id AND om.status = 'active' AND om.org_role = 'director'
  ORDER BY om.created_at ASC
  LIMIT 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_org_supervisor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_org_supervisor(UUID) TO authenticated;
