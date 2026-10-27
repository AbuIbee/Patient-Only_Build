# MMA-P1-FINAL — Architectural Reconciliation Report

Directive: "CLAUDE CODE — MY MEMORIA PROFESSIONAL — MMA-P1-FINAL: FOUNDATIONAL
ARCHITECTURE AND PACKAGE 1 COMPLETION."
Branch: `remediation/mymemoria-functional-001`. Repository: `AbuIbee/Patient-Only_Build`.

This report does not accept the prior `MMA_PACKAGE_1_ACCEPTANCE_REPORT.md`'s
conclusions on authority. Every row below is independently re-verified in
this session against actual code, actual migrations, or actual read-only
staging introspection, with evidence cited.

## 0. Environment verification (Section 1)

| Check | Result |
|---|---|
| Repository | `AbuIbee/Patient-Only_Build` (origin remote confirmed) |
| Branch | `remediation/mymemoria-functional-001` |
| Starting HEAD | `d5f77626f7a39607bcc069af3474bf87c9dc1f14` (local == remote, verified via fetch) |
| Prior commits `bc13a79f`, `14f1aa1b`, `d5f77626` | All three exist, reachable on this branch, contents inspected via `git show --stat` — not merely trusted from the prior report's claim |
| Uncommitted pre-existing work | `dist/index.html` (modified), `dist/assets/` and `audit-output/` (untracked) — build artifacts, not touched, not staged |
| Current HEAD after this session's work | `ff4898b9b8a17dacd9ca903df5a390b814c4ddb3` |

## 1. Reconciliation matrix

