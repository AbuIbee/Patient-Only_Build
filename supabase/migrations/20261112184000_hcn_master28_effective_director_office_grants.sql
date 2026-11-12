-- HCN Master #28: effective secondary Director offices without modifying
-- the unique (organization_id,user_id) primary membership constraint.
-- Security: every grant is independently Owner-approved, scoped to org,
-- active license, active Director membership and an audited request.
CREATE TABLE public.hcn_director_office_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 capability text NOT NULL CHECK(capability IN ('caregiver','therapist','medical_professional','billing_admin')),
 source_request_id uuid NOT NULL UNIQUE REFERENCES public.hcn_director_office_requests(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 granted_by uuid NOT NULL REFERENCES auth.users(id),
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_by uuid REFERENCES auth.users(id),
 revoked_at timestamptz,
 UNIQUE(organization_id,user_id,capability),
 CHECK ((status='active' AND revoked_at IS NULL AND revoked_by IS NULL)
     OR (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
CREATE INDEX hcn_director_office_grants_actor_idx
 ON public.hcn_director_office_grants(user_id,organization_id,status);
ALTER TABLE public.hcn_director_office_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_director_office_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_director_office_grants TO authenticated;
CREATE POLICY "Director sees own secondary office grants; Owner oversees organization"
ON public.hcn_director_office_grants FOR SELECT TO authenticated
USING(user_id=(SELECT auth.uid())
  OR public.is_active_org_director(organization_id)
  OR public.is_organization_owner(organization_id));

CREATE OR REPLACE FUNCTION public.hcn_has_active_director_office(p_org uuid,p_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL
 AND p_capability IN ('caregiver','therapist','medical_professional','billing_admin')
 AND EXISTS(
  SELECT 1 FROM public.hcn_director_office_grants g
  JOIN public.hcn_director_office_requests r ON r.id=g.source_request_id
   AND r.organization_id=g.organization_id AND r.requester_id=g.user_id
   AND r.capability=g.capability AND r.status='approved'
   AND r.decided_by IS DISTINCT FROM r.requester_id
  JOIN public.organization_memberships m ON m.organization_id=g.organization_id
   AND m.user_id=g.user_id AND m.status='active' AND m.org_role IN ('director','co_director')
  JOIN public.organization_licenses l ON l.organization_id=g.organization_id AND l.status='active'
  WHERE g.organization_id=p_org AND g.user_id=(SELECT auth.uid())
   AND g.capability=p_capability AND g.status='active'
   -- A later license downgrade or credential revocation must cut off the
   -- secondary office immediately, not only prevent future grants.
   AND (
     g.capability NOT IN ('therapist','medical_professional')
     OR (
       EXISTS(SELECT 1 FROM public.professional_applications a
        WHERE a.target_organization_id=g.organization_id
          AND a.applicant_user_id=g.user_id
          AND a.requested_office=g.capability
          AND a.credential_verification_status='independently_verified'
          AND a.status IN ('approved','pending_review','resubmitted'))
       AND EXISTS(
         SELECT 1 FROM public.organization_licenses lic
         JOIN public.license_tier_catalog tier ON tier.tier_code=lic.license_tier_code
         WHERE lic.organization_id=g.organization_id AND lic.status='active'
           AND LEAST(lic.specialist_slot_count,tier.specialist_slot_count)>0
           AND (
             (SELECT count(*) FROM public.organization_memberships mm
              WHERE mm.organization_id=g.organization_id AND mm.status='active'
                AND mm.org_role IN ('medical_professional','therapist','other_specialist'))
             +(SELECT count(*) FROM public.hcn_director_office_grants gg
              WHERE gg.organization_id=g.organization_id AND gg.status='active'
                AND gg.capability IN ('medical_professional','therapist'))
           )<=LEAST(lic.specialist_slot_count,tier.specialist_slot_count)
       )
     )
   )
   AND (g.capability<>'caregiver' OR EXISTS(
     SELECT 1 FROM public.organization_licenses lic WHERE lic.organization_id=g.organization_id
       AND (lic.max_caregiver_seats IS NULL OR
         (SELECT count(*) FROM public.organization_memberships mm
          WHERE mm.organization_id=g.organization_id AND mm.org_role='caregiver' AND mm.status='active')
          +(SELECT count(*) FROM public.hcn_director_office_grants gg
            WHERE gg.organization_id=g.organization_id AND gg.capability='caregiver' AND gg.status='active')
          <=lic.max_caregiver_seats)
   ))
   AND (g.capability<>'billing_admin' OR EXISTS(
     SELECT 1 FROM public.organization_licenses lic WHERE lic.organization_id=g.organization_id
       AND (lic.max_billing_admin_seats IS NULL OR
         (SELECT count(*) FROM public.organization_memberships mm
          WHERE mm.organization_id=g.organization_id AND mm.org_role='billing_admin' AND mm.status='active')
          +(SELECT count(*) FROM public.hcn_director_office_grants gg
            WHERE gg.organization_id=g.organization_id AND gg.capability='billing_admin' AND gg.status='active')
          <=lic.max_billing_admin_seats)
   ))
 );
$$;
REVOKE ALL ON FUNCTION public.hcn_has_active_director_office(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_has_active_director_office(uuid,text) TO authenticated;

-- A secondary office is not blanket patient access. Even a verified clinician
-- must be explicitly assigned to that covered patient in that office.
CREATE OR REPLACE FUNCTION public.hcn_has_director_office_patient_assignment(
 p_org uuid,p_patient uuid,p_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.hcn_has_active_director_office(p_org,p_capability)
 AND EXISTS(
   SELECT 1 FROM public.staff_patient_assignments a
   JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id
     AND c.patient_id=a.patient_id AND c.status='active'
   WHERE a.organization_id=p_org AND a.patient_id=p_patient
    AND a.user_id=(SELECT auth.uid()) AND a.org_role=p_capability AND a.is_active
 );
$$;
REVOKE ALL ON FUNCTION public.hcn_has_director_office_patient_assignment(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_has_director_office_patient_assignment(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_decide_director_office_request(
 p_request_id uuid,p_approve boolean,p_note text)
RETURNS public.hcn_director_office_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_request public.hcn_director_office_requests;
 v_owner uuid; v_license public.organization_licenses; v_limit int; v_used bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO v_request FROM public.hcn_director_office_requests
 WHERE id=p_request_id FOR UPDATE;
 IF v_request.id IS NULL OR v_request.status<>'pending'
 THEN RAISE EXCEPTION 'No pending office request'; END IF;
 SELECT owner_user_id INTO v_owner FROM public.organizations WHERE id=v_request.organization_id;
 IF v_owner IS NULL OR v_owner<>auth.uid() OR v_request.requester_id=auth.uid()
 THEN RAISE EXCEPTION 'Only a different, independently authenticated organization Owner may approve'; END IF;
 SELECT * INTO v_license FROM public.organization_licenses
 WHERE organization_id=v_request.organization_id FOR UPDATE;
 IF v_license.id IS NULL OR v_license.status<>'active'
 THEN RAISE EXCEPTION 'Organization license must be active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships
  WHERE organization_id=v_request.organization_id AND user_id=v_request.requester_id
   AND org_role IN ('director','co_director') AND status='active')
 THEN RAISE EXCEPTION 'Requesting Director is not active'; END IF;
 IF char_length(btrim(coalesce(p_note,'')))<10
 THEN RAISE EXCEPTION 'Review decision requires at least 10 characters'; END IF;
 IF p_approve THEN
  IF v_request.capability IN ('therapist','medical_professional') THEN
   -- Credential and slot restrictions are rechecked at decision time.
   IF NOT EXISTS (
    SELECT 1 FROM public.professional_applications a
    WHERE a.target_organization_id=v_request.organization_id
      AND a.applicant_user_id=v_request.requester_id
      AND a.requested_office=v_request.capability
      AND a.credential_verification_status='independently_verified'
      AND a.status IN ('approved','pending_review','resubmitted')
   ) THEN RAISE EXCEPTION 'Independent professional credential verification is required'; END IF;
   SELECT LEAST(v_license.specialist_slot_count,t.specialist_slot_count)
     INTO v_limit FROM public.license_tier_catalog t
     WHERE t.tier_code=v_license.license_tier_code;
   IF v_limit IS NULL OR v_limit<1 THEN
    RAISE EXCEPTION 'No valid licensed specialist slots remain'; END IF;
   SELECT (SELECT count(*) FROM public.organization_memberships m
     WHERE m.organization_id=v_request.organization_id AND m.status='active'
       AND m.org_role IN ('therapist','medical_professional','other_specialist'))
     +(SELECT count(*) FROM public.hcn_director_office_grants g
     WHERE g.organization_id=v_request.organization_id AND g.status='active'
       AND g.capability IN ('therapist','medical_professional'))
     INTO v_used;
   IF v_used>=v_limit THEN RAISE EXCEPTION 'Specialist license capacity reached'; END IF;
  ELSIF v_request.capability='caregiver' THEN
   v_limit:=v_license.max_caregiver_seats;
   IF v_limit IS NOT NULL THEN
    SELECT (SELECT count(*) FROM public.organization_memberships m
      WHERE m.organization_id=v_request.organization_id AND m.status='active'
       AND m.org_role='caregiver')
     +(SELECT count(*) FROM public.hcn_director_office_grants g
      WHERE g.organization_id=v_request.organization_id AND g.status='active'
       AND g.capability='caregiver')
     INTO v_used;
    IF v_used>=v_limit THEN RAISE EXCEPTION 'Caregiver capacity reached'; END IF;
   END IF;
  ELSIF v_request.capability='billing_admin' THEN
   v_limit:=v_license.max_billing_admin_seats;
   IF v_limit IS NOT NULL THEN
    SELECT (SELECT count(*) FROM public.organization_memberships m
     WHERE m.organization_id=v_request.organization_id AND m.status='active'
      AND m.org_role='billing_admin')
     +(SELECT count(*) FROM public.hcn_director_office_grants g
      WHERE g.organization_id=v_request.organization_id AND g.status='active'
       AND g.capability='billing_admin')
     INTO v_used;
    IF v_used>=v_limit THEN RAISE EXCEPTION 'Billing administrator capacity reached'; END IF;
   END IF;
  END IF;
 END IF;
 UPDATE public.hcn_director_office_requests
  SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_by=auth.uid(),decided_at=now(),decision_note=btrim(p_note)
  WHERE id=v_request.id RETURNING * INTO v_request;
 IF p_approve THEN
  INSERT INTO public.hcn_director_office_grants(
    organization_id,user_id,capability,source_request_id,granted_by)
  VALUES(v_request.organization_id,v_request.requester_id,
     v_request.capability,v_request.id,auth.uid())
  ON CONFLICT(organization_id,user_id,capability) DO UPDATE
  SET source_request_id=excluded.source_request_id,status='active',
      granted_by=excluded.granted_by,granted_at=now(),revoked_by=NULL,revoked_at=NULL;
 END IF;
 INSERT INTO public.account_management_audit(
  target_user_id,organization_id,action_type,actor_user_id,new_value,reason)
 VALUES(v_request.requester_id,v_request.organization_id,'hcn_director_office_request_review',
   auth.uid(),jsonb_build_object('request_id',v_request.id,
   'capability',v_request.capability,'decision',v_request.status,
   'effective_grant',p_approve),btrim(p_note));
 RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.hcn_decide_director_office_request(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_decide_director_office_request(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_revoke_director_office_grant(p_org uuid,p_user uuid,p_capability text,p_reason text)
RETURNS public.hcn_director_office_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_grant public.hcn_director_office_grants;
BEGIN
 IF auth.uid() IS NULL OR p_user=auth.uid() OR NOT EXISTS(
  SELECT 1 FROM public.organizations o
  WHERE o.id=p_org AND o.owner_user_id=auth.uid()
 ) THEN RAISE EXCEPTION 'An independent Owner must revoke this office'; END IF;
 IF char_length(btrim(coalesce(p_reason,'')))<10
 THEN RAISE EXCEPTION 'Revocation reason is required'; END IF;
 UPDATE public.hcn_director_office_grants
 SET status='revoked',revoked_by=auth.uid(),revoked_at=now()
 WHERE organization_id=p_org AND user_id=p_user AND capability=p_capability AND status='active'
 RETURNING * INTO v_grant;
 IF v_grant.id IS NULL THEN RAISE EXCEPTION 'No active office grant to revoke'; END IF;
 INSERT INTO public.account_management_audit(
   target_user_id,organization_id,action_type,actor_user_id,new_value,reason)
 VALUES(p_user,p_org,'hcn_director_office_access_revoked',auth.uid(),
   jsonb_build_object('capability',p_capability,'grant_id',v_grant.id),btrim(p_reason));
 RETURN v_grant;
END $$;
REVOKE ALL ON FUNCTION public.hcn_revoke_director_office_grant(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_revoke_director_office_grant(uuid,uuid,text,text) TO authenticated;

-- The Office resolver must see both the primary role and individually approved
-- secondary offices; the primary unique membership remains unchanged.
CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE(organization_id uuid, organization_name text, package_type text, org_role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
 SELECT o.id,o.name,o.package_type,m.org_role
 FROM public.organization_memberships m
 JOIN public.organizations o ON o.id=m.organization_id
 JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active'
 WHERE m.user_id=auth.uid() AND m.status='active'
 UNION
 SELECT o.id,o.name,o.package_type,g.capability
 FROM public.hcn_director_office_grants g
 JOIN public.organizations o ON o.id=g.organization_id
 WHERE g.user_id=auth.uid()
   AND public.hcn_has_active_director_office(g.organization_id,g.capability);
$$;
REVOKE ALL ON FUNCTION public.get_my_organizations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;

-- Authorize only explicitly assigned patients when a Director switches to
-- a secondary Caregiver/Medical/Therapy office. No org-wide grant.
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
RETURNS TABLE(organization_id uuid,organization_name text,patient_id uuid,
 first_name text,last_name text,preferred_name text,org_role text,address text,
 location text,assignment_id uuid,display_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
 SELECT a.organization_id,o.name,p.id,p.first_name,p.last_name,p.preferred_name,
   a.org_role,p.address,p.location,a.id,a.display_label
 FROM public.staff_patient_assignments a
 JOIN public.organizations o ON o.id=a.organization_id
 JOIN public.patients p ON p.id=a.patient_id
 JOIN public.organization_licenses l ON l.organization_id=a.organization_id
   AND l.status='active' AND l.license_number IS NOT NULL
 JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id
   AND c.patient_id=a.patient_id AND c.status='active'
 WHERE a.user_id=auth.uid() AND a.is_active
   AND (
     EXISTS(SELECT 1 FROM public.organization_memberships m
       WHERE m.organization_id=a.organization_id AND m.user_id=a.user_id
        AND m.org_role=a.org_role AND m.status='active')
     OR public.hcn_has_director_office_patient_assignment(a.organization_id,a.patient_id,a.org_role)
   )
 UNION
 SELECT NULL::uuid,'Direct Patient Connection',p.id,p.first_name,p.last_name,
 p.preferred_name,'therapist',p.address,p.location,NULL::uuid,NULL::text
 FROM public.therapist_relationships tr
 JOIN public.patients p ON p.id=tr.patient_id
 WHERE tr.therapist_id=auth.uid() AND tr.is_active=true;
$$;
REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_patients() TO authenticated;

-- Role-aware clinical review must be patient-scoped even for a Director's
-- approved specialist office.
CREATE OR REPLACE FUNCTION public.hcn_is_qualified_clinician_for_patient(
 p_organization_id uuid,p_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.organization_memberships m
   JOIN public.staff_patient_assignments a ON a.organization_id=m.organization_id
     AND a.user_id=m.user_id AND a.org_role=m.org_role
   WHERE m.organization_id=p_organization_id AND m.user_id=auth.uid()
    AND m.status='active' AND m.org_role IN ('medical_professional','therapist')
    AND a.patient_id=p_patient_id AND a.is_active
 ) OR EXISTS(
   SELECT 1 FROM public.organization_owner_capability_grants g
   WHERE g.organization_id=p_organization_id AND g.user_id=auth.uid()
     AND g.capability IN ('medical_professional','therapist') AND g.status='active'
 ) OR EXISTS(
   SELECT 1 FROM public.organization_memberships m
   WHERE m.organization_id=p_organization_id AND m.user_id=auth.uid()
    AND m.status='active' AND m.org_role='clinical_supervisor'
 ) OR public.hcn_has_director_office_patient_assignment(p_organization_id,p_patient_id,'medical_professional')
   OR public.hcn_has_director_office_patient_assignment(p_organization_id,p_patient_id,'therapist');
$$;
REVOKE ALL ON FUNCTION public.hcn_is_qualified_clinician_for_patient(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_is_qualified_clinician_for_patient(uuid,uuid) TO authenticated;
