-- MMA-ENT-CAREGIVER-MASTER-003, R15 (P1) — "Enterprise-only assigned
-- caregivers omitted from HELP notification routing." Independent
-- runtime audit (MMA_ENT_CAREGIVER_MASTER_002_RUNTIME_AUDIT.md, finding
-- R15): record_help_activation() (migration 050) resolved responders
-- SOLELY from caregiver_patients (the residential, non-organization
-- relationship table). A patient covered entirely through an
-- organization -- several active staff_patient_assignments, active
-- coverage, zero caregiver_patients rows, the normal shape for an
-- Enterprise-covered patient -- got caregiver_count_at_time=0,
-- conversation_id=null, notification_status=no_caregiver_linked: the
-- HELP event itself is correctly recorded (migration 050's own
-- atomicity fix), but it reaches nobody.
--
-- Fix: resolve responders from the UNION of caregiver_patients
-- (residential, unchanged) and staff_patient_assignments WHERE
-- is_active = true (the same, already-authorized Enterprise
-- relationship get_patient_care_circle()/is_authorized_for_patient()
-- already use elsewhere in this app -- migrations 036/040/050 -- not a
-- new or wider authorization source). Deliberately does NOT add
-- therapist_relationships or organization directors: the audit's own
-- reproduction and regression scope is explicitly residential-only /
-- Enterprise-only / mixed caregiver-and-staff-assignment behavior, and
-- widening who gets paged for a safety event beyond what was actually
-- asked for is exactly the kind of scope creep R14-R17's "do not
-- fabricate recipients" instruction warns against.
--
-- create_conversation()/send_message() downstream already independently
-- re-verify each recipient via is_authorized_for_patient() (migration
-- 040/050), so a responder who was active at the moment of this SELECT
-- but revoked a moment later is still correctly rejected there -- this
-- fix only widens WHO IS CONSIDERED, never weakens that re-check.
CREATE OR REPLACE FUNCTION public.record_help_activation(p_phone_dialed TEXT)
RETURNS help_activations AS $$
DECLARE
  v_row help_activations;
  v_responder_ids UUID[];
  v_conv conversations;
  v_msg messages;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'No patient record found for this account';
  END IF;

  SELECT array_agg(DISTINCT responder_id) INTO v_responder_ids FROM (
    SELECT caregiver_id AS responder_id FROM caregiver_patients WHERE patient_id = auth.uid()
    UNION
    SELECT user_id AS responder_id FROM staff_patient_assignments WHERE patient_id = auth.uid() AND is_active = true
  ) responders;

  v_status := CASE WHEN v_responder_ids IS NULL OR array_length(v_responder_ids, 1) = 0 THEN 'no_caregiver_linked' ELSE 'recorded' END;

  -- The HELP record itself — committed regardless of what happens
  -- below. This INSERT is never inside the nested block that follows.
  INSERT INTO help_activations (patient_id, phone_dialed, caregiver_count_at_time, notification_status)
  VALUES (auth.uid(), p_phone_dialed, COALESCE(array_length(v_responder_ids, 1), 0), v_status)
  RETURNING * INTO v_row;

  IF v_responder_ids IS NOT NULL AND array_length(v_responder_ids, 1) > 0 THEN
    -- Nested block = an implicit savepoint: if ANYTHING here raises, it
    -- is caught right here and never rolls back the help_activations
    -- row already committed to this transaction above.
    BEGIN
      v_conv := public.create_conversation(auth.uid(), v_responder_ids, 'HELP button activated');
      v_msg := public.send_message(
        v_conv.id,
        'The HELP button was activated' || CASE WHEN p_phone_dialed IS NOT NULL THEN ' and a call to ' || p_phone_dialed || ' was attempted.' ELSE '.' END,
        true,
        NULL
      );
      UPDATE help_activations
        SET conversation_id = v_conv.id, message_id = v_msg.id, notification_status = 'caregiver_notified'
        WHERE id = v_row.id
        RETURNING * INTO v_row;
    EXCEPTION WHEN OTHERS THEN
      UPDATE help_activations SET notification_status = 'notification_failed' WHERE id = v_row.id RETURNING * INTO v_row;
      RAISE WARNING 'HELP activation %: caregiver notification failed but the event record was preserved: %', v_row.id, SQLERRM;
    END;
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_help_activation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_help_activation(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_help_activation(TEXT) FROM anon;
