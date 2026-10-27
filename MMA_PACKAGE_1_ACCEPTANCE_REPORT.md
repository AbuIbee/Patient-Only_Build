# MY MEMORIA PROFESSIONAL — PACKAGE 1: Security and Database Completion
## Acceptance Report

**Repository:** `AbuIbee/Patient-Only_Build` · **Branch:** `remediation/mymemoria-functional-001`
**Enterprise staging Supabase:** `axurszlibxwwptkczztt` ("MyMemoria Ally - Isolated Staging") — inspected read-only only, never written to.
**Consumer production Supabase:** `ktehhvmmwnsbcvpjcmzt` ("PatientOnlyBuild") — not touched in any way this session.
**Final verified SHA this report covers:** `14f1aa1bbf5aee0554dcdf1c5030ad7083dcfffd` (pushed; local HEAD confirmed equal to `origin/remediation/mymemoria-functional-001` before and after each commit).

## OVERALL STATUS: **NO-GO** — not all seven workstreams are complete

Per this directive's own instruction, Package 1 is marked **NO-GO**, not READY FOR CODEX REVIEW. Two of seven workstreams have real, verified, pushed progress on their highest-priority, most concretely-specified items. The remaining five require substantially more work than this session produced — named exactly below, not glossed over. Only verified-safe, regression-tested improvements were pushed; nothing was weakened to force a green result.

---

## 1. Seven-workstream acceptance matrix

