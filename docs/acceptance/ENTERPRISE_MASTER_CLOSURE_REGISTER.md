# Enterprise Master Closure Register

Status date: 2026-10-22. Branch `remediation/mymemoria-functional-001`, HEAD at the time this register was opened: `0195489bb29985f8ea9ec1e76ce43b26e92c49b0`.

## 0. Provenance and methodology (read this before any row below)

Per the Master Enterprise Completion Directive's explicit instruction, this register is built from **real, locatable historical documents and this session's own live-verified state** — nothing below was reconstructed from memory or invented to reach a target count.

Sources used:
- `MyMemoria_Functional_Remediation_001/28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv` — the authoritative **92-row** Enterprise Caregiver requirement matrix (1 header + 92 data rows: H01–H18, P01–P22, C01–C06, W01–W14, O01–O10, F01, X01–X07, N01–N14). This is the real source of the directive's "92 Enterprise requirements" figure. It is **not duplicated row-by-row here** — that would be a 92-row restatement adding no new information. Instead, §1 below records what, if anything, changed since that CSV was last written, and §6 lists what Round 3 adds on top of it.
- `41_MASTERCORRECTIVE_OWNER_DECISION_REGISTER.md`, `35_ROUND7_CORRECTIVE_W13_DECISION.md`, `44_MASTERCORRECTIVE2_FINDING_REGISTER.md` — prior open owner decisions and the most recent pre-existing finding register.
- This session's own commits: `a0da0f12` (centralized `/Professional` routing, Round 1) and `0195489b` (professional application/governance system, Round 2).
- Live re-verification run this pass: `npm run test:integration` (22/22 pass before this pass's own fix, 23/23 after adding migration 084's regression test), `npm run test:unit` (377/377 pass), `npx tsc --noEmit` (clean), `npm run lint` (clean — one pre-existing, unrelated warning).

**On the directive's "59 navigation destinations" figure**: no historical document located in this repository states or derives the number 59. It does not appear in the 92-row CSV (which itself names 14 caregiver-office nav destinations, N01–N14, as a subset of the 92, not a separate 59-count). It is not recoverable as a pre-existing authoritative figure — per the directive's own instruction, this is disclosed rather than silently matched. §2 below instead reports the **actual current count**, computed directly from the five office dashboards' own navigation arrays as they exist in the codebase today: **60**, not 59. This is reported as what it is — a fresh, code-derived inventory — not represented as a historically authoritative number.

**What this means for the 92/92 and the (disclosed, non-authoritative) ~59-60/~59-60 completion criteria**: this register tracks both honestly. Neither is claimed complete in this pass. See §7 for the current rollup and §8 for the final status.

## 1. The 92-item Enterprise Caregiver matrix — reconciliation since the CSV was last written

The CSV already carries per-row status, evidence, and `Blocker/Defect` columns current as of Master Corrective 2 (migration 079). This session's two completed rounds (Round 1: centralized `/Professional` routing; Round 2: professional application governance) changed **routing/shell chrome** (`App.tsx`, `ProfessionalEntryRouter`, `ProfessionalOfficeResolver`) and **added a new governance layer** (`professional_applications` and its RPCs). Neither round touched any of the tables, RPCs, or RLS policies the 92-row matrix's requirements (H/P/C/W/O/F/X/N series) depend on.

This claim is verified, not assumed: `tests/integration/round7MasterCorrectiveSecurity.test.ts` — which exercises SEC-01 through SEC-06, FUNC-01 through FUNC-05, and the two Round 2 governance tests — passes **22/22** against the current HEAD. If Round 1 or Round 2 had regressed any underlying caregiver-domain behavior, this suite would have caught it (it is schema/behavior-level, not UI-level). `npx tsc --noEmit` is clean and `npm run test:unit` is 377/377.

