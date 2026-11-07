-- HCN-CARE-MASTER-001: primary + standby healthcare proxies and Director-only
-- decision queue. Existing active proxy permissions stay unchanged: standby is
-- verified but INACTIVE and cannot use the Patient portal.
ALTER TABLE public.patient_representatives
  ADD COLUMN IF NOT EXISTS designation text NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS authorization_expires_at timestamptz;
ALTER TABLE public.patient_representatives
  DROP CONSTRAINT IF EXISTS patient_representatives_status_check;
ALTER TABLE public.patient_representatives
  ADD CONSTRAINT patient_representatives_status_check
  CHECK (status IN ('pending_verification','standby','active','revoked','replaced'));
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patient_representatives'::regclass
    AND conname='hcn_representative_designation_check') THEN
    ALTER TABLE public.patient_representatives
      ADD CONSTRAINT hcn_representative_designation_check
      CHECK (designation IN ('primary','secondary'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS hcn_one_standby_proxy_per_patient
  ON public.patient_representatives(patient_id)
  WHERE (designation='secondary' AND status='standby');

CREATE TABLE IF NOT EXISTS public.hcn_representative_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  target_representative_id uuid NOT NULL REFERENCES public.patient_representatives(id),
  action text NOT NULL CHECK (action IN ('appoint_secondary','activate_secondary','revoke_primary')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hcn_proxy_requests_org_pending_idx
  ON public.hcn_representative_change_requests(organization_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hcn_proxy_one_pending_action
  ON public.hcn_representative_change_requests(patient_id,target_representative_id,action)
  WHERE status='pending';
ALTER TABLE public.hcn_representative_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_representative_change_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_representative_change_requests TO authenticated;
GRANT ALL ON public.hcn_representative_change_requests TO service_role;

DROP POLICY IF EXISTS "HCN proxy requests authorized read" ON public.hcn_representative_change_requests;
CREATE POLICY "HCN proxy requests authorized read"
ON public.hcn_representative_change_requests FOR SELECT TO authenticated
USING (
  EXISTS(SELECT 1 FROM public.covered_patient_memberships c
    JOIN public.organization_licenses l ON l.organization_id=c.organization_id AND l.status='active'
    WHERE c.organization_id=organization_id AND c.patient_id=patient_id AND c.status='active')
  AND (
    patient_id=(SELECT auth.uid())
    OR public.is_active_org_director(organization_id)
    OR EXISTS(SELECT 1 FROM public.staff_patient_assignments a
      JOIN public.organization_memberships m ON m.organization_id=a.organization_id
        AND m.user_id=a.user_id AND m.status='active' AND m.org_role='caregiver'
      WHERE a.organization_id=organization_id AND a.patient_id=patient_id
        AND a.user_id=(SELECT auth.uid()) AND a.is_active)
  )
);

CREATE OR REPLACE FUNCTION public.hcn_request_proxy_change(
  p_org_id uuid, p_patient_id uuid, p_target_representative_id uuid,
  p_action text, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid:=auth.uid();
  v_rep public.patient_representatives;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('appoint_secondary','activate_secondary','revoke_primary')
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'A valid action and explanation are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.covered_patient_memberships c
    JOIN public.organization_licenses l ON l.organization_id=c.organization_id AND l.status='active'
    WHERE c.organization_id=p_org_id AND c.patient_id=p_patient_id AND c.status='active')
  THEN RAISE EXCEPTION 'Active licensed coverage is required' USING ERRCODE='42501'; END IF;
  IF NOT (
    v_actor=p_patient_id OR public.is_active_org_director(p_org_id)
    OR EXISTS(SELECT 1 FROM public.staff_patient_assignments a
      JOIN public.organization_memberships m ON m.organization_id=a.organization_id
        AND m.user_id=a.user_id AND m.status='active' AND m.org_role='caregiver'
      WHERE a.organization_id=p_org_id AND a.patient_id=p_patient_id
        AND a.user_id=v_actor AND a.is_active)
  ) THEN
    RAISE EXCEPTION 'Only this patient, their assigned caregiver or Director may request a change'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_rep FROM public.patient_representatives
    WHERE id=p_target_representative_id AND patient_id=p_patient_id AND organization_id=p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proxy does not belong to this patient and organization' USING ERRCODE='42501'; END IF;
  IF (p_action='appoint_secondary' AND v_rep.status<>'pending_verification')
    OR (p_action='activate_secondary' AND
        (v_rep.status<>'standby' OR v_rep.designation<>'secondary'))
    OR (p_action='revoke_primary' AND
        (v_rep.status<>'active' OR v_rep.designation<>'primary'))
  THEN RAISE EXCEPTION 'Proxy is not eligible for the requested change' USING ERRCODE='22023'; END IF;
  INSERT INTO public.hcn_representative_change_requests
    (organization_id,patient_id,target_representative_id,action,reason,requested_by)
    VALUES(p_org_id,p_patient_id,p_target_representative_id,p_action,btrim(p_reason),v_actor)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_request_proxy_change(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_request_proxy_change(uuid,uuid,uuid,text,text)
 TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_decide_proxy_change(
  p_request_id uuid, p_approve boolean, p_review_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid:=auth.uid();
  v_req public.hcn_representative_change_requests;
  v_rep public.patient_representatives;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_req FROM public.hcn_representative_change_requests
    WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status<>'pending' THEN
    RAISE EXCEPTION 'Pending proxy request not found' USING ERRCODE='22023';
  END IF;
  IF NOT public.is_active_org_director(v_req.organization_id) THEN
    RAISE EXCEPTION 'Only this organization Director may decide proxy requests'
      USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.covered_patient_memberships c
    JOIN public.organization_licenses l ON l.organization_id=c.organization_id AND l.status='active'
    WHERE c.organization_id=v_req.organization_id AND c.patient_id=v_req.patient_id AND c.status='active')
  THEN RAISE EXCEPTION 'Active licensed coverage is required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_review_reason,'')))<5 THEN
    RAISE EXCEPTION 'Director decision requires a reason' USING ERRCODE='22023';
  END IF;
  -- Serialize all proxy mutations for one patient, including concurrent decisions.
  PERFORM 1 FROM public.patients WHERE id=v_req.patient_id FOR UPDATE;
  SELECT * INTO v_rep FROM public.patient_representatives
    WHERE id=v_req.target_representative_id
      AND patient_id=v_req.patient_id AND organization_id=v_req.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proxy record no longer matches patient' USING ERRCODE='22023'; END IF;

  IF p_approve THEN
    IF v_req.action='appoint_secondary' THEN
      IF v_rep.status<>'pending_verification' OR NOT v_rep.consent_acknowledged
        OR nullif(btrim(coalesce(v_rep.authorization_evidence_reference,'')),'') IS NULL
        OR (v_rep.authorization_expires_at IS NOT NULL AND v_rep.authorization_expires_at<=now()) THEN
        RAISE EXCEPTION 'Verified proxy authorization evidence is required' USING ERRCODE='22023';
      END IF;
      UPDATE public.patient_representatives
        SET designation='secondary',status='standby',verification_status='verified',
          verified_by=v_actor,verified_at=now(),updated_at=now()
        WHERE id=v_rep.id;
    ELSIF v_req.action='activate_secondary' THEN
      IF v_rep.status<>'standby' OR v_rep.designation<>'secondary'
        OR v_rep.verification_status<>'verified'
        OR (v_rep.authorization_expires_at IS NOT NULL AND v_rep.authorization_expires_at<=now()) THEN
        RAISE EXCEPTION 'Standby authorization is no longer valid' USING ERRCODE='22023';
      END IF;
      UPDATE public.patient_representatives SET
        status='replaced',revoked_by=v_actor,revoked_at=now(),
        revocation_reason=v_req.reason,
        replaced_by_representative_id=v_rep.id,updated_at=now()
        WHERE patient_id=v_req.patient_id AND status='active' AND id<>v_rep.id;
      UPDATE public.patient_representatives SET
        designation='primary',status='active',updated_at=now()
        WHERE id=v_rep.id;
    ELSIF v_req.action='revoke_primary' THEN
      IF v_rep.status<>'active' OR v_rep.designation<>'primary' THEN
        RAISE EXCEPTION 'Primary proxy is no longer active' USING ERRCODE='22023';
      END IF;
      UPDATE public.patient_representatives SET status='revoked',
        revoked_by=v_actor,revoked_at=now(),revocation_reason=v_req.reason,updated_at=now()
        WHERE id=v_rep.id;
    END IF;
  END IF;

  UPDATE public.hcn_representative_change_requests
    SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by=v_actor,reviewed_at=now(),review_reason=btrim(p_review_reason)
    WHERE id=v_req.id;
  INSERT INTO public.account_management_audit
    (target_user_id,organization_id,actor_user_id,action_type,new_value,reason)
    VALUES(v_req.patient_id,v_req.organization_id,v_actor,'hcn_proxy_director_decision',
      jsonb_build_object('request_id',v_req.id,'action',v_req.action,
        'approved',p_approve,'representative_id',v_rep.id),
      btrim(p_review_reason));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_decide_proxy_change(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_decide_proxy_change(uuid,boolean,text)
 TO authenticated,service_role;
