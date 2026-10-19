-- S4 — revoke_therapist_connection also marks the corresponding
-- pending_therapist_connections row 'revoked' (Senior Architect
-- Execution Contract, Section 5: "revoke_therapist_connection leaves
-- pending invitations untouched").
--
-- Traced the actual accept/revoke logic before changing anything: no
-- live privilege-restoration path was found — respond_to_therapist_invite
-- requires status = 'pending', and a revoked relationship's
-- pending_therapist_connections row stays at 'accepted' (not 'pending'),
-- so it cannot be re-accepted as-is; a genuine re-invite goes through
-- caregiver_invite_therapist, which correctly resets status to
-- 'pending' and requires a fresh accept. The real issue is historical-
-- record accuracy: after a revoke, the connection's own status still
-- reads 'accepted' even though access was ended, which both misreports
-- history and removes a layer of defense against any future code path
-- that might not independently re-check therapist_relationships.is_active
-- the way the current code correctly does.
--
-- 'revoked' was already an allowed value in
-- pending_therapist_connections_status_check (added proactively in
-- migration 051) and the client's statusLabel() mapping in
-- CareTeamCommunicationAccess already renders it as "Connection ended"
-- — no new migration risk, this just starts actually setting it.

CREATE OR REPLACE FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id;

  UPDATE pending_therapist_connections SET status = 'revoked', responded_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id AND status = 'accepted';

  RETURN true;
END;
$function$;
