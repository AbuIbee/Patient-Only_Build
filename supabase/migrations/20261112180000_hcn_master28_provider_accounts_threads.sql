-- HCN-MASTER-28 Phase 1: permanent verified provider identity + patient-scoped messages.
-- No existing legacy link is upgraded to a provider account. Never send PHI through email.
CREATE TABLE IF NOT EXISTS public.hcn_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL UNIQUE REFERENCES public.hcn_healthcare_providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','revoked','rejected')),
  approved_by uuid REFERENCES auth.users(id),
  approval_note text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,user_id),
  CHECK ((status <> 'active') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_hcn_provider_accounts_user ON public.hcn_provider_accounts(user_id, status);
ALTER TABLE public.hcn_provider_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_provider_accounts FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_provider_accounts TO authenticated;
CREATE POLICY "Provider account visible to holder and org managers"
  ON public.hcn_provider_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));

-- Provider claims their own verified email identity; no role/clinical access until manager approval.
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
  ON CONFLICT (provider_id) DO NOTHING;
  SELECT * INTO v_account FROM public.hcn_provider_accounts WHERE provider_id=v_provider.id;
  IF v_account.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Provider already belongs to a different authenticated identity'; END IF;
  IF v_account.status IN ('revoked','rejected','suspended') THEN RAISE EXCEPTION 'Provider access is disabled; contact your organization'; END IF;
  RETURN v_account;
END $$;
REVOKE ALL ON FUNCTION public.hcn_claim_provider_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_claim_provider_account(uuid) TO authenticated;

-- Approval is separate from email verification and requires a DIFFERENT manager identity.
CREATE OR REPLACE FUNCTION public.hcn_decide_provider_account(p_provider_id uuid, p_approve boolean, p_evidence_note text)
RETURNS public.hcn_provider_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_provider public.hcn_healthcare_providers; v_account public.hcn_provider_accounts; v_email text; v_confirmed timestamptz;
BEGIN
  SELECT * INTO v_provider FROM public.hcn_healthcare_providers WHERE id=p_provider_id FOR UPDATE;
  IF v_provider.id IS NULL OR NOT (public.is_active_org_director(v_provider.organization_id) OR public.is_organization_owner(v_provider.organization_id)) THEN
    RAISE EXCEPTION 'Only an authorized organization manager may decide this provider account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses WHERE organization_id=v_provider.organization_id AND status='active') THEN
    RAISE EXCEPTION 'Inactive organization license';
  END IF;
  SELECT * INTO v_account FROM public.hcn_provider_accounts WHERE provider_id=p_provider_id FOR UPDATE;
  IF v_account.id IS NULL OR v_account.status NOT IN ('pending','active') THEN RAISE EXCEPTION 'Provider approval request is not pending'; END IF;
  IF v_account.user_id=auth.uid() THEN RAISE EXCEPTION 'Self-approval is prohibited'; END IF;
  IF nullif(btrim(coalesce(p_evidence_note,'')),'') IS NULL OR char_length(btrim(p_evidence_note)) < 12 THEN
    RAISE EXCEPTION 'Record verification evidence or rejection reason of at least 12 characters';
  END IF;
  SELECT lower(btrim(email)), email_confirmed_at INTO v_email,v_confirmed FROM auth.users WHERE id=v_account.user_id;
  IF v_confirmed IS NULL OR v_email IS DISTINCT FROM lower(btrim(v_provider.secure_contact_email)) THEN
    RAISE EXCEPTION 'Confirmed provider email no longer matches account';
  END IF;
  IF p_approve AND NOT v_provider.is_active THEN RAISE EXCEPTION 'Provider has been deactivated'; END IF;
  UPDATE public.hcn_provider_accounts SET
    status=CASE WHEN p_approve THEN 'active' ELSE 'rejected' END,
    approved_by=auth.uid(), approved_at=now(),
    approval_note=btrim(p_evidence_note), updated_at=now()
  WHERE id=v_account.id RETURNING * INTO v_account;
  IF p_approve THEN
    UPDATE public.hcn_healthcare_providers SET verification_status='verified',updated_at=now()
      WHERE id=p_provider_id;
  END IF;
  RETURN v_account;
