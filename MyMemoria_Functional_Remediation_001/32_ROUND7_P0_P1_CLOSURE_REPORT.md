# ROUND 7 — P0/P1 Enterprise Production-Critical Closure Report

**Branch:** `remediation/mymemoria-functional-001`
**Starting HEAD:** `3cfee1db` **Final HEAD:** `55789571`
**Classification report:** `31_ROUND7_P0_P1_CLASSIFICATION.md`

## Summary

Zero P0 items were classified from the 35 outstanding requirements (none describes an active, reproduced security bypass). Adversarial testing nonetheless **found and fixed one real P1 functional defect** that Round 6's own PASS claim for W10 had missed, plus one real data-filter bug in H10. All 4 classified P1 items (H15, P05, C02, F01) are now closed with real backend + browser evidence, not source review. 29 items remain correctly deferred as P2 and 1 (W13) as P3, each individually justified in the classification report — none removed from the locked matrix, none silently reclassified.

**Matrix movement this round: 57 PASS → 62 PASS (+5); 34 PARTIAL → 29 PARTIAL (-5); 1 OPEN unchanged (W13).**

## Defect 1 (confirmed, fixed): W10's accept-flow was broken for its primary Enterprise use case

**Discovery:** while live-verifying W10 for this round's classification work, a fresh two-organization adversarial fixture reproduced that an Org A staff-only caregiver (zero `caregiver_patients` rows, only a `staff_patient_assignments` row) could successfully *send* a therapist invitation via `caregiver_invite_therapist()` (migration 072's own fix, correctly working) — but the invited therapist's *accept* call (`respond_to_therapist_invite()`) returned `status: 'revoked'`, never `'accepted'`. Root cause: that function's own staleness re-check ("has the inviting caregiver's authority over this patient lapsed since the invite was sent?") only ever queried `caregiver_patients`, so it always concluded the Enterprise staff member's authority had "lapsed" (it was never there in that table to begin with) and auto-revoked the connection at every single accept attempt. `revoke_therapist_connection()` had the identical gap, meaning the inviting staff member could never have manually revoked the connection either.

**Why this matters:** Round 6 marked W10 PASS based solely on the invite step succeeding. The full workflow the requirement actually describes ("Initiate... connection requests;... verify target and acceptance/authorization") was never completable end to end for an Enterprise org-caregiver — a real, previously undetected functional defect, not merely missing acceptance evidence.

**Fix (migration 074):** both functions' authorization re-checks gained the identical `OR EXISTS (staff_patient_assignments ... is_active = true)` branch already proven correct in migration 072, with every other line — the THER-01 positive-role allowlist, both `FOR UPDATE` row locks, the accept/decline/revoke branching, the `therapist_relationships` upsert — preserved byte-for-byte.

**Live re-verification after the fix:** re-invited the same therapist; accept now returns `status: 'accepted'`; the therapist's subsequent professional-note write (`note_type='therapist_session'`) succeeded; the staff caregiver's revoke call succeeded; a second note-write attempt after revocation was rejected (`42501`, RLS). The pre-existing `round4TherapistEligibility`/`round5NoteForgeryAndEligibilityRevocation` unit suites (which assert against the *unchanged* migrations 064/065 files) still pass unmodified, confirming the residential path's own logic was never touched.

**A related, deliberately out-of-scope architectural note, not a defect:** an accepted `therapist_relationships` connection (the mechanism this RPC family creates) does not by itself grant the therapist a read of the base `patients` table row or a dashboard view inside the Enterprise shell — `EnterpriseStaffPatientView`/`StaffCaseloadDashboard` are gated exclusively on `staff_patient_assignments`, a deliberately separate mechanism per migration 035's own design note ("not a reuse"). This is confirmed fail-closed (the therapist correctly cannot read the patient's base record through this path) and is outside W10's literal text, which concerns the connection-request lifecycle itself, already now fully functional. Building a therapist_relationships-to-Enterprise-dashboard bridge would be new scope, not a P0/P1 defect fix, and was not attempted.

## Defect 2 (confirmed, fixed): H10's dashboard widget filtered on a non-existent status value

While seeding real data to verify P05, discovered `medication_logs.status`'s real `CHECK` constraint is `('taken','missed','pending','skipped')` — H10's widget filtered on `('missed','refused')`. `'refused'` has never been a valid value in this table. Half the filter was silently dead code. Fixed to `('missed','skipped')`; re-verified with 3 real seeded rows (taken/missed/skipped) that the corrected query returns exactly the 2 expected rows with correct medication-name joins, and that an unrelated-org account's identical read returns empty.

## P1 closure evidence

**H15 — Registration & Patient Access.** Called the real `provision-caregiver-patient` Edge Function as a staff-only org-caregiver (real new patient created, real auth identity, no mock). Called the real `cover_patient_via_staff_registration()` RPC: first observed the honest, real capacity-exceeded rejection (`"No covered-patient capacity is available for this organization (1 of 1 used)"`) — no false success — then had a real director raise capacity via `org_configure_license()`, retried, and confirmed success with a real resulting `staff_patient_assignments` row correctly attributed to the registering caregiver.

