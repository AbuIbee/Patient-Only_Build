# MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — corrected execution package

Response to `MYMEMORIA_STAGING_ACTUAL_RESULTS_AND_TARGETED_FIXES.md`
(2026-10-16). Every documented conflict (A-G) is resolved below. No
production SQL, no Git operation, no deploy. Release remains **not
authorized**.

## Fixes made, by conflict letter

**A — `002_identity_and_role_contract.sql`.** The role CHECK now includes
`'pending'` from the start (matches `022`'s eventual six-value set
exactly, so `022`'s later DROP+ADD of the identical constraint is a
harmless no-op). Previously, on a database that already has a row with
`role='pending'` (true of production today), the DROP CONSTRAINT would
succeed and the ADD CONSTRAINT would fail, leaving `profiles.role` with
**no CHECK constraint at all** until `022` ran. Closed. This file is safe
to run against staging even though `staging_profile_identity_contract_
002_aligned` already covers similar ground — every statement in it is now
idempotent (column adds, trigger, constraint) and will no-op cleanly
against whatever that migration already installed; it does not need to be
separately skipped.

**B — `010_subscriptions_and_admin_rpc.sql`.** Its `CREATE TABLE IF NOT
EXISTS subscriptions` previously used `user_id` as the primary key with a
9-value status list — the wrong shape (confirmed by `011`/`013`'s own
evidence). Against an EMPTY database (staging's real situation before this
runs), `010` would have been the file that actually created the table, in
that wrong shape, which `013`'s later `ADD COLUMN IF NOT EXISTS`-only
fixups cannot fully correct (cannot move a PK, cannot add a UNIQUE
constraint cleanly, cannot tighten nullability). Fixed: `010`'s table
definition now matches the real, confirmed production shape directly (`id`
PK, `user_id` NOT NULL UNIQUE, the six approved statuses, NOT NULL trial
timestamps with defaults, provider/period columns). `013`'s own `CREATE
TABLE IF NOT EXISTS` is now a true no-op against this. Not used to
bootstrap anything different from production's real shape.

**C — `014_caregiver_relationship_authorization_and_view_hardening.sql`.**
Confirmed and fixed a real bug in the prior patch: a leftover, unconditional
`DROP VIEW IF EXISTS public.therapist_relationship_list` was still present
immediately after the new state-aware DO block that was supposed to
replace it — an artifact of an incomplete edit, not an intentional second
code path. Removed. Only the state-aware block remains; the already-applied
`staging_caregiver_view_invoker_scope_004` fix for `caregiver_patient_list`
is correctly preserved either way.

**D — `005`/`008` release holds.** Neither is in the execution order below.
Both remain explicitly `DO NOT EXECUTE` pending independent SEC-003/SEC-006
clearance — not re-interpreted as satisfied by any other file in this
package (in particular, `014`'s fix for the caregiver-claim defect is
related to SEC-003 but is not treated here as the same thing as an
explicit SEC-003 sign-off). `008` stays commented-out proposal SQL; `005`
stays unexecuted. F06 (Memories patient-self-access) and F14 (Calm Me video
persistence) remain BLOCKED, not IMPLEMENTED — CalmMeDialog.tsx's own
client-side upload block is unaffected either way.

**E — `007_patient_documents_storage.sql`.** The patient-documents table/
bucket/policies portion is unchanged and stays in the execution order. The
separate, unrelated `audio-files` bucket-wide authenticated SELECT grant
is now held (commented out, with an explanatory header matching the 005/
008 pattern) rather than active SQL — it was broadening access based on an
explicitly-flagged, never-verified assumption about that bucket's actual
contents. F13 (Tell Me a Story playback) remains BLOCKED for the same
reason, pending that verification.

**F — `018`/`019` Temporary/Companion vs. existing `is_temp_user()`/
`is_temp_user_expired()`.** Added a prominent reconciliation note directly
in `018` (not a silent fix) explaining: these RESTRICTIVE policies combine
with Postgres's AND semantics, so adding `018`/`019`'s own
`caller_is_temp_user_program()`-based RESTRICTIVE policies alongside the
existing `is_temp_user()`/`is_temp_user_expired()`-based ones can only
narrow access further — it cannot weaken or bypass the existing mechanism,
and does not need to replace it. What is NOT resolved (stated explicitly):
no row has `subscriptions.program` set today, so an already-existing real
temp-user account won't be recognized by `is_my_program_active()` until a
backfill (driven by that account's existing `profiles.temp_user_expires_at`)
runs — a production-specific data migration, out of scope for today
(staging has zero rows to backfill) and not written here. The exact
`is_temp_user()`/`is_temp_user_expired()` definitions are still needed
(query 6 of `09a_STAGING_INSPECTION_READONLY.sql`) before that backfill can
be written.

**G — `026` already applied.** Not in the execution order below. The
staging report confirms both tables exist with RLS enabled (4 policies
each — matching this file's own design). **Verification step, not a
re-run**: compare `026`'s exact policy names/definitions against what
`staging_026_reminders_and_therapist_relationships_schema_gap` actually
installed (query 5 of `09a` gives the real policy names once re-run); if
they differ materially, decide then whether to reconcile — do not replay
`026` to find out.

## New: `027_staging_production_table_parity.sql`

Required handoff item 1 ("exact staging baseline reconstruction for the 17
missing production tables, schema only"). Of the 17, four already have a
creation statement elsewhere in this chain (`subscriptions` → 010/013,
`patient_intake` → 009, `patient_document_uploads` → 007,
`promo_redemptions` → 013) and are not repeated. The remaining 13 are
created in this one new file: `care_partner_checkins`, `care_partner_logs`,
`media_uploads`, `patient_calendar_notes`, `patient_care_partners`,
`patient_emergency_contacts`, `patient_home_photos`,
`patient_loved_one_photos`, `patient_routine_items`, `patient_task_items`,
`audio_stories`, `calm_tracks`, `trial_registrations`.

Column shapes for 10 of the 13 come from this repo's generated client
types (`src/types/supabase.ts`), each one derived from a confirmed
application read/write call site — not a fresh guess. The remaining 3
(`audio_stories`, `calm_tracks`, `trial_registrations`) have no generated
type and no confirmed `src/` call site at all (`trial_registrations`
especially — zero references anywhere in the frontend); their column
*names* and not-null-ness are the production audit's own catalog, but
their exact *types* are a reasonable inference, flagged as such in the
file, not presented as equally confirmed.

**Scope boundary, stated in the file itself:** this is schema parity only.
It does not attempt to replicate production's `block_temp_*`/
`block_expired_temp_*` RESTRICTIVE policies — their exact logic is still
unverified (item F above), and guessing it risks exactly the kind of
"guessed, then wrong" defect already caught once in this package (the
`014` view-column list before the audit was found). Core ownership
policies only (patient owns their own row via `patient_id = auth.uid()`,
matching the established convention everywhere else in this schema; plain
read/admin-write for the two shared catalog tables, matching the audit's
own confirmed policy names for those two specifically).

## Dependency-ordering finding, and why the execution order changes

`016`, `019`, `023`, and `024` each add RESTRICTIVE policies targeting
several of `027`'s 13 new tables (`care_partner_checkins`, `media_uploads`,
`patient_loved_one_photos`, `patient_care_partners`,
`patient_emergency_contacts`, `patient_calendar_notes`,
`patient_task_items`, `patient_routine_items`, `patient_home_photos`).
Every one of those policy-adds is already wrapped in `WHEN undefined_table
THEN RAISE NOTICE ... skipped` — so running them before the tables exist
does not error, it just silently never installs that specific policy.
Running the files in plain numeric order would mean `027` (which creates
the tables) runs AFTER `016`/`019`/`023`/`024` (which need those tables to
already exist), and several real RESTRICTIVE protections would silently
never install.

**Fix: `027` moves to immediately after `013` in the execution order below**
— after every other table-creating file, before every policy-layering file
that depends on its output. No file's own numbering changed; only the
order they are *run* in for this staging pass.

## Execution order (staging, `axurszlibxwwptkczztt`)

1. Re-run `09a_STAGING_INSPECTION_READONLY.sql` if its results are stale;
   otherwise reuse the prior results already in hand.
2. **Do not run:** `001` (historical, already instantiated elsewhere),
   `005` (held, SEC-003), `008` (held, SEC-006), `026` (already applied —
   verify only, per item G above).
3. Run in this exact order:
   `002 → 003 → 004 → 006 → 007 → 009 → 010 → 011 → 012 → 013 → 027 → 014
   → 015 → 016 → 017 → 018 → 019 → 020 → 021 → 022 → 023 → 024 → 025`
4. After the batch: confirm `information_schema.tables` for `public` now
   lists 31 tables (the 14 already present + the 4 already covered by
   007/009/010/013 — wait, those 4 are already part of the 14+already-
   applied count once 010/013 run — restate plainly: 12 legacy baseline +
   reminders + therapist_relationships (14, already there) + the 4 tables
   007/009/010/013 create (patient_document_uploads, patient_intake,
   subscriptions, promo_codes/promo_redemptions) + the 13 new tables in
   `027` = 31 tables total, i.e. production's real 29 plus the 2
   staging-only additions (`reminders`, `therapist_relationships`) that do
   not exist in production).
5. Report back: any error (file + exact message), the full output of
   query 6 from `09a` (the `is_temp_user()`/`is_temp_user_expired()`
   expressions — still needed, see item F), and a comparison of `026`'s
   policy names against this repo's file (item G).

## Still not done — explicitly, not silently

- Phase D (authenticated-session functional/security tests, synthetic
  data cleanup verification) has not started. It depends on this apply
  succeeding.
- Items 2 ("state explicitly how 005/008 are handled") — done above (held,
  unresolved, no code change implies no capability change).
- Item 3 ("resolve the Temporary/Companion conflict and shared-audio
  precondition") — the conflict is reconciled defensively (§F above); it
  is not fully resolved (the backfill and the exact `is_temp_user()` body
  are still open), and the shared-audio grant is held, not resolved (§E).
- No application test results exist yet — nothing has been claimed as
  passing.
- No production SQL, merge, Git push, or Vercel deploy has occurred or is
  authorized by this handoff.
