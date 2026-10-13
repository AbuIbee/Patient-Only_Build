# 02 — Schema and RLS Migration Plan

**None of the SQL below has been executed against any database — local, staging, or production.** All ten files live at `supabase/migrations/002_*.sql` through `010_*.sql` in this branch. Every statement is written defensively (`IF NOT EXISTS`, `DROP ... IF EXISTS` + recreate, `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL END $$`) specifically because the live schema could not be introspected in this pass (see `00_BASELINE_AND_SCOPE.md` — the tracked `001_initial_schema.sql` is known to be stale) and no credentials for a real introspection were available or in scope.

## Why idempotent-by-default, not a diff against live schema
Production (`ktehhvmmwnsbcvpjcmzt`) is a read-only evidence source per the work order, not a migration target, and no isolated staging exists to diff against either. Rather than guess at exact current column sets and risk a migration that assumes something is missing when it already exists (or vice versa), every `ALTER TABLE` uses `ADD COLUMN IF NOT EXISTS`, every `CREATE TABLE` uses `IF NOT EXISTS`, and every `CREATE POLICY`/`ADD CONSTRAINT` is wrapped to no-op if already present. **This does not remove the need for a human to run `supabase db diff` (or equivalent) against the real project before executing anything below** — idempotency makes these safe to *attempt* against an unknown state, not a substitute for actually knowing that state.

## Deployment order and dependencies

| # | File | Depends on | Unlocks |
|---|---|---|---|
| 1 | `002_identity_and_role_contract.sql` | — | F01 (profile columns, role CHECK), F02 (`provisioning_status`) |
| 2 | `003_medication_integrity.sql` | — | F03 (`schedule` column), F04 (unique constraint + `medication_name`), F05 (undo RPC) |
| 3 | `004_patient_self_access_core.sql` | — | F03/F04 (patients can read/write own meds+logs), F07 (mood/tasks), F11 (tasks UPDATE) |
| 4 | `005_memories_patient_self_access_PENDING_SEC-003.sql` | **SEC-003 sign-off** | F06 — do not apply before that |
| 5 | `006_patient_notes_author.sql` | — | F12 |
| 6 | `007_patient_documents_storage.sql` | — | F08 (bucket+table), F13 (audio-files SELECT — confirm bucket-contents assumption first, see file comment) |
| 7 | `008_calm_me_video_PENDING_SEC-006.sql` | **SEC-006 sign-off** | F14 — left commented out; not an executable statement until uncommented post-approval |
| 8 | `009_patient_intake.sql` | — | F09 |
| 9 | `010_subscriptions_and_admin_rpc.sql` | — | F10 |

Files 1–3, 5–6, 8–9 have no interdependency on each other and can be applied in any relative order among themselves; the numbering reflects the owner's stated priority grouping (identity/onboarding → core patient data → documents/intake/admin), not a hard dependency chain. File 4 must stay gated behind SEC-003; file 7 is non-executable as written (commented SQL) and must stay that way until SEC-006 clears.

## Minimal grants — summary of what each migration does NOT do
- No migration grants `anon` SELECT on anything containing patient data. `009_patient_intake.sql` grants `anon` INSERT only, exactly as the work order specifies, and explicitly no SELECT.
- No migration grants a blanket UPDATE or DELETE where the work order prohibits it. `003_medication_integrity.sql` adds **no** UPDATE/DELETE policy on `medication_logs` — reversal is only possible through the `undo_medication_dose()` SECURITY DEFINER RPC, which does its own ownership check inside the function body.
- `010_subscriptions_and_admin_rpc.sql` adds **no** client-facing INSERT/UPDATE policy on `subscriptions` at all — the only write path is the `admin_set_subscription()` RPC, which re-verifies admin role server-side regardless of what any client UI sends.
- `004_patient_self_access_core.sql` and `006_patient_notes_author.sql` are strictly additive (new policies alongside existing caregiver policies) — no existing caregiver-facing policy is narrowed, widened, or removed.
- `005_...PENDING_SEC-003.sql` is withheld from the "safe to apply now" set entirely, by file-naming convention and by not being bundled into any other file.

## Backfill verification plan (for whoever executes this against real staging/production)
1. **Before any `ALTER TABLE ... ADD COLUMN`:** run `\d <table>` (or `information_schema.columns`) and confirm which proposed columns already exist with which types/defaults; remove or adjust any statement that would conflict (e.g., if `profiles.must_change_password` already exists as `NOT NULL` with no default, the `ADD COLUMN IF NOT EXISTS ... DEFAULT false` is a no-op and fine; if it exists with an incompatible type, this migration will need manual adjustment first).
2. **Before `004`/`005`/`006`'s new RLS policies:** run `SELECT * FROM pg_policies WHERE tablename = '<table>'` for each affected table and confirm no existing policy already covers the patient-self case (possibly under a different name) — applying on top of an already-patched live policy is harmless (additive OR-combined policies), but duplicate policies with the same semantic intent should be cleaned up for clarity, not left stacked.
3. **Before `003`'s unique constraint on `medication_logs(medication_id, date, scheduled_time)`:** run a duplicate-check query (`SELECT medication_id, date, scheduled_time, COUNT(*) FROM medication_logs GROUP BY 1,2,3 HAVING COUNT(*) > 1`) first — if live data already has duplicates (plausible, since the application code has been silently swallowing upsert errors per F04's finding), the `ADD CONSTRAINT` will fail and those rows need deduplication before the constraint can be added.
4. **Before `010`'s `subscriptions.trial_ends_at` nullability is relied upon:** confirm the live column's actual nullability; if it's already nullable, this is a no-op; if `NOT NULL` with the `'2099-12-31'` convention baked into existing rows, decide whether to backfill those to `NULL` or leave them (the application code no longer writes that sentinel, but doesn't need to rewrite history either).
5. **After every step above:** re-run this pass's own `tests/unit/` suite plus a manual smoke pass of the specific feature against the real staging environment before considering any single migration "deployed".

## Recovery plan
- Every `ALTER TABLE ... ADD COLUMN` here is additive and non-destructive; rollback is `ALTER TABLE ... DROP COLUMN IF EXISTS <name>` for any column this pass introduced, listed per-file in each migration's own header comment.
- Every new RLS policy can be rolled back with `DROP POLICY IF EXISTS "<exact name>" ON <table>` (names are written verbatim in each file).
- The two new RPCs (`undo_medication_dose`, `admin_set_subscription`) can be rolled back with `DROP FUNCTION IF EXISTS public.<name>(...)`; doing so without also reverting the corresponding application code would break F05/F10's UI (the client would call a function that no longer exists) — revert code and function together.
- `009_patient_intake.sql` and `010_subscriptions_and_admin_rpc.sql` each propose a `CREATE TABLE IF NOT EXISTS` for a table that may already exist live under a different (unknown) shape — if the live version differs from what's proposed here, **do not run these as-is**; diff first and hand-adjust.
