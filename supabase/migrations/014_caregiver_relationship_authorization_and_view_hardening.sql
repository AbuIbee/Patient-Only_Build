-- 014_caregiver_relationship_authorization_and_view_hardening.sql
-- MYMEMORIA-CRITICAL-REPAIR-EXECUTION-001 — REPAIR 1 (SEC-001) + REPAIR 2 (SEC-003).
-- CORRECTED under MYMEMORIA-CRITICAL-REPAIR-CORRECTIVE-002, CORRECTION A + B —
-- see the "*** CORRECTIVE-002 ***" block below for what changed and why.
-- CORRECTED AGAIN under MYMEMORIA-CRITICAL-REPAIR-FINALIZATION-003, REPAIR A
-- — see the "*** FINALIZATION-003 ***" block further below: the
-- CORRECTIVE-002 version still let ANY caregiver/admin claim ANY existing
-- role='patient' profile merely by knowing its id, as long as no `patients`
-- row existed yet. Edited in place (same file/number) rather than
-- superseded by a new file, matching this project's own established
-- convention for correcting an unexecuted draft of its own (e.g.
-- 011_subscriptions_revoke_client_billing_authority.sql's C02-009 rollback-
-- section correction) rather than a draft superseded by new schema
-- evidence (e.g. 013 vs 010/011).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database. No production, staging,
-- or local database connection was used to produce it.
--
-- SCHEMA EVIDENCE: the tracked 001_initial_schema.sql names caregiver_
-- patients' relationship column `relationship` with no `updated_at`. The
-- generated client types (src/types/supabase.ts, introspected from the
-- real schema — the same evidence source 011/013 already relied on for
-- `subscriptions`) show the REAL live column is `relationship_type` (a
-- RelationshipType enum: 'daughter'|'son'|'spouse'|'professional'|'friend'|
-- 'primary'|'secondary'), plus `updated_at`. This file is written against
-- that real shape, with a defensive ALTER TABLE in case it runs against a
-- database that still only has 001's tracked shape.

-- ============================================================
-- *** CORRECTIVE-002 *** — why claim_unclaimed_patient() was replaced
-- ============================================================
-- The original fix in this file (claim_unclaimed_patient()) let any
-- caregiver attach themselves to any EXISTING patient_id as long as nobody
-- had claimed it yet — "first-claim-wins." MYMEMORIA-CRITICAL-REPAIR-
-- CORRECTIVE-002 correctly identifies this as still insufficient: a caller
-- who simply knows (or guesses, or enumerates) an unclaimed patient_id
-- could claim a REAL existing patient record that a caregiver/admin created
-- for a legitimate reason but had not yet linked themselves to (e.g. a
-- retry window, an operator error, or any future flow that creates a
-- patients row before its caregiver link). "No existing relationship yet"
-- is not evidence of "this caller is authorized to create one."
--
-- THE CORRECTED MODEL: patient creation and the initial caregiver link are
-- no longer two separable operations (create patients row, THEN separately
-- claim it) — they are now a single atomic function,
-- create_patient_with_caregiver(), which creates a BRAND NEW patients row
-- and its caregiver_patients link together, in one transaction. There is
-- structurally no code path left that can "claim" a patients row that
-- already existed before the call — the function's own existence check
-- refuses (fails closed) rather than adopts any pre-existing, unlinked
-- patients row, even one with zero caregivers. This is not "first-claim-
-- wins with smaller windows" — it removes the "claim by id" primitive
-- entirely. See the function body below for the exact guarantee.
--
-- WHAT THIS STILL DOES NOT DO (explicitly, per CORRECTION A's own
-- instruction not to invent authorization where the data model can't
-- support it): there is no mechanism, anywhere in this codebase, for a
-- SECOND caregiver to be added to an ALREADY-EXISTING patient — no pending-
-- request table, no patient-approval UI, no admin-mediated "add caregiver"
-- RPC. create_patient_with_caregiver() only ever operates on a patient_id
-- that does not yet have a patients row at all. "Existing-patient
-- connections require a separately authorized relationship mechanism" is
-- satisfied by continuing to refuse ALL such connections (REVOKE INSERT,
-- no replacement policy) rather than inventing one — this is the fail-
-- closed outcome the corrective order explicitly permits when "the
-- existing data model cannot establish a secure initial-creator
-- relationship" for that case. If/when the product needs multi-caregiver
-- support, it needs a genuine patient-consent or admin-mediated mechanism
-- designed and approved separately — not a byproduct of this fix.

