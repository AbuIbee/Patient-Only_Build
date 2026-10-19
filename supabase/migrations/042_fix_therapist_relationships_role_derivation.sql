-- 042_fix_therapist_relationships_role_derivation.sql
-- FINAL INTEGRATION CORRECTIONS item 2 — bug found live-testing the
-- therapist_relationships integration added in migration 040.
--
-- is_authorized_for_patient() and get_patient_care_circle() were correctly
-- extended to recognize a legacy therapist_relationships link, but
-- create_conversation() and add_conversation_participant() each compute
-- participant_role via their OWN separate CASE expression that was never
-- updated — so a person authorized ONLY via therapist_relationships
-- resolved to a NULL role and the INSERT failed outright on
-- conversation_participants' NOT NULL constraint (confirmed live: adding
-- a therapist_relationships-linked therapist to a conversation raised
-- "null value in column participant_role violates not-null constraint").
--
-- Fixed by adding the same therapist_relationships branch used in
-- get_patient_care_circle() to both CASE expressions.
--
-- STAGING-TARGETED. Not yet applied to production.
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
    WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true)
      THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true LIMIT 1)
    WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = p_user_id AND patient_id = v_patient_id AND is_active = true) THEN 'therapist'
  END;

  INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
  VALUES (p_conversation_id, p_user_id, v_role, auth.uid())
  ON CONFLICT (conversation_id, user_id) DO NOTHING
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
    WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true)
      THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true LIMIT 1)
    WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true) THEN 'therapist'
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
      WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true)
        THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true LIMIT 1)
      WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = v_recipient AND patient_id = p_patient_id AND is_active = true) THEN 'therapist'
    END;
    INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
    VALUES (v_conv.id, v_recipient, v_recipient_role, auth.uid())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END LOOP;

  RETURN v_conv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
