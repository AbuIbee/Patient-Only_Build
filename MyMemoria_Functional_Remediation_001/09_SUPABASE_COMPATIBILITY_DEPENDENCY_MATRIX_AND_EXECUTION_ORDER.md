# MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — Phase A/B deliverable

Status: Phase A (dependency matrix) and Phase B (migration package) complete
for everything resolvable without direct database access. Phase C (staging
execution) and the live-enforcement parts of Phase D are handed to ChatGPT
per the owner's division of labor. This document is the single source of
truth for what to run, in what order, and what remains open.

## 0. Evidence sources used

- This repo's `supabase/migrations/001-025` (local proposal set, never
  executed anywhere).
- Owner's verified production findings (work order §5) and staging state
  (work order §6).
- `C:\Users\solod\OneDrive\Desktop\MyMemoria_Production_Audit\` —
  `04_SUPABASE_SECURITY_AND_SCHEMA.md` in particular: a full, real,
  evidence-based catalog of production's 29 tables, every policy name, every
  storage bucket, and specific column-level schema/runtime mismatches. This
  is the SAME evidence source migrations 011/013/023 already cite by name —
  it was not re-derived here, it already existed on disk and was read in
  full for this task.
- Direct inspection of the current frontend (`src/App.tsx`, `src/services/
  patientService.ts`, `src/services/patientIntakeService.ts`,
  `src/pages/admin/AdminLayout.tsx`, `src/pages/patient/PatientCareTeam.tsx`,
  `src/pages/patient/PatientDocuments.tsx`) to confirm which backend
  capabilities actually have a live UI caller today.

No live connection to staging or production was made. This session's
Supabase MCP connector only has access to the `Paid2You` project (never
touched, per the owner's standing instruction) — `get_project` on both
`axurszlibxwwptkczztt` and `ktehhvmmwnsbcvpjcmzt` returned permission
denied. All SQL below is therefore evidence-based, not live-verified, and
is explicitly marked "not yet tested" until ChatGPT runs it against staging
and reports back.

## 1. Headline finding: migrations 002-025 are already safe to apply in
   order, almost unmodified

Audited every statement in `supabase/migrations/002` through `025` for the
two classic non-idempotency traps (bare `CREATE TABLE`/`CREATE POLICY`/
`ALTER TABLE ... ADD COLUMN` without an `IF NOT EXISTS` or `DO $$ ...
EXCEPTION WHEN duplicate_object` guard). Zero bare occurrences found in
002-025. Every `CREATE OR REPLACE FUNCTION` in the chain re-defines its
function from scratch rather than assuming an earlier-numbered migration
already created it (confirmed for `admin_set_subscription`,
`provision_free_subscription`, `redeem_promo_code`, `admin_set_role`,
`handle_new_user`). Only `001_initial_schema.sql` has bare, non-idempotent
DDL — and per the owner's own instruction, 001 must never be replayed
against either staging or production (both already have a real `profiles`/
`patients`/etc. schema that predates this repo's migration history; 001
would fail outright with "relation already exists").

**Practical consequence:** this reconciliation does not need a from-scratch
rewrite. It needs: skip 001, apply 002-025 in order (two files below were
corrected in place), then apply the one new file (026) this task adds.

## 2. Corrections made to existing files

### 2.1 `014_caregiver_relationship_authorization_and_view_hardening.sql` — patched

**Original defect:** the file's SEC-001 fix was `DROP VIEW IF EXISTS
public.caregiver_patient_list` (and the same for
`therapist_relationship_list`) — a deliberate "no confirmed consumer, fail
closed by removing it" decision written before two things were known: (a)
the production audit's exact column list for the view (one column,
`is_primary`, that file's own replacement draft had not included), and (b)
the isolated staging project already has a **working, applied** fix for
this exact defect — `staging_caregiver_view_invoker_scope_004` — which
hardens the view in place (`security_invoker = true`, anon SELECT removed,
authenticated SELECT kept) rather than dropping it.

Replaying the old "drop" fix against staging would **undo** that
already-applied, working correction. Replaying it against production would
discard a capability for no remaining reason, now that PG15+
`security_invoker` support is proven available (staging's own fix proves
it).

**Fix applied:** replaced the unconditional `DROP VIEW` with a state-aware
`DO $$ ... $$` block: if the view is already `security_invoker=true`
(staging's case after its own fix, or any environment this has already run
against), it is left alone except for an idempotent grant re-assertion
(`REVOKE ... FROM PUBLIC, anon; GRANT SELECT ... TO authenticated` — a
no-op if already correct). If the view exists but is NOT yet hardened
(production's current, confirmed state), it is dropped and recreated with
`security_invoker = true` using the production-audit-confirmed real column
list (`caregiver_id, patient_id, first_name, last_name, preferred_name,
photo_url, dementia_stage, location, is_primary`). `therapist_relationship_
list` gets the same state check, but since neither the production audit's
table catalog nor any local migration confirms this view's real column
list (the audit doesn't list it as existing in production at all — only the
base table `therapist_relationships` is absent, consistent with §5 finding
#5's "trusted program classification... absent" pattern for new objects),
the harden branch for it only fires a `RAISE NOTICE` rather than guessing a
`CREATE VIEW` body. No existing row, in either table, is touched by this
file's changes.

The file's own staging-test descriptions (T1, T12) were updated to match —
they previously asserted the views would be gone after this migration;
they now describe the hardened-in-place behavior.

### 2.2 `026_reminders_and_therapist_relationships_schema_gap.sql` — new file

Two tables the live frontend reads have no migration anywhere in 001-025,
and the production audit's full 29-table catalog confirms both are
genuinely absent from production (not a naming mismatch — a real hole):

- **`reminders`** — read by `PatientLayout.tsx` (dispatched into app state)
  and consumed by `PatientReminders.tsx`. No write path exists anywhere in
  `src/` today, so this migration's policies grant read/manage to the
  patient's own row and to a linked caregiver (the same shape every sibling
  patient-data table already uses), but add no new capability beyond what
  the existing, confirmed read call site needs.
- **`therapist_relationships`** — read by `PatientCareTeam.tsx`'s
  read-only "my care team" screen (a genuinely reachable path, currently
  broken against production because the table doesn't exist — this is not
  dormant code, it's a live query that would 500/empty today). The
  caregiver-write functions in `patientService.ts`
  (`assignTherapistToPatient`, etc.) have zero confirmed UI callers — per
  the owner's explicit instruction, this is recorded as a release
  limitation, not grounds to invent a caregiver/therapist UI. The table and
  its policies are still created with the full, standard
  patient/caregiver/therapist/admin shape (matching every sibling table's
  established convention) so the one confirmed read path works correctly,
  without blocking a future, separately-approved UI from using the same
  table.

Column shapes for both match `src/types/supabase.ts` exactly — the
generated client types this engagement already produced from confirmed
application read/write evidence, not a fresh guess.

## 3. Items already fully addressed by the existing 002-025 chain (no new
   work needed — verified by direct inspection, not re-audited)

| Owner finding (§5) | Addressed by | Note |
|---|---|---|
| #1 29 production tables, #2 zero recorded migrations | n/a | Baseline facts, not a defect to fix |
| #3 `subscriptions.plan` absent | 017 | `ADD COLUMN IF NOT EXISTS plan`, CHECK, Daily Care/Full Support identity |
| #4 trusted Temporary/Companion classification absent | 018 | `ADD COLUMN IF NOT EXISTS program`, CHECK; see §4 below for the one open design question |
| #5 `create_patient_with_caregiver()` absent | 014 | Admin/superadmin-only, per owner's explicit instruction to preserve current implemented (not dormant) behavior — see §5 |
| #6 `is_my_program_active()` absent | 018 | See §4 — functionally correct for "program enrolled at all," open question is which expiry column it should trust |
| #7 `caregiver_patient_list` security-definer view, anon SELECT | 014 (patched, §2.1) | |
| #8 `caregiver_patients` INSERT checks only caregiver's own id | 014 | `REVOKE INSERT`, routes through `create_patient_with_caregiver()` only |
| #9 `profiles` unsafe client role modification | 012 + 002 | 002 adds the missing columns the app already depends on; 012 removes client role-write authority |
| #10 `subscriptions` permissive public UPDATE | 011 (named) + 023 (catalog-driven, closes the "guessed name" gap) | Production audit confirms the exact live name ("Service role can update subscriptions", `USING (true)`) — 023's catalog-driven `DROP POLICY` doesn't need to guess it |
| #11 `music-files` policies too broad | 023 | Patches the one confirmed patient-specific path (`videos/<patientId>/...`, CalmMeDialog); the audit shows the bucket's OTHER policies are bucket-id-only with no per-patient path at all — no other patient-specific content type is confirmed to exist in this bucket today, so no further narrowing is proposed without a confirmed path to protect |
| #12 `patient-documents` bucket absent | 007 | Already idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING` bucket insert, DO-guarded policies) — just never applied. Table itself (`patient_document_uploads`) already exists in production per the audit; only the storage bucket + its policies are missing, and 007 adds exactly that |
| #13 preserve legacy schema/functions | n/a | No migration in this chain drops anything without a state-aware check (see §2.1) |
| `profiles` missing `must_change_password`/`photo_url`/`mfa_enabled`/`phone_normalized` (confirmed by production audit, not in owner's original 13-point list) | 002 | |
| `medications.schedule` missing (confirmed by production audit) | 003 | |

## 4. Open design question — not resolved by this package, needs staging
   evidence before finalizing (does NOT block today's staging apply)

The production audit found `profiles.temp_user_expires_at` already exists,
alongside a comprehensive, already-live set of `block_temp_*`/
`block_expired_temp_*` RESTRICTIVE policies across essentially every
patient-data table (care_partner_checkins, care_partner_logs, medications,
medication_logs, memories, mood_entries, patient_care_partners,
patient_emergency_contacts, patient_intake, patients, profiles,
subscriptions, tasks). No local migration (018/019 included) references
this column or this policy family at all — they were written assuming a
wholly separate `subscriptions.program` + `is_my_program_active()` design,
with no RLS enforcement of their own defined for most of those same tables.

This looks like production already has a working, comprehensive temp-user
expiration mechanism, built independently of (and earlier than) this
engagement's `program`-column design. Two real possibilities, and I cannot
tell which from static evidence alone:

1. `temp_user_expires_at` is the ALREADY-LIVE, real enforcement backbone,
   and `is_my_program_active()` should be rewritten to read from it
   directly (so the frontend's UI signal and the RLS layer's actual
   enforcement can never disagree) — Companion (30-day) would then reuse
   the same column with a longer expiry, with `subscriptions.program` as a
   lightweight "which kind" tag only.
2. `temp_user_expires_at` covers only the pre-existing "Temp User" case and
   is unrelated to a Companion design; building Companion independently via
   `subscriptions.program`/`trial_ends_at` is correct and the two systems
   coexist without conflict.

**Resolving this requires the exact `USING`/`WITH CHECK` expressions of the
`block_temp_*` policies** (not just their names), which is query 6 in
`09a_STAGING_INSPECTION_READONLY.sql`. Staging almost certainly does not
have any of this yet (consistent with the "12-table baseline" description),
so this does not block applying 017/018/019 to staging today — it blocks
finalizing the PRODUCTION migration design, and is listed again in the
production release procedure (§6) as a required pre-step.

## 5. Scope decision already made by the owner — not re-litigated here

`create_patient_with_caregiver()` (014) is admin/superadmin-only. An
earlier phase of this engagement found this blocks ordinary caregiver
self-service patient creation, and flagged it as an open owner decision.
Direct inspection for this task confirmed the entire caregiver-creates-a-
new-patient pathway (`patientIntakeService.createAndProvisionPatient()` →
`patientService.createPatient()` → `create_patient_with_caregiver()`) has
**zero live UI callers** anywhere in `src/pages` — `AdminLayout.tsx`'s own
"Add User" tool only creates an auth user + profile row, never a `patients`
row or caregiver link, and the public `/patient-intake` form only writes to
`patient_intake`. The owner has directed: preserve the currently
*implemented* behavior (admin-only, exactly as migration 014 already
writes it), do not redesign caregiver-led onboarding into a new UI flow,
and record the unreachable capability as a release limitation rather than
a defect to fix. No change was made to 014's authorization model on this
account.

Same treatment for caregiver-driven patient media access: `MediaUploader.tsx`
and `CalmMeDialog.tsx` are hardcoded to `state.currentUser.id` everywhere —
there is no caregiver-authenticated media path in the current frontend to
isolate-but-preserve. Migration 023's music-files fix and migration 007's
patient-documents bucket both already scope correctly to patient-self +
admin; no caregiver-specific storage policy was added, for the same reason.

## 6. Execution order for staging (`axurszlibxwwptkczztt`)

1. Run `09a_STAGING_INSPECTION_READONLY.sql` in full. Paste the complete
   output back before anything else runs.
2. **Do not** run `001_initial_schema.sql`.
3. Run `002` through `025` in exact numeric order (014 is the patched
   version now in the repo). Each file is self-contained and idempotent;
   none should error if objects it creates already exist, and `014`'s view
   handling will no-op cleanly against the already-applied
   `staging_caregiver_view_invoker_scope_004` state once run.
4. Run `026_reminders_and_therapist_relationships_schema_gap.sql`.
5. After every file: `SELECT * FROM pg_policies WHERE schemaname='public'`
   plus a row-count check on `profiles`/`patients`/`caregiver_patients`/
   `subscriptions`, to catch any unexpected error or row-count drift
   immediately rather than after the whole batch.
6. Report back: any error (file + exact message), plus the full output of
   query 6 from `09a` (the `block_temp_*` expressions) — that answer is
   needed before Phase D's Temporary/Companion tests can be finalized, and
   before the production procedure (§6 below... see the actual numbered
   section) can be completed.

Phase D (functional/security verification with synthetic accounts, cleanup
verification) is not yet started — it depends on this apply succeeding and
the open question in §4 being answered. I'll pick it up as soon as results
come back.

## 7. Outstanding items for the final consolidated report

- Verified passing: nothing yet — no SQL has been executed anywhere.
- Verified failing: nothing yet.
- Not yet tested: everything in this package, pending ChatGPT's staging run.
- Unresolved blocker (external, not fixable from this session): no
  Supabase MCP access to either `axurszlibxwwptkczztt` or
  `ktehhvmmwnsbcvpjcmzt` — resolved by the owner's own direct-access path
  via ChatGPT, not by this session.
- Unresolved design question (not a blocker to today's staging apply): §4
  above.
- Confirmed release limitation (not a defect): caregiver-led patient
  registration and caregiver-driven media access exist only as backend
  code; no live UI reaches either today (§5).
