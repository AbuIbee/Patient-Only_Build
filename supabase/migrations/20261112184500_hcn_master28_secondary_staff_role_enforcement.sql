-- Master #28 secondary office end-to-end staff authorization. Production
-- function bodies were captured read-only and patched surgically. This migration
-- follows the audited grant activation migration. Access is scoped by
-- primary active Director membership + approved office grant + patient assignment.
CREATE OR REPLACE FUNCTION public.assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text)
 RETURNS staff_patient_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row staff_patient_assignments;
  v_membership organization_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may assign staff to a patient';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional') THEN
    RAISE EXCEPTION 'Invalid staff role: %', p_org_role;
  END IF;

  SELECT * INTO v_membership FROM organization_memberships
  WHERE organization_id = p_org_id AND user_id = p_user_id
  FOR UPDATE;
  IF v_membership.id IS NULL OR v_membership.status != 'active' OR (v_membership.org_role != p_org_role AND NOT EXISTS (
    SELECT 1 FROM public.hcn_director_office_grants g
    JOIN public.hcn_director_office_requests req ON req.id=g.source_request_id
      AND req.status='approved' AND req.decided_by IS DISTINCT FROM req.requester_id
      AND req.organization_id=g.organization_id AND req.requester_id=g.user_id AND req.capability=g.capability
    WHERE g.organization_id=p_org_id AND g.user_id=p_user_id
      AND g.capability=p_org_role AND g.status='active'
  )) THEN
    RAISE EXCEPTION 'The target user is not an active % member of this organization', p_org_role;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'This patient is not actively covered by this organization';
  END IF;

  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, p_user_id, p_patient_id, p_org_role, auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET
    org_role = EXCLUDED.org_role, is_active = true, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$

CREATE OR REPLACE FUNCTION public.hcn_assign_caregiver_to_patient(p_org_id uuid, p_caregiver_id uuid, p_patient_id uuid)
 RETURNS staff_patient_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  ) AND NOT EXISTS (
    SELECT 1 FROM public.hcn_director_office_grants g
    JOIN public.hcn_director_office_requests req ON req.id=g.source_request_id
      AND req.status='approved' AND req.decided_by IS DISTINCT FROM req.requester_id
      AND req.organization_id=g.organization_id AND req.requester_id=g.user_id AND req.capability=g.capability
    WHERE g.organization_id=p_org_id AND g.user_id=p_caregiver_id
      AND g.capability='caregiver' AND g.status='active'
  ) THEN RAISE EXCEPTION 'Caregiver must complete password activation and receive approved office access before patient assignment'; END IF;
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
END; $function$

CREATE OR REPLACE FUNCTION public.hcn_director_schedule_assigned_visit(p_org_id uuid, p_patient_id uuid, p_caregiver_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone)
 RETURNS caregiver_visits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.caregiver_visits;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active organization director may schedule visits' USING ERRCODE='42501';
  END IF;
  IF p_patient_id IS NULL OR p_caregiver_id IS NULL OR p_scheduled_start IS NULL
     OR p_scheduled_end IS NULL OR p_scheduled_end <= p_scheduled_start
     OR p_scheduled_end > p_scheduled_start + interval '24 hours' THEN
    RAISE EXCEPTION 'A valid patient, caregiver and visit window (max 24 hours) are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_licenses l
      WHERE l.organization_id=p_org_id AND l.status='active') THEN
    RAISE EXCEPTION 'Organization license is not active' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.covered_patient_memberships cp
      WHERE cp.organization_id=p_org_id AND cp.patient_id=p_patient_id AND cp.status='active') THEN
    RAISE EXCEPTION 'Patient is not actively covered in this organization' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_patient_assignments spa
      JOIN public.organization_memberships m ON m.organization_id=spa.organization_id
         AND m.user_id=spa.user_id AND m.status='active'
         AND (m.org_role='caregiver'
           OR (m.org_role IN ('director','co_director') AND
              EXISTS (
    SELECT 1 FROM public.hcn_director_office_grants g
    JOIN public.hcn_director_office_requests req ON req.id=g.source_request_id
      AND req.status='approved' AND req.decided_by IS DISTINCT FROM req.requester_id
      AND req.organization_id=g.organization_id AND req.requester_id=g.user_id AND req.capability=g.capability
    WHERE g.organization_id=spa.organization_id AND g.user_id=spa.user_id
      AND g.capability='caregiver' AND g.status='active'
  )))
      WHERE spa.organization_id=p_org_id AND spa.patient_id=p_patient_id
        AND spa.user_id=p_caregiver_id AND spa.org_role='caregiver' AND spa.is_active) THEN
    RAISE EXCEPTION 'Selected caregiver is not actively assigned to this patient' USING ERRCODE='42501';
  END IF;
  -- Serialize overlapping bookings of the same caregiver even across director sessions.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_caregiver_id::text,0));
  IF EXISTS (SELECT 1 FROM public.caregiver_visits v
      WHERE v.organization_id=p_org_id AND v.caregiver_id=p_caregiver_id
        AND v.status IN ('scheduled','in_progress')
        AND v.scheduled_start < p_scheduled_end
        AND v.scheduled_end > p_scheduled_start) THEN
    RAISE EXCEPTION 'Caregiver has a conflicting scheduled or active visit';
  END IF;
  INSERT INTO public.caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end)
  VALUES(p_org_id,p_patient_id,p_caregiver_id,p_scheduled_start,p_scheduled_end)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$