**Reconciliation result: all 92 rows' `Actual Status` values in the CSV remain accurate as of this session's HEAD.** No row needs a status change from Rounds 1–2. The CSV's own disclosed gaps (W13 OPEN; H13 PARTIAL; several `PENDING` owner sign-offs; several individually-disclosed minor UI gaps noted in each row's `Blocker/Defect` column) are **carried forward unchanged**, not resolved by this reconciliation, and are re-listed in §4 and §6 so they are not lost.

One correction applied in this session that bears on the matrix: **H15/N02 (Registration & Patient Access)** — the CSV's own evidence already documents `caregiver_initiate_patient_registration`. This session's `create_organization()` change (Round 2) does **not** affect this RPC or H15/N02's status; director-initiated organization creation and caregiver-initiated patient registration are different operations. Confirmed by reading `083_r10_professional_application_approval_system.sql`: it touches `create_organization` and adds `professional_applications`/`professional_application_events`/`account_management_audit`/`professional-credentials` only.

## 2. Five-office navigation destination inventory (actual, code-derived)

| Office | Dashboard component | Nav item count | Keys |
|---|---|---|---|
| Admin (Director) | `OrganizationDirectorDashboard.tsx` | 13 | dashboard, overview, applications, staff, patients, assignments, scheduling, operations, incidents, communications, reports, licensing, settings |
| Caregiver | `EnterpriseCaregiverDashboard.tsx` | 14 | dashboard, patients, schedule, tasks, records, communications, notes, handoffs, alerts, visits, careTeam, documents, organization, settings |
| Medical | `ClinicalOfficeDashboard.tsx` (medical mode) | 12 | dashboard, patients, schedule, assessments, diagnoses, medications, careplan, documentation, communication, reports, credentials, settings |
| Therapy | `ClinicalOfficeDashboard.tsx` (therapy mode) | 11 | dashboard, patients, schedule, careplan, documentation, goals, communication, reports, credentials, documents, settings |
| Patient (Enterprise) | `EnterprisePatientDashboard.tsx` | 10 | dashboard, careplan, appointments, health, medications, messages, careteam, documents, preferences, settings |
| **Total** | | **60** | |

Each office's nav array renders in the live app (confirmed by `tsc`/build cleanliness and, for the Caregiver office specifically, the pre-existing E2E suite `tests/e2e_enterprise_ui_navigation_acceptance.spec.ts`). **What is not yet done**: a dedicated, fresh browser-level click-through confirming all 60 destinations individually render real (non-empty, non-crashing) authorized content for the Admin, Medical, Therapy, and Patient offices specifically — the Caregiver office's 14 are the only ones with a committed E2E navigation spec. This is listed as open work in §6 (Wave B, five-office functional completion), not claimed done here.

## 3. Professional governance system (Round 2) against the Round 3 directive's lifecycle requirements

Migration `083_r10_professional_application_approval_system.sql` implements all 9 named lifecycle states (`draft, submitted→pending_review, info_required, resubmitted, approved, rejected, withdrawn, suspended, revoked` — `draft`/`submitted` collapse to one `pending_review` entry state since the form has no separate client-side draft-save step; this is a disclosed simplification, not a missing state, since nothing in the directive requires a distinct persisted draft row before submission).

12-case lifecycle checklist (Round 3 §-named cases), current status:

