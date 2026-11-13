-- HCN Master #28 — independent Organization Owner review entry point.
-- No implicit Director membership is created for the Owner.
CREATE OR REPLACE FUNCTION public.hcn_list_my_owned_organizations()
RETURNS TABLE(organization_id uuid, organization_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT o.id,o.name
  FROM public.organizations o
  WHERE o.owner_user_id=(SELECT auth.uid())
  ORDER BY o.name;
$$;
REVOKE ALL ON FUNCTION public.hcn_list_my_owned_organizations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_my_owned_organizations() TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_owner_list_office_requests(p_org uuid)
RETURNS TABLE(
 request_id uuid,requester_id uuid,requester_name text,capability text,status text,
 request_reason text,requested_at timestamptz,decided_at timestamptz,decision_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NOT public.is_organization_owner(p_org) THEN
    RAISE EXCEPTION 'Only the independent Organization Owner may see office approval requests';
  END IF;
  RETURN QUERY
    SELECT r.id,r.requester_id,
      concat_ws(' ',p.first_name,p.last_name)::text,
      r.capability,r.status,r.request_reason,r.requested_at,r.decided_at,r.decision_note
    FROM public.hcn_director_office_requests r
    LEFT JOIN public.profiles p ON p.id=r.requester_id
    WHERE r.organization_id=p_org ORDER BY r.requested_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.hcn_owner_list_office_requests(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_owner_list_office_requests(uuid) TO authenticated;
