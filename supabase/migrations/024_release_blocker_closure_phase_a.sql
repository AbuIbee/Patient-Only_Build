-- 024_release_blocker_closure_phase_a.sql
-- MYMEMORIA-MASTER-009-RELEASE-BLOCKER-CLOSURE / PHASE A — three concrete
-- defects confirmed by independent evidence-gathering against migrations
-- 014, 019, 020 (not guessed; each traced to an exact file:line below).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.

-- ============================================================
-- A1. profiles: replace self-referencing admin policies with a
--     SECURITY DEFINER helper (020's own policies are the ONLY case in
--     this entire migration chain of a policy on `profiles` whose USING
--     clause queries `profiles` again — confirmed by grepping every
--     `ON profiles` policy in 001-020; every OTHER "same EXISTS pattern"
--     020's own comment cites — 009/010/011/012/013/014/017/018 — is a
--     policy on a DIFFERENT table querying profiles, not profiles
--     querying itself. 020's citation of those as precedent for ITS OWN
--     self-referencing case does not actually hold.)
-- ============================================================
-- FIX: the same SECURITY DEFINER pattern 016 already established for
-- patient_has_paid_entitlement() — a function owned by the migration-
-- applying role (which Postgres does not subject to its OWN table's RLS
-- unless FORCE ROW LEVEL SECURITY is set, which nothing in this chain
-- ever sets on `profiles`) so the admin check never re-enters `profiles`'
-- own RLS evaluation at all, same-table or not.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_admin IS 'RELEASE-BLOCKER-CLOSURE PHASE A1: replaces the inline EXISTS(SELECT ... FROM profiles) subquery that 020 embedded directly in policies ON profiles itself — the only same-table self-referencing RLS case in this chain. SECURITY DEFINER + table ownership means this function''s own internal SELECT never triggers profiles'' RLS, so no self-reference/recursion risk exists regardless of Postgres version or planner behavior.';

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update other profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete pending signups only" ON profiles;

DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update other profiles"
    ON profiles FOR UPDATE
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete pending signups only"
    ON profiles FOR DELETE
    USING (role = 'pending' AND public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- A2. patients: restore the INSERT grant the self-service intake flow
--     actually needs (confirmed broken by 014's own REVOKE)
-- ============================================================
-- EVIDENCE: 014_caregiver_relationship_authorization_and_view_hardening.sql
-- does, back-to-back: `REVOKE INSERT ON public.patients FROM authenticated`
-- (closing the table-level privilege entirely for every authenticated
-- caller), then `DROP POLICY "Caregivers can create patients"` and adds a
-- NEW policy `WITH CHECK (id = auth.uid())` intended to let a patient
-- create their own record. Postgres checks table-level GRANT privilege
-- BEFORE consulting any RLS policy — a REVOKE makes the new policy
-- unreachable for EVERY caller, not just caregivers. Confirmed against
-- the actual application call site:
-- src/pages/patient/PatientIntakeForm.tsx's own `.from('patients')
-- .upsert({ id: userId, ... }, { onConflict: 'id' })` (userId =
-- state.currentUser.id, matching the policy's own `id = auth.uid()`
-- exactly) IS a direct table call, not the create_patient_with_caregiver
-- RPC — this is the self-service path 014's own new policy was written
-- for, and it would fail at the privilege-check layer the first time any
-- patient with no existing row submits intake.
-- FIX: restore the GRANT. The RLS policy 014 already added (`id =
-- auth.uid()`) is the actual, sufficient protection against the thing the
-- REVOKE was presumably trying to prevent (an arbitrary caregiver
-- inserting a patient record for someone else) — 014's own DROP POLICY
-- of the old permissive "Caregivers can create patients" policy already
-- closes that path independently of this GRANT. Admin-assisted creation
-- is unaffected either way (create_patient_with_caregiver is SECURITY
-- DEFINER and was never gated by this table-level grant).
GRANT INSERT ON public.patients TO authenticated;

COMMENT ON POLICY "Patients can create their own patient record" ON patients IS 'RELEASE-BLOCKER-CLOSURE PHASE A2: this policy was unreachable from 014 through this migration — REVOKE INSERT ON public.patients FROM authenticated (014) blocked every authenticated caller at the privilege-check layer, before RLS. INSERT re-GRANTed above; WITH CHECK (id = auth.uid()) is the real restriction, matching PatientIntakeForm.tsx''s actual self-service call.';

-- ============================================================
-- A3. Temporary-demo isolation: close the gap for four tables omitted
--     from 019's own enumerated FOREACH list (confirmed by grepping every
--     real patient-facing INSERT/UPDATE/DELETE call site against 019's
--     table array — none of these four appear in it, and none appear in
--     019's own "BLOCKERS" comment section as a known, deliberate gap)
-- ============================================================
-- EVIDENCE: `patient_calendar_notes` (PatientReminders.tsx's calendar
-- notes), `patient_task_items` (PatientReminders.tsx's My Tasks),
-- `patient_routine_items` (PatientRoutine.tsx) have NO table-level
-- RESTRICTIVE policy from 019 and no storage-bucket backstop (unlike
-- e.g. patient_loved_one_photos, which 019 already covers directly).
-- `patient_home_photos` (ShowMeHomeDialog.tsx) has its underlying files
-- incidentally covered by 019's `patient-media` bucket policy, but its
-- own metadata TABLE (labels, storage paths) is not — a Temporary-demo
-- account could still read/write the row even if the file bytes are
-- blocked. None of these four tables appears in any tracked migration
-- (001-023) under any name, so their live shape is unconfirmed — this
-- uses the exact same dynamic, table-existence-tolerant FOREACH pattern
-- 019 already established, so an absent table is a no-op, not a failure.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'patient_calendar_notes', 'patient_task_items',
    'patient_routine_items', 'patient_home_photos'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot read %I (RELEASE-BLOCKER-CLOSURE A3)" ON %I AS RESTRICTIVE FOR SELECT USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — temp-user SELECT restriction skipped.', tbl;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot insert into %I (RELEASE-BLOCKER-CLOSURE A3)" ON %I AS RESTRICTIVE FOR INSERT WITH CHECK (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — temp-user INSERT restriction skipped.', tbl;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot update %I (RELEASE-BLOCKER-CLOSURE A3)" ON %I AS RESTRICTIVE FOR UPDATE USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — temp-user UPDATE restriction skipped.', tbl;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot delete from %I (RELEASE-BLOCKER-CLOSURE A3)" ON %I AS RESTRICTIVE FOR DELETE USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — temp-user DELETE restriction skipped.', tbl;
    END;
  END LOOP;
END $$;

-- Not added to the expired-Companion FOREACH (019, lines 210-217) —
-- deliberately: that list is scoped to exactly the three approved Free
-- features (medications, media, documents) a Companion keeps/loses on
-- expiration. Calendar notes/tasks/routine/home-photos are outside that
-- scope on purpose; adding them there would change which features expire
-- for Companion, not fix an isolation gap for Temporary.

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (positive, A1): an admin's `SELECT * FROM profiles` still returns
--   every row (unchanged behavior, now via is_admin() instead of an
--   inline subquery).
-- T2 (regression, A1): an ordinary patient's own-row self-access
--   (001's original policies) is completely untouched by this file.
-- T3 (critical, A2): a brand-new patient account (no existing `patients`
--   row) submits PatientIntakeForm.tsx's real self-service upsert.
--   Expected: succeeds after this file; confirmed-broken (privilege
--   denied) before it, on top of 014 alone.
-- T4 (negative, regression, A2): a caregiver attempts to INSERT a
--   `patients` row for an id that is NOT their own. Expected: still
--   denied — the RLS policy's `id = auth.uid()` check, unaffected by the
--   restored GRANT.
-- T5 (positive, A3): a Temporary-demo account attempts to read/write
--   `patient_calendar_notes`/`patient_task_items`/`patient_routine_items`/
--   `patient_home_photos`. Expected: denied after this file.
-- T6 (negative, regression, A3): a non-Temporary account's own
--   calendar notes/tasks/routine/home-photos access is unaffected —
--   these are RESTRICTIVE policies ANDed onto whatever PERMISSIVE policy
--   already exists; they narrow nothing for a caller for whom
--   caller_is_temp_user_program() is false.
