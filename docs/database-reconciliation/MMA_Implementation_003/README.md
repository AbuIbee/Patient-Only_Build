# My Memoria Professional — Database Implementation 003

**Engineering delivery status: SQL authored and static-tested; NOT locally executed against PostgreSQL, NOT installed in GitHub, NOT deployed.**

The 4 schema files contain authentic reference SQL for the 21 tables absent from Professional staging, relevant source primary/unique/check/FK constraints and indexes where present, and deny-by-default RLS enabling. They are candidate schema implementation pieces, not fully functional migrations. In particular, source-only functions/policies are in separate REVIEW files and are **not safe to bulk apply**: they depend on missing functions/roles, privilege and business logic decisions. The commercial, APR, notification and patient/deletion workflows require additional Enterprise-specific design and integration.

## Priority batches
1. Professional applications, evidence and owner capability grants.
2. Quotes, billing, contracts, licenses and amendments.
3. APR/legal holds, deletion and audit trails.
4. Cross-office notification/clinical attachment structures.

## Integration procedure (do not touch existing migrations)
- Work on `remediation/mymemoria-functional-001` and first review `git status`.
- Keep these candidates in `docs/database-reconciliation/` until the disposable staging clone is recreated and fully verified. **Do not place the candidate `.sql` files in `supabase/migrations/` yet**, since the CLI can replay them automatically.
- Run source SQL dependency lint and actual `psql -X -v ON_ERROR_STOP=1 --single-transaction` against clone in priority order. Record failures; never suppress.
- Review each function by exact identity args/return/search_path/SECURITY DEFINER and target definitions. Merge only approved functions and policies into final versioned migrations, ensuring grants are least privilege.
- Execute synthetic JWT cross-tenant access, role revocation, platform owner, patient privacy, billing approval, APR and legal hold positive/negative tests; test repeat execution and recovery.
- Codex independent audit before request for owner approval of remote staging application.

## Intentional limitation
The chat environment has no access to your Windows Docker or live test identities. The SQL has not been applied or functionally tested. A successful local replay of the previous 159 source migrations **does not** prove this staging-delta package passes. GitHub was read, but not modified: previous owner rules require approval for remote-visible pushes.
