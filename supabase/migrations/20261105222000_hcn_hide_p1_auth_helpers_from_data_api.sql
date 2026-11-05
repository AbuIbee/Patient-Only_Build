-- Keep the P1 SECURITY DEFINER authorization helpers outside the exposed
-- PostgREST schema. RLS policies and the care-team report view still invoke
-- these helpers with authenticated EXECUTE rights; clients cannot call them
-- through /rest/v1/rpc because private is not an exposed API schema.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.hcn_can_read_care_partner_notes(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_patient_id IS NOT NULL
    AND (select auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.staff_patient_assignments spa
        JOIN public.organization_memberships om
          ON om.organization_id = spa.organization_id
         AND om.user_id = spa.user_id
         AND om.org_role = spa.org_role
         AND om.status = 'active'
        JOIN public.organization_licenses ol
          ON ol.organization_id = spa.organization_id
         AND ol.status = 'active'
         AND ol.license_number IS NOT NULL
        JOIN public.covered_patient_memberships cpm
          ON cpm.organization_id = spa.organization_id
         AND cpm.patient_id = spa.patient_id
         AND cpm.status = 'active'
        WHERE spa.user_id = (select auth.uid())
          AND spa.patient_id = p_patient_id
          AND spa.is_active = true
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.covered_patient_memberships cpm
          WHERE cpm.patient_id = p_patient_id
        )
        AND EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p_patient_id
            AND cp.caregiver_id = (select auth.uid())
        )
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.covered_patient_memberships cpm
          WHERE cpm.patient_id = p_patient_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.therapist_relationships tr
          JOIN public.profiles pr ON pr.id = tr.therapist_id
          WHERE tr.patient_id = p_patient_id
            AND tr.therapist_id = (select auth.uid())
            AND tr.is_active = true
            AND pr.role = 'therapist'
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION private.hcn_can_write_care_partner_notes(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_patient_id IS NOT NULL
    AND (select auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.staff_patient_assignments spa
        JOIN public.organization_memberships om
          ON om.organization_id = spa.organization_id
         AND om.user_id = spa.user_id
         AND om.org_role = spa.org_role
         AND om.status = 'active'
        JOIN public.organization_licenses ol
          ON ol.organization_id = spa.organization_id
         AND ol.status = 'active'
         AND ol.license_number IS NOT NULL
        JOIN public.covered_patient_memberships cpm
          ON cpm.organization_id = spa.organization_id
         AND cpm.patient_id = spa.patient_id
         AND cpm.status = 'active'
        WHERE spa.user_id = (select auth.uid())
          AND spa.patient_id = p_patient_id
          AND spa.is_active = true
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.covered_patient_memberships cpm
          WHERE cpm.patient_id = p_patient_id
        )
        AND EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = p_patient_id
            AND cp.caregiver_id = (select auth.uid())
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION private.hcn_can_read_care_partner_notes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.hcn_can_write_care_partner_notes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.hcn_can_read_care_partner_notes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.hcn_can_write_care_partner_notes(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "HCN authorized care team reads Care Partner notes" ON public.care_partner_notes;
DROP POLICY IF EXISTS "HCN authorized staff create Care Partner notes" ON public.care_partner_notes;
DROP POLICY IF EXISTS "HCN authorized staff update Care Partner notes" ON public.care_partner_notes;

CREATE POLICY "HCN authorized care team reads Care Partner notes"
ON public.care_partner_notes FOR SELECT TO authenticated
USING (private.hcn_can_read_care_partner_notes(patient_id));

CREATE POLICY "HCN authorized staff create Care Partner notes"
ON public.care_partner_notes FOR INSERT TO authenticated
WITH CHECK (private.hcn_can_write_care_partner_notes(patient_id));

CREATE POLICY "HCN authorized staff update Care Partner notes"
ON public.care_partner_notes FOR UPDATE TO authenticated
USING (private.hcn_can_write_care_partner_notes(patient_id))
WITH CHECK (private.hcn_can_write_care_partner_notes(patient_id));

CREATE OR REPLACE VIEW public.care_team_home_reports
WITH (security_barrier = true)
AS
SELECT id, patient_id, report_date, submitted_at, mood, meals, hydration,
       medications, mobility, exercise, sleep_quality, pain_level
FROM public.care_partner_logs
WHERE private.hcn_can_read_care_partner_notes(patient_id);

REVOKE ALL ON FUNCTION public.hcn_can_read_care_partner_notes(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hcn_can_write_care_partner_notes(uuid)
  FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.hcn_can_read_care_partner_notes(uuid);
DROP FUNCTION public.hcn_can_write_care_partner_notes(uuid);

COMMIT;
