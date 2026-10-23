-- Codex MMA-CODEX-10 — "false-zero-count bug" in the Director/Medical/
-- Therapy communications overview.
--
-- CONFIRMED DEFECT: get_org_communications_overview() (migration 041)
-- requires every counted conversation to have a participant with an
-- active staff_patient_assignments row for (user_id, patient_id,
-- p_org_id). Migration 087 made 'director' a legal conversation
-- participant whose authority comes from organization_memberships +
-- covered_patient_memberships, not staff_patient_assignments. A real,
-- properly-authorized conversation whose only org-scoped participant is
-- a director (no staff_patient_assignments row exists for a director)
-- was therefore silently excluded from every count this function
-- returns — "Care team messages"/"active conversations" on the
-- Medical/Therapy dashboards and the Director's own overview card could
-- all undercount, including showing zero for a conversation that is
-- genuinely active.
--
-- (therapist_relationships is deliberately NOT added here: those
-- connections carry no organization_id at all -- get_my_staff_patients()
-- returns them under organization_id=NULL, "Direct Patient Connection"
-- -- so they have no organization to be counted under. Excluding them
-- from an org-scoped overview is correct, not a bug.)
--
-- Fix: the WHERE clause now accepts either authorization path, scoped
-- correlated EXISTS checks rather than additional JOINs so the fan-out
-- to messages/message_acknowledgments isn't multiplied.
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
  LEFT JOIN messages m ON m.conversation_id = c.id
  LEFT JOIN message_acknowledgments ma ON ma.message_id = m.id
  WHERE (
    EXISTS (
      SELECT 1 FROM staff_patient_assignments spa
      WHERE spa.user_id = cp.user_id AND spa.patient_id = c.patient_id
        AND spa.organization_id = p_org_id AND spa.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM organization_memberships om
      JOIN covered_patient_memberships cpm ON cpm.organization_id = om.organization_id
      WHERE om.user_id = cp.user_id AND om.organization_id = p_org_id
        AND om.org_role = 'director' AND om.status = 'active'
        AND cpm.patient_id = c.patient_id AND cpm.status = 'active'
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_org_communications_overview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_communications_overview(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_org_communications_overview(UUID) FROM anon;