CREATE OR REPLACE FUNCTION hcn_private.current_staff_patient_v1(p_org uuid, p_patient uuid, p_role text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT hcn_private.current_identity_v1() AND EXISTS (
    SELECT 1 FROM public.staff_patient_assignments a
    JOIN public.organization_memberships m ON m.organization_id=a.organization_id
      AND m.user_id=a.user_id AND m.status='active'
      AND (m.org_role=a.org_role OR (m.org_role IN ('director','co_director')
        AND public.hcn_has_active_director_office(a.organization_id,a.org_role)))
    JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id
      AND c.patient_id=a.patient_id AND c.status='active'
    JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active'
      AND l.license_number IS NOT NULL
    WHERE a.organization_id=p_org AND a.patient_id=p_patient AND a.user_id=auth.uid()
      AND a.is_active AND (p_role IS NULL OR a.org_role=p_role)
      AND a.org_role IN ('caregiver','medical_professional','therapist','clinical_supervisor')
      AND CASE a.org_role
        WHEN 'medical_professional' THEN public.is_medical_professional_for_patient(p_patient)
        WHEN 'therapist' THEN public.is_therapist_for_patient(p_patient)
        ELSE true END
  );
$function$

CREATE OR REPLACE FUNCTION public.hcn_acknowledge_previsit(p_visit_id uuid, p_sections text[], p_attestation text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_visit public.caregiver_visits; v_id uuid;
  v_handoff timestamptz; v_note timestamptz;
  v_meds timestamptz;v_contacts timestamptz;v_info timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.caregiver_visits v WHERE v.id=p_visit_id AND v.caregiver_id=auth.uid() AND hcn_private.current_staff_patient_v1(v.organization_id,v.patient_id,'caregiver')) THEN RAISE EXCEPTION 'Current scheduled caregiver authorization required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_visit FROM public.caregiver_visits
    WHERE id=p_visit_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_visit.caregiver_id<>auth.uid()
    OR v_visit.status NOT IN ('scheduled','missed') THEN
    RAISE EXCEPTION 'Only the scheduled caregiver may acknowledge an upcoming visit'
      USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    JOIN public.staff_patient_assignments a
      ON a.organization_id=m.organization_id AND a.user_id=m.user_id
    JOIN public.organization_licenses l
      ON l.organization_id=m.organization_id AND l.status='active'
    JOIN public.covered_patient_memberships c
      ON c.organization_id=m.organization_id AND c.patient_id=a.patient_id AND c.status='active'
    WHERE m.organization_id=v_visit.organization_id
      AND m.user_id=auth.uid() AND m.status='active'
      AND (m.org_role='caregiver' OR (m.org_role IN ('director','co_director')
        AND public.hcn_has_active_director_office(v_visit.organization_id,'caregiver')))
      AND a.patient_id=v_visit.patient_id AND a.is_active
  ) THEN RAISE EXCEPTION 'Active caregiver assignment and licensed coverage required'
      USING ERRCODE='42501'; END IF;
  IF p_sections IS NULL OR NOT (
    p_sections @> ARRAY['patient_updates','care_plan','medications','healthcare_contacts','handoffs']::text[]
  ) OR cardinality(p_sections)>12
    OR p_attestation <> 'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.'
  THEN RAISE EXCEPTION 'Complete the required five-section acknowledgment' USING ERRCODE='22023'; END IF;
  SELECT max(created_at) INTO v_handoff FROM public.shift_handoffs
    WHERE organization_id=v_visit.organization_id AND patient_id=v_visit.patient_id;
  SELECT max(updated_at) INTO v_note FROM public.patient_notes
    WHERE patient_id=v_visit.patient_id AND note_type NOT IN
      ('therapist_session','clinical_observation','care_partner_personal');
  SELECT max(updated_at) INTO v_meds FROM public.medications WHERE patient_id=v_visit.patient_id;
  SELECT max(updated_at) INTO v_contacts FROM public.patient_care_providers WHERE patient_id=v_visit.patient_id;
  SELECT max(updated_at) INTO v_info FROM public.hcn_patient_information
    WHERE patient_id=v_visit.patient_id AND organization_id=v_visit.organization_id;
  INSERT INTO public.hcn_previsit_acknowledgments
    (visit_id,organization_id,patient_id,caregiver_id,reviewed_sections,latest_handoff_at,latest_patient_note_at,latest_medications_at,latest_contacts_at,latest_patient_information_at,attestation)
  VALUES(p_visit_id,v_visit.organization_id,v_visit.patient_id,auth.uid(),
         p_sections,v_handoff,v_note,v_meds,v_contacts,v_info,p_attestation)
  ON CONFLICT (visit_id,caregiver_id) DO UPDATE SET
    reviewed_sections=EXCLUDED.reviewed_sections,
    latest_handoff_at=EXCLUDED.latest_handoff_at,
    latest_patient_note_at=EXCLUDED.latest_patient_note_at,
    latest_medications_at=EXCLUDED.latest_medications_at,
    latest_contacts_at=EXCLUDED.latest_contacts_at,
    latest_patient_information_at=EXCLUDED.latest_patient_information_at,
    attestation=EXCLUDED.attestation, acknowledged_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.hcn_enforce_active_specialist_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tier text; v_slots integer; v_catalog_slots integer; v_used bigint;
