-- CODEX F-01 (P0, release-blocking) — "Conversation confidentiality
-- and revocation regression." Independent audit report
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-01,
-- target commit b362e119.
--
-- Root cause, confirmed by reading the actual history: migration 043
-- originally made is_conversation_participant() conjunctive --
-- EXISTS(a participant row for auth.uid() in THIS conversation) AND
-- is_authorized_for_patient() currently holds for that patient -- so a
-- revoked caregiver/staff/therapist participant instantly lost direct
-- table read access even though their historical
-- conversation_participants row was untouched. Migration 087 then
-- introduced is_org_director_for_patient() as a second, narrower
-- authorization path for Directors, correctly re-validated it inside
-- send_message()/get_my_conversations()/search_my_conversations(), but
-- never touched is_conversation_participant() itself to recognize it.
-- Migration 104 "fixed" the resulting empty-conversation bug for a
-- validly-added Director participant by REPLACING 043's conjunction
-- with two permissive OR branches instead of EXTENDING the conjunction
-- -- which reintroduced 043's original bug (a revoked participant's
-- historical row alone now satisfies the first branch again) AND added
-- a brand new one: the second branch grants direct-table read access
-- to ANY current director-for-patient with NO requirement that they
-- were ever actually added to (addressed in) this specific
-- conversation at all.
--
-- Fix: restore 043's conjunctive invariant -- an actual participant
-- row is always required -- and extend what counts as "currently
-- authorized" to include is_org_director_for_patient(), exactly
-- mirroring the revalidation migration 087 already applies at
-- send_message()/get_my_conversations() time. This closes both gaps
-- at once: a revoked participant (of any role, Director included)
-- loses access on their very next request, and a Director who was
-- never addressed into this conversation still cannot read it merely
-- by covering the patient generally -- while a validly-added Director
-- participant (migration 087's actual intended case) keeps working
-- exactly as before.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND (
        public.is_authorized_for_patient(auth.uid(), c.patient_id)
        OR public.is_org_director_for_patient(auth.uid(), c.patient_id)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- F-01's own "Minimum remediation" also names resolve_follow_up()
-- explicitly: it only ever checked user_id/follow_up_assigned_to
-- ownership of the acknowledgment row, never whether the caller is
-- STILL a current, authorized participant of the conversation that
-- message belongs to -- so a revoked participant who had earlier
-- requested or been assigned a follow-up could keep resolving it
-- indefinitely after losing all other access.
CREATE OR REPLACE FUNCTION public.resolve_follow_up(p_message_id UUID)
RETURNS boolean AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL OR NOT public.is_conversation_participant(v_conv_id) THEN
    RAISE EXCEPTION 'You are not a current participant in this conversation';
  END IF;

  UPDATE message_acknowledgments SET follow_up_resolved = true, updated_at = now()
  WHERE message_id = p_message_id AND (user_id = auth.uid() OR follow_up_assigned_to = auth.uid());
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- F-01's remediation also names "current eligibility checks to
-- attachment writes": the existing INSERT policies on
-- message_attachments/storage.objects only ever checked "are you the
-- sender of this message" (a permanent historical fact), never
-- whether you are STILL a current, authorized participant of that
-- message's conversation -- so a revoked participant could keep
-- uploading new attachments to their own old messages indefinitely.
-- Both now also require is_conversation_participant(), matching the
-- SELECT side of both policies exactly.
DROP POLICY IF EXISTS "Message sender can attach a file to their own message" ON message_attachments;
CREATE POLICY "Message sender can attach a file to their own message"
  ON message_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid() AND public.is_conversation_participant(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS "Sender can upload their own message attachment objects" ON storage.objects;
CREATE POLICY "Sender can upload their own message attachment objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'conversation-attachments'
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id::text = (storage.foldername(name))[1] AND m.sender_id = auth.uid() AND public.is_conversation_participant(m.conversation_id)
    )
  );
