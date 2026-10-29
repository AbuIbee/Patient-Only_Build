-- HCN P0: signed-in invitation acceptance must revalidate original inviter.
-- Prevent ON CONFLICT against an active member from replacing active role.
-- Declines remain possible after inviter revocation; acceptance is fail-closed.
CREATE OR REPLACE FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text)
 RETURNS organization_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_user_id UUID;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_row organization_memberships;
  v_is_director boolean;
  v_is_office_admin boolean;
  v_package TEXT;
  v_role_cap INTEGER;
  v_role_count INTEGER;
BEGIN
  v_is_director := public.is_active_org_director(p_org_id);
  v_is_office_admin := EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND org_role = 'office_administrator' AND status = 'active'
  );
  IF NOT v_is_director AND NOT v_is_office_admin THEN
    RAISE EXCEPTION 'Only an active director, co-director, or office administrator of this organization may invite staff';
  END IF;

  IF p_org_role IN ('therapist', 'medical_professional', 'other_specialist') THEN
    RAISE EXCEPTION 'A therapist or medical professional office requires independently verified credentials -- submit a professional application for this organization instead of a direct invite';
  END IF;

  SELECT package_type INTO v_package FROM organizations WHERE id = p_org_id;
  IF v_package = 'therapist' AND p_org_role = 'caregiver' THEN
    RAISE EXCEPTION 'This organization''s Therapist Enterprise package does not include the caregiver office';
  END IF;

  IF v_is_director THEN
    IF p_org_role NOT IN ('caregiver', 'billing_admin', 'co_director', 'office_administrator', 'clinical_supervisor', 'auditor') THEN
      RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
    END IF;
  ELSE
    IF p_org_role NOT IN ('caregiver', 'billing_admin') THEN
      RAISE EXCEPTION 'An office administrator may only invite caregiver or billing administrator roles';
    END IF;
  END IF;

  SELECT id INTO v_target_user_id FROM profiles WHERE lower(email) = lower(btrim(p_email));
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first, then invite them.', p_email;
  END IF;

  PERFORM licensed_seats FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;

  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
  END IF;

  v_role_cap := CASE p_org_role
    WHEN 'caregiver' THEN (SELECT max_caregiver_seats FROM organization_licenses WHERE organization_id = p_org_id)
    WHEN 'billing_admin' THEN (SELECT max_billing_admin_seats FROM organization_licenses WHERE organization_id = p_org_id)
    ELSE NULL
  END;
  IF v_role_cap IS NOT NULL THEN
    SELECT count(*) INTO v_role_count FROM organization_memberships
      WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role = p_org_role;
    IF v_role_count >= v_role_cap THEN
      RAISE EXCEPTION 'No licensed % seats are available for this organization (% of % used). Configure a higher per-role cap before inviting more.', p_org_role, v_role_count, v_role_cap;
    END IF;
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_org_id, v_target_user_id, p_org_role, 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = EXCLUDED.org_role,
    status = 'invited',
    invited_by = EXCLUDED.invited_by,
    updated_at = now()
  WHERE organization_memberships.status IN ('invited','declined','revoked')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This account is already an active organization member; use an authorized role-change workflow';
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean)
 RETURNS organization_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_row public.organization_memberships;
 v_inviter_role text;
 v_license_status text;
 v_seats integer;
 v_occupied integer;
 v_package text;
 v_authorized boolean;
BEGIN
 IF auth.uid() IS NULL OR p_accept IS NULL THEN
   RAISE EXCEPTION 'Authenticated invitation acceptance or rejection is required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM public.organization_memberships
 WHERE id=p_membership_id AND user_id=auth.uid() AND status='invited'
 FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'No pending invitation exists for this account' USING ERRCODE='42501';
 END IF;
 IF p_accept THEN
   -- Require the ORIGINAL inviter still to be authorized at acceptance time;
   -- row locks serialize with a concurrent member removal.
   SELECT org_role INTO v_inviter_role FROM public.organization_memberships
   WHERE organization_id=v_row.organization_id AND user_id=v_row.invited_by AND status='active'
   FOR SHARE;
   v_authorized :=
     (v_row.invited_by IS NOT NULL AND v_row.invited_by=public.get_organization_owner(v_row.organization_id))
     OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_row.invited_by AND p.role IN ('admin','superadmin'))
     OR (v_inviter_role IN ('director','co_director') AND v_row.org_role NOT IN ('director','medical_professional','therapist','other_specialist'))
     OR (v_inviter_role='office_administrator' AND v_row.org_role IN ('caregiver','billing_admin'));
   IF NOT COALESCE(v_authorized,false) THEN
     RAISE EXCEPTION 'Invitation issuer no longer has authority to grant this role' USING ERRCODE='42501';
   END IF;

   SELECT package_type INTO v_package FROM public.organizations WHERE id=v_row.organization_id;
   IF v_package='therapist' AND v_row.org_role IN ('caregiver','medical_professional','other_specialist') THEN
     RAISE EXCEPTION 'The licensed organization package excludes this office' USING ERRCODE='42501';
   END IF;
   SELECT status,licensed_seats INTO v_license_status,v_seats
     FROM public.organization_licenses WHERE organization_id=v_row.organization_id FOR UPDATE;
   IF v_row.org_role<>'director' THEN
     IF v_license_status IS DISTINCT FROM 'active' OR v_seats IS NULL THEN
       RAISE EXCEPTION 'Organization license is not active for staff invitations' USING ERRCODE='42501';
     END IF;
     SELECT count(*) INTO v_occupied FROM public.organization_memberships
       WHERE organization_id=v_row.organization_id AND status IN ('active','invited') AND org_role <> 'director';
     IF v_occupied>v_seats THEN
       RAISE EXCEPTION 'Staff invitation would exceed licensed seat capacity' USING ERRCODE='23514';
     END IF;
   END IF;
   IF v_row.org_role IN ('medical_professional','therapist','other_specialist') AND NOT EXISTS(
     SELECT 1 FROM public.professional_applications a
     WHERE a.target_organization_id=v_row.organization_id AND a.applicant_user_id=v_row.user_id
       AND a.requested_office=v_row.org_role AND a.credential_verification_status='independently_verified'
       AND a.status IN ('pending_review','resubmitted','approved')) THEN
       RAISE EXCEPTION 'Professional credential verification is required before activation' USING ERRCODE='42501';
   END IF;
 END IF;
 UPDATE public.organization_memberships
 SET status=CASE WHEN p_accept THEN 'active' ELSE 'declined' END,updated_at=now()
 WHERE id=v_row.id
 RETURNING * INTO v_row;
 RETURN v_row;
END $function$;
REVOKE ALL ON FUNCTION public.invite_org_member(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invite_org_member(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_to_org_invite(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.respond_to_org_invite(uuid,boolean) TO authenticated;