| Requirement | Existing implementation | Evidence | Compliant? | Correction |
|---|---|---|---|---|
| 4.1 Platform Owner trust must not depend on a user-editable field | `profiles.role` IS the trust field, but migration 012 revoked column-level `INSERT`/`UPDATE` grants on `role` from `authenticated` entirely; the only mutator is `admin_set_role()`, a `SECURITY DEFINER` RPC that itself requires the caller already hold `role IN ('admin','superadmin')` | `supabase/migrations/012_profiles_revoke_client_role_authority.sql` (column-grant REVOKE/GRANT lists, `admin_set_role()` body) | **Compliant.** No authenticated-reachable self-escalation path exists. First-admin bootstrap is explicitly out-of-band (direct DB access), documented as a known, accepted limitation in the same file — not a defect | None needed |
| 4.1 (continued) `is_platform_owner()` used consistently as the trust check | `is_platform_owner()` (`SELECT EXISTS(... profiles.role IN ('admin','superadmin'))`), `SECURITY DEFINER`, used throughout `professional_applications`/`account_management_audit`/organization approval RPCs | `supabase/migrations/083_r10_professional_application_approval_system.sql:35-40` | Compliant | None needed |
| 6 "Director capacity-request workflow must remain functional" after the prior session's `org_configure_license` lockdown | `director_request_organization_amendment()` / `organization_amendment_requests` is a **separate** RPC pathway from `org_configure_license()`, Platform-Owner-reviewed, never touched by migration 143. UI still wires to it (`OrganizationDirectorDashboard.tsx:436`) | `supabase/migrations/113_mma_ent_sales_006_organization_amendment_requests.sql`; grep of `OrganizationDirectorDashboard.tsx` | **Compliant** — the prior session's lockdown did not regress this workflow | None needed |
| 10.1 Existing authorization helpers (`is_authorized_for_patient`, `has_patient_access`, `is_medical_professional_for_patient`, `is_therapist_for_patient`, `is_professional_staff_for_patient`) require active membership + active coverage + active license, not staff-assignment alone | Fixed in the prior session's migration 142 (reconciled against staging's real, verified migration), independently re-verified in this session by reading the actual committed SQL, not re-trusting the prior report's narrative | `supabase/migrations/142_package1_...sql` (read in full this session) | Compliant, re-verified | None needed this session |
| 5 Organization Owner — full organizational authority, self-assignable clinical access, multiple functions under one identity | **Did not exist at all** before this session. No `owner_user_id`/owner concept distinct from `org_role='director'`; `organization_memberships` `UNIQUE(organization_id, user_id)` structurally prevented one identity holding multiple office rows for one org | Grep of all migrations for `organization_owner`/`is_org_owner`/`self_assign` returned nothing before this session | **Non-compliant → now partially corrected** | Migration 144 (this session): additive `organizations.owner_user_id` (backfilled from `created_by`, trigger-defaulted for compatibility with 26 existing fixtures) + `organization_owner_capability_grants` + `org_owner_self_assign_capability()`/`org_owner_revoke_own_capability()`, each auditable via `account_management_audit`. Wired into `is_medical_professional_for_patient`/`is_therapist_for_patient`/`is_authorized_for_patient` as an additional, license/coverage-gated OR-branch. Verified: no access before self-assignment, correct tenant scoping (owner of two orgs only gets access within the org the grant names), revocation removes access immediately, every action audited. **Not yet done:** Owner "assign organizational permissions"/"assign organizational roles" to OTHER staff beyond themselves (5.1's broader staff-management authority) — self-assignment only was built this session |
| 7 Authorized Patient Representative | **Does not exist at all.** No representative table, no relationship/authorization-basis fields, no enrollment RPC, no distinct identity linkage between a representative and the actual patient | Grep of all migrations for `representative` returned zero matches | **Non-compliant, NOT STARTED** | Requires: a new `patient_representatives` table (legal name fields, contact, relationship, authorization basis/evidence reference, verification status), a multi-step enrollment RPC restricted to an authorized org employee, patient-office access re-scoped to resolve through the representative's own identity while attributing actions to both representative and patient, revocation/replacement RPCs. This is a net-new, multi-table feature, not a reconciliation — not completed this session; see Section 3 below |
| 8 Patient closure (ACTIVE → CLOSED → ARCHIVED) and 45-day automatic archival | **Does not exist at all.** No `closed_at`/`archived_at` columns, no closure RPC, no archival job | Grep of all migrations for `closed_at`/`archived_at`/`patient_closure`/`archival` returned zero matches | **Non-compliant, NOT STARTED** | Requires a lifecycle column set on the patient/org-coverage relationship, a closure RPC requiring mandatory notes, and a retry-safe scheduled archival job (`pg_cron` or equivalent) respecting multi-org patient sharing. Not completed this session |
| 8.4 Retrieve actual staging definitions for `enterprise_configurable_patient_retention_baseline`, `enterprise_patient_deletion_request_controlled_queue`, `enterprise_read_only_patient_deletion_eligibility_gate` before designing replacements | Directly queried staging (`axurszlibxwwptkczztt`) read-only via `pg_get_functiondef` for exactly these three names | `npx supabase db query --linked --agent=yes -o json "SELECT p.proname, pg_get_functiondef(p.oid) ... WHERE p.proname IN (...)"` → `{"rows": []}` | **Confirmed: none of the three exist on staging.** The original directive's premise that staging holds these functions is itself incorrect, reproduced independently rather than assumed | There is nothing to retrieve or reconcile — retention/deletion architecture must be designed fresh, additively, under Section 8.4's constraints (legal holds block deletion, documented authorization/eligibility/audit). Not yet designed |
| 9 Full five-office permission matrix | Partial — Workstream 2/3's existing per-function audits (migrations 083, 104, 106, 124-141) cover many individual findings, but no single consolidated action-by-action matrix across all 5 offices + 3 cross-cutting authorities exists | Repo migration history | **Incomplete** | Deliverable B (`MMA_P1_PERMISSION_MATRIX.md`) not yet produced this session |

## 2. Organization Owner design decision (recorded per Section 0's instruction)

The directive requires Organization Owner self-assignment to be explicit,
auditable, and to support one identity holding multiple organizational
functions simultaneously. The existing `organization_memberships` table
enforces `UNIQUE(organization_id, user_id)` — one office per person per
org — and dozens of existing functions/RLS policies depend on that being a
single-row lookup. Relaxing it repo-wide was judged higher-risk and broader
in blast radius than the directive's own Section 15 ("do not redesign
screens/mechanisms unrelated to the correction") permits for Package 1.

**Decision:** model Owner capability self-assignment as a separate,
additive grant table (`organization_owner_capability_grants`) layered on
top of the existing office model via an additional authorization OR-branch,
rather than changing `organization_memberships`' structural assumption.
This is implemented in migration 144 and independently tested
(`tests/integration/package1OrgOwnerSelfAssignment.test.ts`).

## 3. Scale assessment for remaining work

APR (Section 7) and patient closure/archival (Section 8) are net-new,
multi-table, multi-RPC features with no existing scaffolding in this
repository — not reconciliation of a discrepancy between two already-built
systems, which is what most of this engagement's prior work has been.
Building either to the directive's full specification (representative
enrollment + verification + revocation + replacement + audit attribution
for APR; closure + mandatory notes + retry-safe 45-day archival + legal
hold enforcement + multi-org protection for closure) is substantial,
independently testable work in its own right. Honest status: **NOT
STARTED**, reported as such rather than claimed complete or
partially faked.

## 4. Status summary

- **IMPLEMENTED — TESTED — VERIFIED (this session):** Organization Owner
  self-assignment of clinical capability (migration 144).
- **VERIFIED, no change needed:** Platform Owner trust model (4.1);
  Director capacity-request workflow regression check (Section 6); the
  four patient-access authorization helpers (10.1, prior session's
  migration 142, re-verified).
- **BLOCKED — nothing to retrieve:** staging's three named retention/
  deletion functions do not exist (8.4) — re-architecture must proceed
  from a clean slate, not yet done.
- **NOT STARTED:** Authorized Patient Representative (7); patient closure
  and 45-day archival (8); consolidated five-office permission matrix (9);
  storage/signed-URL audit (10.3); migration/grant inventory beyond the
  four already-reconciled functions (11.1); adversarial test matrix (12);
  92/60/25 regression reconciliation (13).

**Overall: PACKAGE 1 — NO-GO.** Real, tested, pushed progress exists on
Platform Owner trust verification and Organization Owner self-assignment.
The remainder — especially APR and patient closure/archival — are
substantial net-new builds not completed in this session and not safe to
claim complete.
