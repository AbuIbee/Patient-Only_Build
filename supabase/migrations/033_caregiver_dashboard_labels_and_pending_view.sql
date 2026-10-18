-- 033_caregiver_dashboard_labels_and_pending_view.sql
-- OWNER: CAREGIVER DASHBOARD-FIRST NAVIGATION
--
-- STAGING-TARGETED. Not yet applied to production.
--
-- Two additions, both scoped to the EXISTING caregiver_patients /
-- pending_caregiver_registrations tables (migrations 001/014/030) — no new
-- tables, per item 4's "do not require a schema change if a suitable
-- secure existing field can be reused": caregiver_patients is exactly the
-- right place for a per-(caregiver,patient)-relationship display label,
-- since different caregivers of the same patient may want different
-- labels, and the table is already scoped + RLS-protected per relationship.
--
-- §1 — display_label: a caregiver-chosen friendly name for a patient card.
-- Never touches patients.first_name/last_name/preferred_name (the
-- patient's actual identity) or patients.id (immutable). Scoped to the
-- caregiver's OWN relationship row only — a caregiver can never set or
-- read another caregiver's label for the same patient, let alone an
-- unrelated patient's record.
ALTER TABLE caregiver_patients ADD COLUMN IF NOT EXISTS display_label TEXT;

DO $$ BEGIN
  ALTER TABLE caregiver_patients ADD CONSTRAINT caregiver_patients_display_label_length
    CHECK (display_label IS NULL OR char_length(display_label) <= 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No UPDATE *policy* exists on caregiver_patients at all today (confirmed:
-- 001 only ever added SELECT/INSERT/DELETE, and 014 revoked client INSERT
-- entirely without adding UPDATE). But `authenticated` already holds
-- Supabase's default TABLE-LEVEL UPDATE grant on this table (confirmed via
-- information_schema.table_privileges — it was never REVOKEd by any prior
-- migration, unlike profiles in 012). A column-scoped GRANT alone does NOT
-- shrink an existing broader grant — Postgres privileges are additive —
-- so the REVOKE below is required first, exactly mirroring 012's own
-- REVOKE-then-GRANT pattern for profiles. Without it, the RLS policy below
-- would be the only thing standing between a caregiver and rewriting
-- caregiver_id/patient_id/relationship_type/is_primary on their own row
-- (WITH CHECK catches a caregiver_id reassignment away from themselves,
-- but nothing would stop is_primary/relationship_type from being rewritten
-- arbitrarily) — confirmed by a live staging test before this fix.
REVOKE UPDATE ON public.caregiver_patients FROM authenticated;
GRANT UPDATE (display_label, updated_at) ON public.caregiver_patients TO authenticated;

DO $$ BEGIN
  CREATE POLICY "Caregivers can set their own display label for a patient"
    ON caregiver_patients FOR UPDATE
    USING (caregiver_id = auth.uid())
    WITH CHECK (caregiver_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §2 — get_my_pending_registrations(): powers the dashboard's "incomplete
-- registration" state (item 5 — "clearly show the incomplete status and
-- available recovery action without displaying a patient card as fully
-- registered"). pending_caregiver_registrations has ZERO client-facing
-- policies by design (migration 030) — this is the one, narrow,
-- SECURITY DEFINER read path, scoped to the caller's own caregiver_id,
-- exactly like every other trusted-RPC-only table in this schema.
-- LEFT JOINs to profiles to report whether the patient's Auth account was
-- at least created (provisioning_status='profile_created') — if so, the
-- existing caregiver_claim_new_patient() RPC can still complete the
-- registration from the dashboard with no re-signup/duplicate risk; if
-- not (e.g. Auth account creation itself failed), resumable_patient_id is
-- null and the dashboard offers no false "resume" action.
CREATE OR REPLACE FUNCTION public.get_my_pending_registrations()
RETURNS TABLE (
  registration_id UUID,
  claim_token UUID,
  patient_first_name TEXT,
  patient_last_name TEXT,
  patient_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  resumable_patient_id UUID
) AS $$
  SELECT
    r.id, r.claim_token, r.patient_first_name, r.patient_last_name, r.patient_email, r.created_at,
    p.id AS resumable_patient_id
  FROM pending_caregiver_registrations r
  LEFT JOIN profiles p
    ON lower(p.email) = lower(r.patient_email)
    AND p.role = 'patient'
    AND p.provisioning_status = 'profile_created'
  WHERE r.caregiver_id = auth.uid()
    AND r.consumed_at IS NULL
  ORDER BY r.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_pending_registrations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_registrations() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_registrations IS 'CAREGIVER DASHBOARD-FIRST NAVIGATION item 5: lists the caller''s OWN unconsumed pending_caregiver_registrations rows, scoped by auth.uid() inside the function — never trusts a caller-supplied caregiver id. Read-only; never creates, claims, or deletes anything.';

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS EXECUTED (real isolated staging
-- project, synthetic identities, cleaned up afterward):
-- ============================================================
-- T1 (positive): the owning caregiver can UPDATE display_label for their
--     own caregiver_patients row.
-- T2 (negative): an unrelated caregiver (no caregiver_patients row for
--     that patient) cannot UPDATE display_label — 0 rows affected, not an
--     error (ordinary RLS row-filtering), and a direct SELECT by that
--     unrelated caregiver returns 0 rows for the same patient.
-- T3 (regression): caregiver_id/patient_id/relationship_type/is_primary
--     remain unwritable by authenticated (column grant limited to
--     display_label/updated_at only) — attempting to UPDATE caregiver_id
--     is rejected at the column-privilege layer, independent of RLS.
-- T4 (positive): get_my_pending_registrations() returns only the calling
--     caregiver's own unconsumed registrations; resumable_patient_id is
--     populated when a matching profile_created profile exists and null
--     otherwise (both cases exercised).
-- T5 (negative): a different caregiver's call to
--     get_my_pending_registrations() returns zero rows for the first
--     caregiver's pending registrations.
