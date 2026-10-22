# 03 — P1: Account Deletion and Lifecycle

See `01_SECURITY_FINDINGS_AND_FIXES.md` for defect context (none existed before this phase). This document covers acceptance against the directive's exact 6 required engineering changes and negative-test list.

## Required engineering changes — status

1. **Locate the original account deletion/deactivation/retention requirements.** Done: none exist anywhere in the historical record or codebase — confirmed by searching `supabase/functions/` and `src/services/`. This absence is itself the finding.
2. **Identify affected routes, identities, memberships, patient relationships, clinical records, storage objects, audit records, dependent workflows.** Done: `organization_memberships`, `staff_patient_assignments`, `therapist_relationships` (revoked/deactivated on approval); `patient_notes`/diagnoses/vitals/etc. (explicitly NOT touched — author attribution preserved); `account_management_audit` (every change recorded). Storage objects (`professional-credentials`, `patient-documents`) were not found to need any change — they are already scoped by assignment-based RLS, which itself is revoked as part of this workflow, so access to them is already correctly cut off as a side effect.
3. **Implement authorized request/validation/status-tracking/safe deactivation.** Done: `account_deletion_requests` table + `request_account_deletion()`/`cancel_account_deletion_request()`/`get_my_account_deletion_requests()`/`get_pending_account_deletion_requests()`/`platform_owner_review_account_deletion()`.
4. **Ensure a request cannot bypass retention/historical integrity/authorization controls.** Done: approval never deletes a clinical record or the author's identity — verified live, an authored `patient_notes` row survives deactivation byte-for-byte. No destructive SQL (`DELETE`/`TRUNCATE`) runs against any clinical table anywhere in this workflow.
5. **Where irreversible deletion/retention rules lack approval, implement only safe independent prerequisites and flag the policy decision.** Done: the safe prerequisite (request/review/reversible deactivation) is built; irreversible erasure is explicitly flagged as owner decision item 7, not guessed.
6. **Do not perform real-user deletion during testing.** Confirmed: every account in `tests/integration/accountDeletionLifecycle.test.ts` is a disposable fixture created and torn down by the test file itself.

## Required negative tests — status

| Test | Status | Evidence |
|---|---|---|
| Unauthorized account deletion | PASS (structural) | `request_account_deletion()` has no parameter naming a different target — self-service only, by signature, not just by role check. |
| Cross-tenant deletion | PASS (structural) | Same reasoning — there is no cross-tenant target to name. |
| Privilege escalation | PASS | A non-owner's review attempt (including self-approval) is rejected with "Only the Platform Owner". |
| Duplicate requests | PASS | A second request while one is open (`requested`/`under_review`) is rejected. |
| Deleted/suspended account access | PASS | Post-deactivation, `get_my_staff_patients()` returns empty for the deactivated account — functionally revoked, not merely a status flag. |
| Unintended cascade deletion of protected records | PASS | Verified live: an authored `patient_notes` row is unchanged after deactivation. |
| (Added) Re-deciding an already-decided request | PASS | Rejected with "already been decided" — no re-approval/re-denial path. |
| (Added) Wrong-user cancellation | PASS | Only the original requester may cancel; others rejected. |

## UI

Self-service request panel: Caregiver office Settings & Account (the reference implementation). **Not yet replicated** to the Admin/Medical/Therapy/Patient offices' own Settings views — disclosed as remaining UI work, not claimed done everywhere. Platform Owner review queue: `PlatformOwnerAdminPage.tsx`.

## Open owner decision (item 7)

Should this application ever perform irreversible erasure (hard-deleting `auth.users`/`profiles`, or anonymizing authored clinical records), and should a service-role Edge Function be built to also disable sign-in outright (a plain SQL RPC cannot call the Supabase Auth Admin API)? Not resolved here.

## Test evidence

**Database integration evidence**: `tests/integration/accountDeletionLifecycle.test.ts`, 9/9 passing. Commit `d117b20c`.
**Browser E2E evidence**: none specific to this item this phase (the UI was built and `tsc`/lint/build-verified but not Playwright-tested end to end).
**Hosted Preview evidence**: none — see Wave D status document.
