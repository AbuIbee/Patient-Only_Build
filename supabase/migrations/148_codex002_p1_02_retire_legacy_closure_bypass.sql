-- MMA-P1-CODEX-002 P1-02 — "A legacy RPC can bypass required closure
-- controls." Independent Codex audit MMA_P1_CODEX_INDEPENDENT_AUDIT.md,
-- reproduced exactly as described: end_patient_coverage() (migration 035)
-- remained authenticated-callable and directly set status='ended' with
-- no reason, no notes, no audit row, and no archival deadline, even
-- though migration 146 built the real, compliant close_patient_coverage()
-- path. Calling the comment "dead code" in migration 146 did not disable
-- backend access -- this migration does.
--
-- FIX: end_patient_coverage() now delegates to close_patient_coverage(),
-- which already enforces the real director-authority check, mandatory
-- reason/notes, atomicity, idempotency, audit, and the 45-day deadline.
-- Signature is UNCHANGED (still two args) so the one real client caller
-- (organizationService.ts's endPatientCoverage(), confirmed by grep to be
-- otherwise unused by any page) does not need to change -- but it can no
-- longer silently create an incomplete lifecycle record: calling it
-- without a reason/notes now fails exactly the way calling
-- close_patient_coverage() directly without them does, rather than
-- succeeding with NULLs.
CREATE OR REPLACE FUNCTION public.end_patient_coverage(
  p_org_id UUID,
  p_patient_id UUID
) RETURNS boolean AS $$
BEGIN
  PERFORM public.close_patient_coverage(
    p_org_id, p_patient_id,
    'Coverage ended (legacy end_patient_coverage() path)',
    'Submitted through the legacy end_patient_coverage() RPC, which now enforces the same mandatory closure controls as close_patient_coverage().'
  );
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.end_patient_coverage(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_patient_coverage(UUID, UUID) TO authenticated;
