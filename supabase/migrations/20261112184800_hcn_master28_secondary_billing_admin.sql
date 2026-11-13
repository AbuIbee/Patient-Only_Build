-- Billing Admin is a separately authorized, read-only organization office.
-- No clinical PHI or Stripe secrets are exposed through this RPC.
CREATE OR REPLACE FUNCTION public.hcn_get_my_secondary_billing_summary(p_org uuid)
RETURNS TABLE(organization_name text,license_tier text,license_status text,
 specialist_slots integer,licensed_seats integer,covered_patient_capacity integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT o.name,l.license_tier_code,l.status,l.specialist_slot_count,
   l.licensed_seats,l.covered_patient_capacity
 FROM public.organizations o
 JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active'
 WHERE o.id=p_org AND public.hcn_has_active_director_office(p_org,'billing_admin')
$$;
REVOKE ALL ON FUNCTION public.hcn_get_my_secondary_billing_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_my_secondary_billing_summary(uuid) TO authenticated;
