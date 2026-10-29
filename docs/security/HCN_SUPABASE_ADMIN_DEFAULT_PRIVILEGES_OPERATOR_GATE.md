# HCN release blocker: `supabase_admin` future-table default privileges

**Environment:** isolated HCN staging project `axurszlibxwwptkczztt`.  
**Status:** unresolved; do not apply this document directly to PatientOnly production.

## Verified finding

PostgreSQL default table ACLs for `supabase_admin` in schema `public`
still grant `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN`
to `anon` and `authenticated`. RLS does not authorize or constrain
these table-level operations. They may be reintroduced whenever
`supabase_admin` creates a new public table.

The existing 88 public tables were explicitly deprived of client
TRUNCATE/TRIGGER/REFERENCES privileges, and subsequent verification
found 0 remaining MAINTAIN grants to those two client roles.
The distinct `postgres` creator-role default grants were corrected
and verified in staging. The `supabase_admin` defaults were not.

The linked SQL session uses `current_user=postgres`, which is not
a member of `supabase_admin`. A transaction attempting to change
both owners' default privileges was rejected with
`permission denied to change default privileges`; it was rolled back.
No privilege escalation or role impersonation was attempted.

## Authorized operator-only repair

A database operator already authenticated as, or explicitly authorized
to manage the defaults of, `supabase_admin` may review and execute
the following *on HCN staging first*:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON TABLES FROM anon, authenticated;
```

This must **not** be executed using an unauthorized role or applied
directly to PatientOnly production. It does not create license
entitlements or alter clinical row access.

## Read-only verification

```sql
SELECT defaclrole::regrole AS owner_role, defaclacl::text AS acl
FROM pg_default_acl
WHERE defaclnamespace = 'public'::regnamespace
  AND defaclobjtype = 'r'
  AND defaclrole IN ('postgres'::regrole,'supabase_admin'::regrole);

SELECT
  count(*) FILTER (WHERE has_table_privilege('anon',format('%I.%I',schemaname,tablename),'MAINTAIN')) AS anon_maintain,
  count(*) FILTER (WHERE has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'MAINTAIN')) AS authenticated_maintain
FROM pg_tables WHERE schemaname='public';
```

Confirm that **both** default ACLs lack D/x/t/m permissions for
`anon` and `authenticated`, and that newly created tables do not
inherit these rights. Existing-table zero counts do not establish
that future-table defaults are safe.

**Production release disposition:** unresolved until authorized
operator evidence and independent security acceptance are attached.
