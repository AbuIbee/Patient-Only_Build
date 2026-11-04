
-- HCN manager-controlled caregiver employment provisioning (2026-11-04).
-- Organization Owner or active Director/Co-Director is the only authorizer.
-- Employee Auth accounts are created by a trusted Edge Function, never a
-- browser or by an Enterprise caregiver's self-registration.
CREATE OR REPLACE FUNCTION public.hcn_manager_add_caregiver(
  p_org_id uuid, p_employee_id uuid
) RETURNS public.organization_memberships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_org public.organizations;
  v_license public.organization_licenses;
  v_existing public.organization_memberships;
  v_member public.organization_memberships;
  v_seats_used integer;
  v_role_used integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in as an organization manager'; END IF;
  IF NOT (
      public.is_active_org_director(p_org_id) OR
      public.am_i_org_owner(p_org_id)
  ) THEN RAISE EXCEPTION 'Only the Organization Owner or active Director may create caregiver accounts'; END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND OR v_org.package_type <> 'integrated_care' THEN
    RAISE EXCEPTION 'Caregivers require an existing Integrated Care organization';
  END IF;

  SELECT * INTO v_license FROM public.organization_licenses
    WHERE organization_id=p_org_id FOR UPDATE;
  IF NOT FOUND OR v_license.status <> 'active' OR v_license.license_number IS NULL THEN
    RAISE EXCEPTION 'An active, numbered organization license is required';
  END IF;

  IF p_employee_id = auth.uid() THEN
    RAISE EXCEPTION 'Managers may not provision their own employee account';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
    WHERE u.id=p_employee_id AND u.email IS NOT NULL
      AND lower(u.email)=lower(p.email)
  ) THEN
    RAISE EXCEPTION 'The employee account must be created and verified by the server first';
  END IF;

  SELECT * INTO v_existing FROM public.organization_memberships
  WHERE organization_id=p_org_id AND user_id=p_employee_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.org_role <> 'caregiver' THEN
      RAISE EXCEPTION 'This identity already has another organization role; no automatic role change allowed';
    END IF;
    IF v_existing.status IN ('invited','active') THEN
      RETURN v_existing; -- retry is idempotent; never create a duplicate
    END IF;
    RAISE EXCEPTION 'A declined or revoked employee requires an explicit rehire review';
  END IF;

  SELECT count(*) INTO v_seats_used FROM public.organization_memberships
  WHERE organization_id=p_org_id AND status IN ('invited','active')
    AND org_role <> 'director';
  IF v_license.licensed_seats IS NULL OR v_seats_used >= v_license.licensed_seats THEN
    RAISE EXCEPTION 'No licensed employee seats available';
  END IF;
  IF v_license.max_caregiver_seats IS NOT NULL THEN
    SELECT count(*) INTO v_role_used FROM public.organization_memberships
      WHERE organization_id=p_org_id AND status IN ('invited','active')
        AND org_role='caregiver';
    IF v_role_used >= v_license.max_caregiver_seats THEN
      RAISE EXCEPTION 'The caregiver-specific licensed seat cap has been reached';
    END IF;
  END IF;

  INSERT INTO public.organization_memberships (
      organization_id,user_id,org_role,status,invited_by
  ) VALUES (p_org_id,p_employee_id,'caregiver','invited',auth.uid())
    RETURNING * INTO v_member;
  RETURN v_member;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_manager_add_caregiver(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_manager_add_caregiver(uuid,uuid)
  TO authenticated;

-- Employees finish password setup before accepting their membership.
-- An invite link alone must not activate staff permissions.
CREATE OR REPLACE FUNCTION public.hcn_activate_my_caregiver_invites()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Employee authentication is required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.profiles p ON p.id=u.id
    WHERE u.id=auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND nullif(u.encrypted_password,'') IS NOT NULL
      AND p.must_change_password=false
  ) THEN
    RAISE EXCEPTION 'Set and confirm your own password before accepting employment';
  END IF;

  UPDATE public.organization_memberships m
  SET status='active',updated_at=now()
  WHERE m.user_id=auth.uid() AND m.org_role='caregiver' AND m.status='invited'
    AND EXISTS (SELECT 1 FROM public.organization_licenses l
      WHERE l.organization_id=m.organization_id AND l.status='active'
        AND l.license_number IS NOT NULL)
  ;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_activate_my_caregiver_invites() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_activate_my_caregiver_invites() TO authenticated;

-- Existing direct-invite RPC cannot bypass manager-created identities.
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
  IF p_org_role='caregiver' THEN
    RAISE EXCEPTION 'Caregiver employment accounts must be created by the Organization Owner or Director using Create Caregiver Account';
  END IF;
  v_is_director := public.is_active_org_director(p_org_id);
  v_is_office_admin := EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND org_role = 'office_administrator' AND status = 'active'
  );
  IF NOT v_is_director AND NOT v_is_office_admin THEN
    RAISE EXCEPTION 'Only an active director, co-director, or office administrator of this organization may invite staff';
  END IF;

  IF p_org_role IN ('therapist', 'medical_professional') THEN
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
    status = CASE WHEN organization_memberships.status = 'revoked' THEN 'invited' ELSE organization_memberships.status END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$

CREATE OR REPLACE FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean)
 RETURNS organization_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row organization_memberships;
BEGIN
  -- For caregiver employment, even a valid emailed invitation does not
  -- confer operational access until a password is set and the license
  -- remains active. Other office roles preserve their previous behavior.
  IF p_accept AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.id=p_membership_id AND m.user_id=auth.uid()
      AND m.status='invited' AND m.org_role='caregiver'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
      WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
        AND nullif(u.encrypted_password,'') IS NOT NULL
        AND p.must_change_password=false
    ) THEN
      RAISE EXCEPTION 'Create your employee password before accepting your invitation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      JOIN public.organization_licenses l ON l.organization_id=m.organization_id
      WHERE m.id=p_membership_id AND m.user_id=auth.uid()
        AND l.status='active' AND l.license_number IS NOT NULL
    ) THEN RAISE EXCEPTION 'The employer organization has no active license'; END IF;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE organization_memberships
  SET status = CASE WHEN p_accept THEN 'active' ELSE 'declined' END, updated_at = now()
  WHERE id = p_membership_id AND user_id = auth.uid() AND status = 'invited'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No pending invitation found for you with this id';
  END IF;

  RETURN v_row;
END;
$function$

-- Public self-registration no longer grants an Enterprise Caregiver
-- application, irrespective of handcrafted HTTP/RPC requests.
CREATE OR REPLACE FUNCTION public.hcn_reject_self_caregiver_application()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.requested_office='caregiver' THEN
    RAISE EXCEPTION 'Caregiver accounts are created by the organization Owner or Director; ask your employer for an activation invitation';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS hcn_no_public_caregiver_applications ON public.professional_applications;
CREATE TRIGGER hcn_no_public_caregiver_applications
BEFORE INSERT OR UPDATE OF requested_office ON public.professional_applications
FOR EACH ROW EXECUTE FUNCTION public.hcn_reject_self_caregiver_application();
REVOKE ALL ON FUNCTION public.hcn_reject_self_caregiver_application() FROM PUBLIC,anon,authenticated;