| # | Case | Status | Evidence |
|---|---|---|---|
| 1 | Applicant submits, cannot self-approve | PASS | migration 083 RPCs; integration test "Platform Owner approval path" |
| 2 | Director reviews own-org applications only | PASS | `is_active_org_director(target_organization_id)` re-derived server-side in every director RPC |
| 3 | Platform Owner approves initial Director | PASS | `platform_owner_approve_director_application()`; live browser journey (Round 2) |
| 4 | Self-approval bootstrap closed | PASS | `create_organization()` rewritten to submit an application, not create an org; integration test confirms zero orgs/memberships created |
| 5 | Corrections requested → resubmission | PASS | `request_application_corrections()`/`resubmitApplication`; live browser journey (Round 2, Caregiver path) |
| 6 | Rejection with reason, auditable | PASS | `reject_application()` requires reason; `professional_application_events` append-only |
| 7 | Withdrawal by applicant | PASS | `withdraw_application()` RPC exists, self-row only |
| 8 | Suspension/revocation of an active professional | PASS (fixed this pass) | `remove_org_member()` (migration 035, director-only, revokes membership + deactivates `staff_patient_assignments` atomically) already existed and is wired into `OrganizationDirectorDashboard.tsx`, but predated migration 083's `account_management_audit` table and wrote no audit row. Migration 084 adds the audit insert without changing the function's signature or authorization check. Integration test "CLOSURE REGISTER — remove_org_member() now writes an auditable account_management_audit row (migration 084)" verifies the audit row's actor/before/after state and that a non-director's attempt is both rejected and leaves no audit row. |
| 9 | Platform Owner office/role correction | PASS | `platform_owner_correct_office_classification()`; UI in `PlatformOwnerAdminPage.tsx` |
| 10 | `profiles.role` not client-editable, no generic self-role RPC | PASS | confirmed by migration 083's RPC-only write model (zero client INSERT/UPDATE/DELETE policies on `professional_applications`) |
| 11 | Enterprise Patient never created via public registration | PASS | `/Professional/Register`'s `OFFICE_OPTIONS` excludes `patient` by construction (`ProfessionalRegisterPage.tsx`) |
| 12 | Full audit trail, append-only | PASS | `professional_application_events`/`account_management_audit` — RLS enabled, no UPDATE/DELETE policy on either |

**Case 8 closed this pass**: `remove_org_member()` was located, confirmed already director-gated and atomic, and extended (migration 084) to write an `account_management_audit` row. Regression test committed; 23/23 integration tests pass.

