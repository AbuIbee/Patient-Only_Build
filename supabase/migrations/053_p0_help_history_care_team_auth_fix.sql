-- P0 SECURITY CONTAINMENT — closes a live, confirmed staging exposure.
--
-- get_patient_help_activation_history(uuid) and
-- get_patient_care_team_connections(uuid) both used the same NULL-unsafe
-- authorization pattern:
--
--   IF p_patient_id != auth.uid() AND NOT EXISTS (...) THEN RAISE EXCEPTION;
--
-- When called by the anon role, auth.uid() is NULL. `p_patient_id != NULL`
-- evaluates to NULL (SQL three-valued logic), not TRUE or FALSE. The
-- caregiver-link EXISTS() subquery also correctly returns no rows (since
-- `caregiver_id = NULL` never matches), so NOT EXISTS(...) is TRUE. The
-- full condition becomes `NULL AND TRUE` = NULL, and `IF NULL THEN ...`
-- in plpgsql is treated as FALSE — the RAISE EXCEPTION never fires, and
-- execution falls through to RETURN QUERY with no authorization applied
-- at all. An anonymous caller supplying any p_patient_id received that
-- patient's full HELP activation history (timestamps, phone numbers
-- dialed, notification status, acknowledgment identities) or care-team
-- connections. Confirmed live on staging before this fix: anon_can_execute
-- = true on both functions, and the condition above verified to evaluate
-- to NULL/fall-through when auth.uid() IS NULL.
--
-- Both are rewritten with explicit, NULL-safe, positively-expressed
-- authorization: reject a NULL caller identity and a NULL patient id
-- before any query runs, then require auth.uid() = p_patient_id OR a
-- currently-active caregiver_patients link — expressed as
-- `IF NOT (... OR EXISTS(...)) THEN RAISE EXCEPTION` so there is no
-- inequality comparison against auth.uid() left anywhere in the function.
-- ACLs are also explicitly hardened (REVOKE ALL FROM PUBLIC/anon, GRANT
-- EXECUTE TO authenticated only) as defense in depth, independent of the
-- logic fix.
--
-- A full audit of every SECURITY DEFINER function in this schema granting
-- anon EXECUTE found these to be the only two sharing this defect class;
-- every other function either explicitly checks `auth.uid() IS NULL`
-- first (caregiver_claim_new_patient, remove_conversation_participant,
-- respond_to_therapist_invite) or gates through is_active_org_director/
-- is_active_org_member, both of which use `user_id = auth.uid()` inside
-- an EXISTS() — NULL-safe by construction, since a NULL auth.uid() simply
-- matches no row rather than flipping the authorization outcome.

CREATE OR REPLACE FUNCTION public.get_patient_help_activation_history(p_patient_id uuid)
RETURNS TABLE(
  id uuid, created_at timestamp with time zone, phone_dialed text, caregiver_count_at_time integer,
  conversation_id uuid, notification_status text, acknowledged_count bigint, acknowledged_by text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'A patient id is required';
  END IF;
  IF NOT (
    auth.uid() = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s HELP activation history';
  END IF;

  RETURN QUERY
  SELECT
    ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status,
    count(ma.id) FILTER (WHERE ma.acknowledged_at IS NOT NULL),
    array_agg(DISTINCT (pr.first_name || ' ' || pr.last_name)) FILTER (WHERE ma.acknowledged_at IS NOT NULL)
  FROM help_activations ha
  LEFT JOIN message_acknowledgments ma ON ma.message_id = ha.message_id AND ma.user_id != ha.patient_id
  LEFT JOIN profiles pr ON pr.id = ma.user_id
  WHERE ha.patient_id = p_patient_id
  GROUP BY ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status
  ORDER BY ha.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_patient_help_activation_history(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_patient_care_team_connections(p_patient_id uuid)
RETURNS TABLE(
  source text, connection_id uuid, therapist_id uuid, first_name text, last_name text,
  relationship_type text, status text, created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'A patient id is required';
  END IF;
  IF NOT (
    auth.uid() = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s care team';
  END IF;

  RETURN QUERY
  SELECT 'active'::text, tr.id, tr.therapist_id, pr.first_name, pr.last_name, tr.relationship_type,
         CASE WHEN tr.is_active THEN 'active' ELSE 'ended' END, tr.created_at
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id
  UNION ALL
  SELECT 'invitation'::text, ptc.id, ptc.therapist_id, pr.first_name, pr.last_name, ptc.relationship_type,
         ptc.status, ptc.created_at
  FROM pending_therapist_connections ptc
  JOIN profiles pr ON pr.id = ptc.therapist_id
  WHERE ptc.patient_id = p_patient_id AND ptc.status != 'accepted'
  ORDER BY created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_patient_care_team_connections(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_care_team_connections(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_patient_care_team_connections(uuid) TO authenticated;
