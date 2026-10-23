-- Codex MMA-CODEX-11 — "complete missing messaging features." Confirmed
-- this engagement's own earlier audit this pass: zero attachment
-- mechanism existed for any conversation, and message_acknowledgments'
-- follow-up tracking had no due-date column and no up-front ownership
-- concept (only a retroactive, self-row-only resolve). Builds both using
-- the EXISTING approved communication architecture (conversations/
-- conversation_participants/is_conversation_participant()) and this
-- engagement's own established private-Storage pattern (patient-
-- documents, professional-credentials) -- no new product architecture,
-- no external provider, no public bucket.
--
-- §1 — message_attachments: metadata table, RLS-governed directly (no
-- RPC wrapper needed, following professional_application_documents'
-- own precedent), live-rechecked on every read so a participant removed
-- from a conversation loses attachment access on their very next
-- request -- the same "revalidation on revocation" guarantee every
-- other authorization point in this app already provides.
CREATE TABLE IF NOT EXISTS message_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL UNIQUE,
  file_name     TEXT NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Conversation participants can view message attachments"
    ON message_attachments FOR SELECT
    USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only the message's own sender may attach a file to it (an attachment
-- is part of what that sender said, not something another participant
-- can retroactively append) -- re-derived server-side, never trusted
-- from the client.
DO $$ BEGIN
  CREATE POLICY "Message sender can attach a file to their own message"
    ON message_attachments FOR INSERT
    WITH CHECK (
      uploaded_by = auth.uid()
      AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON message_attachments FROM PUBLIC;
GRANT SELECT, INSERT ON message_attachments TO authenticated;
REVOKE ALL ON message_attachments FROM anon;

-- §2 — private Storage bucket, scoped per-message via the path's first
-- segment (the same storage.foldername(name)[1] convention this
-- engagement's other private buckets already use). 20MB/common document
-- + image types, matching migration 100's own rationale (match, don't
-- narrow, what a real conversation attachment would realistically be).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('conversation-attachments', 'conversation-attachments', false, 20971520,
  ARRAY['image/*', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Sender can upload their own message attachment objects"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'conversation-attachments'
      AND EXISTS (SELECT 1 FROM messages m WHERE m.id::text = (storage.foldername(name))[1] AND m.sender_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Conversation participants can read message attachment objects"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'conversation-attachments'
      AND EXISTS (
        SELECT 1 FROM messages m
        WHERE m.id::text = (storage.foldername(name))[1] AND public.is_conversation_participant(m.conversation_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §3 — follow-up due date and assignable ownership. The existing model
-- is deliberately kept (one acknowledgment row per message per
-- participant) -- "owner" is added as who THIS follow-up is assigned
-- to resolve, independent of who created it, so "I read this, but I'm
-- assigning it to Dr. X to close by Friday" is now representable.
ALTER TABLE message_acknowledgments
  ADD COLUMN IF NOT EXISTS follow_up_due_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_assigned_to UUID REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION public.acknowledge_message(
  p_message_id UUID,
  p_follow_up_requested BOOLEAN,
  p_follow_up_note TEXT,
  p_follow_up_due_date DATE DEFAULT NULL,
  p_follow_up_assigned_to UUID DEFAULT NULL
) RETURNS message_acknowledgments AS $$
DECLARE
  v_conv_id UUID;
  v_row message_acknowledgments;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL OR NOT public.is_conversation_participant(v_conv_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  -- The assignee, if given, must themselves be a live participant of
  -- THIS conversation -- never assignable to an outsider, re-checked
  -- server-side regardless of what the client sends.
  IF p_follow_up_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM conversation_participants WHERE conversation_id = v_conv_id AND user_id = p_follow_up_assigned_to
  ) THEN
    RAISE EXCEPTION 'A follow-up may only be assigned to another participant in this same conversation';
  END IF;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at, follow_up_requested, follow_up_note, follow_up_due_date, follow_up_assigned_to)
  VALUES (p_message_id, auth.uid(), now(), now(), COALESCE(p_follow_up_requested, false), p_follow_up_note, p_follow_up_due_date, p_follow_up_assigned_to)
  ON CONFLICT (message_id, user_id) DO UPDATE SET
    read_at = COALESCE(message_acknowledgments.read_at, now()),
    acknowledged_at = now(),
    follow_up_requested = COALESCE(p_follow_up_requested, message_acknowledgments.follow_up_requested),
    follow_up_note = COALESCE(p_follow_up_note, message_acknowledgments.follow_up_note),
    follow_up_due_date = COALESCE(p_follow_up_due_date, message_acknowledgments.follow_up_due_date),
    follow_up_assigned_to = COALESCE(p_follow_up_assigned_to, message_acknowledgments.follow_up_assigned_to),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.acknowledge_message(UUID, BOOLEAN, TEXT, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_message(UUID, BOOLEAN, TEXT, DATE, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.acknowledge_message(UUID, BOOLEAN, TEXT, DATE, UUID) FROM anon;

-- resolve_follow_up(): previously self-row-only (user_id = auth.uid()).
-- Now ALSO resolvable by the assigned owner, since the entire point of
-- assignment is letting someone else close out a follow-up they did not
-- originally create. Still re-checked server-side, never client-trusted.
CREATE OR REPLACE FUNCTION public.resolve_follow_up(p_message_id UUID)
RETURNS boolean AS $$
BEGIN
  UPDATE message_acknowledgments SET follow_up_resolved = true, updated_at = now()
  WHERE message_id = p_message_id AND (user_id = auth.uid() OR follow_up_assigned_to = auth.uid());
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.resolve_follow_up(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_follow_up(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_follow_up(UUID) FROM anon;

DROP FUNCTION IF EXISTS public.acknowledge_message(UUID, BOOLEAN, TEXT);