-- ============================================================
-- REPAIR 1 / SEC-001 (+ CORRECTION B) — views that bypass caller authorization
-- ============================================================
-- EVIDENCE: 001_initial_schema.sql defines
--   CREATE VIEW caregiver_patient_list AS
--     SELECT cp.caregiver_id, p.id, p.first_name, p.last_name,
--            p.preferred_name, p.photo_url, p.dementia_stage, p.location,
--            cp.is_primary
--     FROM caregiver_patients cp JOIN patients p ON cp.patient_id = p.id;
-- The generated client types (src/types/supabase.ts lines 488-502) show the
-- real live view is even richer: it additionally carries `date_of_birth`
-- and `role`.
--
-- A plain (non-`security_invoker`) view in Postgres checks table privileges
-- — and, in practice on every Postgres version Supabase has shipped prior
-- to the security_invoker reloption (PG15+), evaluates row-security
-- policies — using the VIEW's OWNER, not the querying session. Migrations
-- in this project are applied as the `postgres`/migration role, which owns
-- every object it creates and is not subject to the `caregiver_id =
-- auth.uid()` restriction that protects the underlying `caregiver_patients`
-- and `patients` tables directly. Any authenticated (and, depending on the
-- live PostgREST exposure/grants, possibly anonymous) caller who queries
-- `caregiver_patient_list` directly therefore receives EVERY caregiver's
-- EVERY patient's name, date of birth, dementia stage, photo, and location
-- — not just their own linked patients. This is exactly Supabase's own
-- documented "security definer view" anti-pattern.
--
-- Confirmed via `grep -rn caregiver_patient_list src/` that no tracked
-- application code queries this view. `patientService.getCaregiverPatients()`
-- and `PatientCareTeam.tsx` both query the base `caregiver_patients` table
-- directly (patient_id / caregiver_id filtered), which already carries a
-- correctly-scoped `caregiver_id = auth.uid()` / use is scoped by the
-- caller's own session in every confirmed call site. The view is therefore
-- pure attack surface with no confirmed legitimate consumer in this
-- codebase.
--
-- FIX: fail closed. Drop the view outright rather than attempt to harden it
-- in place — there is no confirmed reader to preserve, and "narrowly
-- scoped" here means removing the exposure, not leaving a wider API surface
-- that needs separate, ongoing verification. If a future, currently
-- untracked production consumer is discovered, the safe replacement is NOT
-- to simply recreate this view — it is to recreate it with the PG15+
-- `security_invoker = true` reloption AND `GRANT SELECT` restricted to
-- `authenticated` only (never `anon`/`PUBLIC`), e.g.:
--   CREATE VIEW public.caregiver_patient_list WITH (security_invoker = true) AS
--     SELECT cp.caregiver_id, p.id AS patient_id, p.first_name, p.last_name,
--            p.preferred_name, p.photo_url, p.dementia_stage, p.location
--     FROM caregiver_patients cp JOIN patients p ON cp.patient_id = p.id;
--   REVOKE ALL ON public.caregiver_patient_list FROM PUBLIC, anon;
--   GRANT SELECT ON public.caregiver_patient_list TO authenticated;
-- — and only after confirming the live Postgres major version actually
-- supports `security_invoker` (PG15+); this file does not do that
-- confirmation, so it does not take that path.
DROP VIEW IF EXISTS public.caregiver_patient_list;