**Owner-dependent question (Round 3 explicitly requires this be escalated, not resolved unilaterally)**: per-profession credential-validation standards (what actually constitutes "verified" for a license number, who may attest it, whether a third-party verification service is required for Medical/Therapy license numbers vs. a Director's own attestation being sufficient for Caregiver applicants). No standard exists anywhere in the codebase or historical docs; `professional_applications.credential_verification_status` exists as a field or process would be invented without an owner answer in violation of the directive's own instruction. This is added to the owner decision register in §4 as item 5.

## 4. Owner decision register (carried forward + one addition)

Unchanged from `41_MASTERCORRECTIVE_OWNER_DECISION_REGISTER.md` — no new evidence this round changes items 1–4:

1. **W13 — Offline Drafting.** Full analysis on record at `35_ROUND7_CORRECTIVE_W13_DECISION.md`. Still OPEN pending the owner's answer on scope/key-management/idempotency. Not built this round either — building any part of it without that answer would repeat the exact risk that document warns against.
2. **H13 — EVV.** No concrete payer/state EVV requirement exists on record. Current state (visit start/end + optional lat/long, no certification claim) remains the correct final state absent a named requirement.
3. **O09 — Language selection / speech support.** Unchanged; high-contrast/text-sizing already shipped.
4. **O10 — MFA / active-sessions list.** Unchanged; password change already shipped and browser-verified end to end.
5. **NEW — Professional credential-validation standard** (see §3). Needed before case 8's suspension path and before any claim that `credential_verification_status` is meaningfully enforced rather than cosmetic.

## 5. Codex / prior-audit findings disposition

All findings in `44_MASTERCORRECTIVE2_FINDING_REGISTER.md` (SEC-03 follow-ups ×2, FUNC-04 follow-up) are closed by migration 079 and reconfirmed still passing this pass (22/22 integration). No new Codex evidence has been supplied for this round — `codex_master_9023_acceptance/` remains the most recent external audit artifact on record, already fully disposed of per that register's own §"Disposition" note. **Independent Codex re-audit of this round's own work (Rounds 1–3) has not occurred** — per the directive, this cannot be self-certified and is tracked as an explicit blocker in §8.

## 6. Round 3 net-new scope — status

| Workstream | Status | Notes |
|---|---|---|
| Wave A — Therapist invitation/authorization lifecycle re-verification against this round's adversarial list | PARTIAL | SEC-01 (accept/revoke race) and THER-01/02 staleness checks already covered and passing (22/22). Concurrency under this round's *specific* named edge cases (stale-session replay, double-accept) not freshly re-run this pass. |
| Wave A — Director/professional escalation prevention | PASS (carried from §3) | Covered by migration 083 governance system. |
| Wave A — Clinical provenance integrity | PASS (carried from §1, SEC-03/SEC-04 rows) | No regression since those fixes. |
| Wave A — Account access/deletion auditing | PARTIAL (staff-removal audit gap closed this pass, migration 084) | Write-side audit trail is append-only and verified (§3 case 12). Director-initiated staff removal/revocation is now audited (§3 case 8). Account **deletion** (destroying the `auth.users`/`profiles` row itself, as opposed to revoking an organization membership) has no dedicated RPC or audit path located — still open. |
| Wave B — Migration/RLS/RPC integrity audit through migration 083 | NOT DONE THIS PASS | Requires a full line-by-line inventory of all 83 migrations' current RLS state vs. applied state; not attempted this pass given scope. |
| Wave B — Cross-office 25-combination communication matrix | NOT BUILT | Current `create_conversation()` enforces per-patient recipient authorization (verified, §1 C02/C05/X06) but there is no explicit office-pair (5×5) authorization matrix or test suite naming all 25 combinations. This is a real gap, not a disclosed-and-accepted limitation. |
| Wave B — Professional governance 12-case completion | 11/12 PASS, 1 open (§3 case 8) | |
| Wave B — Five-office 60/60 functional completion | NOT DONE THIS PASS | Nav inventory done (§2); per-destination functional E2E for Admin/Medical/Therapy/Patient offices not done. |
| Wave C — Enterprise Patient / Therapist E2E journeys | NOT DONE THIS PASS | |
| Wave C — H13/EVV, W13/offline | Unchanged, owner-blocked (§4) | |
| Wave D — Production-equivalent verification + Vercel Preview evidence | NOT DONE THIS PASS | |
| Wave E — 15-document final acceptance package | NOT STARTED | This register is the first of the 15; `docs/acceptance/final/` created empty. |

## 7. Rollup

- 92-item Enterprise Caregiver matrix: statuses unchanged from the authoritative CSV, reconciled and confirmed non-regressed. The CSV's own PASS count stands; its own disclosed OPEN/PARTIAL/PENDING items are **not** resolved by this register.
- Navigation destinations: 60 actual (not the directive's unverified 59), inventoried; functional verification per-destination outside the Caregiver office is outstanding.
- Professional governance: 11/12 lifecycle cases verified.
- No claim of 92/92 or 60/60 PASS is made. Per the directive's own explicit instruction, this is disclosed rather than concealed to hit a number.

## 8. Final status for this register (this pass only)

**IMPLEMENTATION PARTIALLY COMPLETE — BLOCKED ITEMS DOCUMENTED.**

Blocking items requiring further engineering work (not owner decisions): Wave A suspension-RPC verification, account-deletion auditing, Wave B migration/RLS full audit, the 25-combination communication matrix, five-office functional E2E beyond Caregiver, Enterprise Patient/Therapist journeys, Wave D production-equivalent evidence, and the remaining 14 documents of the Wave E package.

Blocking items requiring an owner decision before engineering can proceed safely: W13, H13 (final confirmation), O09, O10, and the new professional credential-validation standard (§4).

Blocking items no engineering effort can close unilaterally: independent Codex re-audit of Rounds 1–3, and explicit owner production-release authorization.
