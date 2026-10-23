# 04 — P1: Professional Credential Verification

## UPDATE — 2026-10-23, HEAD `5fba1435`

One closure since this document was written: credential revocation now actually invalidates authority. Previously, flagging an already-APPROVED application `requires_reverification` only changed a status column — the membership and any staff_patient_assignments it had already granted stayed fully active. Migration 091 makes a negative/reverification decision immediately revoke the membership and deactivate assignments, audited (`membership_revoked_credential_invalidated`). The substantive evidence-standard owner decision (item 5 below) remains unchanged and open.

---

See `01_SECURITY_FINDINGS_AND_FIXES.md` for the defect/fix narrative (DEFECT-CREDENTIAL-VERIFICATION-STATUS-NEVER-ENFORCED). This document covers acceptance against the directive's exact 6 required engineering changes.

## Required engineering changes — status

1. **Inventory all professional classifications and credential fields.** Done: 4 professions (`director`, `caregiver`, `medical_professional`, `therapist`); director has no clinical credential (organizational founding, approved by the Platform Owner through a separate path). The other three submit profession-specific fields via `application_details JSONB` (license number, issuer, jurisdiction, expiration date, specialty — collected by `ProfessionalRegisterPage.tsx`, pre-existing).
2. **Separate document submission, administrative review, independently verified authenticity, final authorization.** Done — four distinct phases now exist where only two did before: (1) submission — pre-existing (`professional_application_documents`); (2) administrative review — pre-existing (`director_approve_application`/`request_application_corrections`/`reject_application`, answering "is this application complete and credible"); (3) independently verified authenticity — NEW (`record_credential_verification()`, answering "is the credential itself genuine," a distinct, separately-audited act); (4) final authorization — pre-existing RPCs, now GATED on (3).
3. **Implement backend-enforced states that do not describe an unverified credential as verified.** Done: the pre-existing 8-value CHECK constraint (`not_submitted`/`submitted`/`pending_review`/`insufficient`/`independently_verified`/`expired`/`rejected`/`requires_reverification`) is now actually read and enforced, not merely declared.
4. **Ensure unverified professionals cannot exercise privileges reserved for verified professionals.** Done: `director_approve_application()` refuses to run for the three clinical/caregiver offices until `credential_verification_status='independently_verified'` — verified live, zero membership (hence zero privilege of any kind) is granted to an unverified applicant.
5. **Preserve reviewer identity, timestamps, review evidence, decision history, revocation.** Done: new columns `credential_verified_by`, `credential_verified_at`, `credential_verification_evidence`; every decision additionally logged to the pre-existing append-only `professional_application_events` table. `requires_reverification` exists as a CHECK-constraint value for a future revocation path (not separately built this phase beyond being a legal, settable status).
6. **Do not invent regulatory standards, licensing-board integrations, or required verification methods.** Confirmed: `record_credential_verification()`'s `p_evidence_reference` is free text supplied by the human reviewer describing what they actually did. No licensing-board API call, no prescribed method, no regulatory claim anywhere in the code or its comments.

## Acceptance per the directive's own stated criterion

> "Technical controls pass; any unresolved substantive verification standard remains explicitly BLOCKED pending owner decision."

- **Technical controls**: PASS — the gate is real, enforced, and tested (7/7 in `tests/integration/credentialVerificationGate.test.ts`): approval rejected before verification (zero membership granted); non-director/self-verification rejected; evidence mandatory; approval succeeds after verification; Director applications correctly exempted (no clinical credential to verify).
- **Substantive verification standard**: explicitly BLOCKED — owner decision item 5 (narrowed from "is there a gate at all" to "what evidence is sufficient"). Not resolved, not guessed.

## UI

Director review center (`OrganizationDirectorDashboard.tsx`): a credential-verification control (Mark Independently Verified / Mark Insufficient, with a mandatory evidence description) gates the Approve button, which is disabled with an explanatory tooltip until a decision is recorded.

## Test evidence

**Database integration evidence**: `tests/integration/credentialVerificationGate.test.ts`, 7/7 passing. Commit `cd3e6349`.
**Browser E2E evidence**: none specific to this item this phase (UI wired, `tsc`/lint/build-verified, not Playwright-tested end to end).
**Hosted Preview evidence**: none — see Wave D status document.
