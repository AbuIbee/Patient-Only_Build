-- HCN-CARE-MASTER-001: Organization Owner may opt into an organization-scoped
-- Director office WITHOUT changing their ownership or becoming Platform Owner.
-- No broad RLS grants, no direct client INSERT privilege.
CREATE OR REPLACE FUNCTION public.hcn_my_owned_organizations()
RETURNS TABLE (
  organization_id uuid, organization_name text,
  license_active boolean, director_enabled boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT o.id, o.name,
    EXISTS(SELECT 1 FROM public.organization_licenses l
      WHERE l.organization_id=o.id AND l.status='active'),
    EXISTS(SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id=o.id AND m.user_id=(SELECT auth.uid())
        AND m.org_role='director' AND m.status='active')
  FROM public.organizations o
  WHERE o.owner_user_id=(SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.hcn_my_owned_organizations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_my_owned_organizations() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_owner_enable_director_office(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_membership public.organization_memberships;
  v_owner uuid;
BEGIN
  IF v_actor IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated organization owner is required' USING ERRCODE='42501';
  END IF;
  SELECT owner_user_id INTO v_owner FROM public.organizations
    WHERE id=p_org_id FOR UPDATE;
  IF v_owner IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Only this organization owner may enable Director office' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_licenses
    WHERE organization_id=p_org_id AND status='active') THEN
    RAISE EXCEPTION 'Active organization license is required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_membership FROM public.organization_memberships
    WHERE organization_id=p_org_id AND user_id=v_actor FOR UPDATE;
  IF FOUND THEN
    -- The membership schema supports exactly ONE org role per account.
    -- Never silently overwrite caregiver, clinician or any other staff role.
    IF v_membership.org_role <> 'director' THEN
      RAISE EXCEPTION 'Existing staff office role cannot be overwritten automatically; contact organization administration'
        USING ERRCODE='23514';
    END IF;
    IF v_membership.status='active' THEN RETURN true; END IF;
    UPDATE public.organization_memberships
      SET status='active', updated_at=now()
      WHERE id=v_membership.id;
  ELSE
    INSERT INTO public.organization_memberships
      (organization_id,user_id,org_role,status,invited_by)
      VALUES(p_org_id,v_actor,'director','active',v_actor);
  END IF;

  INSERT INTO public.account_management_audit
    (target_user_id,organization_id,action_type,actor_user_id,new_value,reason)
    VALUES(v_actor,p_org_id,'hcn_owner_enabled_director_office',v_actor,
      jsonb_build_object('role','director','retains_ownership',true),
      'Organization owner activated Director office');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_owner_enable_director_office(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_owner_enable_director_office(uuid)
  TO authenticated,service_role;
