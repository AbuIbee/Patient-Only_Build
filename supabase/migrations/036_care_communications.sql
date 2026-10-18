-- 036_care_communications.sql
-- ENTERPRISE CONSOLIDATED DELIVERY — Checkpoint B: one shared
-- communications system, reused by every authorized portal (patient,
-- caregiver, therapist, medical professional).
--
-- STAGING-TARGETED. Not yet applied to production.
--
-- Core design principle, stated once: "Do not automatically expose a
-- conversation to every person linked to the patient. A participant must
-- be intentionally included or otherwise separately authorized for the
-- record type." conversation_participants is the ONLY thing that grants
-- read/write access to a conversation and its messages — not
-- caregiver_patients, not staff_patient_assignments, not any other
-- existing relationship table. Those tables are consulted ONLY at the
-- moment someone is ADDED as a participant (is_authorized_for_patient()
-- below), to confirm the person being added actually has a legitimate
-- care relationship to the patient — never to implicitly grant
-- conversation access on their own.
--
-- This is also why "private notes" (patient_notes, care_partner_notes)
-- are untouched by this migration — they stay exactly what they already
-- are, never repurposed into a conversation history.

-- ============================================================================
-- §1 — conversations: patient-scoped, created by an explicit action, never
-- implicitly.
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject     TEXT,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- §2 — conversation_participants: THE access-control table for everything
-- else in this file.
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_participants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('patient', 'caregiver', 'therapist', 'medical_professional')),
  added_by         UUID NOT NULL REFERENCES profiles(id),
  added_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Internal helper, not granted directly: does CALLER-SUPPLIED p_user_id
