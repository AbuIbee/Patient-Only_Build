# MASTER CORRECTIVE — Codex Finding Closure Register

**Branch:** `remediation/mymemoria-functional-001`
**Starting HEAD:** `b7352408` **Baseline audit label:** `codex-round7-b7352408` (confirmed via `docker inspect` label on the audit's own disposable Postgres container — the audit ran against this exact commit's schema, including migration 075)
**Audit source:** `codex_round7_independent_audit/` (untracked at session start; `executed_results.jsonl`, `security_tests.py`, `concurrency_test.py`, `seed_fixture.py`, `browser_audit.mjs`, `browser_results.json`, `LOCKED_REQUIREMENTS_REFERENCE.md` read in full)
**Fix migrations:** `076_r7_mastercorrective_sec01-06_func01.sql`, `077_r7_mastercorrective_func02-04.sql`, `078_r7_mastercorrective_h06_schedule_detail.sql`
**Regression tests:** `tests/integration/round7MasterCorrectiveSecurity.test.ts` (13 tests, real local stack), `tests/e2e_mastercorrective_func02_mood_pagination.spec.ts`, `tests/e2e_mastercorrective_h06_h14.spec.ts` (real browser)

Every finding below was independently reproduced against the real local Supabase stack (not merely source-reviewed) either by re-running the Codex artifact where it still existed on disk, or — where the generating script was not preserved — by reconstructing the exact precondition from `seed_fixture.py`'s fixture shape and `executed_results.jsonl`'s evidence fields, then confirming the same failure live before writing any fix (per directive §2's explicit instruction for missing scripts).

## SEC-01 — Therapist accept/revoke race

- **Codex finding IDs:** `DEFECT-THER-ACCEPT-REVOKE-RACE`, `DEFECT-THER-RACE-RETAINS-WRITE` (`concurrency_test.py`, fully preserved)
- **Severity:** P0 — unauthorized clinical-note write survives revocation under a real, two-session timing condition, not a contrived single-request test.
- **Affected boundary:** `revoke_therapist_connection()` / `therapist_relationships.is_active` / `patient_notes` INSERT authorization (`is_therapist_for_patient()`).
- **Root cause:** `revoke_therapist_connection()` ran `UPDATE therapist_relationships SET is_active=false` **before** acquiring the `FOR UPDATE` lock on `pending_therapist_connections` that actually serializes it against a concurrent `respond_to_therapist_invite()`. When an accept was mid-flight (holding that lock), the deactivation UPDATE found no relationship row yet and silently no-opped; by the time the lock resolved and the connection was correctly marked `revoked`, the deactivation statement had already run and would never run again.
- **Fix:** Migration 076 reorders the function — lock `pending_therapist_connections` first, mark it revoked, **then** deactivate `therapist_relationships`. Correctness for the opposite race ordering (revoke wins the lock first) was already proven in migration 065/to be unaffected.
- **Regression test:** `tests/integration/round7MasterCorrectiveSecurity.test.ts` → `SEC-01` describe block, reproducing the identical two-session interleaving via a raw `FOR UPDATE`-holding `psql` session (`runConcurrentAcceptHoldingLock` in `_runtime.ts`), timed against `pg_stat_activity.wait_event='PgSleep'` exactly as the original script did.
- **Status:** CLOSED — original race no longer reproducible; final state is `revoked|false`, not `revoked|true`.

## SEC-02 — Staff assignment revocation bypass

- **Codex finding IDs:** `DEFECT-AMENDMENT-AFTER-REVOCATION`, `DEFECT-VISIT-START-AFTER-REVOCATION`, `DEFECT-VISIT-END-AFTER-REVOCATION` (`security_tests.py`, fully preserved)
- **Severity:** P0 — three independent authorization boundaries re-checked only historical ownership, never current authorization.
- **Affected boundary:** `record_note_amendment()`, `start_caregiver_visit()`, `end_caregiver_visit()`.
- **Root cause:**
  - `record_note_amendment()` re-validated the professional-tier gate only for `therapist_session`/`clinical_observation` notes; every other `note_type` had no current-access re-check at all.
  - `start_caregiver_visit()`/`end_caregiver_visit()` checked only `caregiver_id = auth.uid()` (visit-row ownership, which never changes), never `staff_patient_assignments.is_active`/`caregiver_patients`.
- **Fix:** Migration 076 adds a `has_patient_access()` re-check to the amendment path for every note type, and a current-authorization re-check (active `staff_patient_assignments` OR `caregiver_patients`) to both visit functions, at the actual mutation boundary.
- **Regression test:** `SEC-02` describe block — deactivates the assignment, confirms all three writes rejected, reactivates it, confirms they resume working normally.
- **Status:** CLOSED.

## SEC-03 — Clinical provenance forgery

- **Codex finding IDs:** `DEFECT-DIRECT-VERIFIED-CODE-STATUS` (`security_tests.py`, preserved); `DEFECT-DIRECT-PROFESSIONAL-patient_diagnoses`/`patient_allergies`/`patient_vitals` (generating script not present on disk — reconstructed from `seed_fixture.py`'s identities and `executed_results.jsonl`'s evidence shape: `status 201, persisted_rows: 1` for a direct POST with a forged `source` claim)
- **Severity:** P0 — forged clinical provenance (a caregiver's claim silently becoming "verified by a medical professional") is exactly the risk class this engagement's locked spec names explicitly.
- **Affected boundary:** `patients.code_status`/`code_status_source` (direct UPDATE); `patient_diagnoses`/`patient_allergies`/`patient_vitals` (direct INSERT).
- **Root cause:** The professional-tier gate (`is_professional_staff_for_patient()`) existed only inside the `record_*()` RPCs. The underlying tables' own RLS never independently re-checked the claimed `source`/`code_status_source` value — migration 070's own comment incorrectly asserted "RLS WITH CHECK alone cannot see the `source` value cleanly," which is false; a `WITH CHECK` expression can reference any column of the row being written. `patients.code_status*` had no protection at all beyond the RPC, and the patient's own self-row UPDATE policy (migration 004) let a patient set these columns on themself directly.
- **Fix:** Migration 076 adds (a) a `BEFORE INSERT OR UPDATE` trigger on `patients` re-validating the tier gate for `code_status*`/`communication_needs_source` on every write path and forcing the `*_updated_by` actor columns server-side; (b) a `RESTRICTIVE` INSERT policy on each of the three clinical tables enforcing the identical tier check the RPCs already perform.
- **Regression test:** `SEC-03` describe block — direct `PATCH`/`POST` forgery attempts all rejected; a real medical professional's legitimate RPC call still succeeds (positive control).
- **Status:** CLOSED.

## SEC-04 — Unauthorized care-plan supersession

- **Codex finding ID:** `DEFECT-ORDINARY-CAREGIVER-SUPERSEDES-CAREPLAN` (generating script not present on disk — reconstructed from the evidence shape `previous_plan_current: "f"`, `new_author: <ordinary caregiver uuid>`, which only `record_patient_care_plan()`'s own internal supersession logic produces)
- **Severity:** P0 — an ordinary caregiver with no clinical authority could supersede a (potentially professionally-authored) official care plan.
- **Affected boundary:** `record_patient_care_plan()`; `patient_care_plans` INSERT.
- **Root cause:** The RPC required only `has_patient_access()` — the same bar as reading the chart — never a clinical-authority check, despite the locked requirement's own text ("clinician/agency-approved... distinguish orders from patient preferences").
- **Fix:** Migration 076 requires `is_professional_staff_for_patient()` to author or supersede a plan, both in the RPC and as a `RESTRICTIVE` table policy — the same pattern already proven for therapy goals (P19).
- **Regression test:** `SEC-04` describe block — ordinary caregiver rejected; medical professional still succeeds.
- **Status:** CLOSED.

## SEC-05 — Task audit actor forgery

- **Codex finding ID:** `DEFECT-TASK-AUDIT-IDENTITY-FORGERY` (generating script not present on disk — reconstructed: a direct `PATCH /rest/v1/tasks` setting `status_updated_by` to an arbitrary other user's id, matching the evidence field `forged_other_user_persisted: true`)
- **Severity:** P1 — audit-trail integrity, not direct patient-data exposure, but corrodes every other control that assumes this column reflects the true actor.
- **Affected boundary:** `tasks.status_updated_by`.
- **Root cause:** A plain client-settable column with no trigger forcing it to equal `auth.uid()`.
- **Fix:** Migration 076 adds a `BEFORE UPDATE` trigger that forces `status_updated_by`/`status_updated_at` to the authenticated caller/`now()` whenever `status` changes, silently overriding any client-supplied value.
- **Regression test:** `SEC-05` describe block.
- **Status:** CLOSED.

## SEC-06 — Ordinary caregiver billing disclosure

- **Codex finding ID:** `DEFECT-CAREGIVER-BILLING-READ` (generating script not present on disk — reconstructed: a direct GET of `/rest/v1/organization_licenses` as an ordinary caregiver, matching the evidence's full row including `annual_license_fee`)
- **Severity:** P1 — commercial/financial disclosure to an unintended role, not a patient-safety or clinical-authorization breach, but an explicit locked-contract exclusion (X05).
- **Affected boundary:** `organization_licenses` SELECT RLS.
- **Root cause:** Migration 035's original policy ("Active org members can view their own organization's license") conflated an ordinary member's *operational* need to know coverage status with a director's *commercial* need to see billing terms, in a single row-scoped (not column-scoped) policy.
- **Fix:** Migration 076 restricts the base table's SELECT policy to `is_active_org_director()` and adds `get_organization_coverage_status()`, a narrow RPC exposing only `status`/`covered_patient_capacity` to any active member. `EnterpriseStaffPatientView.tsx`'s F01 CoverageBanner was updated in the same commit to call the RPC instead of reading the table directly.
- **Regression test:** `SEC-06` describe block — ordinary caregiver denied, director allowed, coverage RPC still works for the caregiver.
- **Status:** CLOSED. **This closes a previously-mis-accepted PASS row (X05)** — see Deliverable B for the honest disclosure of why the original acceptance was wrong.

## FUNC-01 — Visit completion without required documentation

- **Codex finding ID:** `DEFECT-VISIT-NOTES-NOT-REQUIRED` (`security_tests.py`, preserved)
- **Root cause:** `end_caregiver_visit()` accepted `NULL`/empty `visit_notes`. The locked requirement (W01) reads: "capture start/end times **and required visit notes**" — this is the actual approved business rule, not an invented payer-specific EVV rule.
- **Fix:** Migration 076 rejects empty/whitespace-only notes at completion.
- **Status:** CLOSED (co-located with SEC-02's visit-function fix).

## FUNC-02 — Mood history inaccessible in the Enterprise record

- **Codex finding ID:** `UI-P11-MOOD-HISTORY-UNREACHABLE` (`browser_audit.mjs`, preserved)
- **Root cause:** The Round 7 Corrective mood-pagination UI lived inside `EnterpriseStaffPatientView`'s default render branch, which is dead code whenever a caller supplies `onReady` — and `EnterpriseCaregiverDashboard` always does, rendering `EnterprisePatientRecordTabs` instead. The feature existed but was never reachable by an ordinary org-caregiver.
- **Fix:** Moved the Mood History card + "Load more" control into `EnterprisePatientRecordTabs.tsx`'s `MedicalTab` — the actually-reachable component.
- **Regression test:** `tests/e2e_mastercorrective_func02_mood_pagination.spec.ts` — real browser, real org-caregiver, 15 seeded entries, confirms 10→15 after clicking Load more.
- **Status:** CLOSED.

## FUNC-03 — Communications categorization defect

- **Codex finding ID:** `UI-INBOX-READ-FOLLOWUP-MISCLASSIFIED` (`browser_audit.mjs`, preserved)
- **Root cause:** `CommunicationsView` classified "Needs a response" using `unreadCount > 0` as a proxy — conflating "unread" with "has an open follow-up." A read message with an unresolved follow-up request fell into "Routine."
- **Fix:** Migration 077 adds `get_my_conversations().has_open_follow_up`, a real `EXISTS` over `message_acknowledgments.follow_up_requested`/`follow_up_resolved`; the client now classifies on that signal.
- **Regression test:** `tests/integration/round7MasterCorrectiveSecurity.test.ts` → `FUNC-03` — a fully-read conversation with an unresolved follow-up correctly reports `has_open_follow_up=true`.
- **Status:** CLOSED.

## FUNC-04 — Message-history/search defect

- **Codex finding ID:** `UI-C06-HISTORICAL-SEARCH-MISSING` (`browser_audit.mjs`, preserved)
- **Root cause (determined, not assumed):** Client filter scope, not server paging or an inaccessible component — `ConversationSummary` only ever carries the conversation's single latest message; a search for text in an older message had nothing to match against, structurally, not as a UI bug.
- **Fix:** Migration 077 adds `search_my_conversations()`, searching every message body in the caller's own conversations server-side; the client unions this with its existing instant local-field filter.
- **Regression test:** `FUNC-04` describe block — finds a conversation by an older message's text its latest message does not contain.
- **Status:** CLOSED.

## FUNC-05 — H13/H14/P07/P11/O07 adjudication

- **H13 (Visit Verification/EVV):** Left **PARTIAL**, per directive instruction not to invent payer-specific EVV rules. No concrete payer/state requirement exists on record; the owner decision from `34_ROUND7_CORRECTIVE_30ITEM_VALIDATION.md` remains the correct path.
- **H14 (Incomplete Documentation):** Previously PARTIAL on the belief that "unfinished care lists" needed a due-date concept the schema lacks. Re-reading the locked text, "unfinished" plainly means a checklist with ≥1 pending task — already fully expressible via `tasks.status='pending'`. Implemented; 3 of 4 categories independently confirmed by Codex's own browser evidence (`UI-H14-CATEGORIES`), preserved; the 4th browser-verified this session. **Upgraded to PASS.**
- **P07 (Patient Intake):** Codex's own browser evidence (`UI-P07-POPULATED-INTAKE`) confirms the complete intake record renders correctly against a real populated row. Preserved per directive §9 allowance. **Upgraded to PASS.**
- **P11 (Mood History):** Closed via FUNC-02 above. **Upgraded to PASS.**
- **O07 (My Activity):** Codex's own browser evidence (`UI-O07-ACTIVITY`) confirms the itemized list renders with real content. Preserved per directive §9 allowance. **Upgraded to PASS.**

## FUNC-06 — W13 (Offline Drafting)

Remains **OPEN**. No owner approval to defer exists, and the full threat-model analysis in `35_ROUND7_CORRECTIVE_W13_DECISION.md` (preserved, re-affirmed this session) still shows insufficient approved policy to implement safely. No partial queue was built this session either — the directive's own prohibition on a misleading partial implementation still applies, and nothing in the Codex audit bears on this item.

## SPEC-01 — Re-inspection of flagged PASS items

- **H06 (Today's Schedule):** Codex's `UI-H06-ADDRESS-MISSING` confirmed a genuine gap against the locked text ("scheduled start/end, and authorized address/facility, with timezone and status") — no end time, address, or timezone was shown. Migration 078 + frontend fix close this; browser-verified (`tests/e2e_mastercorrective_h06_h14.spec.ts`). Matrix updated; remains PASS with corrected evidence.
- **O09 (Accessibility):** Codex's `UI-O09-EFFECTIVE-CONTRAST` **confirms** the Round 7 Corrective high-contrast fix works (`assertion_met: true`, a real computed-style change observed). No regression found. Language-selection/speech-support sub-scope remains the owner decision already on record — unchanged.
- **O10 (Account & Security):** Codex's own script hit a harness-level timeout waiting for a transient `sonner` toast ("Password changed.") and stopped (`UI-HARNESS-STOP`), before reaching its own O10 re-login assertion. This reads as test-timing flakiness around an auto-dismissing toast, not a reproduced functional break — this session's own prior dedicated O10 test (full password-change-then-re-login) already demonstrated the underlying capability works, and MFA/active-sessions sub-scope remains the owner decision already on record. No change made; disclosed here rather than silently dropped.
- **H04/C01/N06 (inbox):** Closed via FUNC-03 above.
- **C06 (message history):** Closed via FUNC-04 above.
- **H14/P07/P11/O02/O07:** Covered above.

## H14-RESOLUTION-PERSISTED

Not a defect — a confirmatory data-shape check (`open_incidents: "0"`, `handoff_ack_rows: "2"`) that Codex's own fixture correctly reached a resolved state. No action required.
