-- 079_r7_mastercorrective2_sec03_func04_followup.sql
-- An independent Codex re-audit of commit 9023e90c (the prior Master
-- Corrective migration 076-078 commit) found 3 classes of REAL
-- remaining defect in that commit's own fixes. Each is root-caused and
-- closed here; see codex_master_9023_acceptance/ for the audit
-- scripts/evidence this migration responds to, and
-- 44_MASTERCORRECTIVE2_FINDING_REGISTER.md for the written register.

-- ============================================================================
-- SEC-03 FOLLOW-UP (part 1 of 3) — CONFIRMED DEFECT
-- (SEC03-RPC-record_patient_diagnosis/allergy/vitals, codex_master_
-- 9023_acceptance/verify_security.py): an ordinary caregiver's RPC
-- call to record_patient_diagnosis()/record_patient_allergy()/
-- record_patient_vitals() with p_source='verified_source' succeeded
-- and persisted. Migration 076's RESTRICTIVE table policies correctly
-- block this via DIRECT REST (SEC03-DIRECT-* all still pass), but
-- these RPCs are SECURITY DEFINER and therefore bypass RLS entirely
-- for their own writes -- RLS policies are not a backstop for a
-- SECURITY DEFINER function's own logic. The RPCs themselves (migration
-- 070, never touched by migration 076) only ever checked
-- `p_source = 'professional_observation'`, never `'verified_source'`
-- -- the SAME two-tier coverage gap migration 076 already fixed for
-- the column's own CHECK constraint and the RESTRICTIVE policies, but
-- never propagated to these three RPCs' own gate.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_patient_diagnosis(
  p_patient_id UUID, p_condition_name TEXT, p_diagnosed_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_diagnoses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_diagnoses;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_condition_name, '')) = '' THEN RAISE EXCEPTION 'A condition name is required'; END IF;
  IF p_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a verified or professional_observation source';
  END IF;
  INSERT INTO patient_diagnoses (patient_id, condition_name, diagnosed_date, notes, source, author_id)
  VALUES (p_patient_id, p_condition_name, p_diagnosed_date, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_patient_allergy(
  p_patient_id UUID, p_allergen TEXT, p_reaction TEXT DEFAULT NULL, p_severity TEXT DEFAULT 'unknown', p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_allergies
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_allergies;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_allergen, '')) = '' THEN RAISE EXCEPTION 'An allergen is required'; END IF;
  IF p_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a verified or professional_observation source';
  END IF;
  INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, notes, source, author_id)
  VALUES (p_patient_id, p_allergen, p_reaction, p_severity, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_patient_vitals(
  p_patient_id UUID, p_blood_pressure TEXT DEFAULT NULL, p_pulse_bpm INTEGER DEFAULT NULL, p_temperature_f NUMERIC DEFAULT NULL,
  p_oxygen_saturation INTEGER DEFAULT NULL, p_weight_lbs NUMERIC DEFAULT NULL, p_pain_level INTEGER DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patient_vitals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_vitals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a verified or professional_observation source';
  END IF;
  INSERT INTO patient_vitals (patient_id, blood_pressure, pulse_bpm, temperature_f, oxygen_saturation, weight_lbs, pain_level, notes, source, author_id)
  VALUES (p_patient_id, p_blood_pressure, p_pulse_bpm, p_temperature_f, p_oxygen_saturation, p_weight_lbs, p_pain_level, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- ============================================================================
-- SEC-03 FOLLOW-UP (part 2 of 3) — CONFIRMED DEFECTS
-- (SEC03-COMM-VERIFIED, SEC03-UNCHANGED-SOURCE-CONTENT): (a) a direct
-- PATCH setting communication_needs_source='verified_source' (the
-- OTHER professional tier migration 076's trigger never checked --
-- only 'professional_observation') succeeded; (b) once a field was
-- legitimately set to a professional tier, a PATCH that changed only
-- the communication_needs TEXT -- never touching the source column at
-- all -- was NOT re-validated, because the trigger only fired its
-- check when the SOURCE value itself changed. The forged content then
-- displayed with a stale, now-false 'professional_observation'
-- attribution. record_communication_needs() had the identical
-- single-tier gap as the three RPCs above.
--
-- FIX: record_communication_needs() now checks both tiers; the trigger
-- now re-validates whenever EITHER the content OR the source changes,
-- and gates on whichever of OLD/NEW is in a professional tier -- so a
-- non-professional can neither claim a professional tier nor silently
-- overwrite content already attributed to one.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_communication_needs(
  p_patient_id UUID, p_communication_needs TEXT, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patients AS $$
DECLARE
  v_row patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
  END IF;
  UPDATE patients SET
    communication_needs = p_communication_needs, communication_needs_source = p_source, communication_needs_updated_by = auth.uid()
  WHERE id = p_patient_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.enforce_patient_safety_plan_provenance()
RETURNS TRIGGER AS $$
DECLARE
  v_code_status_touch BOOLEAN;
  v_comm_touch BOOLEAN;
BEGIN
  v_code_status_touch := TG_OP = 'INSERT' OR NEW.code_status IS DISTINCT FROM OLD.code_status OR NEW.code_status_source IS DISTINCT FROM OLD.code_status_source;
  IF v_code_status_touch THEN
    IF (
      NEW.code_status_source IN ('verified_source', 'professional_observation')
      OR (TG_OP = 'UPDATE' AND OLD.code_status_source IN ('verified_source', 'professional_observation'))
    ) AND NOT public.is_professional_staff_for_patient(NEW.id) THEN
      RAISE EXCEPTION 'Only an assigned therapist or medical professional may set or modify a verified code status';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      NEW.code_status_updated_by := auth.uid();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_comm_touch := NEW.communication_needs IS DISTINCT FROM OLD.communication_needs OR NEW.communication_needs_source IS DISTINCT FROM OLD.communication_needs_source;
    IF v_comm_touch THEN
      IF (
        COALESCE(NEW.communication_needs_source, 'unknown') IN ('verified_source', 'professional_observation')
        OR COALESCE(OLD.communication_needs_source, 'unknown') IN ('verified_source', 'professional_observation')
      ) AND NOT public.is_professional_staff_for_patient(NEW.id) THEN
        RAISE EXCEPTION 'Only an assigned therapist or medical professional may record or modify a professionally-sourced communication need';
      END IF;
      NEW.communication_needs_updated_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- FUNC-04 FOLLOW-UP (part 3 of 3) — CONFIRMED DEFECT (FUNC04-REVOKED-
-- SEARCH, FUNC04-REVOKED-LIST): after a caregiver's staff_patient_
-- assignments row was deactivated, their get_my_conversations() and
-- search_my_conversations() calls still returned the patient's
-- conversation -- the exact "revoked membership must lose future
-- access" case C06's own locked requirement names. Both RPCs scoped
-- only via conversation_participants row existence, never re-checking
-- whether the caller's authorization for the PATIENT is still active
-- -- conversation_participants rows are never cleaned up on
-- revocation, by design (preserving conversation history structure),
-- so authorization must be re-checked at read time instead.
--
-- FIX: both RPCs now additionally require is_authorized_for_patient()
-- (migration 040's existing union of self/caregiver_patients/
-- staff_patient_assignments/therapist_relationships -- the exact same
-- check create_conversation() already re-verifies for every recipient)
-- to be true for the CALLER right now, not merely that a
-- conversation_participants row exists historically.
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
  WHERE (p_patient_id IS NULL OR c.patient_id = p_patient_id)
    AND public.is_authorized_for_patient(auth.uid(), c.patient_id)
  ORDER BY c.updated_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_my_conversations IS 'ENTERPRISE CONSOLIDATED DELIVERY: scoped by auth.uid() via the conversation_participants JOIN AND a live is_authorized_for_patient() re-check (MASTER CORRECTIVE 2 FUNC-04) — revoked membership loses future access even though conversation_participants rows are never retroactively deleted. has_open_follow_up (MASTER CORRECTIVE FUNC-03) reflects a real unresolved follow-up request, independent of read state.';
REVOKE ALL ON FUNCTION public.get_my_conversations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_my_conversations(p_search_term TEXT)
RETURNS TABLE (conversation_id UUID) AS $$
  SELECT DISTINCT c.id
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN messages m ON m.conversation_id = c.id
  WHERE btrim(COALESCE(p_search_term, '')) != '' AND m.body ILIKE '%' || p_search_term || '%'
    AND public.is_authorized_for_patient(auth.uid(), c.patient_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.search_my_conversations(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_my_conversations(TEXT) TO authenticated;
