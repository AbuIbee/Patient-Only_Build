-- Preserve one authenticated provider identity per organization. The
-- unique constraints own concurrency. A competing claim that inserts
-- nothing is resolved by reading the target provider's actual account.
CREATE OR REPLACE FUNCTION public.hcn_claim_provider_account(p_provider_id uuid)
RETURNS public.hcn_provider_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_provider public.hcn_healthcare_providers; v_email text; v_confirmed timestamptz; v_account public.hcn_provider_accounts;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before claiming a provider identity'; END IF;
  SELECT * INTO v_provider FROM public.hcn_healthcare_providers WHERE id=p_provider_id FOR UPDATE;
  IF v_provider.id IS NULL OR NOT v_provider.is_active OR nullif(btrim(v_provider.secure_contact_email),'') IS NULL THEN
    RAISE EXCEPTION 'Provider identity is not available for activation';
  END IF;
  SELECT lower(btrim(email)), email_confirmed_at INTO v_email,v_confirmed FROM auth.users WHERE id=auth.uid();
  IF v_confirmed IS NULL OR v_email IS DISTINCT FROM lower(btrim(v_provider.secure_contact_email)) THEN
    RAISE EXCEPTION 'Sign in using the confirmed email invited for this provider';
  END IF;
  INSERT INTO public.hcn_provider_accounts (organization_id,provider_id,user_id,status)
  VALUES (v_provider.organization_id,v_provider.id,auth.uid(),'pending')
  ON CONFLICT DO NOTHING;
  SELECT * INTO v_account FROM public.hcn_provider_accounts WHERE provider_id=v_provider.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This sign-in is already linked to another provider at this organization. Ask the organization to send an invitation to the other provider’s own email address.';
  END IF;
  IF v_account.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Provider already belongs to a different authenticated identity'; END IF;
  IF v_account.status IN ('revoked','rejected','suspended') THEN RAISE EXCEPTION 'Provider access is disabled; contact your organization'; END IF;
  RETURN v_account;
END $$;
REVOKE ALL ON FUNCTION public.hcn_claim_provider_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_claim_provider_account(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_list_claimable_provider_accounts()
RETURNS TABLE(provider_id uuid,provider_name text,organization_name text,account_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT p.id, p.display_name, o.name,CASE
    WHEN a.id IS NOT NULL THEN a.status
    WHEN EXISTS (
      SELECT 1 FROM public.hcn_provider_accounts existing
      WHERE existing.organization_id=p.organization_id AND existing.user_id=u.id
    ) THEN 'identity_already_linked'
    ELSE 'unclaimed'
  END
  FROM public.hcn_healthcare_providers p
  JOIN public.organizations o ON o.id=p.organization_id
  JOIN auth.users u ON u.id=(SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL
    AND lower(btrim(u.email))=lower(btrim(p.secure_contact_email))
  LEFT JOIN public.hcn_provider_accounts a ON a.provider_id=p.id
  WHERE p.is_active AND (a.id IS NULL OR a.user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.hcn_list_claimable_provider_accounts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_claimable_provider_accounts() TO authenticated;

