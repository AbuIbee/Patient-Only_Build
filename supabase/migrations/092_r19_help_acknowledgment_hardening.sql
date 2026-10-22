-- Codex MMA-CODEX-07 — HELP acknowledgment.
--
-- CONFIRMED DEFECT (reproduced by reading, not merely inferred):
-- acknowledge_help_activation() (migration 075) gated on
-- has_patient_access(v_row.patient_id), which has an explicit
-- `p_patient_id = auth.uid()` OR-branch (migration 070) — the exact
-- same check a genuine staff member passes. A patient could therefore
-- call acknowledge_help_activation() on their OWN HELP activation
-- directly via RPC, setting staff_acknowledged_by/staff_acknowledged_at
-- to themselves — a forged "staff responded" record for an event
-- nobody but the patient themselves ever saw.
--
-- Fix: require genuine CURRENT staff/professional/director standing
-- for this patient specifically — caregiver_patients,
-- staff_patient_assignments (any staff org_role), therapist_relationships,
-- or is_org_director_for_patient() (migration 087) — and explicitly
-- reject the patient themselves, rather than reusing
-- has_patient_access()'s broader self-inclusive check.
--
-- Also hardens concurrent acknowledgment handling (a named requirement):
-- once a HELP activation has been acknowledged, a second call is a
-- safe no-op returning the EXISTING acknowledgment unchanged, rather
-- than silently overwriting who actually responded first with a
-- second, later caller's identity.
CREATE OR REPLACE FUNCTION public.acknowledge_help_activation(p_help_activation_id UUID)
RETURNS help_activations AS $$
DECLARE
  v_row help_activations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM help_activations WHERE id = p_help_activation_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such HELP activation'; END IF;

  IF auth.uid() = v_row.patient_id THEN
    RAISE EXCEPTION 'A patient cannot acknowledge their own HELP activation as staff';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = v_row.patient_id AND caregiver_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = v_row.patient_id AND user_id = auth.uid() AND is_active = true)
    OR EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = v_row.patient_id AND therapist_id = auth.uid() AND is_active = true)
    OR public.is_org_director_for_patient(auth.uid(), v_row.patient_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient';
  END IF;

  -- Idempotent: the first real acknowledgment wins; a later call (a
  -- second responder, a retried request) returns it unchanged rather
  -- than overwriting who actually responded.
  IF v_row.staff_acknowledged_by IS NOT NULL THEN
    RETURN v_row;
  END IF;

  UPDATE help_activations SET staff_acknowledged_by = auth.uid(), staff_acknowledged_at = now()
  WHERE id = p_help_activation_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.acknowledge_help_activation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_help_activation(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.acknowledge_help_activation(UUID) FROM anon;
