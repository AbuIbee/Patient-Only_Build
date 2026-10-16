-- 012_profiles_revoke_client_role_authority.sql
-- C02-001 (P0) — protect administrator authority.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- EVIDENCE (read-only; MyMemoria_Production_Audit/04_SUPABASE_SECURITY_AND_SCHEMA.md,
-- SEC-002): "profiles_update permits id=auth.uid() OR is_admin_check() in
-- USING/WITH CHECK, with whole-table authenticated UPDATE grant ...
-- Ordinary non-temp user can change their own role at the database
-- authorization layer." Independently re-confirmed in this codebase: the
-- admin panel's own `saveUser()` (src/pages/admin/AdminLayout.tsx) issues a
-- plain `supabase.from('profiles').update({ role: e.role, ... }).eq('id',
-- u.id)` — under that live policy, this is simultaneously (a) the
-- legitimate "admin edits another user's role" feature AND (b) if called
-- against the caller's OWN id, the exact self-escalation path, since
-- `id = auth.uid()` passes regardless of whether the caller is actually an
-- admin. A frontend-only "don't show this button to non-admins" guard does
-- not close this — the work order explicitly prohibits relying on one.
--
-- APPROACH: Postgres column-level GRANT/REVOKE (independent of RLS row
-- policies, which only ever constrain WHICH ROWS, never WHICH COLUMNS) is
-- used to remove `role` from the set of columns the generic `authenticated`
-- role may write at all, for both INSERT and UPDATE. Every other
-- self-service profile column remains writable, preserving legitimate
-- patient/caregiver edits. Role changes are only possible through the new
-- `admin_set_role()` SECURITY DEFINER RPC below, which runs with the
-- function's own privileges (unaffected by the caller's column grants) and
-- re-checks the caller's trusted role itself — mirroring the exact pattern
-- `admin_set_subscription()` already uses.
--
-- *** ARCHITECTURE HOLD POINT (explicitly not resolved by this file) ***
-- admin_set_role() requires the CALLER to already hold role IN
-- ('admin','superadmin'). This safely prevents further self-escalation and
-- lets an existing admin delegate admin status to someone else, but it
-- does NOT and cannot establish how the very FIRST administrator account
-- is created, since by definition no admin exists yet to call the RPC on
-- their behalf. No approved source of that initial trust was found in any
-- evidence available to this engagement. This file does not invent one —
-- see 01_C02_IMPLEMENTATION_MATRIX.md for the exact question submitted for
-- owner/architect decision. Until that is answered, promoting the first
-- admin requires a direct, out-of-band `UPDATE profiles SET role='admin'
-- WHERE id = '<uuid>'` run by someone with raw database access (bypassing
-- this RPC entirely, by design — that path is not reachable from the
-- application, only from direct DB administration).

