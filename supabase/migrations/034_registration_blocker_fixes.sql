-- 034_registration_blocker_fixes.sql
-- ENTERPRISE CONSOLIDATED DELIVERY — closes out the carried-over
-- registration defects explicitly listed for this delivery:
--   - "Incomplete registrations with no Continue/Edit/Delete controls"
--     (Continue already existed as "Finish Registration"; this adds the
--     missing Delete/cancel action)
--
-- The other listed items in that same bullet group (Edge Function non-2xx
-- parsing, duplicate Register button, partial-creation error messaging)
-- were root-caused and fixed entirely in application code this round —
-- no schema change was needed for those; see
-- src/services/caregiverRegistrationService.ts and CaregiverPortal.tsx.
--
-- STAGING-TARGETED. Not yet applied to production.

-- cancel_my_pending_registration(): lets a caregiver delete their OWN
-- unconsumed pending_caregiver_registrations row (e.g. one whose Auth
-- account creation never completed, with nothing left to resume) so it
-- stops cluttering the dashboard's "Incomplete Registrations" section.
-- Scoped by auth.uid() inside the function, mirroring every other
-- SECURITY DEFINER RPC on this table (migration 030) — never deletes a
-- CONSUMED registration (that row is the historical record of a real,
-- successful claim) or another caregiver's row.
CREATE OR REPLACE FUNCTION public.cancel_my_pending_registration(
  p_registration_id UUID
) RETURNS boolean AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND caregiver_id = auth.uid()
    AND consumed_at IS NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No cancelable registration found for this id — it may already be complete, belong to another caregiver, or not exist.';
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cancel_my_pending_registration(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_my_pending_registration(UUID) TO authenticated;

COMMENT ON FUNCTION public.cancel_my_pending_registration IS 'ENTERPRISE CONSOLIDATED DELIVERY: the "Delete" action for an incomplete registration (the dashboard''s "Continue/Edit/Delete controls" requirement). Only ever deletes the CALLER''s own unconsumed row — never a completed registration (the record of a real claim) or another caregiver''s row.';

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS EXECUTED (real isolated staging
-- project, synthetic identities, cleaned up afterward):
-- ============================================================
-- T1 (positive): the owning caregiver can cancel their own never-created
--     (no resumable_patient_id) pending registration.
-- T2 (negative): an unrelated caregiver's attempt to cancel the SAME
--     registration id is rejected (0 rows match caregiver_id=auth.uid()).
-- T3 (negative): attempting to cancel an already-CONSUMED registration
--     (a real, completed claim) is rejected — consumed_at IS NULL guards
--     this explicitly.
