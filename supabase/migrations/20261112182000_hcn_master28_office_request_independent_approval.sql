-- HCN-MASTER-28: independent Owner approval for Director office requests.
-- A decision record is NOT a role grant. Multi-office access requires a
-- separately reviewed authorization engine; never alter the unique
-- organization_memberships(organization_id,user_id) invariant implicitly.
CREATE TABLE IF NOT EXISTS public.hcn_director_office_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  capability text NOT NULL CHECK (capability IN ('caregiver','medical_professional','therapist','billing_admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  request_reason text NOT NULL CHECK (char_length(btrim(request_reason)) BETWEEN 10 AND 2000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text,
  CHECK ((status='pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR status='cancelled'
    OR (status IN ('approved','rejected') AND decided_at IS NOT NULL AND decided_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_director_office_request
  ON public.hcn_director_office_requests(organization_id,requester_id,capability)
  WHERE status='pending';
ALTER TABLE public.hcn_director_office_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_director_office_requests FROM PUBLIC,anon;
GRANT SELECT ON public.hcn_director_office_requests TO authenticated;
CREATE POLICY "Requester and organization owner can see office requests"
  ON public.hcn_director_office_requests FOR SELECT TO authenticated
  USING (requester_id=(SELECT auth.uid()) OR public.is_organization_owner(organization_id));

CREATE OR REPLACE FUNCTION public.hcn_request_director_office(p_org uuid,p_capability text,p_reason text)
RETURNS public.hcn_director_office_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_request public.hcn_director_office_requests;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_org_director(p_org) THEN
    RAISE EXCEPTION 'Only an active Director may request another office';
  END IF;
  IF p_capability NOT IN ('caregiver','medical_professional','therapist','billing_admin') THEN
    RAISE EXCEPTION 'Unsupported office capability';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Provide a request reason of 10 to 2000 characters';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses WHERE organization_id=p_org AND status='active') THEN
    RAISE EXCEPTION 'Organization license is inactive';
  END IF;
  INSERT INTO public.hcn_director_office_requests(organization_id,requester_id,capability,request_reason)
  VALUES(p_org,auth.uid(),p_capability,btrim(p_reason))
  ON CONFLICT(organization_id,requester_id,capability) WHERE status='pending'
  DO UPDATE SET request_reason=public.hcn_director_office_requests.request_reason
  RETURNING * INTO v_request;
  RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.hcn_request_director_office(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_request_director_office(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_decide_director_office_request(p_request_id uuid,p_approve boolean,p_note text)
RETURNS public.hcn_director_office_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_request public.hcn_director_office_requests; v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO v_request FROM public.hcn_director_office_requests WHERE id=p_request_id FOR UPDATE;
  IF v_request.id IS NULL OR v_request.status<>'pending' THEN RAISE EXCEPTION 'No pending office request'; END IF;
  SELECT owner_user_id INTO v_owner FROM public.organizations WHERE id=v_request.organization_id;
  IF v_owner IS NULL OR v_owner<>auth.uid() OR v_request.requester_id=auth.uid() THEN
    RAISE EXCEPTION 'An independent organization Owner must approve or reject this request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses
     WHERE organization_id=v_request.organization_id AND status='active') THEN
    RAISE EXCEPTION 'Organization license is inactive';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_memberships
    WHERE organization_id=v_request.organization_id AND user_id=v_request.requester_id
      AND org_role IN ('director','co_director') AND status='active') THEN
    RAISE EXCEPTION 'Requesting Director is no longer active';
  END IF;
  IF char_length(btrim(coalesce(p_note,'')))<10 THEN
    RAISE EXCEPTION 'Review decision requires a justification of at least 10 characters';
  END IF;
  UPDATE public.hcn_director_office_requests
  SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_by=auth.uid(),decided_at=now(),decision_note=btrim(p_note)
  WHERE id=p_request_id RETURNING * INTO v_request;
  INSERT INTO public.account_management_audit(
    target_user_id,organization_id,action_type,actor_user_id,new_value,reason
  ) VALUES(v_request.requester_id,v_request.organization_id,
    'hcn_director_office_request_review',auth.uid(),
    jsonb_build_object('request_id',v_request.id,'capability',v_request.capability,'decision',v_request.status),
    btrim(p_note));
  -- Intentionally NO insert into organization_memberships or capability grants.
  RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.hcn_decide_director_office_request(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_decide_director_office_request(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_cancel_director_office_request(p_request_id uuid)
RETURNS public.hcn_director_office_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_request public.hcn_director_office_requests;
BEGIN
  UPDATE public.hcn_director_office_requests SET status='cancelled'
  WHERE id=p_request_id AND requester_id=auth.uid() AND status='pending'
  RETURNING * INTO v_request;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Only the requester may cancel an active request'; END IF;
  RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.hcn_cancel_director_office_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_cancel_director_office_request(uuid) TO authenticated;

-- Close the pre-existing instant-grant bypass when a dual-role Owner
-- is presently operating as an active Director. Owner-only self-assignment
-- remains subject to existing legacy rules and licensing checks.
CREATE OR REPLACE FUNCTION public.org_owner_self_assign_capability(p_org_id uuid,p_capability text)
RETURNS public.organization_owner_capability_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_row public.organization_owner_capability_grants;
BEGIN
  IF p_capability NOT IN ('caregiver','therapist','medical_professional','billing_admin') THEN
    RAISE EXCEPTION 'Invalid capability: %',p_capability;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org_id AND owner_user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Only this organization''s Owner may self-assign capability';
  END IF;
  IF public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'An active Director may not self-assign additional offices; independent Owner approval is required';
  END IF;
  INSERT INTO public.organization_owner_capability_grants(
    organization_id,user_id,capability,status,granted_by
  ) VALUES(p_org_id,auth.uid(),p_capability,'active',auth.uid())
  ON CONFLICT(organization_id,user_id,capability) DO UPDATE
    SET status='active',granted_by=auth.uid(),revoked_by=NULL,revoked_at=NULL
  RETURNING * INTO v_row;
  INSERT INTO public.account_management_audit(target_user_id,organization_id,action_type,actor_user_id,new_value,reason)
  VALUES(auth.uid(),p_org_id,'organization_owner_self_assign_capability',auth.uid(),
    jsonb_build_object('capability',p_capability),'Organization Owner self-assignment');
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.org_owner_self_assign_capability(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_owner_self_assign_capability(uuid,text) TO authenticated;
