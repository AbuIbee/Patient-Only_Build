-- READ ONLY, run on disposable clone first. Explicit schema preflight, no DDL.
SELECT current_database() AS local_db_name, inet_server_addr() AS server_address, inet_server_port() AS server_port;
SELECT count(*) AS public_tables FROM pg_tables WHERE schemaname='public';
SELECT count(*) AS public_functions FROM pg_proc WHERE pronamespace='public'::regnamespace;
SELECT count(*) AS public_policies FROM pg_policies WHERE schemaname='public';
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('enterprise_demo_environments','enterprise_patient_deletion_requests','enterprise_retention_settings','enterprise_role_catalog') ORDER BY 1;