| # | Workstream | Status | Summary |
|---|---|---|---|
| 1 | Privileged provisioning & enrollment | **PARTIAL** | `org_configure_license` lockdown done + UI fixed (migration 143). `create_organization` investigated: local already safer than staging, no local change needed (see §3). `admin_set_organization_license_status`, `caregiver_initiate_patient_registration`, and the other 10 Workstream-1-named RPCs were NOT individually re-audited this session for caller-binding/consent/tenant-scope/escalation beyond what the grant-diff surfaced. |
| 2 | Enforce five-office permissions | **PARTIAL** | The core patient-access authorization chain (`is_authorized_for_patient`/`has_patient_access`/`is_medical_professional_for_patient`/`is_therapist_for_patient`/`is_professional_staff_for_patient`) now requires active org membership + active coverage + active license (migration 142) — this is the single highest-value fix in Package 1 and is real, tested, and pushed. A full inventory of every table policy/function/Edge Function/storage policy/frontend gate against an explicit action-by-action matrix was NOT performed. The `profiles.role IN ('admin','superadmin')` pattern used by `admin_set_organization_license_status` and likely other admin-gated functions is exactly the "editable/unverified profiles.role" pattern this directive's own Platform Owner Authority Model section says must be replaced with trusted server-controlled identity — identified, not yet redesigned or audited across every call site. |
| 3 | Tenant & communication isolation | **PARTIAL** | Migration 142 directly closes the specific "staff assignment alone must not bypass revoked membership/ended coverage/expired license" gap for the functions RLS policies most depend on (`has_patient_access` etc. gate most clinical-table policies). F-01 (conversation confidentiality/revocation) was re-confirmed still passing (6/6, migration 120's fix intact) as a side effect of fixing the F-01 test's own incomplete fixture — not independently re-audited beyond that. Storage buckets/signed-URL issuance/object-key-to-patient binding were NOT inspected this session. F-02 payment/customer association was NOT investigated. |
| 4 | Patient deletion | **NOT STARTED** | The staging migrations `enterprise_configurable_patient_retention_baseline`, `enterprise_patient_deletion_request_controlled_queue`, and `enterprise_read_only_patient_deletion_eligibility_gate` exist on staging (confirmed by name via migration-history introspection) but their actual table/function definitions were not retrieved or reconciled this session. No local schema for a retention/deletion-queue/legal-hold mechanism exists yet. |
| 5 | Schema reconciliation | **PARTIAL, with a major correction to the directive's own framing** | See §2 and §3 below — this is the workstream with the most real investigative work this session. |
| 6 | Authenticated adversarial tests | **NOT STARTED as specified** | No new synthetic STAGING identities were created and no real JWT-authenticated requests were sent against the staging project. All testing this session was executed against the pre-existing LOCAL disposable stack (`mma-ent-caregiver-master-003`), consistent with this entire engagement's established, lower-risk pattern — but this is explicitly NOT what Workstream 6 asks for (staging-specific adversarial testing with Platform Owner/Director A&B/revoked-staff/anonymous identities). The positive/negative test PATTERN this workstream describes (forged owner role, cross-tenant reads, stale JWT, expired license, etc.) is partially exercised by the EXISTING local integration suite (273 tests, many already adversarial-shaped) but a dedicated, staging-targeted run with the exact named negative cases was not built. |
| 7 | App integration & delivery | **PARTIAL** | The one UI change actually required by this session's two migrations (LicenseCard) was made and verified. Lint/typecheck/build/unit/integration all pass (see §4). The 92 caregiver requirements / 60 navigation destinations / 25 communications regressions were NOT specifically re-walked against these two new migrations beyond the full automated suite already covering a large fraction of them. |

---

## 2. What was actually found on staging (read-only introspection, not assumed)

Using `npx supabase db query --linked` (Management-API-backed, read-only SELECT statements only — no write capability was used or exists in this flow) against `axurszlibxwwptkczztt`:

- **51 total tracked migrations**, not literally "17" — 34 earlier "legacy_*"/"staging_corrected_*"/"staging_*" migrations (Oct 15–16) represent an earlier, independent catch-up/reconciliation pass, followed by the **17 "enterprise_*" migrations** (Oct 26–27) this directive names. The 17 are confirmed, by exact name and version, to match the directive's description precisely (`enterprise_restrict_authenticated_clinical_and_org_rpcs` = `20261026230035`, `enterprise_block_director_self_service_license_capacity_changes` = `20261026231844`, `enterprise_block_unapproved_self_provisioned_directors` = `20261026232019`, `enterprise_require_active_org_membership_coverage_license_for_staff_patient_access` = `20261027024543`).
- **A major correction to this directive's own framing, found by direct comparison, not assumed:** staging is NOT uniformly "ahead" of this repository on security hardening. A full `pg_proc`/`aclexplode` grant snapshot of all 92 SECURITY DEFINER functions on staging, diffed against the equivalent snapshot from this repository's own 141-migration local/disposable stack, shows **staging is still missing the bulk of this repository's own, much-earlier anon-EXECUTE lockdown work** (migrations 076, 085, 106, and others) — dozens of functions (`invite_org_member`, `remove_org_member`, `respond_to_org_invite`, `create_conversation`, `send_message`, `get_my_conversations`, and many more) are still `anon`-executable on staging while this repository already restricted them to `authenticated`-only, in most cases many sessions ago. This is reported to the Platform Owner as a real, separate finding — **staging needs to catch up to this repository in most areas, not the other way around.**
- **The 4 specific migrations this directive names were independently verified and acted on:**
  - **Migration 17** (`...require_active_org_membership_coverage_license...`): verified via `pg_get_functiondef`, reproduced exactly in `supabase/migrations/142_...sql`, with one deliberate exception (see §3). **An additional function with the identical vulnerability, `is_professional_staff_for_patient`, was found to be UNFIXED even on staging** (migration 17 missed it) — fixed here, going one function further than the hosted migration.
  - **Migration 15** (`...block_director_self_service_license_capacity_changes`): verified (`org_configure_license` is `service_role`-only on staging), reproduced in `supabase/migrations/143_...sql` for this repository's own 8-arg version of the function, plus the required Director-UI fix.
  - **Migration 16** (`...block_unapproved_self_provisioned_directors`): verified — staging's `create_organization` is STILL the original, unsafe, direct-self-provisioning body (creates an org and grants Director status immediately, no review). **This repository's own migration 083, already in this codebase's history, already replaced this with a safe application-submission wrapper** — this repository does not need migration 16's fix; **staging needs this repository's migration 083 applied to it instead.** No local change was made or needed.
  - **Migration 14** (`...restrict_authenticated_clinical_and_org_rpcs`): given the broader grant-diff finding above, this repository already restricts anon/authenticated access on its own clinical/org RPCs at least as strictly as — and in most cases more strictly than — what migration 14 achieves on staging. No specific local gap attributable to migration 14 was found.

## 3. Deliberate divergences from staging (not weakened, documented)

- `is_authorized_for_patient(uuid, uuid)`: staging grants `anon, authenticated` on this raw function, which takes an **arbitrary `p_user_id` as a direct parameter**, not `auth.uid()`. This means, on staging today, **any caller — including an unauthenticated one — can probe arbitrary `(user_id, patient_id)` pairs as an authorization oracle.** This repository's own grant (`service_role` only, with `has_patient_access(patient_id)` — using `auth.uid()` internally — as the safe, self-scoped wrapper) is already correct and was **not weakened to match staging.** This divergence is reported here, not silently fixed on staging (no write capability to staging was used).
- `create_organization`/`org_configure_license`: as above — this repository is intentionally not made to match staging's current (less safe, or differently-shaped) state for these two functions.

## 4. Evidence: what was actually run, and the results

```
npm run typecheck   -> clean
npx eslint <changed files>  -> clean (exit 0)
npm run build        -> succeeds, 3261 modules
npx vitest run (unit) -> 32 files / 405 tests passing
npm run test:integration (disposable mma-ent-caregiver-master-003 stack,
  MMA_TEST_API_BASE=http://127.0.0.1:57321
  MMA_TEST_DB_CONTAINER=supabase_db_mma-ent-caregiver-master-003)
                      -> 39 files / 273 tests passing
```

Both migrations were verified RED before the fix and GREEN after, not just green after:
- Migration 142: `tests/integration/codexF01ConversationConfidentiality.test.ts` initially failed 6/6 (its own fixture was missing an `organization_licenses` row — the only test file in the repo with that specific gap, confirmed by scanning every fixture file) — fixed, then 6/6 passing, then the full suite re-confirmed clean.
- Migration 143: 4 tests across 3 files initially failed with the exact, expected new 403s where they'd previously asserted the old (now-superseded) 200/400 behavior — each rewritten to assert the real new behavior with an explanation of what changed, not forced to pass by weakening the assertion. One flawed fix attempt (calling `org_configure_license` as `service_role` to preserve a concurrency test) was caught, verified wrong by direct raw-SQL testing (`SET ROLE service_role` fails the function's own internal director check in ~8ms, never reaching the row lock), and corrected to an honest resolution before committing.

