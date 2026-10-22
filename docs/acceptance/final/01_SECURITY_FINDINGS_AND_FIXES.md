# 01 — Security Findings and Fixes

Every finding below was reproduced live against the local Supabase stack before being fixed, and re-verified after. None is carried forward from memory or inferred without a live check. Evidence tier for all items in this document: **Database integration evidence** (automated regression tests) plus, where stated, **Verified local evidence** (direct SQL/HTTP probes performed while diagnosing).

## DEFECT-ANON-EXECUTE-GRANT (2 passes)

- **Affected objects**: every SECURITY DEFINER RPC in the `public` schema (105 initially, +7 found on re-sweep = 112 total functions touched across migrations 085 and 090).
- **Defect**: every migration's `REVOKE ALL ... FROM PUBLIC` pattern never revoked the `anon` database role's own, separate EXECUTE grant (Supabase's local default privileges grant it directly at function-creation time). 7 further functions had never even had a `REVOKE FROM PUBLIC` line at all, inheriting EXECUTE through the un-revoked PUBLIC pseudo-role grant instead.
- **Reproduction**: `curl -X POST .../rest/v1/rpc/get_my_organizations` with only the anon API key (no user session) returned HTTP 200 (empty array) instead of being rejected at the privilege layer; `admin_set_role`/`remove_org_member` similarly reached their own function bodies (and were only stopped by in-function `auth.uid() IS NULL` logic, not by the database privilege system).
- **Impact assessed**: not currently exploitable — every sampled function's own authorization logic depends on `auth.uid()`, which is `NULL` for a true anon caller, and fails closed. A defense-in-depth gap, not an active breach.
- **Fix**: migrations `085_r12_closure_register_revoke_anon_execute_on_functions.sql` and `090_r17_closure_register_remaining_anon_grants.sql`. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon` closes the recurrence path for all future functions.
- **Regression test**: exhaustive, not fixed-name — `SELECT count(*) FROM pg_proc ... WHERE has_function_privilege('anon', p.oid, 'EXECUTE')` asserted `0`, in `tests/integration/round7MasterCorrectiveSecurity.test.ts`.
- **Verified**: anon now receives `401 permission denied for function ...` at the Postgres privilege layer; a real authenticated caller's identical call is unaffected.
- **Commits**: `393f5aed` (migration 085), `d448c079` (migration 090).

## DEFECT-DIRECTOR-NOT-A-PATIENT-CONVERSATION-PARTICIPANT

- **Affected objects**: `create_conversation()`, `add_conversation_participant()`, `get_my_conversations()`, `search_my_conversations()`, `get_patient_care_circle()`, `conversation_participants.participant_role` CHECK constraint, `messages.sender_role` CHECK constraint.
- **Defect**: no mechanism existed for an organization Director to become authorized for a specific patient's conversations — `staff_patient_assignments`'s CHECK constraint excludes `'director'`, and `is_authorized_for_patient()` has no `organization_memberships`-based path.
- **Reproduction**: a caregiver naming their org's director as a conversation recipient was rejected with "not authorized for this patient" even though the director legitimately oversees that patient's covering organization.
- **Consequence discovered**: W09 ("Message supervisor") and N11 silently failed server-side for every real director, despite historical evidence marking them PASS on the strength of "the button renders and calls the RPC" alone.
- **Fix**: migration `087_r14_director_conversation_participation.sql` — `is_org_director_for_patient()`, true only for an active director of the organization ACTIVELY covering the specific patient, re-checked live on every call. `is_authorized_for_patient()` itself is untouched.
- **Regression tests**: `tests/integration/crossOfficeCommunicationMatrix.test.ts`, 29 tests — the full 5x5 matrix (24/25 cells, Patient-Patient diagonal structurally N/A) plus 2 narrowness negative tests (unrelated-org director still rejected; a director loses access the instant their org's coverage ends, re-tested on both read and send, restored when coverage resumes).
- **Commit**: `4c387c8c`.

## DEFECT-SEND-MESSAGE-NO-REVALIDATION

- **Affected object**: `send_message()`.
- **Defect**: only checked historical `conversation_participants` row existence, never re-validating CURRENT authorization — unlike the read paths (`get_my_conversations`/`search_my_conversations`, fixed for FUNC-04 in migration 079) and unlike `start_caregiver_visit`/`end_caregiver_visit` (SEC-02, migration 076). A participant whose authorization had since been revoked could still send new messages into an old conversation.
- **Fix**: same migration 087 — `send_message()` now re-validates `is_authorized_for_patient() OR is_org_director_for_patient()` at send time.
- **Regression test**: the coverage-ends test above also asserts a send attempt is rejected after coverage ends, not merely a read.
- **Commit**: `4c387c8c`.

## DEFECT-THERAPIST-INVITED-PATIENT-MISSING-FROM-THERAPY-OFFICE

- **Affected object**: `get_my_staff_patients()`.
- **Defect**: the new `/Professional/Therapy` dashboard's "My Therapy Patients" list reads this RPC, which only ever queried `staff_patient_assignments` (director-assigned). It never queried `therapist_relationships` (the older, caregiver-initiated invite/accept workflow `is_authorized_for_patient()` already recognizes).
- **Reproduction**: a therapist who accepted a real, legitimate `caregiver_invite_therapist()`/`respond_to_therapist_invite()` connection saw zero patients in their own office, despite being fully authorized to message about and work with that patient.
- **Fix**: migration `086_r13_closure_register_therapist_relationship_patients.sql` — unions both sources, deduplicated (`DISTINCT ON`) so an org-assigned row always wins over a looser direct-connection row for the same patient.
- **Regression tests**: `tests/integration/round7MasterCorrectiveSecurity.test.ts` — the previously-missing patient now appears (with `organization_id IS NULL`); a patient present via both mechanisms appears exactly once, with the org-scoped row winning.
- **Commit**: `9c1d163e`.

## DEFECT-CREDENTIAL-VERIFICATION-STATUS-NEVER-ENFORCED

- **Affected objects**: `professional_applications.credential_verification_status`, `director_approve_application()`.
- **Defect**: `credential_verification_status` existed since migration 083 with a rich 8-value CHECK constraint, but no RPC anywhere ever read, wrote, or gated on it. An application could reach `status='approved'` (full active membership, full privileges) with its credential still at the default `'submitted'` value — genuinely unverified and indistinguishable in the system from a checked one.
- **Fix**: migration `089_r16_credential_verification_gate.sql` — a new, separately-audited `record_credential_verification()` decision (reviewer identity, timestamp, mandatory evidence description); `director_approve_application()` now refuses to run for the three clinical/caregiver offices until it has recorded `'independently_verified'`.
- **Regression tests**: `tests/integration/credentialVerificationGate.test.ts`, 7/7 — approval rejected pre-verification (zero membership granted), non-director/self-verification rejected, evidence mandatory, approval succeeds post-verification, Director applications correctly exempted.
- **Commit**: `cd3e6349`.

## Full test-suite state after all fixes

`npm run test:integration`: 76/76 (4 files). `npm run test:unit`: 377/377 (30 files). `npx tsc --noEmit`: clean. `npm run lint`: clean (one pre-existing, unrelated warning in `codex_round7_independent_audit/browser_audit.mjs`). `npm run build`: clean.
