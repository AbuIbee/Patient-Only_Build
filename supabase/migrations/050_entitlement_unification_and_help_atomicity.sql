-- 050_entitlement_unification_and_help_atomicity.sql
-- CODEX-VERIFIED CRITICAL REMEDIATION — Critical 5 & 6.
--
-- CRITICAL 5: patient_has_paid_entitlement(p_patient_id) only ever
-- checked the `subscriptions` table — never Enterprise coverage. Two
-- real RLS policies gate on it (memories INSERT, care_partner_checkins
-- INSERT): an Enterprise-covered patient with no personal subscription
-- row (the normal case — covered patients are never individually
-- billed) would be shown these features as unlocked by the client
-- (SubscriptionContext's own, separately-correct isEnterpriseCovered
-- override) and then be REJECTED by the database the moment they
-- actually tried to use them. is_patient_enterprise_covered() below is
-- now the single, shared, authoritative definition — both
-- is_my_enterprise_coverage_active() (the client-facing, auth.uid()-
-- scoped check SubscriptionContext already calls) and
-- patient_has_paid_entitlement() (every database-level feature-gate
-- policy) call it, so there is exactly one place this logic can ever
-- drift from either "Patient routing," "Feature access," or "Full
-- Support display."
--
-- CRITICAL 6: record_help_activation() ran the HELP-event insert and the
-- auto-conversation creation in ONE transaction — a failure in
-- create_conversation()/send_message() would roll back the ALREADY-
-- INSERTED help_activations row along with it, erasing the safety event
-- entirely because of an unrelated messaging failure. The conversation/
-- message attempt is now wrapped in its own nested BEGIN/EXCEPTION
-- block (an implicit savepoint in PL/pgSQL) — a failure there is
-- caught, recorded as notification_status, and never propagates to roll
-- back the HELP record itself. Acknowledgment counting is also now
-- scoped to the SPECIFIC message_id this event created, not every
-- message anyone ever sends in that conversation afterward — a reply
-- about something unrelated must never count as acknowledging the HELP
-- event.
--
-- STAGING-TARGETED. Not yet applied to production.

CREATE OR REPLACE FUNCTION public.is_patient_enterprise_covered(p_patient_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM covered_patient_memberships cpm
    JOIN organization_licenses ol ON ol.organization_id = cpm.organization_id
    WHERE cpm.patient_id = p_patient_id
      AND cpm.status = 'active'
      AND ol.status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_patient_enterprise_covered(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_patient_enterprise_covered(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_my_enterprise_coverage_active()
RETURNS boolean AS $$
  SELECT public.is_patient_enterprise_covered(auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.patient_has_paid_entitlement(p_patient_id UUID)
RETURNS boolean AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = p_patient_id
        AND s.tier IN ('paid_tier', 'master')
        AND (
          s.status = 'active'
          OR (s.status = 'promo' AND (s.promo_expires_at IS NULL OR s.promo_expires_at > now()))
        )
    )
    OR public.is_patient_enterprise_covered(p_patient_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- CRITICAL 6 — HELP event atomicity + message-scoped acknowledgment.
-- ============================================================================
ALTER TABLE public.help_activations ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id);
ALTER TABLE public.help_activations ADD COLUMN IF NOT EXISTS notification_status TEXT NOT NULL DEFAULT 'recorded'
  CHECK (notification_status IN ('recorded', 'no_caregiver_linked', 'caregiver_notified', 'notification_failed'));

CREATE OR REPLACE FUNCTION public.record_help_activation(p_phone_dialed TEXT)
RETURNS help_activations AS $$
DECLARE
  v_row help_activations;
  v_caregiver_ids UUID[];
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

  SELECT array_agg(caregiver_id) INTO v_caregiver_ids
  FROM caregiver_patients WHERE patient_id = auth.uid();

  v_status := CASE WHEN v_caregiver_ids IS NULL OR array_length(v_caregiver_ids, 1) = 0 THEN 'no_caregiver_linked' ELSE 'recorded' END;

  -- The HELP record itself — committed regardless of what happens
  -- below. This INSERT is never inside the nested block that follows.
  INSERT INTO help_activations (patient_id, phone_dialed, caregiver_count_at_time, notification_status)
  VALUES (auth.uid(), p_phone_dialed, COALESCE(array_length(v_caregiver_ids, 1), 0), v_status)
  RETURNING * INTO v_row;

  IF v_caregiver_ids IS NOT NULL AND array_length(v_caregiver_ids, 1) > 0 THEN
    -- Nested block = an implicit savepoint: if ANYTHING here raises, it
    -- is caught right here and never rolls back the help_activations
    -- row already committed to this transaction above.
    BEGIN
      v_conv := public.create_conversation(auth.uid(), v_caregiver_ids, 'HELP button activated');
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

-- get_patient_help_activation_history(): acknowledgment counting now
-- scoped to ha.message_id specifically — a reply about something else
-- in the same conversation can never count as acknowledging this event.
DROP FUNCTION IF EXISTS public.get_patient_help_activation_history(UUID);
CREATE OR REPLACE FUNCTION public.get_patient_help_activation_history(p_patient_id UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  phone_dialed TEXT,
  caregiver_count_at_time INTEGER,
  conversation_id UUID,
  notification_status TEXT,
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
    ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status,
    count(ma.id) FILTER (WHERE ma.acknowledged_at IS NOT NULL),
    array_agg(DISTINCT (pr.first_name || ' ' || pr.last_name)) FILTER (WHERE ma.acknowledged_at IS NOT NULL)
  FROM help_activations ha
  LEFT JOIN message_acknowledgments ma ON ma.message_id = ha.message_id AND ma.user_id != ha.patient_id
  LEFT JOIN profiles pr ON pr.id = ma.user_id
  WHERE ha.patient_id = p_patient_id
  GROUP BY ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status
  ORDER BY ha.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
