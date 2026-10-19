-- 043_conversation_access_revalidates_authorization.sql
-- FINAL INTEGRATION CORRECTIONS item 2 — "Revoked participants lose
-- access appropriately."
--
-- Bug found live-testing revocation: is_conversation_participant() only
-- checked membership in conversation_participants, never re-verifying
-- the underlying relationship that justified adding that person in the
-- first place. Confirmed live: after setting a therapist_relationships
-- row to is_active=false, is_authorized_for_patient() correctly returned
-- false (blocking NEW conversations/additions), but the therapist could
-- still SELECT the EXISTING conversation they had already been added to
-- — a direct-query count against `conversations` still returned 1 row.
-- Someone removed from a patient's care team kept indefinite read/write
-- access to every conversation they were ever added to about that
-- patient, with no explicit remove_conversation_participant() call ever
-- happening. This mirrors exactly the staff_patient_assignments gap
-- fixed in migration 035's remove_org_member() cascade, just one layer
-- further down.
--
-- Fix: is_conversation_participant() now ALSO requires
-- is_authorized_for_patient() to still hold for that conversation's
-- patient, re-checked on every call. Losing the underlying relationship
-- (caregiver_patients row deleted, staff_patient_assignments.is_active
-- set false, therapist_relationships.is_active set false, or an org
-- membership revocation that cascades to either of those) now instantly
-- and automatically revokes conversation access — no separate cleanup
-- step required, and the conversation_participants row itself is left
-- untouched (preserving the historical "who was in this conversation"
-- record, consistent with this file's own existing design note on
-- revocation).
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND public.is_authorized_for_patient(auth.uid(), c.patient_id)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
