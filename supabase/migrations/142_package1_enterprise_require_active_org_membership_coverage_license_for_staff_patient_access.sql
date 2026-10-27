-- PACKAGE 1 — Security and Database Completion, Workstream 2/3/5.
--
-- Reconciles this repository's patient-access authorization functions
-- against the Enterprise staging project (axurszlibxwwptkczztt)'s real,
-- currently-applied migration
-- `enterprise_require_active_org_membership_coverage_license_for_staff_patient_access`
-- (version 20261027024543, the directive's "migration 17") -- retrieved
-- by direct, read-only introspection against the linked staging project
-- (`pg_get_functiondef`, `information_schema.routine_privileges`), never
-- invented. No write was made to staging; this migration only changes
-- the LOCAL/disposable schema.
--
-- CONFIRMED DEFECT (present in this repository since migration 040/070,
-- i.e. the entire history of this engagement until now): is_authorized_
-- for_patient()/has_patient_access()/is_medical_professional_for_patient()/
-- is_therapist_for_patient() all authorized the Enterprise staff-
-- assignment path on `staff_patient_assignments.is_active = true` ALONE
-- -- with NO check that the staff member's own organization_memberships
-- row is still 'active', that the patient's own covered_patient_
-- memberships row is still 'active', or that the organization's license
-- is still 'active'. A caregiver/medical professional/therapist whose
-- ORG MEMBERSHIP was revoked, whose patient's COVERAGE ended, or whose
-- org's LICENSE expired/was canceled -- while their own
-- staff_patient_assignments.is_active flag happened to still read true
-- -- would retain full patient access. This is exactly the
-- "staff assignment alone must not bypass revoked membership, ended
-- patient coverage, or expired/canceled/unpaid license" requirement.
--
-- FIX: reproduces the verified staging SQL for the 4 named functions
-- EXACTLY (byte-for-byte body, confirmed via pg_get_functiondef), with
-- one deliberate exception: this repository's EXISTING, already-safer
-- EXECUTE grants are preserved rather than copied from staging. Staging
-- currently grants `anon,authenticated` on the raw is_authorized_for_
-- patient(uuid,uuid) -- which takes an ARBITRARY p_user_id as a direct
-- parameter, not auth.uid() -- meaning ANY caller, including an
-- unauthenticated one, can currently probe arbitrary (user_id,
-- patient_id) pairs on staging as an authorization oracle. This
-- repository's own grant (service_role only on the raw 2-arg function,
-- with has_patient_access(patient_id) -- using auth.uid() internally --
-- as the safe, self-scoped, authenticated-callable wrapper) is already
-- correct and is NOT weakened to match staging. This divergence is
-- reported to the Platform Owner, not silently fixed on staging by this
-- migration (no write capability to staging exists or is used here).
--
-- ADDITIONAL FIX, BEYOND the hosted migration: is_professional_staff_for_
-- patient() has the IDENTICAL vulnerability (a raw inline
-- staff_patient_assignments.is_active EXISTS check with no membership/
-- coverage/license join) and was confirmed, by the same read-only
-- introspection, to be UNFIXED on staging too (migration 17 missed it).
-- Fixed here by routing its medical/therapist check through the now-safe
-- is_medical_professional_for_patient()/is_therapist_for_patient()
-- instead of its own raw EXISTS -- closing the same gap this migration's
-- namesake closed for the other four, going one function further than
-- the hosted fix.
CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
SELECT p_user_id IS NOT NULL AND p_patient_id IS NOT NULL AND
(p_user_id=p_patient_id OR EXISTS (SELECT 1 FROM public.caregiver_patients cp WHERE cp.caregiver_id=p_user_id AND cp.patient_id=p_patient_id)
OR EXISTS (SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role=a.org_role JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=p_user_id AND a.patient_id=p_patient_id AND a.is_active=true)
OR EXISTS (SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=p_user_id AND t.patient_id=p_patient_id AND t.is_active=true));
$function$;
-- Grant unchanged from this repository's existing, already-safer state
-- (service_role only) -- see the comment above. REVOKE/GRANT restated
-- explicitly so this migration is a complete, standalone reconciliation
-- record rather than relying on an earlier migration's grant surviving
-- untouched by coincidence.
REVOKE ALL ON FUNCTION public.is_authorized_for_patient(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorized_for_patient(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_patient_access(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT public.is_authorized_for_patient((select auth.uid()),p_patient_id); $function$;
REVOKE ALL ON FUNCTION public.has_patient_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_patient_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='medical_professional' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='medical_professional' AND a.is_active=true); $function$;
REVOKE ALL ON FUNCTION public.is_medical_professional_for_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_medical_professional_for_patient(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='therapist' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='therapist' AND a.is_active=true)
OR EXISTS(SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=(select auth.uid()) AND t.patient_id=p_patient_id AND t.is_active=true); $function$;
REVOKE ALL ON FUNCTION public.is_therapist_for_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_therapist_for_patient(uuid) TO authenticated, service_role;

-- Beyond the hosted fix (see the comment block above): close the
-- identical gap in is_professional_staff_for_patient() by routing
-- through the now-safe per-role checks instead of a raw inline EXISTS.
CREATE OR REPLACE FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.is_medical_professional_for_patient(p_patient_id) OR public.is_therapist_for_patient(p_patient_id);
$function$;
REVOKE ALL ON FUNCTION public.is_professional_staff_for_patient(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_professional_staff_for_patient(UUID) TO authenticated, service_role;
