-- MMA-P1-FINAL-CLOSURE Priority 5 — corrective fix for migration 149
-- (already pushed; not rewritten in place, per this repository's own
-- established convention -- see migrations 147/156 for the identical
-- precedent). See migration 158's header comment for the full
-- explanation and empirical reproduction of the bug: migration 149's
-- four RESTRICTIVE policies embedded a raw subquery against
-- patient_legal_holds, which has RLS limiting SELECT to the Platform
-- Owner only -- for any ordinary (non-admin) caller, that subquery is
-- silently filtered to zero rows regardless of the hold's real state,
-- so `NOT EXISTS(...)` always evaluated to TRUE and the RESTRICTIVE
-- policy provided NO actual protection against the exact threat model
-- (an ordinary Caregiver) the original Codex P1-03 finding named.
--
-- Repoints all four policies at patient_has_active_legal_hold()
-- (migration 158), a SECURITY DEFINER function unaffected by the
-- calling role's own RLS on patient_legal_holds. No other logic
-- changes; the DELETE-only, non-destructive-UPDATE-permitted scope
-- decision from migration 149 is preserved exactly.
DROP POLICY IF EXISTS "Active legal hold blocks patient_notes deletion" ON patient_notes;
CREATE POLICY "Active legal hold blocks patient_notes deletion"
  ON patient_notes AS RESTRICTIVE FOR DELETE
  USING (NOT public.patient_has_active_legal_hold(patient_id));

DROP POLICY IF EXISTS "Active legal hold blocks patient_document_uploads deletion" ON patient_document_uploads;
CREATE POLICY "Active legal hold blocks patient_document_uploads deletion"
  ON patient_document_uploads AS RESTRICTIVE FOR DELETE
  USING (NOT public.patient_has_active_legal_hold(patient_id));

DROP POLICY IF EXISTS "Active legal hold blocks medications deletion" ON medications;
CREATE POLICY "Active legal hold blocks medications deletion"
  ON medications AS RESTRICTIVE FOR DELETE
  USING (NOT public.patient_has_active_legal_hold(patient_id));

DROP POLICY IF EXISTS "Active legal hold blocks medication_logs deletion" ON medication_logs;
CREATE POLICY "Active legal hold blocks medication_logs deletion"
  ON medication_logs AS RESTRICTIVE FOR DELETE
  USING (NOT public.patient_has_active_legal_hold(patient_id));
