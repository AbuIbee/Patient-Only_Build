-- HCN 2026-11-04 explicit manager-only caregiver-to-patient assignment.
-- Reuses the established staff_patient_assignments table and existing
-- patient-specific authorization; does not create a blanket caregiver_patients
-- relationship, which could survive enterprise membership revocation.
CREATE OR REPLACE FUNCTION public.hcn_assign_caregiver_to_patient(
 p_org_id uuid,p_caregiver_id uuid,p_patient_id uuid
) RETURNS public.staff_patient_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_row public.staff_patient_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_active_org_director(p_org_id) OR public.am_i_org_owner(p_org_id)
  ) THEN
    RAISE EXCEPTION 'Only this organization''s Owner or active Director may assign a caregiver';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_licenses l
    WHERE l.organization_id=p_org_id AND l.status='active' AND l.license_number IS NOT NULL
  ) THEN RAISE EXCEPTION 'Organization license is not active'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id=p_org_id AND m.user_id=p_caregiver_id
      AND m.org_role='caregiver' AND m.status='active'
  ) THEN RAISE EXCEPTION 'Caregiver must complete password activation before patient assignment'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.covered_patient_memberships c
    WHERE c.organization_id=p_org_id AND c.patient_id=p_patient_id AND c.status='active'
  ) THEN RAISE EXCEPTION 'Patient is not actively covered by this organization'; END IF;

  INSERT INTO public.staff_patient_assignments(
    organization_id,user_id,patient_id,org_role,is_active,assigned_by
  ) VALUES (p_org_id,p_caregiver_id,p_patient_id,'caregiver',true,auth.uid())
  ON CONFLICT (organization_id,user_id,patient_id) DO UPDATE
    SET org_role='caregiver',is_active=true,assigned_by=EXCLUDED.assigned_by,updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_assign_caregiver_to_patient(uuid,uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_assign_caregiver_to_patient(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_unassign_caregiver_from_patient(
 p_org_id uuid,p_caregiver_id uuid,p_patient_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_active_org_director(p_org_id) OR public.am_i_org_owner(p_org_id)
  ) THEN
    RAISE EXCEPTION 'Only this organization''s Owner or active Director may revoke an assignment';
  END IF;
  UPDATE public.staff_patient_assignments
  SET is_active=false,updated_at=now()
  WHERE organization_id=p_org_id AND user_id=p_caregiver_id
    AND patient_id=p_patient_id AND org_role='caregiver';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_unassign_caregiver_from_patient(uuid,uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_unassign_caregiver_from_patient(uuid,uuid,uuid) TO authenticated;

-- The previous direct-coverage function let active caregivers turn their
-- own residential patients into enterprise-covered patients without a
-- Director assignment. Retire that bypass in Enterprise organizations.
-- Residential patient registration itself remains unchanged.
CREATE OR REPLACE FUNCTION public.cover_patient_via_staff_registration(
 p_org_id uuid,p_patient_id uuid
) RETURNS public.covered_patient_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Enterprise patient enrollment is managed by the Organization Owner or Director. Ask management to register and assign this patient.';
END; $$;
REVOKE ALL ON FUNCTION public.cover_patient_via_staff_registration(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cover_patient_via_staff_registration(uuid,uuid) TO authenticated;
