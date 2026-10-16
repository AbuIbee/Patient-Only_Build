-- 015_profile_email_sync_from_auth.sql
-- MYMEMORIA-FUNCTIONAL-REPAIR-004 — REPAIR 2: verified email synchronization
-- between Supabase Auth's authoritative identity and public.profiles.email.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database. No production, staging,
-- or local database connection was used to produce it. No Auth-side
-- behavior (confirmation emails, token expiry, GoTrue's internal state
-- machine) is verified at runtime by this engagement — it is relied upon
-- exactly as documented, and the staging-only test section at the bottom
-- says precisely what would need to be run, by the owner, in an isolated
-- environment, to confirm it.
--
-- BACKGROUND: 012_profiles_revoke_client_role_authority.sql (FINALIZATION-003
-- / REPAIR C) removed `email` from `profiles`' client UPDATE grant entirely
-- and routed the one legitimate self-service email-change path
-- (src/pages/patient/PatientIntakeForm.tsx) through
-- `supabase.auth.updateUser({ email })` instead of a raw table write. That
-- closed the "overwrite your own verified email with no confirmation"
-- exposure, but left an explicitly flagged, not-yet-fixed gap: nothing
-- updates `profiles.email` after the Auth-side change is actually
-- confirmed — it stays showing the OLD address indefinitely. This file
-- closes exactly that gap, and only that gap.
--
-- WHY THIS IS SAFE TO DRIVE OFF `auth.users.email` SPECIFICALLY: Supabase
-- Auth (GoTrue) only ever writes the CONFIRMED address into `auth.users.email`
-- itself. While a change is pending confirmation, the new, not-yet-verified
-- address lives in GoTrue's own internal pending-change state (not in
-- `auth.users.email`) — `auth.users.email` does not change until the user
-- completes whatever confirmation GoTrue's project settings require (a
-- single link, or both-address "secure email change" confirmation). A
-- trigger that fires on a change to `auth.users.email` itself therefore:
--   - never fires for a pending, unconfirmed, or abandoned/expired request
--     (satisfies "pending or rejected email changes must not update the
--     profile prematurely" — there is nothing to react to until GoTrue
--     itself has already treated the change as confirmed);
--   - fires exactly once per actually-confirmed change, with the real,
--     final, authoritative address already in `NEW.email`.
-- This file does not re-implement or second-guess GoTrue's own
-- confirmation logic — it reacts strictly after the fact, to a column
-- whose write semantics are already Auth's own guarantee, not something
-- this migration invents or verifies independently.
--
-- SCOPE, PRECISELY: the trigger function below touches exactly one column
-- (`profiles.email`) on exactly one row (`WHERE id = NEW.id` — the SAME
-- auth user whose row the trigger fired for; there is no path to any other
-- row). It does not touch `role`, `subscriptions`, admin/organization
-- state, or any other `profiles` column. It is not recursive: it writes to
-- `profiles`, which has no trigger that writes back to `auth.users`, so
-- there is no cycle. It runs SECURITY DEFINER (the same established
-- pattern as `handle_new_user()` in 001_initial_schema.sql, which also
-- must write into `public.profiles` from an `auth.users` trigger) — this
-- grants it no NEW capability beyond what that already-approved trigger
-- has; it is not a general-purpose escalation path, since its SQL body is
-- fixed and takes no caller-supplied input at all (triggers have no
-- "caller" in the RPC sense — it fires on a row-level event, not a
-- parameterized call a client can invoke directly or influence beyond
-- actually completing Auth's own confirmation flow for their own account).
--
-- *** WHAT THIS FILE DOES NOT DO *** (per this repair order's own scope):
-- it does not add a path for a user to write `profiles.email` directly
-- (that stays revoked, from 012); it does not add an admin-initiated
-- cross-user email-change mechanism (AdminLayout.tsx/AdminPatients.tsx
-- keep that input disabled — no safe backend path exists for an admin to
-- change ANOTHER account's Auth-side email, since that needs the
-- service-role admin API, never available to a plain browser session; this
-- file does not change that). It does not retroactively fix any
-- `profiles.email` value that is ALREADY stale from an email change
-- confirmed before this trigger existed — it only reacts to changes from
-- the moment it is installed onward. Backfilling existing drift (if any)
-- is a one-time, reviewable data operation for the owner to run separately,
-- not something a trigger definition should do.

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Scoped to exactly the row that changed; touches exactly one column.
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.sync_profile_email_from_auth IS 'REPAIR 2 (FUNCTIONAL-REPAIR-004): mirrors auth.users.email into profiles.email after Supabase Auth has already confirmed an email change. Never fires for a pending/unconfirmed change (auth.users.email does not change until GoTrue confirms it). Touches only the email column of the single row whose auth identity changed.';

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- ============================================================
-- STAGING-ONLY AUTHORIZATION/BEHAVIOR TESTS (described for the owner to run
-- in an isolated environment; NOT executed by this migration file or by
-- this engagement — no isolated test database exists, and no Auth-side
-- confirmation flow can be driven from this engagement without one)
-- ============================================================
-- T1 (positive, confirmed change): as user A, call `supabase.auth.
--   updateUser({ email: 'new@example.com' })`, then complete whatever
--   confirmation GoTrue's project settings require (click the emailed
--   link(s)). Expected: once GoTrue applies the change (auth.users.email
--   becomes 'new@example.com'), profiles.email for A's id becomes
--   'new@example.com' too, automatically, with no further client action.
-- T2 (negative, pending/unconfirmed change must NOT update the profile
--   prematurely): as user A, call the same updateUser({ email }) but do
--   NOT click the confirmation link. Expected: auth.users.email for A
--   remains the OLD address (GoTrue's own behavior, not this trigger's);
--   profiles.email for A also remains the OLD address, unchanged — the
--   trigger never fires because its WHEN clause never saw auth.users.email
--   actually change.
-- T3 (negative, failed/expired/abandoned change): same as T2 but the
--   confirmation link is left to expire, or the request is otherwise
--   rejected by GoTrue. Expected: identical outcome to T2 — no partial or
--   premature update to profiles.email under any failure mode, since the
--   trigger has no visibility into, and does not attempt to track, the
--   pending state at all.
-- T4 (positive, cross-user isolation): as user A, confirm an email change
--   to 'a-new@example.com'. Expected: ONLY A's profiles row changes.
--   Snapshot every OTHER user's profiles.email (and specifically B's, a
--   different account) before and after; expected identical — the
--   trigger's UPDATE is WHERE id = NEW.id, naming exactly one row, and
--   NEW.id is fixed by which auth.users row the UPDATE... OF email event
--   fired for.
-- T5 (negative, no other column changes): after T1's confirmed change,
--   diff A's full profiles row before/after (role, subscription-adjacent
--   fields if any were ever added to profiles, first_name, last_name,
--   phone, must_change_password, mfa_enabled, provisioning_status,
--   created_at, updated_at — every column except email). Expected:
--   identical except `email`. Confirms the trigger body's single `SET
--   email = NEW.email` claim is accurate and nothing else moved.
-- T6 (negative, direct-write regression unaffected by this file): as user
--   A, attempt `update profiles set email='attacker@example.com' where
--   id=auth.uid()` directly (bypassing the app). Expected: permission
--   denied — unchanged from 012_profiles_revoke_client_role_authority.sql;
--   this file adds no grant on `profiles.email` for any client role.
-- T7 (negative, admin cross-user change still unavailable): confirm
--   AdminLayout.tsx's and AdminPatients.tsx's email inputs remain disabled
--   and neither sends `email` in its profiles UPDATE payload — unchanged by
--   this file; this migration provides no new path for an admin to change
--   ANOTHER account's email, confirmed or otherwise.
-- T8 (positive, no recursion / no runaway writes): confirm an email change
--   for user A once. Expected: exactly one UPDATE to profiles fires (the
--   WHEN clause's `OLD.email IS DISTINCT FROM NEW.email` guard means a
--   subsequent, unrelated auth.users UPDATE that does NOT touch `email`
--   never re-fires this trigger at all); the UPDATE this trigger itself
--   issues targets `profiles`, which has no trigger writing back to
--   `auth.users`, so there is no second firing to observe.