-- *** CORRECTIVE-002 / CORRECTION B *** — therapist_relationship_list.
-- Repair 001 flagged this sibling view as "out of scope" and left it
-- untouched; this corrective order explicitly expands scope to include it.
-- The generated client types (src/types/supabase.ts lines 504-515) show its
-- shape:
--   CREATE VIEW therapist_relationship_list AS
--     SELECT tr.therapist_id, tr.patient_id, tr.caregiver_id,
--            tr.relationship_type, tr.is_active,
--            <related first/last name>, <related_type: 'patient'|'caregiver'>
--     FROM therapist_relationships tr JOIN ... ;
-- This is built on `therapist_relationships`, which (001_initial_schema.sql
-- does not define it at all — it is an untracked live table, same situation
-- `subscriptions` was in before 010/011/013) has its own authorization
-- story independent of `caregiver_patients`. Whether its own RLS policies
-- are even correctly scoped is NOT evidence available to this engagement —
-- no tracked migration defines `therapist_relationships`' policies, so
-- there is nothing in this repo to compare the view against. What IS
-- confirmed (`grep -rn therapist_relationship_list src/` — one hit, only in
-- the generated type declarations, never queried) is that it has the exact
-- same STRUCTURAL defect as caregiver_patient_list regardless of the
-- underlying table's own policy correctness: a plain, non-security-invoker
-- view created by the migration/owner role evaluates permissions as that
-- owner, not the caller, for every Postgres version prior to PG15's
-- security_invoker reloption. That structural bypass exists independent of
-- whatever `therapist_relationships`' own RLS says. Same fix, same
-- rationale, same "no confirmed consumer to preserve":
DROP VIEW IF EXISTS public.therapist_relationship_list;

