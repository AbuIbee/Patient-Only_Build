# 10 — Test commands and results

All integration tests below ran against the disposable, local-only Docker Supabase stack (`scripts/disposable_supabase.mjs`), never the owner's persistent database or production -- enforced by `tests/integration/_targetValidation.ts`'s own guard, which rejects any target resolving to the owner's real database before a single statement runs.

## Setup (each verification cycle)

```bash
node scripts/disposable_supabase.mjs start
# ... MMA_TEST_API_BASE=http://127.0.0.1:57321 MMA_TEST_DB_CONTAINER=supabase_db_mma-ent-caregiver-master-003
node scripts/disposable_supabase.mjs stop   # after every verification cycle, before every commit
```

## New HCN test files (this directive)

```bash
npx vitest run --config vitest.integration.config.ts tests/integration/hcnP0CorrectiveS01S02Regression.test.ts
# 12/12 passing

npx vitest run --config vitest.integration.config.ts tests/integration/hcnP0RevokedCaregiverClinicalAccessRegression.test.ts
# 12/12 passing

npx vitest run --config vitest.integration.config.ts tests/integration/hcnP0SixteenPolicyReconciliation.test.ts
# 3/3 passing

npx vitest run --config vitest.integration.config.ts tests/integration/hcnP0ThreeTierEnterpriseAcceptance.test.ts
# 8/8 passing

npx vitest run --config vitest.integration.config.ts tests/integration/mmaProfOnboard004OwnershipAndSlots.test.ts
# 8/8 passing (one pre-existing test corrected -- stale 'complete' tier value; one new concurrency test added)
```

## Raw migration replay and tamper tests (manual, documented in `01_S01_S02_CORRECTIONS.md`)

```bash
docker exec -i supabase_db_mma-ent-caregiver-master-003 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20261101090000_hcn_p0_current_staff_clinical_authorization.sql
docker exec -i supabase_db_mma-ent-caregiver-master-003 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20261101091000_hcn_reconcile_checkin_and_redundant_policies.sql
# Replayed in every required sequence (M1, M1->M1, M1->M2, M1->M2->M1, M1->M2->M2, M1->M2->M1->M2):
# all succeed with zero errors on a correctly-migrated state.
```

## Collateral regression sweep (every other integration test touching the affected tables/policies)

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/accountDeletionLifecycle.test.ts tests/integration/assignmentRemovalConcurrency.test.ts \
  tests/integration/carePlanConcurrency.test.ts tests/integration/closureP4RealFiveMinuteArchival.test.ts \
  tests/integration/closureP5StorageLegalHoldProtection.test.ts tests/integration/codex002P101AprPatientOfficeAccess.test.ts \
  tests/integration/codex002P102LegacyClosureBypass.test.ts tests/integration/codex002P103LegalHoldDeletionProtection.test.ts \
  tests/integration/codex002P105ExceptionalPlatformOwnerDeletion.test.ts tests/integration/codex011ClinicalTimestampImmutability.test.ts \
  tests/integration/codex03AuthorizationGaps.test.ts tests/integration/codexF01ConversationConfidentiality.test.ts \
  tests/integration/codexF14TaskInsertAttribution.test.ts tests/integration/communicationsOverviewUndercount.test.ts \
  tests/integration/credentialVerificationGate.test.ts tests/integration/crossOfficeCommunicationMatrix.test.ts \
  tests/integration/d01OrganizationIsolation.test.ts tests/integration/d03PatientLabels.test.ts \
  tests/integration/d08IncidentSeverityTimeAttachments.test.ts tests/integration/messageAttachmentsAndFollowUpOwnership.test.ts \
  tests/integration/package1AuthorizedPatientRepresentative.test.ts tests/integration/package1OrgOwnerSelfAssignment.test.ts \
  tests/integration/package1PatientClosureAndArchival.test.ts tests/integration/r15HelpRoutingRevocationRecheck.test.ts \
  tests/integration/r17ThreadRevocationVsFailure.test.ts tests/integration/roleDelegation.test.ts \
  tests/integration/round7MasterCorrectiveSecurity.test.ts
# 27 files, 206 tests passing
```

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/codex011PerRoleLicenseCaps.test.ts tests/integration/codexF13EligibilityBypass.test.ts \
  tests/integration/f09TherapistPackageOfficeScope.test.ts tests/integration/lastSeatApprovalConcurrency.test.ts \
  tests/integration/mmaProfOnboard004CommercialCatalog.test.ts tests/integration/monthlyBillingAnchorRollover.test.ts \
  tests/integration/enterpriseLicenseIssuance.test.ts tests/integration/codexF04MandatoryAgreements.test.ts \
  tests/integration/enterpriseContracts.test.ts tests/integration/enterpriseNotifications.test.ts \
  tests/integration/issue3P0DirectorActivationAndExceptionalBypass.test.ts tests/integration/mmaProfOnboard004SelfServiceEntry.test.ts
# all passing
```

## Final combined sweep (every HCN-named test this engagement has produced, together)

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/hcnP0CorrectiveS01S02Regression.test.ts tests/integration/hcnP0RevokedCaregiverClinicalAccessRegression.test.ts \
  tests/integration/hcnP0SixteenPolicyReconciliation.test.ts tests/integration/hcnP0ThreeTierEnterpriseAcceptance.test.ts \
  tests/integration/mmaProfOnboard004OwnershipAndSlots.test.ts tests/integration/mmaProfOnboard004CommercialCatalog.test.ts \
  tests/integration/hcnLicenseGatesOfficeAccess.test.ts
# 7 files, 61 tests passing
```

## Static checks (every commit)

```bash
npx tsc --noEmit -p tsconfig.json   # clean every time
npm run lint                        # clean every time (one pre-existing, unrelated warning)
npx vitest run                      # full unit suite: 33 files, 410 tests, passing every time
```

## Anonymous-access regression check (Phase A, found and fixed)

```bash
curl -s "http://127.0.0.1:57321/rest/v1/patients?select=id&limit=1" -H "apikey: <local demo anon key>" -H "Authorization: Bearer <local demo anon key>" -w "\n%{http_code}\n"
# before the fix: 401, "permission denied for function hcn_current_staff_patient_access"
# after the fix:  200, []
```
