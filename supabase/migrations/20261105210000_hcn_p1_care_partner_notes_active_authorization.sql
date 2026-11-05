-- HCN P1: enforce current authorization on every care_partner_notes path.
-- Staff access requires an active assignment, matching active org membership,
-- active license, and active patient coverage. Legacy residential links remain
-- usable only for patients with no enterprise coverage history.
BEGIN;

CREATE OR REPLACE FUNCTION public.hcn_can_read_care_partner_notes(p_patient_id uuid)
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

CREATE OR REPLACE FUNCTION public.hcn_can_write_care_partner_notes(p_patient_id uuid)
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

REVOKE ALL ON FUNCTION public.hcn_can_read_care_partner_notes(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hcn_can_write_care_partner_notes(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_read_care_partner_notes(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hcn_can_write_care_partner_notes(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Assigned staff can create Care Partner notes for their patients" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Caregivers can create Care Partner notes for their patients" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Patients can create their own Care Partner notes" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Assigned org staff can view A-G care partner notes for their pa" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Caregivers can view Care Partner notes for their patients" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Direct-connection therapists can view their patients' notes" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Patients can view their own Care Partner notes" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Assigned staff can update Care Partner notes for their patients" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Caregivers can update Care Partner notes for their patients" ON public.care_partner_notes;
DROP POLICY IF EXISTS "Patients can update their own Care Partner notes" ON public.care_partner_notes;

CREATE POLICY "HCN patients read their own Care Partner notes"
ON public.care_partner_notes FOR SELECT TO authenticated
USING (patient_id = (select auth.uid()));

CREATE POLICY "HCN authorized care team reads Care Partner notes"
ON public.care_partner_notes FOR SELECT TO authenticated
USING (public.hcn_can_read_care_partner_notes(patient_id));

CREATE POLICY "HCN patients create their own Care Partner notes"
ON public.care_partner_notes FOR INSERT TO authenticated
WITH CHECK (patient_id = (select auth.uid()));

CREATE POLICY "HCN authorized staff create Care Partner notes"
ON public.care_partner_notes FOR INSERT TO authenticated
WITH CHECK (public.hcn_can_write_care_partner_notes(patient_id));

CREATE POLICY "HCN patients update their own Care Partner notes"
ON public.care_partner_notes FOR UPDATE TO authenticated
USING (patient_id = (select auth.uid()))
WITH CHECK (patient_id = (select auth.uid()));

CREATE POLICY "HCN authorized staff update Care Partner notes"
ON public.care_partner_notes FOR UPDATE TO authenticated
USING (public.hcn_can_write_care_partner_notes(patient_id))
WITH CHECK (public.hcn_can_write_care_partner_notes(patient_id));

-- This table contains patient notes. Anonymous access and privileges that bypass
-- row-level security (such as TRUNCATE) are never needed by the browser client.
REVOKE ALL ON TABLE public.care_partner_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.care_partner_notes TO authenticated;
GRANT ALL ON TABLE public.care_partner_notes TO service_role;

COMMIT;
