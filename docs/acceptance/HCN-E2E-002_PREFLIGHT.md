# HCN-E2E-002 — Read-only production preflight
**Timestamp:** 2026-11-04 (Eastern US); exact tool-event UTC timestamps in connector logs.
**Operator:** ChatGPT architect. **Codex:** Not invoked. **Browser actor:** Not yet available in this connected tool session.
**State:** PRE-FLIGHT COMPLETE / LIVE ACCOUNT CREATION NOT STARTED / FULL END-TO-END ACCEPTANCE NOT VERIFIED.

## Confirmed production configuration
- Website: https://www.haneencarenetwork.com/Professional.
- Vercel production: READY, Git SHA `6621b4b755b8d682135cf075ab60712803e8762f`, branch `fix/hcn-onboarding-activation-20261029`.
- Supabase project reference: `zgkghauitpyzzljbtrxk` (explicitly the production project).
- Live published annual prices: Essential $399 / Plus $599 / Complete $799.
- Specialist slots: Essential 0 / Plus 1 / Complete 3.
- WELCOME100: active, full_waiver, applies to first annual license only, unlimited redemptions, no configured expiry; at preflight redemption count was 1. One proposed Complete annual fee: 79900 cents; coupon prospective first-year amount 0 cents.
- `calculate_monthly_patient_fee_cents(12)` returned 25000 cents ($250/month); no authority to waive it or initiate a real charge.
- `professional_applications` requested/approved office constraints allow director/caregiver/medical_professional/therapist. No distinct nutritionist or physical therapist credentialed office.
- `organization_memberships` role constraint has `medical_professional` and `therapist` but no `other_specialist`. Existing active-specialist capacity trigger enforces three simultaneous active specialist memberships in Complete.
- Existing production data was nonempty on preflight: one organization and one active license; separate Auth/user counts varied while ongoing customer testing continued. Preserve preexisting records.
- The current enterprise patient-creation and caregiver-creation backend functions are present from prior deployments. They are **not** acceptance proof of a real browser journey.

## P0 test blockers discovered before creating anything
1. Four distinct clinical disciplines require at least four simultaneous specialty capabilities; Complete cap is three. Owner approved the cap previously; no silent entitlement change.
2. Nutritionist and Physical Therapist have no distinct approved/verified office role in application schema. Generic provider labels cannot substitute for authenticated clinical access.
3. No operator-controlled test inbox mapping for 22 IDs was provided. Do not send to fake/uncontrolled addresses.
4. TinyFish was reportedly installed in ChatGPT, but no TinyFish browser tool or Codex execution tool appeared in ALL_TOOLS for this active session. We cannot assert any authenticated browser step completed.
5. Synthetic production e-signing requires lawful signatory authority; do not falsify any legal or credential attestation.
6. WELCOME100 does not waive $250/month for 12 patients. Do not authorize real recurring billing as part of test.

## Current actual results
- Read-only pricing/coupon/schema check: PASS.
- Published test plan / account matrix / assignment matrix: PASS.
- Customer self-service O01 account, organization and licensing: NOT RUN.
- Separate Director D01 provisioning: NOT RUN.
- C01–C04 creation/activation: NOT RUN for this dedicated trial.
- P01–P12 creation and caregiver assignment: NOT RUN for this dedicated trial.
- Four-specialist credentialed enrollment: BLOCKED by existing limit and unavailable role model.
- Communications and privacy acceptance: NOT RUN.
- Live payment and e-signature: NOT RUN; must not be faked.

## Resume conditions
Run Codex in an actual authenticated production browser context with **controlled disposable inboxes** and secure credential store; use the exact [master spec](HCN-E2E-002_BILAL_FAMILY_PRODUCTION_MASTER.md), [account ledger](HCN-E2E-002_ACCOUNT_LEDGER.csv) and [patient matrix](HCN-E2E-002_PATIENT_ASSIGNMENT_MATRIX.csv). Perform idempotent existing-organization/identity collision checks before any write. Stop and report an exact P0 defect when a hard gate is hit. Complete independent nonclinical tests where safe, but never call the complete trial PASS with any unresolved specialty mismatch.