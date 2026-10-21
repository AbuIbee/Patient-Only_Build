-- 077_r7_mastercorrective_func02-04.sql
-- MASTER CORRECTIVE ENGINEERING ORDER — FUNC-03 (inbox categorization)
-- and FUNC-04 (message search). FUNC-02 (mood-history pagination) was a
-- frontend-only fix (moved into EnterprisePatientRecordTabs.tsx's
-- MedicalTab, the actual reachable route) and needed no schema change.

-- ============================================================================
-- FUNC-03 — CONFIRMED DEFECT (UI-INBOX-READ-FOLLOWUP-MISCLASSIFIED,
-- browser_audit.mjs): a conversation with an already-READ message that
-- still had an open follow-up request ("AUDIT Followup Thread")
-- rendered under "Routine" instead of "Needs a response".
--
-- ROOT CAUSE: get_my_conversations() never exposed any follow-up
-- state at all; the client's CommunicationsView used unread_count > 0
-- as a proxy for "needs a response" -- conflating "unread" with "has
-- an open follow-up," which are different facts. A read message can
-- still have an unresolved follow-up request, and an unread message
-- might carry no follow-up request at all.
--
-- FIX: expose the real signal -- whether any message in the
-- conversation has an acknowledgment with follow_up_requested = true
-- and follow_up_resolved = false -- and classify on that, not on
-- unread_count.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_my_conversations(UUID);
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
  WHERE p_patient_id IS NULL OR c.patient_id = p_patient_id
  ORDER BY c.updated_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_my_conversations IS 'ENTERPRISE CONSOLIDATED DELIVERY: scoped by auth.uid() via the conversation_participants JOIN — never returns a conversation the caller was not explicitly added to. has_open_follow_up (MASTER CORRECTIVE FUNC-03) reflects a real unresolved follow-up request, independent of read state.';
-- DROP FUNCTION above resets privileges to the default (owner-only) --
-- re-grant exactly as migration 036 originally did.
REVOKE ALL ON FUNCTION public.get_my_conversations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(UUID) TO authenticated;

-- ============================================================================
-- FUNC-04 — CONFIRMED DEFECT (UI-C06-HISTORICAL-SEARCH-MISSING,
-- browser_audit.mjs): searching for text that only appears in an
-- OLDER message of a conversation (not its latest message) returned
-- "No conversations match this search," even though that message
-- genuinely existed and the caller was a participant.
--
-- ROOT CAUSE: CommunicationsView's client-side search filter only ever
-- checked patientName/subject/lastMessageBody -- the conversation
-- SUMMARY carries only the single latest message, never the full
-- history, so a match anywhere earlier in the thread was structurally
-- invisible to the filter, not merely hidden by a UI bug.
--
-- FIX: a server-side RPC that searches every message body across the
-- caller's own conversations (never another participant's private
-- conversation, scoped by conversation_participants exactly like
-- get_my_conversations()), returning matching conversation ids. The
-- client unions this with its existing instant local-field filter.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_my_conversations(p_search_term TEXT)
RETURNS TABLE (conversation_id UUID) AS $$
  SELECT DISTINCT c.id
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN messages m ON m.conversation_id = c.id
  WHERE btrim(COALESCE(p_search_term, '')) != '' AND m.body ILIKE '%' || p_search_term || '%';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.search_my_conversations(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_my_conversations(TEXT) TO authenticated;