**P05 — Medication History.** Seeded 3 real `medication_logs` rows (taken/missed/skipped, real dates, real scheduled/taken times) for a real patient. The exact query `MedicationsTab` issues returned all 3 correctly. Cross-tenant: an unrelated org's read of the same rows returned empty.

**C02 — New Message (Care Communications — The Central Enterprise Feature).** Exercised `createConversation`/`sendMessage` for the first time specifically inside the Enterprise fixture's own data path: an Org A staff caregiver created a real conversation with subject, sent a real message, and the real authorized recipient (the patient) read it back correctly. A same-caregiver attempt to add an unrelated, unassigned account as recipient was rejected outright. Notably, even the **org director** was correctly rejected as a recipient for a patient they hold no direct `staff_patient_assignments` row for — confirming the authorization is genuinely least-privilege and patient-scoped, not merely org-membership-scoped. Unrelated account's read returned empty; its attempted send was rejected ("You are not a participant in this conversation").

**F01 — Full Support — Covered by Organization.** All three non-trivial `CoverageBanner` states confirmed, each produced by the *real* backend transition a real owner/director action would cause (never a contrived direct write standing in for the real one):
- "covered" — pre-existing Round 6 evidence, unchanged.
- "coverage ended" — produced via the real `end_patient_coverage()` RPC.
- "license not active" — produced via the real `admin_set_organization_license_status()` RPC expiring a real license.

Both new states were confirmed in their underlying data **and** live in a real browser (`tests/e2e_round7_f01_coverage_states.spec.ts`, 2/2 passing). Also independently confirmed the *authoritative* server-side entitlement function `is_patient_enterprise_covered()` returns `false` once the license expires — the UI label and the actual RLS/feature-gating enforcement agree; this was never only a display-layer claim.

## Adversarial P0 re-verification (directive §5/§5.1)

A fresh two-organization, 9-identity fixture (two directors, two org-caregivers, two covered patients, one independent patient for the capacity race, one verified therapist, one entirely unrelated account, one admin) exercised every category in the mandatory negative-test list:

| Test category | Result |
|---|---|
| Anonymous caller (no Authorization header) against a protected RPC | Rejected: "Authentication required" |
| Authenticated unrelated account — read | Empty result, no error, no data disclosed |
| Authenticated unrelated account — write (diagnosis, invite) | Rejected server-side |
| Different organization — cross-org read | Empty |
| Different organization — cross-org write/invite/cover | Rejected ("not authorized," "not an active director of this organization") |
| Different patient — write for a patient the caller has no link to | Rejected: "Not authorized for this patient" |
| Revoked staff assignment — immediate access removal | Confirmed: read returned empty, diagnosis-write rejected, a real existing task's UPDATE matched zero rows (verified the row itself was unmutated) |
| Invalid/manipulated patient identifier (`00000000-...`) | Rejected: "Not authorized for this patient" |
| Forged professional role (`professional_observation` source claim by an ordinary caregiver) | Rejected: "Only a therapist or medical professional may record a professional_observation source" |
| Expired/revoked relationship (THER-02 full cycle) | Confirmed: post-revocation note-write rejected; access returns only after a fresh accept |
| Concurrent conflicting operations | Confirmed: two simultaneous `cover_patient()` calls against a capacity=1 organization — exactly 1 succeeded, 1 was rejected with the real capacity message, final count = 1, not 2 (migration 039's `FOR UPDATE` lock still holds) |

No P0 bypass was reproduced anywhere in this pass. All fixture identities, organizations, and patients were deleted and zero-count-verified after the session (see Regression Report).

## P2/P3 items — explicitly not touched this round

Per directive §9, no implementation effort went into the 29 P2 or 1 P3 item beyond what Round 6 already delivered. Each remains individually justified in `31_ROUND7_P0_P1_CLASSIFICATION.md` and at its pre-existing PARTIAL/OPEN status in the matrix — not removed, not silently upgraded.

## Existing PASS requirements preserved

All 57 requirements that were PASS at the start of this round remain PASS; none were regressed. The full unit suite (377/377, up from 375 — two new test files this round) and the full `npm run typecheck`/`npm run lint`/`npm run build` gate are clean at the final HEAD. No production mutation occurred at any point — all adversarial and verification work ran against the local Docker Supabase stack (`http://127.0.0.1:55321`), confirmed via `git remote -v` and `npx supabase status` before any destructive or adversarial action.

## Release posture

**P0/P1 IMPLEMENTATION COMPLETE — AWAITING CODEX ACCEPTANCE — NO-GO.**

All 4 classified P1 items are closed with real evidence; the 1 confirmed P1-adjacent defect this round's own testing surfaced (W10's broken accept flow) is fixed and re-verified; zero P0 findings remain open. The overall release posture remains NO-GO because 29 P2 items and 1 P3 item (and 29 corresponding matrix rows) remain intentionally incomplete, pending owner review of the proposed deferments in `31_ROUND7_P0_P1_CLASSIFICATION.md` — not because any P0/P1 work is outstanding.
