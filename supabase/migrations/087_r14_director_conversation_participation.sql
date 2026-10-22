-- MASTER ENTERPRISE COMPLETION DIRECTIVE §1.A — Director conversation
-- participation. Closes DEFECT-DIRECTOR-NOT-A-PATIENT-CONVERSATION-
-- PARTICIPANT (closure register §2b) with a narrow, auditable mechanism
-- scoped to messaging ONLY, not a general widening of patient access.
--
-- Design: a new is_org_director_for_patient() check — true only when
-- the caller is an ACTIVE director of the SPECIFIC organization that
-- ACTIVELY covers the SPECIFIC patient in question. This is deliberately
-- narrower than is_authorized_for_patient(): a director of Org A has
-- zero standing for Org B's patients, and a director whose own
-- membership is revoked (migration 084) or whose org's coverage of this
-- patient has ended loses it immediately, re-checked live on every call
-- — never derived from a cached role or a point-in-time grant. This
-- satisfies the directive's explicit requirement #4 ("prevent Director
-- users from acquiring universal patient-message access merely because
-- they hold the Director role"): holding the Director role is
-- necessary but never sufficient; the specific org-to-patient coverage
-- link is independently re-verified every time.
--
-- is_authorized_for_patient() itself is NOT modified -- every other
-- caller of that function (clinical record reads/writes, task/vitals/
-- diagnosis RPCs, etc.) is completely unaffected. Only the messaging
-- surface (create_conversation, add_conversation_participant,
-- get_my_conversations, search_my_conversations, send_message) is
-- extended to recognize this second, narrower authorization path.
CREATE OR REPLACE FUNCTION public.is_org_director_for_patient(p_user_id UUID, p_patient_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_memberships om
    JOIN covered_patient_memberships cpm ON cpm.organization_id = om.organization_id
    WHERE om.user_id = p_user_id
      AND om.org_role = 'director'
      AND om.status = 'active'
      AND cpm.patient_id = p_patient_id
      AND cpm.status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_org_director_for_patient(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_director_for_patient(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_director_for_patient(UUID, UUID) FROM anon;

-- 'director' is now a legal conversation participant / message sender
-- role — both CHECK constraints previously excluded it entirely.
ALTER TABLE conversation_participants DROP CONSTRAINT conversation_participants_participant_role_check;
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_participant_role_check
  CHECK (participant_role = ANY (ARRAY['patient','caregiver','therapist','medical_professional','director']));

ALTER TABLE messages DROP CONSTRAINT messages_sender_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_role_check
  CHECK (sender_role = ANY (ARRAY['patient','caregiver','therapist','medical_professional','director']));

-- create_conversation(): a recipient (or the caller) who is an
-- org-director-for-this-patient is now accepted, in addition to the
-- existing is_authorized_for_patient() path.
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_patient_id UUID,
  p_recipient_user_ids UUID[],
  p_subject TEXT
) RETURNS conversations AS $$
DECLARE
  v_conv conversations;
  v_recipient UUID;
  v_recipient_role TEXT;
  v_caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (public.is_authorized_for_patient(auth.uid(), p_patient_id) OR public.is_org_director_for_patient(auth.uid(), p_patient_id)) THEN
    RAISE EXCEPTION 'You are not authorized for this patient';
  END IF;
  IF p_recipient_user_ids IS NULL OR array_length(p_recipient_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one recipient must be explicitly selected';
  END IF;

  INSERT INTO conversations (patient_id, subject, created_by)
  VALUES (p_patient_id, NULLIF(btrim(COALESCE(p_subject, '')), ''), auth.uid())
  RETURNING * INTO v_conv;

  v_caller_role := CASE
    WHEN auth.uid() = p_patient_id THEN 'patient'
    WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = auth.uid() AND patient_id = p_patient_id) THEN 'caregiver'
    WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true)
      THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true LIMIT 1)
    WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true) THEN 'therapist'
    WHEN public.is_org_director_for_patient(auth.uid(), p_patient_id) THEN 'director'
  END;
  INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
  VALUES (v_conv.id, auth.uid(), v_caller_role, auth.uid());

  FOREACH v_recipient IN ARRAY p_recipient_user_ids LOOP
    IF v_recipient = auth.uid() THEN CONTINUE; END IF;
    IF NOT (public.is_authorized_for_patient(v_recipient, p_patient_id) OR public.is_org_director_for_patient(v_recipient, p_patient_id)) THEN
      RAISE EXCEPTION 'Recipient % is not authorized for this patient', v_recipient;
    END IF;
    v_recipient_role := CASE
      WHEN v_recipient = p_patient_id THEN 'patient'
      WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = v_recipient AND patient_id = p_patient_id) THEN 'caregiver'
      WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true)
        THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true LIMIT 1)
      WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = v_recipient AND patient_id = p_patient_id AND is_active = true) THEN 'therapist'
      WHEN public.is_org_director_for_patient(v_recipient, p_patient_id) THEN 'director'
    END;
    INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
    VALUES (v_conv.id, v_recipient, v_recipient_role, auth.uid())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END LOOP;

  RETURN v_conv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_conversation(UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, UUID[], TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_conversation(UUID, UUID[], TEXT) FROM anon;

-- add_conversation_participant(): same director-for-patient allowance,
-- for adding someone to an ALREADY-EXISTING conversation (membership
-- creation after the fact, not only at conversation-creation time).
CREATE OR REPLACE FUNCTION public.add_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
) RETURNS conversation_participants AS $$
DECLARE
  v_patient_id UUID;
  v_role TEXT;
  v_row conversation_participants;
