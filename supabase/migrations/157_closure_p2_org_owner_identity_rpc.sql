-- MMA-P1-FINAL-CLOSURE Priority 2 — Organization Owner UI needs a
-- simple, authoritative way for the frontend to know "am I the Owner of
-- this organization" before rendering any self-assignment controls.
-- organizations.owner_user_id is not currently exposed through any
-- existing read path (MyOrganization/getMyOrganizations only ever
-- surfaces org_role from organization_memberships, a completely
-- separate concept from ownership).
CREATE OR REPLACE FUNCTION public.am_i_org_owner(p_org_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id AND owner_user_id = auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.am_i_org_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_org_owner(UUID) TO authenticated, service_role;