BEGIN
 IF NEW.status <> 'active' OR NEW.org_role NOT IN ('medical_professional','therapist','other_specialist') THEN RETURN NEW; END IF;
 SELECT l.license_tier_code,l.specialist_slot_count INTO v_tier,v_slots
 FROM public.organization_licenses l WHERE l.organization_id=NEW.organization_id FOR UPDATE;
 IF NEW.org_role = 'other_specialist' THEN
   IF v_tier IS NULL THEN
     RAISE EXCEPTION 'Other Specialist requires a tier-based license' USING ERRCODE='23514';
   END IF;
   IF NOT EXISTS (
     SELECT 1 FROM public.professional_applications a
     WHERE a.applicant_user_id=NEW.user_id AND a.target_organization_id=NEW.organization_id
       AND a.requested_office='other_specialist' AND a.credential_verification_status='independently_verified'
       AND a.status IN ('pending_review','resubmitted','approved')
   ) THEN
     RAISE EXCEPTION 'Other Specialist needs a credential-verified application' USING ERRCODE='23514';
   END IF;
 END IF;
 IF v_tier IS NULL THEN RETURN NEW; END IF;
 SELECT specialist_slot_count INTO v_catalog_slots FROM public.license_tier_catalog WHERE tier_code=v_tier;
 IF v_catalog_slots IS NULL OR v_slots IS NULL THEN
  RAISE EXCEPTION 'Specialist capacity configuration missing for tier %',v_tier USING ERRCODE='23514';
 END IF;
 SELECT (
  (SELECT count(*) FROM public.organization_memberships m
   WHERE m.organization_id=NEW.organization_id AND m.status='active'
    AND m.org_role IN ('medical_professional','therapist','other_specialist')
    AND (TG_OP='INSERT' OR m.id<>NEW.id))
  +(SELECT count(*) FROM public.hcn_director_office_grants g
   WHERE g.organization_id=NEW.organization_id AND g.status='active'
     AND g.capability IN ('medical_professional','therapist'))
 ) INTO v_used;
 IF v_used >= LEAST(v_slots,v_catalog_slots) THEN
  RAISE EXCEPTION 'No specialist slots remain for tier % (% of % occupied)',v_tier,v_used,LEAST(v_slots,v_catalog_slots) USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $function$

CREATE OR REPLACE FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='medical_professional' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='medical_professional' AND a.is_active=true)
OR EXISTS(SELECT 1 FROM public.organizations o JOIN public.organization_owner_capability_grants g ON g.organization_id=o.id AND g.user_id=(select auth.uid()) AND g.capability='medical_professional' AND g.status='active' JOIN public.covered_patient_memberships c ON c.organization_id=o.id AND c.patient_id=p_patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active' WHERE o.owner_user_id=(select auth.uid()))
OR EXISTS (
 SELECT 1 FROM public.staff_patient_assignments spa
 WHERE spa.patient_id=p_patient_id AND spa.user_id=(select auth.uid())
  AND spa.org_role='medical_professional' AND spa.is_active
  AND public.hcn_has_director_office_patient_assignment(spa.organization_id,p_patient_id,'medical_professional')
);
$function$

CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='therapist' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='therapist' AND a.is_active=true)
OR EXISTS(SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=(select auth.uid()) AND t.patient_id=p_patient_id AND t.is_active=true)
OR EXISTS(SELECT 1 FROM public.organizations o JOIN public.organization_owner_capability_grants g ON g.organization_id=o.id AND g.user_id=(select auth.uid()) AND g.capability='therapist' AND g.status='active' JOIN public.covered_patient_memberships c ON c.organization_id=o.id AND c.patient_id=p_patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active' WHERE o.owner_user_id=(select auth.uid()))
OR EXISTS (
 SELECT 1 FROM public.staff_patient_assignments spa
 WHERE spa.patient_id=p_patient_id AND spa.user_id=(select auth.uid())
  AND spa.org_role='therapist' AND spa.is_active
  AND public.hcn_has_director_office_patient_assignment(spa.organization_id,p_patient_id,'therapist')
);
$function$
