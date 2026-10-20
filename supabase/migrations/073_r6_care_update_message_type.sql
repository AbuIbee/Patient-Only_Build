-- 073_r6_care_update_message_type.sql
-- C03 — "Create structured patient-scoped shared updates attributed to
-- author and explicitly addressed to the selected care recipients,
-- separate from Private Journal." Migration 071 added the
-- `messages.message_type` column itself, but send_message() (migration
-- 036) was never widened to accept it — every call always inserted the
-- column's own DEFAULT 'message', so no client path could actually set
-- 'care_update'. This migration closes that gap: one new parameter,
-- DEFAULT 'message', so every existing call site (which never passes
-- it) is completely unaffected.

DROP FUNCTION IF EXISTS public.send_message(UUID, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id UUID,
  p_body TEXT,
  p_is_urgent BOOLEAN,
  p_reply_to_message_id UUID,
  p_message_type TEXT DEFAULT 'message'
) RETURNS messages AS $$
DECLARE
  v_sender_role TEXT;
  v_msg messages;
BEGIN
  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
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
  VALUES (p_conversation_id, auth.uid(), v_sender_role, btrim(p_body), COALESCE(p_is_urgent, false), p_reply_to_message_id, p_message_type)
  RETURNING * INTO v_msg;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at)
  VALUES (v_msg.id, auth.uid(), now(), now());

  UPDATE conversations SET updated_at = now() WHERE id = p_conversation_id;

  RETURN v_msg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID, TEXT) TO authenticated;

-- LIVE VERIFICATION (this round): sending with p_message_type omitted
-- (the pre-existing call shape) still inserts message_type='message';
-- sending with p_message_type='care_update' succeeds and is
-- distinguishable in the message list; an invalid value is rejected.
-- All other authorization behavior (participant check, reply-target
-- check) is unchanged from migration 036.