-- ── Column-level privilege restriction ──────────────────────────────────────
-- Revoke the existing broad table-level grants, then regrant only the
-- non-privileged, already-self-service columns. `role` is excluded from
-- both lists on purpose. `id` and `created_at` are also excluded: `id`
-- must never change; `created_at` is a historical record.
--
-- CORRECTIVE-002 / CORRECTION C restored `email` to this UPDATE list,
-- because two live application flows (AdminLayout.tsx/AdminPatients.tsx
-- admin edits, and PatientIntakeForm.tsx's self-service save) sent `email`
-- in a plain profiles UPDATE and would have broken outright. That
-- correction explicitly flagged, as an open follow-up, that restoring the
-- column also let any signed-in user overwrite their own `email` with no
-- Supabase Auth confirmation step — i.e. exactly the risk the column was
-- originally excluded to prevent.
--
-- *** CORRECTED AGAIN (FINALIZATION-003 / REPAIR C): `email` is excluded
-- from the UPDATE grant once more — this time with the application code
-- actually fixed instead of merely flagged. All three call sites that
-- previously depended on writing `email` through this grant have been
-- changed to stop doing so:
--   - src/pages/admin/AdminLayout.tsx `saveUser()` and
--     src/pages/admin/AdminPatients.tsx `saveRow()` no longer send `email`
--     in their profiles UPDATE payload at all; their row-edit UI disables
--     the email input with an explanatory tooltip. Changing ANOTHER
--     account's email has no safe, trusted backend path available to a
--     plain browser session (it needs the service-role admin API) — left
--     explicitly unavailable from these screens rather than exposing an
--     unverified write, per this corrective order's own instruction.
--   - src/pages/patient/PatientIntakeForm.tsx (self-service, id =
--     auth.uid()) now detects an actual email change against the value
--     loaded at form-open time and calls `supabase.auth.updateUser({
--     email })` instead of writing `profiles.email` directly — Supabase
--     Auth's own confirmation-link flow, which only applies the change
--     once the new address is confirmed. `profiles.email` is intentionally
--     left as the OLD value by this path (nothing in this project syncs
--     `auth.users.email` back into `profiles.email` after a confirmed Auth-
--     side change — a separate, lower-severity display-staleness gap,
--     flagged below, not fixed here, since building that sync is a new
--     piece of infrastructure, not implied by this corrective order).
-- `provisioning_status` remains granted — CORRECTIVE-002's finding for that
-- column is unaffected by this reversal; nothing about it involves `email`.
--
-- *** RESIDUAL GAP, EXPLICITLY NOT FIXED HERE ***: after a user confirms a
-- new email through the Auth-side flow above, `profiles.email` has no
-- mechanism to ever catch up — it stays showing the OLD address
-- indefinitely (a staleness/display bug, not a security one: the actual
-- login identity is `auth.users.email`, which this change never touches
-- directly, and every confirmed email change still goes through Supabase
-- Auth's own verification regardless). Closing it needs a trigger or
-- webhook reacting to Supabase Auth's own email-change-confirmed event —
-- new infrastructure this corrective order's scope does not call for and
-- this file does not invent.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  first_name, last_name, phone, photo_url, phone_normalized,
  must_change_password, mfa_enabled, provisioning_status, updated_at
) ON public.profiles TO authenticated;

REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (
  id, email, first_name, last_name, phone, phone_normalized,
  must_change_password, mfa_enabled, provisioning_status, created_at, updated_at
) ON public.profiles TO authenticated;

-- `role` therefore has NO INSERT or UPDATE privilege for `authenticated` at
-- all after this file. Any INSERT that still tries to set it will fail
-- with a permission error (safe, visible denial) unless the column has a
-- database DEFAULT — added below so the application's existing INSERT call
-- sites (which this corrective pass updates to stop sending `role` at all)
-- continue to create ordinary patient accounts without needing the column
-- grant. The `handle_new_user()` trigger (001_initial_schema.sql) is
-- SECURITY DEFINER and runs with the function owner's privileges, so it is
-- entirely unaffected by this REVOKE — it continues to set role from
-- `raw_user_meta_data` exactly as before.
DO $$ BEGIN
  ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'patient';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not set profiles.role default — reconcile manually before executing.';
END $$;

-- ── Signup-trigger metadata cap ─────────────────────────────────────────────
-- Column grants alone are NOT sufficient: `handle_new_user()`
-- (001_initial_schema.sql) is SECURITY DEFINER and reads
-- `NEW.raw_user_meta_data->>'role'` directly, uncapped, in the tracked
-- version — `COALESCE(NEW.raw_user_meta_data->>'role', 'caregiver')`.
-- SECURITY DEFINER functions run with the function owner's privileges, so
-- they bypass the column-level REVOKE above entirely. `auth.signUp()`'s
-- `options.data` becomes `raw_user_meta_data` under the CALLER's full
-- control — including an anonymous, unauthenticated caller, since signup
-- itself requires no prior session. Per MyMemoria_Production_Audit
-- SEC-002, "Current signup trigger correctly limits metadata to patient/
-- caregiver" describes the LIVE trigger, not this tracked one — this
-- redefinition brings the tracked version in line with that description
-- (a no-op if live already matches; a real fix if it does not), and
-- additionally defaults anything unrecognized to 'patient' rather than
-- 'caregiver' as a conservative, least-privilege choice. 'admin'/
-- 'superadmin' can never originate from self-service signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    CASE WHEN requested_role IN ('patient', 'caregiver') THEN requested_role ELSE 'patient' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trusted role-assignment RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_role(
  p_user_id UUID,
  p_role TEXT
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change another account''s role';
  END IF;

  IF p_role NOT IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use a separate, explicitly audited action to change your own role, not this RPC';
  END IF;

  UPDATE profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for user %', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_role(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_set_role IS 'C02-001: the only path by which an existing admin may change ANOTHER account''s role. Deliberately refuses to let a caller change their own role at all, even an admin''s own, to keep role changes to a single-party-initiated, auditable action.';

-- ── admin_set_subscription() gate unchanged by this file ───────────────────
-- 011_subscriptions_revoke_client_billing_authority.sql already gates
-- admin_set_subscription() on `profiles.role IN ('admin','superadmin')`.
-- That check now reads a column this file has made unwritable by any
-- client-facing path except admin_set_role() above — so billing authority
-- is now transitively protected by the same trust chain, without needing
-- any change to 011 itself.

-- ── Staging-only authorization tests (described; NOT executed) ─────────────
-- T1 (negative): patient/caregiver/temp actor attempts
--   `update profiles set role='admin' where id=auth.uid()` directly.
--   Expected: permission denied (column privilege, not just RLS).
-- T2 (negative): same actor attempts `insert into profiles (id, email,
--   first_name, last_name, role) values (auth.uid(), ..., 'admin')` for a
--   fresh row (e.g. after deleting their own). Expected: permission denied.
-- T3 (negative): same actor calls `admin_set_role(auth.uid(), 'admin')` or
--   `admin_set_role(<any_id>, 'admin')`. Expected: RAISE EXCEPTION 'Only
--   admins can change another account''s role'.
-- T4 (negative): an actual admin calls `admin_set_role(auth.uid(), ...)`
--   (attempting to change their own role via this RPC). Expected: RAISE
--   EXCEPTION 'Use a separate, explicitly audited action...'.
-- T5 (positive): an actual admin calls `admin_set_role(<other_user_id>,
--   'admin')`. Expected: succeeds; target row's role updates; updated_at
--   advances.
-- T6 (positive, non-privileged edits preserved): a patient updates their own
--   first_name/phone/photo_url via the ordinary client path. Expected:
--   succeeds exactly as before this migration.
-- T7 (positive, legitimate admin-initiated subscription change still works):
--   an admin calls `admin_set_subscription(...)` for another user. Expected:
--   succeeds (depends on 011, unaffected by this file).
-- T8 (negative, trigger-level cap): an anonymous caller signs up via
--   `auth.signUp({ email, password, options: { data: { role: 'admin' } } })`.
--   Expected: the resulting profiles row has role='patient', not 'admin' —
--   the trigger ignores the unrecognized/privileged value.
-- T9 (positive, CORRECTIVE-002 regression — provisioning_status): the exact
--   write patientService.ts createPatient() performs,
--   `update profiles set provisioning_status='complete' where id=<new-
--   patient-id>`, run by the caregiver/admin who created that patient.
--   Expected: succeeds (this is the write the original grant list omitted
--   and this correction restores).
-- T10 (positive, admin name/phone edit still works — FINALIZATION-003
--   reversal check): an actual admin runs the write AdminLayout.tsx
--   saveUser() / AdminPatients.tsx now actually perform (no `email` field),
--   `update profiles set first_name=..., last_name=..., phone=...,
--   updated_at=now() where id=<other_user_id>`. Expected: succeeds (depends
--   on whatever live, untracked admin-bypass row policy already permits the
--   admin to target another user's row at all — unchanged by this file,
--   which only touches the column grant).
-- T11 (negative, FINALIZATION-003 / REPAIR C — the actual fix, not merely
--   flagged this time): a non-admin patient attempts `update profiles set
--   email=<attacker-chosen-value> where id=auth.uid()` directly (bypassing
--   the app entirely, e.g. via a raw REST call). Expected: permission
--   denied (column privilege) — `email` has no client UPDATE grant at all
--   now, for any role, any row. This is the regression test for the exact
--   gap CORRECTIVE-002 left open and FINALIZATION-003 closes.
-- T12 (positive, FINALIZATION-003 — legitimate self-service email change
--   still works, just through the correct path): a signed-in patient calls
--   `supabase.auth.updateUser({ email: newEmail })` (what
--   PatientIntakeForm.tsx now does instead of a raw profiles write).
--   Expected: succeeds via Supabase Auth's own mechanism, independent of
--   this migration's profiles grants entirely (auth.users is a different
--   table, governed by GoTrue, not by this file's REVOKE/GRANT statements);
--   a confirmation is sent to the new address; `profiles.email` remains
--   the OLD value afterward (the flagged, not-fixed, display-staleness
--   gap above) until confirmed and until a sync mechanism exists.
