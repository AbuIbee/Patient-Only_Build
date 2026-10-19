-- 048_help_activation_audit.sql
-- CRITICAL OWNER-REPORTED REMEDIATION Correction F — HELP Activation
-- Audit & Alerts.
--
-- Confirmed defect: PatientHome.tsx's handleEmergency() ONLY does
-- `window.location.href = 'tel:...'` and shows a local confirmation
-- dialog — no persistent event, no caregiver notification, no
-- acknowledgment, nothing in any safety history. The dialog's own
-- existing copy is already honest ("we tried to start a call," never
-- "connected") — this migration preserves that telephone action exactly
-- as-is and adds the missing record/surface/acknowledge layer alongside
-- it, never replacing it.
--
-- Design: reuses the ALREADY-TESTED Care Communications system
-- (migrations 036/040/042/043) rather than inventing a parallel
-- notification mechanism — a HELP activation automatically starts an
-- URGENT conversation with the patient's current caregivers. This is a
-- deliberate, narrow exception to "do not automatically expose a
-- conversation to every person linked to the patient": a safety event is
-- exactly the case the owner's own Correction F calls for automatic
-- caregiver surfacing, unlike routine care coordination. help_activations
-- itself remains the authoritative, independent safety-history record
-- (so it survives even if the linked conversation is later altered), and
-- its own `conversation_id` is only ever set, never required — if the
-- patient currently has no caregiver, the event is still recorded
-- (honestly, with nobody to notify) rather than silently dropped.
--
-- "Do not claim a call connected or help was dispatched without
-- confirmation": no field here is named/shaped to imply delivery. There
-- is no 'sent' or 'delivered' notification status anywhere — only
-- 'recorded' (the DB write itself succeeded) and the conversation's own
-- real, already-tested read_at/acknowledged_at per caregiver. A failed
-- RPC call (e.g. the device is offline) means NO row is ever created —
-- the frontend (separate commit) explicitly tells the patient this
-- activation could not be recorded in that case, distinct from a
-- successful recording.
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE TABLE IF NOT EXISTS help_activations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  phone_dialed     TEXT,
  conversation_id  UUID REFERENCES conversations(id),
  caregiver_count_at_time INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE help_activations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Patients can view their own HELP activation history"
    ON help_activations FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view their patients' HELP activation history"
    ON help_activations FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = help_activations.patient_id AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE/DELETE — record_help_activation() RPC only.

-- record_help_activation(): the ONLY write path. Caller must be the
-- patient themselves (never an arbitrary patient_id argument — a HELP
-- activation can only ever be recorded for the person actually
-- triggering it). Auto-creates an urgent conversation with every
-- CURRENTLY linked caregiver, reusing create_conversation()/
-- send_message() exactly as a caregiver-initiated conversation would —
-- no parallel permission model, no new "can read this patient's
-- messages" rule.
CREATE OR REPLACE FUNCTION public.record_help_activation(p_phone_dialed TEXT)
RETURNS help_activations AS $$
DECLARE
  v_row help_activations;
  v_caregiver_ids UUID[];
  v_conv conversations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'No patient record found for this account';
  END IF;

  SELECT array_agg(caregiver_id) INTO v_caregiver_ids
  FROM caregiver_patients WHERE patient_id = auth.uid();

  INSERT INTO help_activations (patient_id, phone_dialed, caregiver_count_at_time)
  VALUES (auth.uid(), p_phone_dialed, COALESCE(array_length(v_caregiver_ids, 1), 0))
  RETURNING * INTO v_row;

  IF v_caregiver_ids IS NOT NULL AND array_length(v_caregiver_ids, 1) > 0 THEN
    v_conv := public.create_conversation(auth.uid(), v_caregiver_ids, 'HELP button activated');
    PERFORM public.send_message(
      v_conv.id,
      'The HELP button was activated' || CASE WHEN p_phone_dialed IS NOT NULL THEN ' and a call to ' || p_phone_dialed || ' was attempted.' ELSE '.' END,
      true,
      NULL
    );
    UPDATE help_activations SET conversation_id = v_conv.id WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.record_help_activation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_help_activation(TEXT) TO authenticated;

-- get_patient_help_activation_history(): read helper used by both the
-- patient's own safety history and the caregiver's expanded Patient Care
-- Record — authorization identical to help_activations' own SELECT
-- policies (patient themselves, or their linked caregiver), re-checked
-- explicitly here since this aggregates acknowledgment state across
-- tables.
CREATE OR REPLACE FUNCTION public.get_patient_help_activation_history(p_patient_id UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  phone_dialed TEXT,
  caregiver_count_at_time INTEGER,
  conversation_id UUID,
  acknowledged_count BIGINT,
  acknowledged_by TEXT[]
) AS $$
BEGIN
  IF p_patient_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s HELP activation history';
  END IF;

  RETURN QUERY
  SELECT
    ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id,
    count(ma.id) FILTER (WHERE ma.acknowledged_at IS NOT NULL),
    array_agg(DISTINCT (pr.first_name || ' ' || pr.last_name)) FILTER (WHERE ma.acknowledged_at IS NOT NULL)
  FROM help_activations ha
  LEFT JOIN messages m ON m.conversation_id = ha.conversation_id
  LEFT JOIN message_acknowledgments ma ON ma.message_id = m.id AND ma.user_id != ha.patient_id
  LEFT JOIN profiles pr ON pr.id = ma.user_id
  WHERE ha.patient_id = p_patient_id
  GROUP BY ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id
  ORDER BY ha.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_help_activation_history(UUID) TO authenticated;
