-- MMA-ENT-CAREGIVER-MASTER-004, D03 (P2) — "Patient search, filtering,
-- labels and reference context." Independent runtime audit finding D03
-- (reproduced): the Enterprise Caregiver Dashboard's patient list
-- (PatientsListView, every "select a patient" picker) has cards and
-- registration only — no search, no per-caregiver label, no stable
-- short reference.
--
-- Mirrors migration 033's EXACT existing residential pattern
-- (caregiver_patients.display_label) rather than inventing a new
-- mechanism: a per-(staff,patient)-ASSIGNMENT display label, scoped to
-- the assignment row the caller themselves holds. Different staff
-- members assigned to the same patient may each choose a different
-- label (e.g. "Room 4" vs "Morning shift — Tuesdays"); nobody can set
-- or read another staff member's label for the same patient, and this
-- never touches patients.first_name/last_name/preferred_name (the
-- patient's actual identity) or patients.id.
ALTER TABLE staff_patient_assignments ADD COLUMN IF NOT EXISTS display_label TEXT;

DO $$ BEGIN
  ALTER TABLE staff_patient_assignments ADD CONSTRAINT staff_patient_assignments_display_label_length
    CHECK (display_label IS NULL OR char_length(display_label) <= 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same gap migration 033 found and fixed for caregiver_patients: no
-- UPDATE *policy* exists on staff_patient_assignments at all today
-- (confirmed: migration 035 only ever added SELECT), but the table
-- never had its default `authenticated` table-level UPDATE grant
-- revoked either — a column-scoped GRANT alone does not shrink that
-- existing broader grant, so the REVOKE below is required first.
-- Without it, the RLS policy below would be the only thing standing
-- between a staff member and rewriting user_id/patient_id/org_role/
-- is_active on their own assignment row.
REVOKE UPDATE ON public.staff_patient_assignments FROM authenticated;
GRANT UPDATE (display_label, updated_at) ON public.staff_patient_assignments TO authenticated;

DO $$ BEGIN
  CREATE POLICY "Staff can set their own display label for an assignment"
    ON staff_patient_assignments FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- get_my_staff_patients() now also returns the assignment's own id
-- (needed to target a specific row for the label UPDATE below — a
-- caller can legitimately hold TWO active staff_patient_assignments
-- rows for the SAME patient_id under two different organizations,
-- migration 094, so patient_id alone cannot identify which row to
-- update) and display_label. The therapist_relationships UNION branch
-- has no staff_patient_assignments row at all (a structurally different
-- relationship type, unchanged by this migration) so both are always
-- NULL there -- never a fabricated id/label for a connection this table
-- doesn't govern.
-- Adding columns to a RETURNS TABLE changes the function's return type,
-- which CREATE OR REPLACE cannot do in place (SQLSTATE 42P13) — the
-- same reason migration 078 already had to DROP this exact function
-- before its own CREATE.
DROP FUNCTION IF EXISTS public.get_my_staff_patients();
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
RETURNS TABLE (
  organization_id UUID, organization_name TEXT, patient_id UUID,
  first_name TEXT, last_name TEXT, preferred_name TEXT, org_role TEXT,
  address TEXT, location TEXT, assignment_id UUID, display_label TEXT
) AS $$
  SELECT spa.organization_id, o.name AS organization_name, p.id AS patient_id, p.first_name, p.last_name, p.preferred_name, spa.org_role,
    p.address, p.location, spa.id AS assignment_id, spa.display_label
  FROM staff_patient_assignments spa
  JOIN organizations o ON o.id = spa.organization_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.user_id = auth.uid() AND spa.is_active = true

  UNION

  SELECT NULL::UUID AS organization_id, 'Direct Patient Connection' AS organization_name, p.id AS patient_id, p.first_name, p.last_name, p.preferred_name, 'therapist' AS org_role,
    p.address, p.location, NULL::UUID AS assignment_id, NULL::TEXT AS display_label
  FROM therapist_relationships tr
  JOIN patients p ON p.id = tr.patient_id
  WHERE tr.therapist_id = auth.uid() AND tr.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_patients() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_staff_patients() FROM anon;