END $$;
REVOKE ALL ON FUNCTION public.hcn_decide_provider_account(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_decide_provider_account(uuid,boolean,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.hcn_provider_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.hcn_healthcare_providers(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,patient_id,provider_id)
);
CREATE INDEX IF NOT EXISTS idx_hcn_provider_threads_provider ON public.hcn_provider_threads(provider_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hcn_provider_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.hcn_provider_threads(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id),
  message_text text NOT NULL CHECK (char_length(btrim(message_text)) BETWEEN 1 AND 10000),
  client_message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id,sender_user_id,client_message_id)
);
CREATE INDEX IF NOT EXISTS idx_hcn_provider_messages_thread ON public.hcn_provider_messages(thread_id,created_at);
ALTER TABLE public.hcn_provider_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcn_provider_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_provider_threads, public.hcn_provider_messages FROM PUBLIC,anon;
GRANT SELECT ON public.hcn_provider_threads, public.hcn_provider_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_can_access_provider_thread(p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM public.hcn_provider_threads t
      JOIN public.hcn_healthcare_providers p ON p.id=t.provider_id AND p.organization_id=t.organization_id
      JOIN public.organization_licenses l ON l.organization_id=t.organization_id AND l.status='active'
      JOIN public.covered_patient_memberships c ON c.organization_id=t.organization_id AND c.patient_id=t.patient_id AND c.status='active'
      WHERE t.id=p_thread_id
        AND (
          public.is_active_org_director(t.organization_id)
          OR EXISTS(
            SELECT 1 FROM public.hcn_provider_accounts a
            JOIN public.hcn_patient_provider_associations x ON x.organization_id=t.organization_id
              AND x.patient_id=t.patient_id AND x.provider_id=t.provider_id AND x.is_active=true
            WHERE a.organization_id=t.organization_id AND a.provider_id=t.provider_id
              AND a.user_id=(SELECT auth.uid()) AND a.status='active'
              AND p.is_active AND p.verification_status='verified'
          )
        )
    );
$$;
REVOKE ALL ON FUNCTION public.hcn_can_access_provider_thread(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_access_provider_thread(uuid) TO authenticated;

CREATE POLICY "Only active thread participants can read threads"
  ON public.hcn_provider_threads FOR SELECT TO authenticated
  USING (public.hcn_can_access_provider_thread(id));
CREATE POLICY "Only active thread participants can read messages"
  ON public.hcn_provider_messages FOR SELECT TO authenticated
  USING (public.hcn_can_access_provider_thread(thread_id));

CREATE OR REPLACE FUNCTION public.hcn_open_provider_thread(p_org uuid,p_patient uuid,p_provider uuid)
RETURNS public.hcn_provider_threads LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_thread public.hcn_provider_threads;
BEGIN
  IF NOT public.is_active_org_director(p_org) THEN RAISE EXCEPTION 'Only an active Director may open a clinical thread'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses WHERE organization_id=p_org AND status='active') THEN
    RAISE EXCEPTION 'Inactive license'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.covered_patient_memberships WHERE organization_id=p_org AND patient_id=p_patient AND status='active') THEN
    RAISE EXCEPTION 'Patient is not actively covered'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.hcn_healthcare_providers p
    JOIN public.hcn_patient_provider_associations x ON x.organization_id=p.organization_id
      AND x.provider_id=p.id AND x.patient_id=p_patient AND x.is_active
    JOIN public.hcn_provider_accounts a ON a.provider_id=p.id AND a.organization_id=p.organization_id
    WHERE p.id=p_provider AND p.organization_id=p_org AND p.is_active
      AND p.verification_status='verified' AND a.status='active'
  ) THEN RAISE EXCEPTION 'Provider must be approved and assigned to this patient'; END IF;
  INSERT INTO public.hcn_provider_threads (organization_id,patient_id,provider_id,created_by)
  VALUES(p_org,p_patient,p_provider,auth.uid())
  ON CONFLICT(organization_id,patient_id,provider_id)
  DO UPDATE SET updated_at=public.hcn_provider_threads.updated_at
  RETURNING * INTO v_thread;
  RETURN v_thread;
