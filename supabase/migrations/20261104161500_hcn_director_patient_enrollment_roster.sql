-- HCN 2026-11-04 Director-managed patient enrollment and complete employee roster.
-- Preserve billing state. Restore null patient capacity only from the
-- applicant's recorded initialExpectedActivePatients (not an invented value).
UPDATE public.organization_licenses l
SET covered_patient_capacity = a.initial_expected_active_patients,
    updated_at = now()
FROM public.professional_applications a
WHERE a.target_organization_id=l.organization_id
  AND a.status='active' AND l.status='active'
  AND l.covered_patient_capacity IS NULL
  AND a.initial_expected_active_patients BETWEEN 1 AND 100000
  AND a.auto_verification_result->>'organization_auto_provisioned'='true'
  AND EXISTS (
    SELECT 1 FROM public.sales_quotes q
    WHERE q.id=(a.application_details->>'originatingQuoteId')::uuid
      AND q.proposed_covered_patient_capacity IS NULL
  );

UPDATE public.sales_quotes q
SET proposed_covered_patient_capacity=a.initial_expected_active_patients
FROM public.professional_applications a
WHERE q.id=(a.application_details->>'originatingQuoteId')::uuid
  AND a.status='active' AND a.initial_expected_active_patients BETWEEN 1 AND 100000
  AND a.auto_verification_result->>'organization_auto_provisioned'='true'
  AND q.proposed_covered_patient_capacity IS NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_licenses l
    WHERE l.organization_id=a.target_organization_id
      AND l.covered_patient_capacity=a.initial_expected_active_patients
  );

-- Profile RLS excludes invited employee profiles. This narrow definer RPC
-- returns names/emails only to the real org Owner or active Director.
CREATE OR REPLACE FUNCTION public.hcn_get_org_staff_roster(p_org_id uuid)
RETURNS TABLE(
  id uuid, user_id uuid, org_role text, status text, created_at timestamptz,
  first_name text, last_name text, email text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
      public.is_active_org_director(p_org_id) OR public.am_i_org_owner(p_org_id)
  ) THEN
    RAISE EXCEPTION 'Only this organization''s Owner or active Director may view employee inventory';
  END IF;
  RETURN QUERY
  SELECT m.id,m.user_id,m.org_role,m.status,m.created_at,
         p.first_name,p.last_name,p.email
  FROM public.organization_memberships m
  LEFT JOIN public.profiles p ON p.id=m.user_id
  WHERE m.organization_id=p_org_id
  ORDER BY m.created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_get_org_staff_roster(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_org_staff_roster(uuid)
  TO authenticated;

-- Auth identities are created ONLY by the employee/patient onboarding Edge
-- Function, never by client-side Auth signup. This server-only function
-- atomically binds a new patient identity, patient record and licensed
-- organization coverage; no staff assignment is made here.
CREATE OR REPLACE FUNCTION public.hcn_director_enroll_patient(
 p_org_id uuid,p_patient_id uuid,p_actor_id uuid,
 p_first_name text,p_last_name text,p_date_of_birth date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_license public.organization_licenses;
  v_profile public.profiles;
  v_patient public.patients;
  v_covered public.covered_patient_memberships;
  v_count integer;
BEGIN
  IF p_actor_id IS NULL OR p_actor_id=p_patient_id THEN
    RAISE EXCEPTION 'Invalid patient enrollment actor or identity';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id=p_org_id AND o.package_type='integrated_care'
      AND (o.owner_user_id=p_actor_id OR EXISTS (
        SELECT 1 FROM public.organization_memberships m
        WHERE m.organization_id=o.id AND m.user_id=p_actor_id
          AND m.org_role IN ('director','co_director') AND m.status='active'))
  ) THEN RAISE EXCEPTION 'Only this organization''s Owner or active Director may create enterprise patients'; END IF;
  SELECT * INTO v_license FROM public.organization_licenses
  WHERE organization_id=p_org_id FOR UPDATE;
  IF NOT FOUND OR v_license.status<>'active' OR v_license.license_number IS NULL
  THEN RAISE EXCEPTION 'Cannot enroll patients without an active numbered organization license'; END IF;

  IF length(btrim(coalesce(p_first_name,''))) NOT BETWEEN 1 AND 80
     OR length(btrim(coalesce(p_last_name,''))) NOT BETWEEN 1 AND 80
  THEN RAISE EXCEPTION 'Patient first and last names are required'; END IF;
  IF p_date_of_birth IS NOT NULL AND p_date_of_birth>current_date
  THEN RAISE EXCEPTION 'Date of birth cannot be in the future'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id=p_patient_id;
  IF NOT FOUND OR v_profile.role<>'patient'
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_patient_id)
  THEN RAISE EXCEPTION 'A server-created patient Auth identity is required'; END IF;

  -- Only exact organization-local idempotent replay is allowed. Never
  -- silently adopt unrelated personal or another organization's patient.
  SELECT * INTO v_patient FROM public.patients WHERE id=p_patient_id;
  SELECT * INTO v_covered FROM public.covered_patient_memberships
  WHERE organization_id=p_org_id AND patient_id=p_patient_id;
  IF FOUND AND v_covered.status='active' AND v_patient.id=p_patient_id
  THEN RETURN p_patient_id; END IF;
  IF v_patient.id IS NOT NULL OR v_covered.id IS NOT NULL OR EXISTS(
    SELECT 1 FROM public.covered_patient_memberships WHERE patient_id=p_patient_id
  ) THEN RAISE EXCEPTION 'Patient identity already registered; review enrollment instead of creating a duplicate'; END IF;

  SELECT count(*) INTO v_count FROM public.covered_patient_memberships
  WHERE organization_id=p_org_id AND status='active';
  IF v_license.covered_patient_capacity IS NULL
    OR v_count>=v_license.covered_patient_capacity
  THEN RAISE EXCEPTION 'Patient capacity unavailable (% / %); correct the licensed patient allocation before enrollment', v_count,coalesce(v_license.covered_patient_capacity,0); END IF;

  INSERT INTO public.patients(id,first_name,last_name,date_of_birth)
  VALUES(p_patient_id,btrim(p_first_name),btrim(p_last_name),p_date_of_birth);
  INSERT INTO public.covered_patient_memberships
    (organization_id,patient_id,status,created_by)
  VALUES(p_org_id,p_patient_id,'active',p_actor_id);
  RETURN p_patient_id;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_director_enroll_patient(uuid,uuid,uuid,text,text,date)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_director_enroll_patient(uuid,uuid,uuid,text,text,date)
  TO service_role;

COMMENT ON FUNCTION public.hcn_director_enroll_patient(uuid,uuid,uuid,text,text,date) IS
'Service-role-only, authenticated-manager-verified atomic new patient + org coverage. Does not assign staff or grant staff access; assignment requires a separate active caregiver.';
