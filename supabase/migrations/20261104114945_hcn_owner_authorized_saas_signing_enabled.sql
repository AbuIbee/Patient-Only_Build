-- 2026-11-04 owner authorization: keep SaaS agreement signing enabled.
-- This legacy function was originally a rollout kill-switch despite its
-- misleading name. Its boolean now represents the owner's explicit signing
-- enablement; it is NOT a legal-entity verification or legal opinion.
-- Do not modify the approved HCN-SAAS-1.0 agreement or signing evidence.
CREATE OR REPLACE FUNCTION public.hcn_saas_contracting_entity_confirmed()
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT true; $$;
COMMENT ON FUNCTION public.hcn_saas_contracting_entity_confirmed() IS
'Legacy compatibility signing gate. True means Haneen owner expressly authorized first-party SaaS electronic signing on 2026-11-04. This does not certify any legal-entity status. Never disable signing without express owner authorization.';
REVOKE ALL ON FUNCTION public.hcn_saas_contracting_entity_confirmed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_saas_contracting_entity_confirmed() TO authenticated, service_role;