BEGIN
  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'Only an existing participant may add someone to this conversation';
  END IF;

  SELECT patient_id INTO v_patient_id FROM conversations WHERE id = p_conversation_id;
  IF NOT (public.is_authorized_for_patient(p_user_id, v_patient_id) OR public.is_org_director_for_patient(p_user_id, v_patient_id)) THEN
    RAISE EXCEPTION 'This person is not authorized for this patient';
  END IF;

  v_role := CASE
    WHEN p_user_id = v_patient_id THEN 'patient'
    WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = p_user_id AND patient_id = v_patient_id) THEN 'caregiver'
    WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true)
      THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true LIMIT 1)
    WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = p_user_id AND patient_id = v_patient_id AND is_active = true) THEN 'therapist'
    WHEN public.is_org_director_for_patient(p_user_id, v_patient_id) THEN 'director'
  END;

  INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
  VALUES (p_conversation_id, p_user_id, v_role, auth.uid())
  ON CONFLICT (conversation_id, user_id) DO NOTHING
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.add_conversation_participant(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_conversation_participant(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.add_conversation_participant(UUID, UUID) FROM anon;

-- get_my_conversations()/search_my_conversations(): re-admit a current
-- org-director-for-this-patient at READ time (history access), and —
-- just as importantly — a FORMER director (membership revoked, or the
-- org's coverage of this patient ended) loses read access even though
-- their historical conversation_participants row still exists, exactly
-- the same live re-validation FUNC-04's follow-up already established
-- for every other participant type (migration 079).
CREATE OR REPLACE FUNCTION public.get_my_conversations(p_patient_id UUID DEFAULT NULL)
RETURNS TABLE (
  conversation_id UUID, patient_id UUID, patient_name TEXT, subject TEXT,
  created_by UUID, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
  last_message_body TEXT, last_message_at TIMESTAMP WITH TIME ZONE, last_message_urgent BOOLEAN,
  unread_count BIGINT, has_open_follow_up BOOLEAN
) AS $$
  SELECT
    c.id, c.patient_id,
    COALESCE(p.preferred_name, p.first_name || ' ' || p.last_name),
    c.subject, c.created_by, c.created_at, c.updated_at,
    lm.body, lm.created_at, lm.is_urgent,
    (
      SELECT count(*) FROM messages m2
      WHERE m2.conversation_id = c.id
        AND NOT EXISTS (SELECT 1 FROM message_acknowledgments a WHERE a.message_id = m2.id AND a.user_id = auth.uid() AND a.read_at IS NOT NULL)
    ),
    EXISTS (
      SELECT 1 FROM messages m3
      JOIN message_acknowledgments a3 ON a3.message_id = m3.id
      WHERE m3.conversation_id = c.id AND a3.follow_up_requested = true AND a3.follow_up_resolved = false
    )
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN patients p ON p.id = c.patient_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, is_urgent FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
  ) lm ON true
  WHERE (p_patient_id IS NULL OR c.patient_id = p_patient_id)
    AND (public.is_authorized_for_patient(auth.uid(), c.patient_id) OR public.is_org_director_for_patient(auth.uid(), c.patient_id))
  ORDER BY c.updated_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_my_conversations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_conversations(UUID) FROM anon;

CREATE OR REPLACE FUNCTION public.search_my_conversations(p_search_term TEXT)
RETURNS TABLE (conversation_id UUID) AS $$
  SELECT DISTINCT c.id
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN messages m ON m.conversation_id = c.id
  WHERE btrim(COALESCE(p_search_term, '')) != '' AND m.body ILIKE '%' || p_search_term || '%'
    AND (public.is_authorized_for_patient(auth.uid(), c.patient_id) OR public.is_org_director_for_patient(auth.uid(), c.patient_id));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.search_my_conversations(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_my_conversations(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_my_conversations(TEXT) FROM anon;

-- send_message(): CONFIRMED FINDING (DEFECT-SEND-MESSAGE-NO-REVALIDATION),
-- fixed in the same pass since it is the same class of gap and directly
-- bears on the required "revoked relationships / suspended Directors"
-- negative test. Previously only checked historical
-- conversation_participants row existence (is_conversation_participant),
-- never re-validating CURRENT authorization -- unlike the read paths
-- (migration 079) and unlike start/end_caregiver_visit's own
-- current-authorization re-check (migration 076, SEC-02). A participant
-- of ANY type whose authorization had since been revoked could still
-- send NEW messages into an old conversation. Now re-validated exactly
-- like the read paths, closing the gap for every participant type, not
-- only directors.
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id UUID,
  p_body TEXT,
  p_is_urgent BOOLEAN,
  p_reply_to_message_id UUID,
  p_message_type TEXT DEFAULT 'message'
) RETURNS messages AS $$
DECLARE
  v_patient_id UUID;
  v_sender_role TEXT;
  v_msg messages;
BEGIN
  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;
  SELECT patient_id INTO v_patient_id FROM conversations WHERE id = p_conversation_id;
  IF NOT (public.is_authorized_for_patient(auth.uid(), v_patient_id) OR public.is_org_director_for_patient(auth.uid(), v_patient_id)) THEN
    RAISE EXCEPTION 'Your authorization for this patient has been revoked; you can no longer send messages about them';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;
  IF p_reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages WHERE id = p_reply_to_message_id AND conversation_id = p_conversation_id
  ) THEN
    RAISE EXCEPTION 'The message being replied to is not in this conversation';
  END IF;
  IF p_message_type NOT IN ('message', 'care_update') THEN
    RAISE EXCEPTION 'Invalid message type: %', p_message_type;
  END IF;

  SELECT participant_role INTO v_sender_role FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  INSERT INTO messages (conversation_id, sender_id, sender_role, body, is_urgent, reply_to_message_id, message_type)
  VALUES (p_conversation_id, auth.uid(), v_sender_role, btrim(p_body), COALESCE(p_is_urgent, false), p_reply_to_message_id, COALESCE(p_message_type, 'message'))
  RETURNING * INTO v_msg;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at)
  VALUES (v_msg.id, auth.uid(), now(), now());

  UPDATE conversations SET updated_at = now() WHERE id = p_conversation_id;

  RETURN v_msg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID, TEXT) FROM anon;

