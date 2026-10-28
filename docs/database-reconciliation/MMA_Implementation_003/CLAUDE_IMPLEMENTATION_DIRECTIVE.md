# Owner-controlled implementation directive — My Memoria Professional

**Branch:** `remediation/mymemoria-functional-001` in `AbuIbee/Patient-Only_Build`. **Staging project ONLY:** `axurszlibxwwptkczztt`. **Consumer production:** `ktehhvmmwnsbcvpjcmzt`, do NOT write to it. Do NOT alter consumer Vercel project `patientonly`.

## Mission
Complete Professional Enterprise-specific data model and server functions, not residential parity. Implement the enclosed four-batch SQL candidate package and any *additional* verified Professional tables/functions derived from existing frontend components, current RPC references, 92/60/25 acceptance matrices, and enterprise lifecycle requirements. Avoid recreating existing staging custom tables. Do not blindly replay 159 source migrations.

## Safety protocol
1. Read-only inventory of all current schemas, existing migration history, frontend `.from`/`.rpc` calls, Edge Functions and policies; record complete baseline diff. Stop if target identity is ambiguous.
2. Create disposable local reconstruction of Professional staging, preserving four custom staging-only tables (`enterprise_demo_environments`, `enterprise_patient_deletion_requests`, `enterprise_retention_settings`, `enterprise_role_catalog`) and the previously installed hardening triggers/eligibility RPC. Do not perform any remote DDL at this stage.
3. Candidate `BATCH_01`..`04` files contain missing table definitions and source constraints, with RLS enabled and no newly granted client access. They are NOT finished runtime migrations. Resolve dependencies, manage referenced roles/auth/storage, add necessary missing columns, reconcile source-only functions and explicit policies with staging protections. Design extra Enterprise-only tables where required, documented with acceptance linkage.
4. Build four versioned, idempotence-aware, transactional forward migrations and validate on disposable staging reconstruction in dependency order. No arbitrary `DROP`, grants to PUBLIC, service-role assumptions, ownership escalation, permissive RLS policies or direct payment operations. Provide recovery scripts/plans, not destructive rollback of populated tables.
5. Test every SQL function's identity arguments, return types, search_path, SECURITY DEFINER, role EXECUTE, RLS USING/WITH CHECK and tenant context. Review function body changes and helper dependency graph. Include synthetic-user negative and positive role JWT tests for Director/Caregiver/Medical/Therapy/Patient, revoked assignment, inactive license, cross-organization access, payment approval, legal holds, APR, notifications and message attachments.
6. Run build/typecheck/lint and full applicable unit/integration/E2E tests. Verify billing webhooks only with permitted test credentials; do not claim provider success without provider-boundary tests.
7. Supply migration file paths+SHAs, exact baseline/after schema inventory, all test commands/results, expected/actual behavior per issue, and known blockers. Do not mark 92/60/25 complete without corresponding evidence.
8. Preserve existing source/other dirty files. For any GitHub remote push or hosted staging DDL, STOP and request explicit owner permission; only local commits or reviewed code artifacts are authorized by this directive. No merge to main, no hosted production deployment.

## Batches
1. Application identity, evidence, verification, correction, Platform Owner decision and Director provisioning.
2. Quotes, agreements, billing ledger, confirmed payment gates, license issuance, per-office seats, amendments.
3. Patient representative authorization, legal holds, retention/deletion/closure protections.
4. All office communications, attachments, notifications, delivery and clinical provenance.

## Acceptance
Independent Codex GO with zero unresolved P0/P1 or cross-tenant defects; all replay tests passing; explicit owner approval before staging promotion. An absent SQL object is not an automatic authorization to copy legacy residential semantics.
