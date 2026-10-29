-- HCN multi-tenant authority: organization ownership is a separate
-- customer business relationship, not a staff membership or platform role.
-- These four SELECT policies expose only the owner's own business metadata,
-- licensing, membership directory and organization-targeted applications.
-- No platform or patient clinical record access is conferred.
CREATE POLICY "HCN Owners can read their own organizations"
ON public.organizations FOR SELECT TO authenticated
USING (public.is_organization_owner(id));

CREATE POLICY "HCN Owners can read their own licenses"
ON public.organization_licenses FOR SELECT TO authenticated
USING (public.is_organization_owner(organization_id));

CREATE POLICY "HCN Owners can read their own staff memberships"
ON public.organization_memberships FOR SELECT TO authenticated
USING (public.is_organization_owner(organization_id));

CREATE POLICY "HCN Owners can read applications targeting their organizations"
ON public.professional_applications FOR SELECT TO authenticated
USING (target_organization_id IS NOT NULL AND public.is_organization_owner(target_organization_id));