END $$;
REVOKE ALL ON FUNCTION public.hcn_open_provider_thread(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_open_provider_thread(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_post_provider_message(p_thread_id uuid,p_message text,p_client_message_id uuid)
RETURNS public.hcn_provider_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_result public.hcn_provider_messages;
BEGIN
  IF NOT public.hcn_can_access_provider_thread(p_thread_id) THEN RAISE EXCEPTION 'Not authorized for this clinical conversation'; END IF;
  IF p_client_message_id IS NULL OR nullif(btrim(coalesce(p_message,'')),'') IS NULL OR char_length(btrim(p_message)) > 10000 THEN
    RAISE EXCEPTION 'Invalid clinical message'; END IF;
  INSERT INTO public.hcn_provider_messages(thread_id,sender_user_id,message_text,client_message_id)
  VALUES(p_thread_id,auth.uid(),btrim(p_message),p_client_message_id)
  ON CONFLICT(thread_id,sender_user_id,client_message_id) DO NOTHING
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN
    SELECT * INTO v_result FROM public.hcn_provider_messages
    WHERE thread_id=p_thread_id AND sender_user_id=auth.uid() AND client_message_id=p_client_message_id;
  END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.hcn_post_provider_message(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_post_provider_message(uuid,text,uuid) TO authenticated;


-- Lookup provides only names for providers matching the signed-in user's
-- confirmed email; it never returns another provider's contact address.
CREATE OR REPLACE FUNCTION public.hcn_list_claimable_provider_accounts()
RETURNS TABLE(provider_id uuid,provider_name text,organization_name text,account_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT p.id, p.display_name, o.name,coalesce(a.status,'unclaimed')
  FROM public.hcn_healthcare_providers p
  JOIN public.organizations o ON o.id=p.organization_id
  JOIN auth.users u ON u.id=(SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL
    AND lower(btrim(u.email))=lower(btrim(p.secure_contact_email))
  LEFT JOIN public.hcn_provider_accounts a ON a.provider_id=p.id
  WHERE p.is_active AND (a.id IS NULL OR a.user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.hcn_list_claimable_provider_accounts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_claimable_provider_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_list_my_provider_threads()
RETURNS TABLE(thread_id uuid,organization_id uuid,provider_id uuid,patient_id uuid,patient_name text,provider_name text,last_activity timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT t.id,t.organization_id,t.provider_id,t.patient_id,
    coalesce(nullif(p.preferred_name,''), concat_ws(' ',p.first_name,p.last_name)),
    hp.display_name,t.updated_at
  FROM public.hcn_provider_threads t
  JOIN public.patients p ON p.id=t.patient_id
  JOIN public.hcn_healthcare_providers hp ON hp.id=t.provider_id
  WHERE public.hcn_can_access_provider_thread(t.id)
  ORDER BY t.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION public.hcn_list_my_provider_threads() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_my_provider_threads() TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_list_provider_messages(p_thread_id uuid)
RETURNS TABLE(message_id uuid,sender_user_id uuid,message_text text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NOT public.hcn_can_access_provider_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Not authorized for this clinical conversation';
  END IF;
  RETURN QUERY SELECT m.id,m.sender_user_id,m.message_text,m.created_at
  FROM public.hcn_provider_messages m WHERE m.thread_id=p_thread_id ORDER BY m.created_at,m.id;
END $$;
REVOKE ALL ON FUNCTION public.hcn_list_provider_messages(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_provider_messages(uuid) TO authenticated;
