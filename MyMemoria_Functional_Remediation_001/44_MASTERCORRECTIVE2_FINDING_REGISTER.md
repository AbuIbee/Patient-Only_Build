# MASTER CORRECTIVE 2 — Follow-up Finding Register

An independent Codex re-audit of commit `9023e90c` (the prior Master Corrective closure) landed mid-session as `codex_master_9023_acceptance/` (scripts: `apply_upgrade.py`, `verify_security.py`; evidence: `executed_results.jsonl`, per-migration `.log` files). It found **3 real, confirmed remaining defects** in that commit's own fixes. Each is closed by migration `079`, with a committed regression test reproducing the exact original failure condition.

## SEC-03 follow-up (1): `verified_source` ungated in the RPCs themselves

- **Finding IDs:** `SEC03-RPC-record_patient_diagnosis`, `SEC03-RPC-record_patient_allergy`, `SEC03-RPC-record_patient_vitals`
- **Root cause:** migration 076's RESTRICTIVE table policies correctly block a direct-REST forgery of `source='verified_source'` (confirmed still passing: `SEC03-DIRECT-*`). But these three RPCs are `SECURITY DEFINER` and therefore **bypass RLS entirely for their own writes** — a RESTRICTIVE policy is not a backstop for a SECURITY DEFINER function's own logic. The RPCs' own gate (migration 070, never touched by migration 076) only ever checked `p_source = 'professional_observation'`, never `'verified_source'` — the exact two-tier gap migration 076 fixed at the column/policy level but never propagated into these three RPCs.
- **Fix:** all three RPCs now check `p_source IN ('verified_source', 'professional_observation')`.
- **Regression test:** `tests/integration/round7MasterCorrectiveSecurity.test.ts`, "SEC-03 follow-up" describe block (parameterized across all three RPCs) — asserts both the rejection and that nothing persisted.

## SEC-03 follow-up (2): `communication_needs` professional-tier gate had two more gaps

- **Finding IDs:** `SEC03-COMM-VERIFIED`, `SEC03-UNCHANGED-SOURCE-CONTENT`
- **Root cause:** (a) the migration 076 trigger's `communication_needs` branch only checked `= 'professional_observation'`, never `'verified_source'` — same single-tier gap as above, this time in a trigger rather than an RPC. (b) The trigger only re-validated when the `communication_needs_source` COLUMN ITSELF changed. A PATCH that changed only the `communication_needs` TEXT — leaving an existing `'professional_observation'` source value untouched — was never re-checked at all, letting a patient silently overwrite professionally-attributed content while the stale, now-false professional attribution remained displayed.
- **Fix:** `record_communication_needs()` now checks both tiers. The trigger now fires whenever EITHER the content or the source changes, and gates on whichever of OLD/NEW is in a professional tier — so professionally-attributed content can never be overwritten by a non-professional, whether or not they touch the source column.
- **Regression test:** same file, "content already attributed to a professional source cannot be silently overwritten..." and the `verified_source` direct-PATCH test.

## FUNC-04 follow-up: revoked membership did not lose conversation search/list access

- **Finding IDs:** `FUNC04-REVOKED-SEARCH`, `FUNC04-REVOKED-LIST`
- **Root cause:** `get_my_conversations()` and `search_my_conversations()` (both migration 077, this engagement's own FUNC-04 fix) scoped only via `conversation_participants` row existence. That row is never retroactively deleted on revocation (by design — it preserves conversation history structure), so a caregiver whose `staff_patient_assignments` row was deactivated could still search and list the patient's conversation — the exact "revoked membership must lose future access" case C06's own locked requirement names, and a real narrowing of this session's own FUNC-04 fix.
- **Fix:** both RPCs now additionally require `is_authorized_for_patient(auth.uid(), c.patient_id)` — migration 040's existing union of self/`caregiver_patients`/active-`staff_patient_assignments`/active-`therapist_relationships`, the identical check `create_conversation()` already re-verifies for every recipient — re-evaluated live at read time, not merely historical participant-row existence.
- **Regression test:** "a caregiver whose assignment was revoked no longer sees or can search a patient's conversation" — revokes, confirms empty results from both RPCs, restores, confirms access resumes.

## Verification

`npm run test:integration` — **19/19 passing** (13 original Master Corrective tests + 6 new). `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (377/377), `npm run build` all clean after migration 079.

## Disposition of `codex_master_9023_acceptance/`

Committed alongside this migration (scripts + logs + `executed_results.jsonl`) as the evidence this fix responds to, excluding `ephemeral_local_config.json` (contains a real `db_password`/`jwt_secret` for its disposable audit container — same class of exclusion as `codex_round7_independent_audit/ephemeral_local_config.json`) and `__pycache__/`.
