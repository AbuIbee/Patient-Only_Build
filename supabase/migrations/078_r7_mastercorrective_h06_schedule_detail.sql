-- 078_r7_mastercorrective_h06_schedule_detail.sql
-- MASTER CORRECTIVE ENGINEERING ORDER — SPEC-01 re-inspection of H06.
--
-- CONFIRMED DEFECT (UI-H06-ADDRESS-MISSING, browser_audit.mjs): the
-- locked requirement text is explicit -- "scheduled start/end, and
-- authorized address/facility, with timezone and status" -- but
-- ScheduleView rendered only a start timestamp and status; no end
-- time, no patient address/facility, no timezone label.
--
-- ROOT CAUSE: get_my_staff_patients() never returned the patient's
-- address/location at all, so ScheduleView (which looks up each
-- visit's patient from this same list) had no address data available
-- to render even if it had tried to.
DROP FUNCTION IF EXISTS public.get_my_staff_patients();
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
RETURNS TABLE (
  organization_id UUID, organization_name TEXT, patient_id UUID,
  first_name TEXT, last_name TEXT, preferred_name TEXT, org_role TEXT,
  address TEXT, location TEXT
) AS $$
  SELECT spa.organization_id, o.name, p.id, p.first_name, p.last_name, p.preferred_name, spa.org_role,
    p.address, p.location
  FROM staff_patient_assignments spa
  JOIN organizations o ON o.id = spa.organization_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.user_id = auth.uid() AND spa.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_patients() TO authenticated;
