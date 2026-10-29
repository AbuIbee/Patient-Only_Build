-- HCN P0: cancel unrestricted client destruction privileges (RLS does not protect TRUNCATE).
-- The migration is intentionally idempotent and covers all CURRENT public tables.
-- Review future default table grants separately.
DO $hcn$
DECLARE t record;
BEGIN
 FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %I.%I FROM PUBLIC, anon, authenticated',t.schemaname,t.tablename);
 END LOOP;
END $hcn$;

-- Organization ownership carries billing management, NOT clinical care authority.
UPDATE public.organization_owner_capability_grants
 SET status='revoked',revoked_at=now(),revoked_by=NULL
 WHERE status='active' AND capability IN ('caregiver','therapist','medical_professional');

CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT p_user_id IS NOT NULL AND p_patient_id IS NOT NULL AND
(p_user_id=p_patient_id OR EXISTS (SELECT 1 FROM public.caregiver_patients cp WHERE cp.caregiver_id=p_user_id AND cp.patient_id=p_patient_id)
OR EXISTS (SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role=a.org_role JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=p_user_id AND a.patient_id=p_patient_id AND a.is_active=true)
OR EXISTS (SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=p_user_id AND t.patient_id=p_patient_id AND t.is_active=true)

OR EXISTS (SELECT 1 FROM public.patient_representatives r JOIN public.covered_patient_memberships c ON c.organization_id=r.organization_id AND c.patient_id=r.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=r.organization_id AND l.status='active' WHERE r.representative_user_id=p_user_id AND r.patient_id=p_patient_id AND r.status='active'));
$function$;

CREATE OR REPLACE FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='medical_professional' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='medical_professional' AND a.is_active=true)
;
$function$;

CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='therapist' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='therapist' AND a.is_active=true)
OR EXISTS(SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=(select auth.uid()) AND t.patient_id=p_patient_id AND t.is_active=true)
;
$function$;

CREATE OR REPLACE FUNCTION public.org_owner_self_assign_capability(p_org_id uuid, p_capability text)
 RETURNS organization_owner_capability_grants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row organization_owner_capability_grants;
BEGIN
  IF p_capability NOT IN ('billing_admin') THEN
    RAISE EXCEPTION 'Invalid capability: %', p_capability;
  END IF;

  IF NOT public.is_organization_owner(p_org_id) THEN
    RAISE EXCEPTION 'Only this organization''s Owner may self-assign capability';
  END IF;

  INSERT INTO organization_owner_capability_grants (organization_id, user_id, capability, status, granted_by)
  VALUES (p_org_id, auth.uid(), p_capability, 'active', auth.uid())
  ON CONFLICT (organization_id, user_id, capability)
  DO UPDATE SET status = 'active', granted_by = auth.uid(), revoked_by = NULL, revoked_at = NULL
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (auth.uid(), p_org_id, 'organization_owner_self_assign_capability', auth.uid(), jsonb_build_object('capability', p_capability), 'Organization Owner self-assignment');

  RETURN v_row;
END;
$function$;