-- ============================================================
-- REPAIR 2 / SEC-003 (CORRECTED under CORRECTIVE-002 / CORRECTION A) —
-- atomic, trusted patient creation; no claim-by-id of an existing patient
-- ============================================================
-- EVIDENCE: 001_initial_schema.sql's only INSERT policy on caregiver_patients
-- was
--   CREATE POLICY "Caregivers can create relationships"
--     ON caregiver_patients FOR INSERT WITH CHECK (caregiver_id = auth.uid());
-- and on patients was
--   CREATE POLICY "Caregivers can create patients"
--     ON patients FOR INSERT WITH CHECK (true);
-- Together these let ANY authenticated caller attach themselves as
-- caregiver to ANY existing patient_id with zero consent check, AND create
-- arbitrary patient shells freely. Every other patient-data table in this
-- schema (medications, mood_entries, memories, tasks, appointments,
-- care_team_members, patient_notes) grants access keyed off membership in
-- `caregiver_patients`, so that single row is the actual authorization
-- boundary for a patient's entire record.
--
-- CONFIRMED LEGITIMATE FLOW (the only caller, src/services/patientService.ts
-- createPatient(), invoked from patientIntakeService.ts's
-- createAndProvisionPatient() with `realUserId = auth.uid()` — never a
-- client-supplied, independent "assign someone else" value): a caregiver/
-- admin signs up a BRAND NEW auth user + profile for the patient first (a
-- separate Supabase Auth API call — see the "boundary this file can and
-- cannot close" note below), THEN creates that patient's `patients` row and
-- caregiver link. No tracked UI flow ever adds a second caregiver to an
-- already-existing patient (`grep -rn caregiver_patients src/pages` — only
-- PatientCareTeam.tsx, a read-only "view my care team" SELECT).
--
-- *** FINALIZATION-003 / REPAIR A *** — the CORRECTIVE-002 version of step
-- 1/2 below still allowed ANY caregiver/admin to call
-- create_patient_with_caregiver(<any existing role='patient' profile id>,
-- ...) successfully, as long as that id had no `patients` row yet. Knowing
-- (by any means — a referral link, a prior unrelated relationship, log
-- exposure, an abandoned signup) an existing profile's UUID was sufficient;
-- nothing tied the CALLER to being the specific caregiver who initiated
-- THAT SPECIFIC patient's enrollment.
--
-- Three candidate fixes were considered and rejected before landing on the
-- one below:
--   (a) Record `auth.uid()` inside `handle_new_user()` (the trigger that
--       creates the profiles row on auth.signUp) as a `provisioned_by`
--       column, then check it here. REJECTED: whether `auth.uid()` even
--       resolves to the CALLING browser's identity inside a trigger fired
--       by GoTrue's own internal write path (GoTrue typically uses its own
--       service connection to perform user creation, not the calling
--       client's JWT) is not something this engagement can verify without
--       a live instance. Building a security check on an unconfirmed
--       assumption about Supabase Auth's internal plumbing is exactly the
--       kind of invented, unverified authorization this corrective order
--       prohibits.
--   (b) A separate "claim this profile_created row as mine" RPC call made
--       immediately after auth.signUp() by the caregiver's own session.
--       REJECTED: this is structurally identical to the "first-claim-wins"
--       pattern CORRECTIVE-002 already ruled out — it just moves the race
--       window from "claiming an existing patients row" to "claiming an
--       existing profiles row." Any OTHER caregiver who also knows that
--       profile id could win the same race.
--   (c) Narrow which callers can use this path at all, to a population
--       that is not open/self-service and therefore cannot be "any
--       unrelated caregiver": admin/superadmin accounts. Per
--       012_profiles_revoke_client_role_authority.sql's own documented
--       architecture, admin accounts are NEVER self-service — the only way
--       to become admin is an EXISTING admin calling admin_set_role() (or,
--       for the very first admin, direct DB administration). This is an
--       ALREADY-ESTABLISHED trust tier in this project (not invented here),
--       just narrowing which existing tier may use this specific
--       capability. ADOPTED.
--
-- *** FUNCTIONAL DEPENDENCY, STATED EXPLICITLY (per this corrective order's
-- instruction: "do not claim caregiver-assisted creation remains
-- functional if this restriction blocks it") ***: the ordinary, existing,
-- SELF-SERVICE "a caregiver signs up for the app, then immediately adds
-- their own family member as a patient" flow — src/pages/common/
-- PricingPage.tsx's self-signup leading into patientIntakeService.ts's
-- createAndProvisionPatient() "Step 2B: Admin/caregiver adding a NEW
-- patient" branch, whenever the logged-in caller's OWN profiles.role is
-- 'caregiver' rather than 'admin'/'superadmin' — IS NOW BLOCKED by this
-- fix. That call will reach create_patient_with_caregiver() and receive a
-- clear, visible `RAISE EXCEPTION` (surfaced to the operator via
-- patientService.ts's existing `Failed to create patient record: ...`
-- error propagation — not a silent failure), not a successful creation.
-- Only an admin/superadmin account can complete this flow until a genuine
-- trusted enrollment mechanism (e.g. a signed, single-use invitation token
-- generated server-side and redeemed atomically, or performing the whole
-- signUp+create sequence from a trusted server endpoint using the service-
-- role key instead of two separate client-driven calls) is designed and
-- approved. This file does not build that — doing so would be inventing a
-- new account-authorization policy, which this corrective order
-- prohibits.
--
-- THE FIX: both the `patients` INSERT grant and the `caregiver_patients`
-- INSERT grant are revoked from `authenticated` entirely. The ONLY path
-- left to create a new patient on someone else's behalf is
-- create_patient_with_caregiver() below — one SECURITY DEFINER function,
-- one implicit transaction, which:
--   1. Requires the caller's own profiles.role to be 'admin' or
--      'superadmin' (verified server-side, not just by which UI button is
--      shown) — satisfies "the transaction establishes that the
--      authenticated actor is authorized to create and initially manage
--      that new record" using a trust tier that is closed/vetted, not
--      open/self-service.
--   2. Requires a profiles row already exist for the target id with
--      role = 'patient' AND provisioning_status = 'profile_created' —
--      i.e. the target must be a genuine, IN-PROGRESS, not-yet-complete
--      provisioning (the auth.signUp + handle_new_user() step that
--      necessarily happens first client-side), never an arbitrary caller-
--      chosen UUID and never an already-fully-provisioned, ordinary
--      existing patient (provisioning_status = 'complete') — closing the
--      "merely supplying an existing profile's UUID" gap this corrective
--      order named, independent of whether a `patients` row exists yet.
--   3. Refuses — fails closed, does not adopt — if a patients row for that
--      id ALREADY exists and is not already linked to this exact caller.
--      This is the actual CORRECTIVE-002 fix: there is no "the patient has
--      no caregiver yet, so I may claim it" path anywhere in this function.
--      The only patients row this function will ever create is one that
--      did not exist before this call.
--   4. Creates the `patients` row and the `caregiver_patients` link in the
--      same function body. If the second INSERT fails for any reason,
--      Postgres rolls back the whole function (including the first
--      INSERT) — a patients row can never exist without its caregiver link,
--      or vice versa, satisfying "failed operations cannot leave partially
--      created, improperly linked patients."
--   5. Is idempotent for a retry by the SAME caregiver of the SAME
--      patient_id (mirrors createPatient()'s existing resumable-
--      provisioning design, including the case where a concurrent
--      duplicate submission loses a unique_violation race against itself).
--
-- A plain `patients` row with `id = auth.uid()` (the patient self-service
-- case — see "Patients can update their own patient record" in
-- 004_patient_self_access_core.sql, and patientIntakeService.ts's "Step 2A:
-- patient fills in own form") is UNAFFECTED: it is preserved by a narrow
-- self-only INSERT policy (`id = auth.uid()`), not by the wide-open
-- `WITH CHECK (true)` this file removes.
--
-- *** THE PRECISE SCHEMA/ARCHITECTURE BOUNDARY THIS FILE CANNOT CLOSE ***
-- (per the corrective order's instruction to "explain the precise schema
-- dependency and fail closed rather than inventing authorization" where
-- true atomicity isn't achievable): `auth.signUp()` is a Supabase Auth
-- (GoTrue) HTTP call, not a SQL statement — it cannot participate in the
-- same Postgres transaction as create_patient_with_caregiver(), because it
-- does not run inside Postgres at all. This means the FULL chain (new auth
-- user -> profile -> patients row -> caregiver link) can never be one
-- atomic unit end-to-end; this was already true before this fix and is a
-- platform constraint, not a gap this migration introduces. What this
-- migration DOES make atomic is the part that is actually the SEC-003
-- authorization boundary — the patients row and its caregiver link, which
-- is exactly where "claim an existing patient" would have to happen, and
-- which is now a single Postgres transaction. The pre-existing, already-
-- documented "resumable, not atomic" design for the auth.signUp step
-- (profiles.provisioning_status) is unchanged and is NOT what was found
-- insufficient by this corrective order.
--
-- *** OPEN OWNER DECISION (not resolved by this file): *** multi-caregiver
-- support (a second family member, a therapist-initiated invite) requires a
-- genuine patient-consent or admin-mediated mechanism (a pending-request
-- table the patient can approve, or an RPC analogous to admin_set_role).
-- This file does not build that. Existing rows (including any patient that
-- may already, today, have more than one caregiver) are completely
-- untouched — this migration never deletes or revalidates any existing
-- row.

REVOKE INSERT ON public.caregiver_patients FROM authenticated;
DROP POLICY IF EXISTS "Caregivers can create relationships" ON caregiver_patients;
DROP FUNCTION IF EXISTS public.claim_unclaimed_patient(UUID, TEXT);

REVOKE INSERT ON public.patients FROM authenticated;
DROP POLICY IF EXISTS "Caregivers can create patients" ON patients;
DO $$ BEGIN
  CREATE POLICY "Patients can create their own patient record"
    ON patients FOR INSERT
    WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Defensive schema alignment: add relationship_type/updated_at if this runs
-- against a database that still matches 001's tracked (not real) shape.
ALTER TABLE caregiver_patients
  ADD COLUMN IF NOT EXISTS relationship_type TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

CREATE OR REPLACE FUNCTION public.create_patient_with_caregiver(
  p_patient_id UUID,
  p_preferred_name TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_diagnosis_date DATE DEFAULT NULL,
  p_dementia_stage TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_affirmation TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_emergency_contact_relationship TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_emergency_contact_email TEXT DEFAULT NULL,
  p_relationship_type TEXT DEFAULT 'primary'
) RETURNS patients AS $$
DECLARE
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_patient_id = auth.uid() THEN
    RAISE EXCEPTION 'A caregiver cannot create a patient record under their own account id';
  END IF;

  -- FINALIZATION-003 / REPAIR A: narrowed from ('caregiver','admin',
  -- 'superadmin') to admin/superadmin only. 'caregiver' is an open, self-
  -- service role with no mechanism tying a specific caregiver session to a
  -- specific patient profile before this call — see the FINALIZATION-003
  -- block above for why that gap cannot be closed any other way without
  -- inventing authorization. This DOES block ordinary caregiver self-
  -- service patient creation; that is the explicitly accepted consequence,
  -- not an oversight.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only an administrator may create a new patient record on behalf of another account. Caregiver self-service enrollment has no verifiable trusted-authorization mechanism yet and is not permitted through this path.';
  END IF;

  -- FINALIZATION-003 / REPAIR A: added `provisioning_status = 'profile_created'`
  -- alongside `role = 'patient'`. Closes "merely supplying an existing
  -- profile's UUID" independent of whether a `patients` row exists: an
  -- ordinary, ALREADY-COMPLETE existing patient (provisioning_status =
  -- 'complete') can never be targeted here, even by an admin, even though
  -- they still satisfy `role = 'patient'` — only a genuinely in-progress,
  -- not-yet-finished provisioning qualifies.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_patient_id AND role = 'patient' AND provisioning_status = 'profile_created'
  ) THEN
    RAISE EXCEPTION 'No patient profile pending provisioning exists for id %. This id must belong to an account currently mid-signup (provisioning_status = ''profile_created''), never an arbitrary or already-complete existing patient.', p_patient_id;
  END IF;

  IF p_relationship_type NOT IN (
    'daughter', 'son', 'spouse', 'professional', 'friend', 'primary', 'secondary'
  ) THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- Idempotent resume: this exact caregiver already completed this exact
  -- creation in a prior attempt (createPatient()'s resumable-provisioning
  -- design can re-enter this function after a crash between steps).
  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF v_patient.id IS NOT NULL THEN
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    -- A patients row exists but is not linked to THIS caller. This is the
    -- exact case CORRECTIVE-002 identified: do not adopt it just because
    -- it happens to have no caregiver (or a different one). Fail closed —
    -- no "first-claim-wins," no guessing which case this is.
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END IF;

  BEGIN
    INSERT INTO patients (
      id, preferred_name, date_of_birth, diagnosis_date, dementia_stage, location, address,
      affirmation, emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_email
    ) VALUES (
      p_patient_id, p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage, p_location, p_address,
      COALESCE(p_affirmation, 'You are safe. You are loved. You are at home.'),
      p_emergency_contact_name, p_emergency_contact_relationship, p_emergency_contact_phone, p_emergency_contact_email
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a race against a concurrent call for the SAME id (e.g. a
    -- double-submit of the same form) — re-check for the caller's own
    -- now-committed link rather than surfacing a raw constraint error.
    SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END;

  -- Same function body as the INSERT above = same implicit transaction: if
  -- this fails, Postgres rolls back the patients INSERT too. A patients row
  -- can never exist without its caregiver link, or vice versa.
  INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary)
  VALUES (auth.uid(), p_patient_id, p_relationship_type, true)
  RETURNING * INTO v_link;

  RETURN v_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_patient_with_caregiver(
  UUID, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_patient_with_caregiver(
  UUID, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.create_patient_with_caregiver IS 'SEC-003 (FINALIZATION-003): the only path by which an admin/superadmin may create a new patient record and its initial caregiver link. Admin/superadmin only — ordinary caregiver self-service enrollment has no verifiable trusted-authorization mechanism and is refused. Atomic (one transaction creates both rows or neither); never claims a pre-existing patients row regardless of whether it already has a caregiver; only targets a profile with provisioning_status=''profile_created'', never an arbitrary or already-complete existing patient; idempotent for the same caller retrying the same patient_id.';

-- caregiver_patients UPDATE/DELETE policies (001's "Caregivers can delete
-- their relationships", USING caregiver_id = auth.uid()) and patients'
-- UPDATE/DELETE/SELECT policies are untouched by this file — this repair's
-- scope is INSERT-time authorization only, per the named defects. Existing
-- rows, and a caregiver's ability to remove their OWN relationship, are
-- unaffected.

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (negative, SEC-001 regression test): as an authenticated non-caregiver
--   (or anon, if PostgREST grants allow), `select * from
--   caregiver_patient_list` and `select * from therapist_relationship_list`.
--   Expected both: `relation "..." does not exist` (42P01) — the views are
--   gone, not merely filtered.
-- T2 (negative, SEC-003 — arbitrary-existing-patient claim, the exact
--   defect CORRECTIVE-002 raised): as admin A, with patient P already
--   existing and having NO caregiver (e.g. created by a different, now-
--   departed flow, or seeded directly for this test) — call
--   `create_patient_with_caregiver('<P>', ...)`. Expected: `RAISE EXCEPTION
--   'A patient record already exists for this id and is not linked to the
--   caller'`; zero rows change in caregiver_patients; P remains without a
--   caregiver (not silently adopted).
-- T2b (negative, FINALIZATION-003 — the unclaimed-PROFILE scenario, as
--   distinct from T2's unclaimed-PATIENTS-ROW scenario): admin A calls
--   `create_patient_with_caregiver('<X>', ...)` where X has a profiles row
--   with role='patient' and provisioning_status='complete' (an ordinary,
--   fully-onboarded, unrelated existing patient with no connection to A at
--   all — ZERO patients-row ambiguity, X's full record already exists) —
--   i.e. "I merely know X's UUID." Expected: `RAISE EXCEPTION 'No patient
--   profile pending provisioning exists for id...'`; zero rows change
--   anywhere; X's existing caregiver relationship(s), if any, are
--   untouched.
-- T3 (negative, direct-table-insert regression): as caregiver A, attempt
--   `insert into caregiver_patients (caregiver_id, patient_id) values
--   (auth.uid(), '<P>')` and `insert into patients (id) values
--   ('<some-other-uuid>')` directly. Expected both: permission denied
--   (INSERT revoked entirely for `authenticated` on both tables).
-- T4 (positive, legitimate new-patient flow — admin only now): admin A,
--   whose own profiles.role is 'admin', calls
--   `create_patient_with_caregiver('<fresh-patient-profile-id>', ...)`
--   where that id already has a profiles row with role='patient' AND
--   provisioning_status='profile_created', and NO patients row yet.
--   Expected: succeeds; exactly one patients row and one caregiver_patients
--   row are created (caregiver_id = A, is_primary = true).
-- T5 (positive, idempotent retry): admin A calls the same RPC again with
--   the SAME patient id used in T4 (still provisioning_status=
--   'profile_created', unchanged by this RPC). Expected: returns the
--   existing patients row unchanged; no duplicate row in either table; no
--   exception.
-- T6 (negative, role gate — ordinary caregiver self-service, the explicitly
--   accepted functional dependency): a user whose profiles.role =
--   'caregiver' (not admin/superadmin) calls
--   create_patient_with_caregiver(...) for a legitimately fresh,
--   'profile_created' target. Expected: `RAISE EXCEPTION 'Only an
--   administrator may create a new patient record...'` — confirms ordinary
--   caregiver self-service patient creation is now blocked, as documented.
-- T6b (negative, role gate — patient role, unchanged): a user whose
--   profiles.role = 'patient' calls create_patient_with_caregiver(...).
--   Expected: same exception as T6.
-- T7 (negative, target must be a real, IN-PROGRESS provisioned patient
--   identity): admin A calls create_patient_with_caregiver() with a
--   p_patient_id that has no profiles row at all (an arbitrary/made-up
--   UUID). Expected: `RAISE EXCEPTION 'No patient profile pending
--   provisioning exists for id...'` (same message as T2b, since both are
--   "this id does not currently qualify" — the exact wording distinguishes
--   them only via the id supplied, not a different code path).
-- T8 (negative, cross-patient isolation — unchanged by this file, plus the
--   FINALIZATION-003 unauthorized-cross-patient case): caregiver A, who
--   legitimately owns patient P1 only, attempts to (a) read P2's
--   `caregiver_patients`/`patients`/`medications`/`memories` rows (P2
--   unrelated, owned by caregiver B) — expected zero rows, enforced by the
--   pre-existing, untouched SELECT policies; and (b) call
--   `create_patient_with_caregiver('<P2>', ...)` even though P2 is a real,
--   existing, 'complete' patient A has genuinely heard of (e.g. via a
--   shared care-team context) — expected the same T2b exception regardless
--   of A's relationship to any OTHER patient; A's legitimate P1 link is
--   unaffected either way.
-- T9 (positive, concurrency — same caller double-submit): fire two
--   concurrent `create_patient_with_caregiver('<new-id>', ...)` calls from
--   the SAME admin A for the SAME brand-new, 'profile_created' patient_id
--   (simulating a double-click), on two separate connections. Expected:
--   exactly one patients row and one caregiver_patients row exist
--   afterward; neither call surfaces a raw unique-violation error to the
--   caller.
-- T10 (negative, concurrency — two different ADMINS racing a real target):
--   fire concurrent `create_patient_with_caregiver('<P>', ...)` calls from
--   two DIFFERENT admins A and B for the SAME patient_id P that has a
--   profiles row (role='patient', provisioning_status='profile_created')
--   but no patients row yet. Expected: exactly one of the two succeeds
--   (creates patients + caregiver_patients for whichever admin's INSERT
--   commits first); the other raises the unique-violation-recovery path's
--   "already exists and is not linked to the caller" exception; exactly
--   one caregiver_patients row exists for P afterward.
-- T11 (positive, patient self-service preserved): a user whose own id
--   equals the patients.id they are inserting (`auth.uid() = id`) performs
--   a direct `insert into patients (id, ...) values (auth.uid(), ...)` (the
--   patientIntakeService.ts "Step 2A: patient fills in own form" upsert
--   path). Expected: succeeds — unaffected by the INSERT revoke, since the
--   new "Patients can create their own patient record" policy covers this
--   exact case.
-- T12 (regression — existing rows preserved): before applying in staging,
--   snapshot `SELECT count(*), array_agg(id ORDER BY id) FROM patients`
--   and the same for `caregiver_patients`; after applying, re-run both.
--   Expected: identical row counts and identical id sets — this migration
--   drops two views, drops two policies (replacing one), revokes two
--   grants, drops one function, and adds one function; it does not touch
--   any existing row.