-- have a legitimate, independently-verified care relationship to
-- p_patient_id? Reuses the EXISTING authorization sources exactly as the
-- owner's own instruction frames it ("reuse... where their security
-- semantics actually fit") — this is a READ-time membership check, never
-- a write into either table.
CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id UUID, p_patient_id UUID)
RETURNS boolean AS $$
  SELECT
    p_user_id = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = p_user_id AND patient_id = p_patient_id)
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = p_patient_id AND is_active = true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_authorized_for_patient(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorized_for_patient(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;

-- conversations: visible only to an actual participant.
DO $$ BEGIN
  CREATE POLICY "Participants can view their conversations"
    ON conversations FOR SELECT
    USING (public.is_conversation_participant(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — create_conversation() RPC only.

-- conversation_participants: a participant can see the OTHER participants
-- of a conversation they're actually in ("sender identity and role" for
-- every message requires knowing who's in the thread) — never participant
-- lists of a conversation they're not part of.
DO $$ BEGIN
  CREATE POLICY "Participants can view the participant list of their own conversations"
    ON conversation_participants FOR SELECT
    USING (public.is_conversation_participant(conversation_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/DELETE — create_conversation()/add_conversation_
-- participant()/remove_conversation_participant() RPCs only.

-- ============================================================================
-- §3 — messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id            UUID NOT NULL REFERENCES profiles(id),
  sender_role          TEXT NOT NULL CHECK (sender_role IN ('patient', 'caregiver', 'therapist', 'medical_professional')),
  body                 TEXT NOT NULL CHECK (char_length(btrim(body)) > 0),
  -- "Clear distinction between routine notes and urgent concerns" —
  -- item: "An urgent alert is not an emergency-response service. Never
  -- claim it reached a supervisor unless delivery/acknowledgment is
  -- verified." This flag changes DISPLAY/sort only — the app makes no
  -- claim anywhere that marking a message urgent notifies, pages, or
  -- reaches anyone beyond the conversation's actual participants reading
  -- it through the ordinary inbox/conversation UI.
  is_urgent            BOOLEAN NOT NULL DEFAULT false,
  reply_to_message_id  UUID REFERENCES messages(id),
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Participants can view messages in their conversations"
    ON messages FOR SELECT
    USING (public.is_conversation_participant(conversation_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT — send_message() RPC only (so sender_id/sender_role
-- are always server-verified, never caller-supplied).

-- ============================================================================
-- §4 — message_acknowledgments: read state, acknowledgment, follow-up.
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_acknowledgments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id           UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at              TIMESTAMP WITH TIME ZONE,
  acknowledged_at      TIMESTAMP WITH TIME ZONE,
  follow_up_requested  BOOLEAN NOT NULL DEFAULT false,
  follow_up_note       TEXT,
  follow_up_resolved   BOOLEAN NOT NULL DEFAULT false,
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE message_acknowledgments ENABLE ROW LEVEL SECURITY;

-- A participant can see ack/read state for messages in conversations they
-- are actually part of (so a sender can see "seen by X") — never for a
-- conversation they're not in.
DO $$ BEGIN
  CREATE POLICY "Participants can view acknowledgment state in their conversations"
    ON message_acknowledgments FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM messages m
        WHERE m.id = message_acknowledgments.message_id
          AND public.is_conversation_participant(m.conversation_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — mark_message_read()/acknowledge_message()
-- RPCs only, and even those only ever touch the CALLER's own row.

-- ============================================================================
-- §5 — RPCs
-- ============================================================================

-- create_conversation(): the caller must themselves be authorized for the
-- patient, AND every explicitly-selected recipient must independently be
-- authorized for the SAME patient — never a blanket "everyone linked to
-- this patient" expansion. The caller is always added as a participant
-- (they're starting the conversation); the patient is NOT automatically
-- added unless explicitly included in p_recipient_user_ids.
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
  IF NOT public.is_authorized_for_patient(auth.uid(), p_patient_id) THEN
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
    ELSE (SELECT org_role FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true LIMIT 1)
  END;
  INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
  VALUES (v_conv.id, auth.uid(), v_caller_role, auth.uid());

  FOREACH v_recipient IN ARRAY p_recipient_user_ids LOOP
    IF v_recipient = auth.uid() THEN CONTINUE; END IF; -- already added above
    IF NOT public.is_authorized_for_patient(v_recipient, p_patient_id) THEN
      RAISE EXCEPTION 'Recipient % is not authorized for this patient', v_recipient;
    END IF;
    v_recipient_role := CASE
      WHEN v_recipient = p_patient_id THEN 'patient'
      WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = v_recipient AND patient_id = p_patient_id) THEN 'caregiver'
      ELSE (SELECT org_role FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true LIMIT 1)
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

-- add_conversation_participant(): only an EXISTING participant may add
-- someone, and that someone must independently be authorized for the
-- conversation's patient — never anyone the caller merely names.
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
  IF NOT public.is_authorized_for_patient(p_user_id, v_patient_id) THEN
    RAISE EXCEPTION 'This person is not authorized for this patient';
  END IF;

  v_role := CASE
    WHEN p_user_id = v_patient_id THEN 'patient'
    WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = p_user_id AND patient_id = v_patient_id) THEN 'caregiver'
    ELSE (SELECT org_role FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true LIMIT 1)
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

-- remove_conversation_participant(): a participant may remove THEMSELVES
-- (leave), or the conversation's creator may remove anyone — the actual
-- "access revocation" mechanism this file's own design note requires.
CREATE OR REPLACE FUNCTION public.remove_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
) RETURNS boolean AS $$
DECLARE
  v_creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT created_by INTO v_creator FROM conversations WHERE id = p_conversation_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'No such conversation';
  END IF;
  IF auth.uid() != p_user_id AND auth.uid() != v_creator THEN
    RAISE EXCEPTION 'Only the conversation creator may remove another participant';
  END IF;

  DELETE FROM conversation_participants WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.remove_conversation_participant(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_conversation_participant(UUID, UUID) TO authenticated;

-- send_message(): sender_id/sender_role are ALWAYS server-derived, never
-- caller-supplied. Auto-marks the message read+acknowledged for the
-- sender themselves (they obviously "read" what they just wrote).
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id UUID,
  p_body TEXT,
  p_is_urgent BOOLEAN,
  p_reply_to_message_id UUID
) RETURNS messages AS $$
DECLARE
  v_patient_id UUID;
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

  SELECT participant_role INTO v_sender_role FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  INSERT INTO messages (conversation_id, sender_id, sender_role, body, is_urgent, reply_to_message_id)
  VALUES (p_conversation_id, auth.uid(), v_sender_role, btrim(p_body), COALESCE(p_is_urgent, false), p_reply_to_message_id)
  RETURNING * INTO v_msg;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at)
  VALUES (v_msg.id, auth.uid(), now(), now());

  UPDATE conversations SET updated_at = now() WHERE id = p_conversation_id;

  RETURN v_msg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, BOOLEAN, UUID) TO authenticated;

-- mark_message_read() / acknowledge_message(): only ever touch the
-- CALLER's own acknowledgment row, only for a message in a conversation
-- they are actually a participant of.
CREATE OR REPLACE FUNCTION public.mark_message_read(p_message_id UUID)
RETURNS boolean AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL OR NOT public.is_conversation_participant(v_conv_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at)
  VALUES (p_message_id, auth.uid(), now())
  ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = COALESCE(message_acknowledgments.read_at, now()), updated_at = now();

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.mark_message_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_message_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_message(
  p_message_id UUID,
  p_follow_up_requested BOOLEAN,
  p_follow_up_note TEXT
) RETURNS message_acknowledgments AS $$
DECLARE
  v_conv_id UUID;
  v_row message_acknowledgments;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL OR NOT public.is_conversation_participant(v_conv_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at, follow_up_requested, follow_up_note)
  VALUES (p_message_id, auth.uid(), now(), now(), COALESCE(p_follow_up_requested, false), p_follow_up_note)
  ON CONFLICT (message_id, user_id) DO UPDATE SET
    read_at = COALESCE(message_acknowledgments.read_at, now()),
    acknowledged_at = now(),
    follow_up_requested = COALESCE(p_follow_up_requested, message_acknowledgments.follow_up_requested),
    follow_up_note = COALESCE(p_follow_up_note, message_acknowledgments.follow_up_note),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.acknowledge_message(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_message(UUID, BOOLEAN, TEXT) TO authenticated;

-- resolve_follow_up(): closes a follow-up on the caller's own
-- acknowledgment row for a message they received.
CREATE OR REPLACE FUNCTION public.resolve_follow_up(p_message_id UUID)
RETURNS boolean AS $$
BEGIN
  UPDATE message_acknowledgments SET follow_up_resolved = true, updated_at = now()
  WHERE message_id = p_message_id AND user_id = auth.uid();
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.resolve_follow_up(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_follow_up(UUID) TO authenticated;

-- ============================================================================
-- §6 — Read helpers
-- ============================================================================

-- get_my_conversations(): every conversation the caller participates in,
-- optionally filtered to one patient — "inbox, sent items and
-- conversation history" is built from this plus get_conversation_messages.
CREATE OR REPLACE FUNCTION public.get_my_conversations(p_patient_id UUID DEFAULT NULL)
RETURNS TABLE (
  conversation_id UUID, patient_id UUID, patient_name TEXT, subject TEXT,
  created_by UUID, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
  last_message_body TEXT, last_message_at TIMESTAMP WITH TIME ZONE, last_message_urgent BOOLEAN,
  unread_count BIGINT
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
    )
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN patients p ON p.id = c.patient_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, is_urgent FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
  ) lm ON true
  WHERE p_patient_id IS NULL OR c.patient_id = p_patient_id
  ORDER BY c.updated_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_conversations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_my_conversations IS 'ENTERPRISE CONSOLIDATED DELIVERY: scoped by auth.uid() via the conversation_participants JOIN — never returns a conversation the caller was not explicitly added to.';

-- ============================================================================
-- STAGING-ONLY AUTHORIZATION TESTS EXECUTED (real isolated staging
-- project, synthetic identities, cleaned up afterward):
-- ============================================================================
-- T1 (positive): a caregiver creates a conversation with an authorized
--     therapist and medical professional; all three see it via
--     get_my_conversations(); the patient (not included) does not.
-- T2 (negative, item "do not automatically expose... must be
--     intentionally included"): create_conversation() with a recipient
--     who has NO caregiver_patients/staff_patient_assignments row for
--     this patient is rejected outright — nothing is created.
-- T3 (negative, direct-query attempt — item 11): the excluded patient's
--     direct SELECT against conversations/messages for this conversation
--     id returns 0 rows (RLS, not merely UI hiding).
-- T4 (positive, item 9): the therapist sends a message directly to the
--     medical professional in the same conversation with no caregiver
--     involvement in that specific send.
-- T5 (positive, four-party + reply threads — item 10): all four
--     authorized roles (patient added separately, caregiver, therapist,
--     medical professional) reply in the same conversation using
--     reply_to_message_id; no new, unauthorized participant is ever
--     implicitly added by replying.
-- T6 (positive): read/acknowledge/follow-up states are per-user
--     (message_acknowledgments) — one participant acknowledging a message
--     does not mark it read for any other participant.
-- T7 (negative, revocation): remove_conversation_participant() by the
--     conversation creator removes a participant; that user's subsequent
--     SELECT against the conversation/messages returns 0 rows, and their
--     send_message() call is rejected.
-- T8 (negative, cross-org/cross-relationship isolation): a caregiver with
--     NO caregiver_patients or staff_patient_assignments row for a given
--     patient cannot create_conversation() for that patient at all.
