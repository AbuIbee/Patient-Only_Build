-- MMA-ENT-CAREGIVER-MASTER-003, R16 (P1) — "persisted staff HELP
-- acknowledgment does not update history acknowledgment summary."
-- Independent runtime audit (MMA_ENT_CAREGIVER_MASTER_002_RUNTIME_AUDIT.md,
-- finding R16): a real "Safety Acknowledge" press correctly persisted
-- help_activations.staff_acknowledged_by/staff_acknowledged_at
-- (migration 092's acknowledge_help_activation()). But
-- get_patient_help_activation_history() (migration 071) computed its
-- OWN separate acknowledged_count/acknowledged_by from
-- message_acknowledgments (read/ack state of the auto-created
-- conversation message) -- an entirely different concept from "a staff
-- member explicitly responded to this safety event" -- so it kept
-- returning acknowledged_count=0 for an event that WAS genuinely
-- acknowledged. EnterpriseCaregiverDashboard's own "Needs your
-- attention" HELP feed (and CaregiverPatientView's HELP history list)
-- both consume this same RPC, so the Dashboard kept listing an
-- acknowledged HELP event as still needing attention while
-- EnterprisePatientRecordTabs' HELP tab (which reads
-- staff_acknowledged_by/at directly, bypassing this RPC) correctly
-- showed it acknowledged -- the exact same event, two disagreeing UIs.
--
-- Fix: get_patient_help_activation_history() now reports
-- staff_acknowledged_by/at (the SAME column acknowledge_help_activation()
-- writes and EnterprisePatientRecordTabs already reads directly) as the
-- single, authoritative "acknowledged" signal, instead of re-deriving
-- it from message_acknowledgments. This is a genuine unification, not a
-- rename: event acknowledgment ("a responder has taken ownership of
-- this safety event") and message acknowledgment ("this particular chat
-- message has been read") are kept distinct by construction now --
-- message_acknowledgments is no longer consulted here at all, so a
-- message read-receipt can never masquerade as, or block, event
-- acknowledgment, and vice versa.
DROP FUNCTION IF EXISTS public.get_patient_help_activation_history(uuid);
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
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s HELP activation history';
  END IF;

  RETURN QUERY
  SELECT
    ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status,
    (CASE WHEN ha.staff_acknowledged_by IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    (CASE WHEN ha.staff_acknowledged_by IS NOT NULL THEN ARRAY[COALESCE(pr.first_name || ' ' || pr.last_name, 'A responder')] ELSE ARRAY[]::text[] END)
  FROM help_activations ha
  LEFT JOIN profiles pr ON pr.id = ha.staff_acknowledged_by
  WHERE ha.patient_id = p_patient_id
  ORDER BY ha.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_patient_help_activation_history(uuid) TO authenticated;
