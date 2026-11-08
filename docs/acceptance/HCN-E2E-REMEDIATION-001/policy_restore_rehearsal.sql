-- DISPOSABLE REVIEW ONLY. Intentionally restores no persistent state.
-- Previous predicates contain known security defects: NEVER promote this restore.
BEGIN;
DO $rehearsal$
DECLARE r record;
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Disposable postgres reviewer required'; END IF;
  FOR r IN SELECT * FROM hcn_private.function_before_clinical_v1 LOOP
    EXECUTE r.definition;
  END LOOP;
  FOR r IN SELECT * FROM hcn_private.policy_before_clinical_v1 LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s%s',r.policy_name,r.table_name,
      CASE WHEN r.original_roles IS NOT NULL THEN ' TO '||(SELECT string_agg(format('%I',x),',') FROM unnest(r.original_roles) x) ELSE '' END,
      CASE WHEN r.using_expression IS NOT NULL THEN format(' USING (%s)',r.using_expression) ELSE '' END,
      CASE WHEN r.check_expression IS NOT NULL THEN format(' WITH CHECK (%s)',r.check_expression) ELSE '' END);
  END LOOP;
END;
$rehearsal$;
SELECT count(*) AS restored_predicate_count
FROM pg_policies p JOIN hcn_private.policy_before_clinical_v1 b
  ON p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name
WHERE p.qual IS NOT DISTINCT FROM b.using_expression
  AND p.with_check IS NOT DISTINCT FROM b.check_expression
  AND (b.original_roles IS NULL OR p.roles=b.original_roles);
ROLLBACK;
