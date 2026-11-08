# HCN-E2E-REMEDIATION-001 — security change review

Baseline: release source `82d18d503203ec794d4c36fdde3a1cc259c26c80`.
No deployment, hosted migration, live identity change, provider configuration or paid AI operation is authorized.

## Authorization design

The old clinical policies admitted a `staff_patient_assignments.is_active` row without checking membership, matching role, covered-patient state or license. A revoked membership could leave that assignment flag active. The operational policies tried to add membership/license/coverage joins as ordinary invoker queries, but license RLS deliberately hides financial license rows from caregivers. Both valid receipt and escalation reads therefore failed in a clean replay. Production has extra license policies; it is not definition-equivalent to the repository baseline.

The first migration adds private, self-scoped boolean authorization functions. Each uses the authenticated identity from `auth.uid()` and current database records, never cached JWT role/assignment claims. The identity must still exist and not be deleted/banned. Staff membership and assignment must belong to the same organization, patient and role and remain active. Covered-patient membership and license must be active, and the license must have its issued license number, matching the existing staff-roster/patient-access gate. The current schema has no license-end-date column; no invented date or synthetic payment state is introduced. Existing professional eligibility predicates remain additional conditions on specialist paths.

An invoker helper cannot solve these dependencies: it sees zero license rows, and invoking the assignment's own SELECT policy from itself recurses. The SECURITY DEFINER helpers therefore live in `hcn_private`, outside configured Data API schemas (`public`, `graphql_public`). Search paths are fixed empty, relation names qualified, arguments contain no caller identity, and only authenticated execution of the scoped boolean helpers is granted. Anonymous/PUBLIC execution and schema creation are not granted. They expose neither license rows nor patient records. The trigger function and policy-before-image table have no client grants. These functions must not be added to an exposed schema list.

Every assignment-dependent policy discovered from `pg_policies` is tightened inside its existing assignment subquery. Patient/residential branches, policy command and permissive/restrictive mode remain unchanged. Guarded policies previously assigned to PUBLIC are narrowed to authenticated, preventing anonymous queries from reaching an intentionally non-anonymous private helper. This preserves anonymous empty-read behavior without granting anonymous helper execution. Original roles are stored with policy before-images. The transformation handles USING and WITH CHECK separately; unknown aliases or missing active predicates abort the migration. Assignment self-read and label updates gain the same current authorization. Operational reads use private scoped checks rather than RLS-filtered financial joins. Two existing caregiver authoring RPCs also receive the current matching-role guard, preserving their remaining validations and grants. No unconditional policy or general staff license-read grant is added.

The six-table dependency review covers:

| Table | Treatment |
|---|---|
| hcn_previsit_acknowledgments | Director with current covered/license scope, or the scheduled caregiver with current caregiver membership/assignment/coverage/license |
| hcn_care_escalations | Current scoped Director or currently assigned eligible staff |
| staff_patient_assignments | Self-read and label updates require current authorization; protected-column grants remain unchanged |
| covered_patient_memberships | Existing patient/governance branches retained; assigned-staff branch uses a private current-authorization/issued-license check so the patient view can read its coverage status without financial license rows |
| organization_memberships | Own-status and authorized governance visibility retained; private helper reads current status/role without recursion |
| organization_licenses | Existing visibility retained, including deliberate caregiver financial-row denial; private helper reads only authorization facts |

Policy helper definitions reviewed include `is_active_org_director`, `is_active_org_member`, `is_active_org_clinical_authority`, `is_active_org_auditor`, `is_invited_or_active_org_director`, `is_platform_owner`, the hosted `is_organization_owner`, and the medical/therapy/current patient eligibility functions. No Platform Owner or Organization Owner authority is granted by this change.

## Wellness provenance and corrections

New columns preserve immutable authenticated author UUID, actual authorized database role, source category, organization, and an optional superseded-entry ID. The server stamps creation and event timestamps. Client author/source conflicts are rejected; client display labels are not trusted. The trigger and CHECK constraint explicitly reject a NULL role for attributed records, and the client rejects an invalid returned role. A patient report and a caregiver/professional observation remain separate entries. The UI keeps staff and historical observations outside the patient's self-reported feeling timeline and labels sources in the staff history.

Authenticated INSERTs require current patient self-authority, current organizational staff authority or an independently existing residential caregiver relationship. Ambiguous multi-organization entries require explicit organization context. UPDATE is append-only denied, including UPSERT conflict updates. A correction is a new entry linked to the original and requires the same original author, patient, organization and source. Original data remains unchanged. Historical entries keep `legacy_unattributed`; no author is inferred from display strings. Trusted non-user fixture/maintenance inserts are also explicitly unattributed and cannot manufacture verified human provenance.

The new organization association is also enforced on staff SELECT: another organization covering the same patient does not gain the first organization's observations. A dedicated real-JWT test verifies both directions and the patient's continued self-access to both. Null-organization historical/personal records retain their prior patient-scoped authorization, and independently authorized residential paths are unchanged.

Author and organization foreign keys deliberately restrict deleting referenced retained records; production account/organization hard-deletion and retention procedures must be reviewed before promotion. Existing synthetic acceptance accounts must not be deleted to test that boundary. Patient and residential records can legitimately have null organization, and historical records are not assigned a fabricated organization.

## Rollback and restore

Both migrations are additive and transaction-safe. Existing clinical rows are not deleted or rewritten with invented authors. Policy before-images are retained in a private RLS-enabled table with no client access. `policy_restore_rehearsal.sql` restores the previous predicates **inside an uncommitted transaction and then rolls back**; it is for the disposable review environment only. Tests also verify migration reapplication is deterministic.

Do not restore the vulnerable assignment-only predicates to production. If deployment is subsequently authorized and a functional regression occurs, roll back the frontend while keeping the new backend authorization/provenance protections, or use a separately reviewed fail-closed forward migration. Do not drop provenance columns, erase revisions or disable RLS/triggers. Review existing transactions/session connection behavior during promotion, then test both old and freshly issued JWTs. Production rollback that would destroy provenance/history is a stop condition, not an approved fallback.

## Reproduction and acceptance

Use a new local Supabase project with no hosted credentials, imported records, provider keys or seed SQL. Set both `MMA_TEST_API_BASE` and `MMA_TEST_DB_CONTAINER` explicitly; the integration runtime rejects unsafe persistent targets. Run the unchanged `tests/integration/hcnOperationsRls.test.ts`, plus `hcnRemediationCurrentAuthorization.test.ts`, then the full integration suite. The unchanged eight-case SQL remains an independent baseline. New real-GoTrue-JWT/PostgREST cases cover membership/coverage revocation with old and fresh tokens, role mismatch, cross-tenant access, provenance forgery, UPDATE/UPSERT, revisions and financial-row denial.

Unit tests supplement these DB tests; they do not replace them. `tests/browser/hcn-signin-accessibility.cjs` is loopback-only and requires local CLI credentials injected in memory. It tests labels, keyboard focus, error association, visibility toggle, actual disposable Auth sign-in and desktop/mobile fit. Never run that fixture-creating script against production.

Supabase references checked: [RLS and private definer functions](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog](https://supabase.com/changelog). Installed CLI2.84.4 was retained; no v3 upgrade or default-target assumption was introduced.

The original 64-check master audit is not reset or accepted by this remediation. Live authenticated three-identity acceptance still requires approved credential injection and a separately authorized promotion/verification process.
