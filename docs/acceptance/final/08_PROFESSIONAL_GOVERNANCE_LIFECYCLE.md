# 08 — Professional Account Governance Lifecycle

## Scope correction (read before the table below)

Every PASS below is a **technical state-transition and authorization-boundary verification only** — it confirms the RPC/RLS/audit-trail machinery enforces who may move an application between which states, atomically and auditably. **None of it establishes that any submitted professional credential is actually true.** See `04_P1_CREDENTIAL_VERIFICATION_GATE.md` for the one case (case 8/credential verification) where this phase added a real, substantive gate on top of the technical machinery — and for the substantive standard that still remains open.

## 12-case lifecycle checklist

| # | Case | Status | Evidence |
|---|---|---|---|
| 1 | Applicant submits, cannot self-approve | PASS | migration 083 RPCs |
| 2 | Director reviews own-org applications only | PASS | `is_active_org_director(target_organization_id)` re-derived server-side |
| 3 | Platform Owner approves initial Director | PASS | `platform_owner_approve_director_application()` |
| 4 | Self-approval bootstrap closed | PASS | `create_organization()` submits an application, creates no org/membership |
| 5 | Corrections requested → resubmission | PASS | `request_application_corrections()` |
| 6 | Rejection with reason, auditable | PASS | `reject_application()` requires reason; events append-only |
| 7 | Withdrawal by applicant | PASS | `withdraw_application()`, self-row only |
| 8 | Suspension/revocation of an active professional | PASS | `remove_org_member()` now writes an `account_management_audit` row (migration 084) |
| 9 | Platform Owner office/role correction | PASS | `platform_owner_correct_office_classification()` |
| 10 | `profiles.role` not client-editable, no generic self-role RPC | PASS | zero client write policies on `professional_applications` |
| 11 | Enterprise Patient never created via public registration | PASS | `/Professional/Register` excludes `patient` by construction |
| 12 | Full audit trail, append-only | PASS | `professional_application_events`/`account_management_audit`, no UPDATE/DELETE policy |

## Credential verification (added this phase — see 04 for full detail)

A 13th control, not one of the original 12 named cases but required by this phase's §1.C: an application cannot reach `approved` for the three clinical/caregiver offices without a separately-recorded, auditable `independently_verified` decision. PASS at the technical-control level; the substantive evidence standard is owner item 5, open.

## Account deletion (added this phase — see 03 for full detail)

A 14th control: a safe, reversible deactivation workflow, request/review/audit, distinct from the pre-existing membership-revocation path. PASS at the technical-control level; irreversible erasure is owner item 7, open.

## Evidence tier

**Database integration evidence**: `tests/integration/round7MasterCorrectiveSecurity.test.ts` (cases 1-12, including the migration-084 fix for case 8), `tests/integration/credentialVerificationGate.test.ts` (credential verification), `tests/integration/accountDeletionLifecycle.test.ts` (account deletion). All passing as of the final full-suite run (76/76).
**Browser E2E evidence**: a live Director-approval and Caregiver-application-correction journey were run in an earlier round (cited, not rerun this phase).
**Hosted Preview evidence**: none — see Wave D status document.
