# 13 — Independent Codex handoff

**Review this exact, immutable commit**: `e24c30358e0065ca3f8b6e7da30aa3f3f1176437` on branch `fix/hcn-p0-clinical-revocation-20261101` (PR #4, draft).

**Do not rely on this report's PASS classifications without reproducing the supporting evidence.** Every claim in `00`-`09` is backed by a specific test file, a specific manual verification command, or a specific line of code cited by name -- re-run the commands in `10_TEST_COMMANDS_AND_RESULTS.md` directly, against a fresh disposable stack of your own, before accepting any of them.

## Mandatory independent acceptance, in order (stop at the first failure)

1. **S01 and S02** -- replay `supabase/migrations/20261101090000_hcn_p0_current_staff_clinical_authorization.sql` and `.../20261101091000_hcn_reconcile_checkin_and_redundant_policies.sql` against a fresh disposable stack, then again in every sequence named in `01_S01_S02_CORRECTIONS.md`. **If either fails, stop -- do not proceed to dependent migration execution**, per this directive's own stop condition.
2. **P0 revoked-caregiver regression** -- run `tests/integration/hcnP0RevokedCaregiverClinicalAccessRegression.test.ts` directly; additionally, reproduce test #2/#3 manually (revoke a real membership, confirm zero disclosure with both the pre-existing and a freshly re-issued JWT) rather than trusting the test's own assertions alone. **If this fails, stop security acceptance immediately.**
3. **Sixteen-policy authorization** -- verify `03_SIXTEEN_POLICY_MATRIX.md`'s live-state claims directly against `pg_policies` on your own fresh stack; specifically re-derive the A-P01/A-P02 "not removed" determination independently, since it departs from the historical classification's literal "REDUNDANT" label and should not be accepted on this report's reasoning alone.
4. **Platform Owner separation / tenant isolation** -- `04_PRIVILEGE_AND_TENANT_ISOLATION.md`.
5. **Essential/Plus/Complete specialist limits** -- `tests/integration/mmaProfOnboard004OwnershipAndSlots.test.ts` and `hcnP0ThreeTierEnterpriseAcceptance.test.ts`.
6. **License lifecycle** -- `05_LICENSE_AND_SPECIALIST_CAPACITY.md`, including the two explicitly flagged open items.
7. **Agreement and billing activation** -- `06_AGREEMENTS_AND_BILLING.md`. Provider-dependent acceptance (an actual Stripe Checkout Session, a real webhook) remains BLOCKED pending sandbox credentials -- do not accept this as closed without independently exercising it once credentials are available.
8. **Director provisioning** -- `07_DIRECTOR_PROVISIONING.md`.
9. **Director onboarding** -- `08_OFFICE_COMMUNICATIONS.md` (Phase H section).
10. **Communications** -- `08_OFFICE_COMMUNICATIONS.md` (Phase I section).
11. **Migration integrity** -- confirm every migration in `supabase/migrations/` still applies cleanly in filename order on a fresh stack (the standard `node scripts/disposable_supabase.mjs start` path already does this, confirmed throughout this session's own work).
12. **Production data isolation** -- confirm (as this session did) that `tests/integration/_targetValidation.ts` rejects any target resolving to the owner's persistent database, and that no command in this session's own history (see `10_TEST_COMMANDS_AND_RESULTS.md`) touched anything but the disposable stack.

## If a gate fails

Identify the exact dependency or defect and report it as its own finding -- do not silently patch and re-report PASS without new evidence. The reporting discipline this session followed (cite the exact test, the exact command, the exact code line) is the standard to hold this report itself to, not just future work.

## Explicitly not in scope for Codex to approve

Production deployment, merging PR #4, or any live Stripe charge. None of these is requested by this handoff, and this directive does not authorize requesting them.