Commits pushed, both verified local HEAD == remote HEAD immediately after push:
- `bc13a79f061dec8d7c284b73c272c2d5fb46f66e` — migration 142 (patient-access authorization) + F-01 test fixture fix.
- `14f1aa1bbf5aee0554dcdf1c5030ad7083dcfffd` — migration 143 (`org_configure_license` lockdown) + Director UI fix + 3 test updates.

## 5. Precise blockers for the remaining workstreams

1. **Workstream 4 (patient deletion):** requires retrieving and reconciling 3 more staging migrations' real table/function definitions (not yet done) before any local schema can be written — doing this safely (vs. inventing a retention/legal-hold schema) requires the same read-only introspection discipline used for migrations 142/143, not yet applied here.
2. **Workstream 6 (staging-targeted adversarial tests):** requires explicit authorization to create synthetic auth identities directly on the `axurszlibxwwptkczztt` staging project (not just the local disposable stack) and a decision on whether that's an acceptable use of the staging environment, or whether all adversarial testing should instead target an even-more-isolated, freshly-provisioned disposable project seeded with these same 142 migrations.
3. **Workstream 2 (Platform Owner identity):** the `profiles.role IN ('admin','superadmin')` pattern this repository already uses predates this directive and is flagged, not fixed — replacing it with a trusted, non-client-editable identity mechanism (e.g. a dedicated owner-identity table only service_role can write, or a custom JWT claim set only at user-creation time) is a real, separate design task spanning every admin-gated function, not a single migration.
4. **Workstreams 1/2/3 remainder:** the full action-by-action permission matrix and the remaining Workstream-1-named RPC audit (consent/tenant-scope/escalation for `caregiver_initiate_patient_registration`, `cover_patient`, `assign_staff_to_patient`, etc.) were not completed — each is individually tractable with the same introspect-then-reconcile method just demonstrated twice, but doing all of them was beyond this session's scope.

## 6. Original Codex findings referenced and their disposition this session

- **F-01** (cross-tenant conversation/forbidden communication): re-confirmed passing (6/6) as a side effect of fixing an incomplete test fixture surfaced by migration 142 — not independently re-audited for new gaps this session.
- **F-02** (payment/customer association): not investigated this session.

## 7. Independent acceptance

This report, and the two pushed commits it describes, are **Claude's own self-verification only.** Per this engagement's standing rule, this is explicitly not, and does not claim to be, independent Codex acceptance. Codex should independently re-verify commits `bc13a79f` and `14f1aa1b` against a disposable stack seeded identically (migrations 001–143), and separately re-verify the staging-side findings in §2–3 via its own read-only introspection before this or any later Package 1 commit is treated as accepted.

**No merge to main, no deploy, no Package 2 work was started.**
