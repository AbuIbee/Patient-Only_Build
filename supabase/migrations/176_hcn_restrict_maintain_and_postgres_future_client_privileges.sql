-- HCN: close reintroduction of destructive client grants on new public
-- tables created by postgres, and remove MAINTAIN on all current
-- public tables. Tables already had TRUNCATE/TRIGGER/REFERENCES revoked
-- by migration 170. Regular SELECT/INSERT/UPDATE/DELETE remain subject
-- to per-table RLS and applicable narrower privileges.
-- Note: supabase_admin owns a DISTINCT default ACL; connected postgres
-- cannot modify it. That remains a separate operator authorization
-- blocker; never impersonate supabase_admin or misrepresent this as done.
DO $hcn$
DECLARE t record;
BEGIN
 FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('REVOKE MAINTAIN ON TABLE %I.%I FROM PUBLIC,anon,authenticated', t.schemaname,t.tablename);
 END LOOP;
END $hcn$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM anon,authenticated;