-- get_patient_care_circle(): the "Select recipients" picker a caregiver
-- uses to start a NEW conversation (CareConversations.tsx). Without
-- this, create_conversation() would accept a director as a recipient,
-- but the generic composer's own picker would never offer one to
-- select -- only W09's dedicated "Message supervisor" button (which
-- already knows the director's id from get_my_org_supervisor) would
-- work. Completing the mechanism means the generic picker surfaces the
-- covering org's active director(s) too, same narrow
-- is_org_director_for_patient() check, not a blanket listing of every
-- director in the system.
CREATE OR REPLACE FUNCTION public.get_patient_care_circle(p_patient_id UUID)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  participant_role TEXT
) AS $$
BEGIN
  IF NOT (public.is_authorized_for_patient(auth.uid(), p_patient_id) OR public.is_org_director_for_patient(auth.uid(), p_patient_id)) THEN
    RAISE EXCEPTION 'You are not authorized for this patient';
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, 'patient'::text
  FROM patients p WHERE p.id = p_patient_id
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'caregiver'::text
  FROM caregiver_patients cp
  JOIN profiles pr ON pr.id = cp.caregiver_id
  WHERE cp.patient_id = p_patient_id
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, spa.org_role
  FROM staff_patient_assignments spa
  JOIN profiles pr ON pr.id = spa.user_id
  WHERE spa.patient_id = p_patient_id AND spa.is_active = true
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'therapist'::text
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id AND tr.is_active = true
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'director'::text
  FROM organization_memberships om
  JOIN covered_patient_memberships cpm ON cpm.organization_id = om.organization_id
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.org_role = 'director' AND om.status = 'active'
    AND cpm.patient_id = p_patient_id AND cpm.status = 'active';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_patient_care_circle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_care_circle(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_patient_care_circle(UUID) FROM anon;
