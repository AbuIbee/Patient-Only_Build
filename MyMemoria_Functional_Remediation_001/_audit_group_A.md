# Audit Group A — F01, F02, F03, F04, F05, F06, F07, F11, F12
Source-to-runtime contract. Repo pinned at `3279111436458b9e2b2f03dfcf3c27ac6cb3a883`, branch `remediation/mymemoria-functional-001`, clean tree at time of audit.

**Critical caveat applying to every finding below:** the repo contains exactly one tracked migration, `supabase/migrations/001_initial_schema.sql` (544 lines, header "CareCompanion Initial Schema" — a different product name, entirely caregiver/`caregiver_patients`-junction-centric, with zero patient-self-service RLS policies anywhere). Application code references several columns (`profiles.must_change_password`, `profiles.photo_url` via some paths, `medications.schedule`, `medication_logs.medication_name`, `patient_notes.note_type = 'care_partner_personal'`) that **do not exist** in this tracked migration. Since the code paths using `must_change_password` are extensive and clearly load-bearing (password-reset gate), the live Supabase schema has almost certainly been patched out-of-band (ad hoc SQL run directly against the project, matching files like `SUPABASE_MIGRATIONS_TO_RUN.sql` that exist in the local reference export but are **not committed to this repo**). I have no DB credentials and cannot query live schema/RLS directly — every "exists in schema?" answer below is relative to the one tracked migration, flagged UNVERIFIED-AGAINST-LIVE-DB where relevant. This mismatch between tracked migrations and real schema is itself a defect worth a line item in the remediation plan (migrations should be the source of truth).

Also noted, out of scope for this audit: `src/pages/admin/indexError.txt` is a ~41,000-line minified JS bundle checked into `src/pages/admin/`. It is not a source file (looks like an accidentally committed build artifact / crash dump) and was excluded from this analysis. Flag for cleanup separately.

---

## F01 — Login, profile hydration, session restore
**Route/component:** `src/App.tsx` → `AppContent` (session restore `useEffect`, lines 76-203); forced-change rendering at `App.tsx:310-320`; recovery at `src/pages/common/ResetPasswordPage.tsx`.

- `PROFILE_COLUMNS` (`App.tsx:17-18`) selects `must_change_password` from `profiles`. **Claim "must_change_password absent" — REFUTED as a code-level absence**: the column is read at `App.tsx:87-100`, written at `src/services/patientService.ts:120`, `src/pages/admin/AdminPatients.tsx:134`, `src/pages/admin/AdminLayout.tsx:250`, cleared at `src/pages/common/ResetPasswordPage.tsx:43`. It is NOT in the tracked migration's `profiles` table (`001_initial_schema.sql:10-19`). Net: either live DB has it (code depends on it working) and the migration file is stale, or every one of these reads/writes is currently erroring. Given `must_change_password` gating is clearly a shipped, deliberate feature (dedicated forced-reset UI), the far more likely explanation is schema drift, not a non-functional feature — **UNVERIFIED-AGAINST-LIVE-DB, but the tracked migration is provably incomplete.**
- `photo_url`: tracked migration puts `photo_url` on `patients` (`001_initial_schema.sql:62`), **not** on `profiles`. But code at `src/services/patientService.ts:60,82,297` and `src/pages/patient/PatientLayout.tsx:155` selects `photo_url` directly from `.from('profiles')`. This is a genuine source-vs-tracked-schema mismatch; same schema-drift caveat applies.
- `mfa_enabled`: only written, never read back. `src/components/MFASettings.tsx:76,97` writes `profiles.mfa_enabled`. `PROFILE_COLUMNS` (`App.tsx:18`) does **not** include `mfa_enabled`, so session restore never reflects real enrollment state — `restoreUser`/`buildAuthFallbackProfile` (`App.tsx:39-74`) have no `mfaEnabled` field at all. **CONFIRMED**: MFA state is write-only from the client's point of view; nothing downstream can "fabricate" enrollment today only because nothing reads it back, but a UI that shows an MFA toggle without reflecting true state on reload is itself the defect.
- Fallback-from-metadata: `buildAuthFallbackProfile` (`App.tsx:64-74`) derives `role` from `user.user_metadata?.role`, which is client-editable via `supabase.auth.updateUser({data:...})` in general Supabase setups. This fallback only fires when the `profiles` row read returns null (`profile || buildAuthFallbackProfile(...)` at `App.tsx:98`), i.e. for a user with no profile row. It does feed `role` into `restoreUser` → `SET_ROLE`. **Potential privilege-escalation smell, PARTIALLY CONFIRMED**: not reachable for any user who already has a profile row (role then comes only from the trusted `profiles.role` DB column), but is reachable for any authenticated user whose profile row is missing/unreadable (RLS misconfig, deleted row, post-signup race). Minimal repair: never source `role` from `user_metadata` for routing/authorization — treat a missing profile as an error state requiring profile repair, not a role fallback.
- Forced-change gate: triggered only in the initial `restoreSession()` flow (`App.tsx:100-119`) and not re-checked anywhere else once `forcedChange` is cleared via `handlePasswordSet` (`App.tsx:246-267`), which itself re-reads `must_change_password` from DB before clearing (`App.tsx:255-265`) — so the gate cannot be client-side bypassed by skipping `onComplete`. Looks consistently enforced across fresh login and session restore. Recovery flow (`PASSWORD_RECOVERY` event, `App.tsx:193-197`) routes to the same `ResetPasswordPage` but with `forced={false}`populated by `showPasswordReset`, not `forcedChange` — **worth a test**: confirm a `must_change_password=true` account that goes through `PASSWORD_RECOVERY` doesn't end up on the non-forced reset screen and then land at `PatientLayout` with the flag still true (`handlePasswordSet` always re-reads and calls `restoreUser`, so even if `forced` was false the flag itself isn't silently cleared — **low risk, but not proven**, mark for a regression test specifically).

**Minimal safe repair:** stop deriving `role`/authorization from `user_metadata` fallback; add a versioned migration to make `profiles.must_change_password`, `profiles.photo_url`, `profiles.mfa_enabled` (and `phone_normalized`, referenced in `src/lib/identity.ts:51` but likewise absent from the tracked migration) match reality with `IF NOT EXISTS` guards and compatible defaults; add `mfa_enabled` to `PROFILE_COLUMNS` and thread it into `restoreUser`.

---

## F02 — Registration and onboarding
**Flow (admin-provisioned patient path):** `src/services/patientService.ts`, function `createPatientWithAccount` (approx. lines 88-171, exact start line not shown by grep context but body confirmed 90-171):
1. `supabase.auth.signUp` (97-108) — auth user created, no rollback path.
2. `profiles.upsert` (115-122) — **throws on error** (`if (profileError) throw ...`), leaving an orphaned `auth.users` row with no profile if this fails after step 1 succeeded. No compensating action.
3. `patients.insert` (125-142) — throws on error, leaving an orphaned auth user **and** profile row if this fails after step 2.
4. `caregiver_patients.insert` (145-153) — throws on error, leaving auth user + profile + patient row but no caregiver link if this fails after step 3. `caregiver_id` here is the **admin/caregiver performing provisioning**, not the patient — confirms no "self-link" is created for the patient here specifically (relevant to F06 below).
5. `resetPasswordForEmail` (156-165) — wrapped in try/catch that only `console.warn`s; silent on failure, patient would have an account with no way to set a password and no visible error to the operator.

**CONFIRMED**: this is exactly the "fragile client-side sequential provisioning" the work order describes — four sequential writes across three tables with no transaction, no idempotency key, and no compensating rollback. A failure at step 3 or 4 after a retry (e.g. operator double-clicks "create patient") would hit `auth.signUp` again for the same email (which Supabase rejects — "already registered" — but the UI has no handling visible in this function for resuming from a partial state; it would need to be re-driven from `assertUniqueProfileIdentity` in `src/lib/identity.ts` to even detect the collision before attempting signUp again, and this function doesn't call that guard itself; callers would need to).

Did not have budget in this pass to trace the self-serve `createAccount` (public pricing-selection signup) path end-to-end — flagging as **NOT AUDITED, recommend separate pass** before F02 implementation; `src/pages/common/PricingPage.tsx` and `src/pages/common/LoginPage.tsx` are the likely entry points but were not opened in this session.

**Minimal safe repair:** wrap provisioning in a single Postgres function (SECURITY DEFINER RPC) so profile+patient+link are atomic, or add resumable-state tracking (e.g. a `provisioning_status` column) so a retry can detect and complete a partial row set instead of re-running from step 1.

---

## F03 — Medication list and CRUD
**Component:** `src/pages/patient/PatientMedications.tsx`.

- `handleSaveMed` (lines 571-589) inserts into `medications` with a `schedule` field (line 584) built as `med.times.map(...)` and selects it straight back (`medSelect`, line 410, reused at 588: `'...is_active, schedule, created_at, updated_at'`).
- Tracked migration's `medications` table (`001_initial_schema.sql:205-219`) has **no `schedule` column** — schedule is modeled as a separate child table `medication_schedules` (`time TEXT`, `days_of_week INTEGER[]`, `001_initial_schema.sql:247-253`).
- **CONFIRMED** (relative to tracked migration; UNVERIFIED-AGAINST-LIVE-DB per the global caveat): the code's `schedule` JSON-array-on-the-medications-row model and the tracked relational `medication_schedules` child-table model are two different, incompatible representations. Line 74 (`mapRow`) reads `row.schedule || []` back off the medications row returned from Supabase — if the live DB truly only has `medication_schedules`, every medication list render depends on a column that doesn't exist, which would make `.select('...schedule...')` error outright, not silently misbehave — this would be fully broken, not a cosmetic bug, if live schema matched the tracked migration. Given the feature presumably works today in some form (per the audit's P1 classification rather than "fully broken"), the live `medications` table almost certainly already has a `schedule` column added out-of-band, and `medication_schedules` is dead/legacy.

**Minimal safe repair:** pick the already-in-use JSONB-on-row model (lowest migration risk, already what the code writes/reads), add a versioned migration backfilling `medications.schedule JSONB DEFAULT '[]'` if genuinely missing, keep `medication_schedules` untouched (do not drop — unknown consumers), and add a typed `Schedule[]` mapper so `s{i}` synthetic IDs (line 441, 573) aren't silently regenerated differently across saves (currently non-stable: `id: \`s${i}\`` is positional, so reordering times would change dose identity used elsewhere, e.g. in `getStatus`/dose matching at lines 479-491 which key off `time` string, not schedule-row `id` — so this particular non-stability does not currently propagate into F04's dose-identity bug, which keys on `time`/`date`/`medId` directly).

---

## F04 — Mark dose taken/skipped
**Handler:** `logDose`, `src/pages/patient/PatientMedications.tsx:515-553`.

- Optimistic local state is applied unconditionally first (520-527).
- Supabase `upsert` with `onConflict: 'medication_id,date,scheduled_time'` (533-544) requires a UNIQUE/EXCLUDE constraint on exactly those three columns. Tracked migration's `medication_logs` (`001_initial_schema.sql:272-283`) has **no unique constraint at all**, only a PK on `id`. Without that constraint, Postgres will reject the upsert's `ON CONFLICT` clause with `no unique or exclusion constraint matching the ON CONFLICT specification` (42P10) — a hard error, not silent data divergence — **if live schema matches the tracked migration**.
- **CONFIRMED defect regardless of which schema is live**: lines 550-552, `catch { /* Optimistic state stays... */ }` — any Supabase error on this upsert (RLS denial, missing constraint, network failure, timeout) is fully swallowed. The optimistic row (set at 520-527, already showing `status: 'taken'|'skipped'`) is never rolled back on failure. This exactly matches the work order's "never show durable completion on unsuccessful INSERT" violation. On next reload, `localLogs` is rebuilt purely from a fresh Supabase `SELECT` (lines 464-471) — so a failed write **will** revert visually on reload/relogin, but the session the user is in shows a false "taken" confirmation with no error surfaced, and `getStatus` (479-491) will have returned `'taken'` to drive UI (checkmarks, stats at 506-512) for that entire session.
- `recorded_by: patientId` (line 541) is written as a raw string into a `TEXT` column (migration: `recorded_by TEXT NOT NULL`, not a FK) — no actor-type distinction possible from this column alone (patient vs. caregiver vs. admin recording on someone's behalf).

**Minimal safe repair:** on upsert failure, roll back the optimistic log entry (or mark it visually `pending-failed`, not `taken`/`skipped`) and surface a toast; verify/add the `(medication_id,date,scheduled_time)` unique constraint via versioned migration; keep `recorded_by` but consider a parallel typed actor-role column rather than overloading a free-text field.

---

## F05 — Undo medication dose
**Handler:** `undoLog`, `src/pages/patient/PatientMedications.tsx:555-569`.

- Line 556 removes the log from **local state unconditionally**, before any Supabase call is attempted.
- Lines 558-566: `supabase.from('medication_logs').delete().eq(...4 columns...)`, wrapped in `catch { /* Local state already updated; ignore Supabase error */ }` (566-568) — confirms the same silent-swallow pattern as F04, in the opposite direction (removes a completion the backend still has).
- Tracked migration's `medication_logs` RLS (`001_initial_schema.sql:286-306`) defines only `SELECT` and `INSERT` policies — **no `UPDATE` or `DELETE` policy exists at all**. Under Postgres RLS, no policy for a command means that command is denied by default for all rows, for all actors (including the row's own creator), regardless of `USING`/`WITH CHECK` on other commands. **CONFIRMED relative to tracked migration**: as written, `undoLog`'s `.delete()` call cannot succeed for anyone against this schema — not even the acting patient — which matches the work order's "existing policies lack necessary UPDATE/DELETE capabilities" claim exactly. UNVERIFIED-AGAINST-LIVE-DB whether this has already been patched (if it has, the open question becomes whether the live DELETE policy is scoped to actor-ownership or is dangerously broad — cannot determine without reading live policy).
- There is no dedicated "undo" audit trail — a delete, if it succeeded, destroys the row rather than reversing it with a record of the reversal (contradicts "maintain audit semantics" in the work order).

**Minimal safe repair:** do not grant blanket UPDATE/DELETE; add a `SECURITY DEFINER` RPC (`undo_medication_dose(log_id uuid)`) that verifies the caller is the patient who owns the row (or an approved caregiver, pending F06's ownership-resolution fix) and performs a soft-reversal (status change to `'pending'` + an `undone_at`/`undone_by` audit column) rather than a hard delete; don't roll back local state until the RPC confirms success.

---

## F06 — Memories
**Handler:** `src/pages/patient/PatientMemories.tsx`, insert at lines 336-353 (preceded by optimistic add at 320-322, storage upload at 328-330).

- Insert writes `patient_id: patientId, created_by: patientId` (339-340) — the acting patient's own ID as both the owner and the creator. No caregiver/`caregiver_patients` lookup is performed anywhere in this function.
- Tracked migration's `memories` RLS (`001_initial_schema.sql:410-431`) is a single `FOR ALL`/`SELECT` pair, both gated on `EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = memories.patient_id AND cp.caregiver_id = auth.uid())`. For this `INSERT` to be permitted when `auth.uid()` is the **patient's own** session, there would need to be a `caregiver_patients` row with `caregiver_id = patientId` (i.e., the patient linked to themself as their own "caregiver").
- Traced patient provisioning (`createPatientWithAccount`, `patientService.ts:144-153`) — confirms the `caregiver_patients` row created there uses `caregiver_id: caregiverId` where `caregiverId` is the **provisioning admin/caregiver's** ID, explicitly **not** the patient's own ID. No self-link is created by this function.
- **Could not locate, in the time available, any code path that inserts a `caregiver_patients` row with `caregiver_id = patient's own id`.** This leaves two possibilities, both consistent with the work order flagging this as broken and dependent on SEC-003: (a) the live RLS has already been changed away from the tracked `caregiver_patients`-only model to include a patient-self clause (most likely, given the feature presumably renders something today), or (b) memory inserts are in fact failing/denied by RLS today and the "optimistic" UI (320-322) is masking that by only rolling back on a thrown error (332, 350-353) — which `.insert()` would produce on an RLS violation, so in scenario (b) the UI *would* roll back visibly, suggesting (a) is more likely live. **UNVERIFIED-AGAINST-LIVE-DB — flag as the single highest-priority "read live RLS before writing the F06 migration" item.**

**Minimal safe repair (same shape repeated in F07):** add an explicit patient-self-ownership RLS policy (`USING (patient_id = auth.uid())` style, keyed off whatever actually identifies "this patient's own auth user" — note `patients.id` is NOT guaranteed to equal `auth.uid()` in the tracked schema's patient-creation path, `patientService.ts:112,128`, where `patientId = authData.user.id` **is** used as `patients.id`, so for this specific provisioning path `patients.id = auth.uid()` does hold) alongside the existing caregiver policy, rather than a `caregiver_patients` self-link row. Gate this migration on SEC-003 approval per the work order.

---

## F07 — Mood and personal tasks
**Components:** `src/pages/patient/PatientMoodTracker.tsx` (insert at line 729), `src/pages/patient/PatientLayout.tsx` (reads at 206, 210), `src/services/patientService.ts` (reads at 349, 352).

- All reads/writes seen use `.eq('patient_id', patientId)` directly — same shape as F06, no `caregiver_patients` lookup performed from the patient-session code paths.
- Tracked migration RLS for both `tasks` (`001_initial_schema.sql:331-349`) and `mood_entries` (`370-388`) is the identical `caregiver_patients`-gated pattern as `memories`. Same ownership-resolution gap as F06, same UNVERIFIED-AGAINST-LIVE-DB status, same dependency on SEC-003.
- Did not have budget to open `PatientMoodTracker.tsx` in full (only confirmed the `mood_entries` write call site by grep, not its surrounding error handling) — flag for a closer pass before implementing, specifically to check whether it has the same "optimistic-update-swallows-errors" shape as F04/F05 (pattern is repeated at `handleCustomComplete` in `PatientRoutine.tsx`, line 183+, which does use Supabase and should be checked for the same silent-catch pattern since it was adjacent to the confirmed-broken `handleAppTaskComplete` — see F11).

**Minimal safe repair:** same as F06 — explicit `patient_id = auth.uid()` RLS policies for `tasks` and `mood_entries`, gated on SEC-003; audit `PatientMoodTracker.tsx`'s and `handleCustomComplete`'s error handling for the same silent-catch pattern found in F04/F05 before marking this IMPLEMENTED.

---

## F11 — Routine checklist
**Handler:** `handleAppTaskComplete`, `src/pages/patient/PatientRoutine.tsx:171-181`.

```
const handleAppTaskComplete = (taskId: string) => {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const updatedTask = { ...task, status: ..., completedAt: ... };
  dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
  if (updatedTask.status === 'completed') toast.success(...);
};
```

**CONFIRMED, unambiguously**: this function contains zero I/O. It is a synchronous reducer dispatch only (`dispatch({ type: 'UPDATE_TASK', ... })`, line 179) against the in-memory `AppContext` store. No `supabase` call anywhere in the function body. A reload (which rebuilds `state.tasks` from `PatientLayout.tsx:206`'s `SELECT` against the `tasks` table) will revert any completion made through this handler, because nothing was ever written back to that table.

Contrast confirmed with the adjacent `handleCustomComplete` (`PatientRoutine.tsx:183` onward), which does call Supabase for the separate "custom routine items" feature (`customItems`/`patientCustomRoutine` local-storage-migrated table) — meaning the two routine item types ("app tasks" from the shared `tasks` table vs. user-defined "custom items") have divergent, inconsistent persistence today. The work order's description ("reducer-only success") is exactly right for built-in app tasks specifically, not for custom items.

**Minimal safe repair:** make `handleAppTaskComplete` async, write `status`/`completed_at` to the `tasks` table keyed by `id` (and `patient_id` for ownership, pending F07's RLS fix since `tasks` shares the same `caregiver_patients`-gated policy model), keep the existing optimistic `dispatch` for instant feedback but roll back (and toast an error) if the write fails — mirroring the fix needed for F04, not the current silent-catch anti-pattern.

---

## F12 — Care partner personal notes
**Handler:** `fetchCareNotes`/insert, `src/pages/patient/PatientDocuments.tsx:126-184` (read at 130-136, local-storage-migration insert at 146-156); second write site at line 386 (not fully read in this pass — same `note_type` literal, flagged for confirmation it uses the identical shape).

- Both insert sites use `note_type: 'care_partner_personal'` (lines 150, 386) and `caregiver_id: patientId` (line 148, and presumably 384ish — grep hit at :384 for `caregiver_id: patientId`).
- Tracked migration's `patient_notes.note_type` CHECK constraint (`001_initial_schema.sql:164`): `CHECK (note_type IN ('general', 'medical', 'behavior', 'mood', 'activity'))`. **`'care_partner_personal'` is not a member of this set.** If live schema matches the tracked migration, every insert at these two call sites fails a CHECK constraint violation (Postgres error 23514) — a hard error, not silent misclassification, **if** live matches tracked.
- `caregiver_id: patientId` (line 148) is the self-link workaround described in the work order verbatim: `patient_notes.caregiver_id` is `NOT NULL REFERENCES profiles(id)` (migration line 162) with no FK target restricted to a `role='caregiver'` profile — so writing the patient's own profile ID there satisfies the `NOT NULL`/FK constraint without a real caregiver authoring the note. This is confirmed as exactly the "UI submits care_partner_personal... requires caregiver identity" problem, worked around by self-impersonation rather than a schema change.
- Read side (130-136) filters `.eq('note_type', 'care_partner_personal')` — consistent with write side; this feature is internally consistent, just resting on a constraint value and an identity hack that (per tracked migration) shouldn't work.

**Minimal safe repair:** versioned migration adding `'care_partner_personal'` (or a better name, e.g. `'patient_personal'`) to the `note_type` CHECK constraint; stop writing `caregiver_id: patientId` — either make `caregiver_id` nullable for patient-authored notes (schema change) or add a parallel `author_id`/`author_role` pair and leave `caregiver_id` null for this note type. Do not expand `patient_notes` SELECT access as a side effect — this note type should stay patient-own-only, and today's RLS (gated on `caregiver_patients`) does not even cleanly express "author-owns-their-own-note" without the same ownership-resolution fix needed in F06/F07.

---

## Summary vs. work-order claims

| Feature | Work-order claim | Verdict |
|---|---|---|
| F01 | `photo_url`/`must_change_password`/`mfa_enabled` absent from live profile; fallback-from-metadata risk | PARTIALLY CONFIRMED — code depends on fields absent from tracked migration (schema-drift, not necessarily non-functional); `mfa_enabled` write-only confirmed; metadata-fallback escalation path confirmed reachable only for missing-profile edge case |
| F02 | fragile client-side sequential provisioning | CONFIRMED (admin-provisioning path only; self-serve signup NOT AUDITED — separate pass needed) |
| F03 | code references missing `schedule` column | CONFIRMED against tracked migration; UNVERIFIED-AGAINST-LIVE-DB |
| F04 | durable completion shown on failed insert | CONFIRMED unconditionally (silent catch); upsert's `onConflict` target constraint also confirmed absent from tracked migration |
| F05 | missing UPDATE/DELETE policies on medication_logs | CONFIRMED against tracked migration (no policy = default-deny for all actors); undo handler also confirmed to swallow errors and optimistically mutate local state first |
| F06 | self-link workaround / broken ownership resolution | PARTIALLY CONFIRMED — ownership gap confirmed against tracked RLS; could not find an actual self-link row being created anywhere in the audited code, so live behavior UNVERIFIED |
| F07 | same ownership gap for mood/tasks | CONFIRMED same pattern as F06; error-handling around the mood write NOT AUDITED in depth |
| F11 | reducer-only, non-persistent | CONFIRMED unambiguously, with code quoted |
| F12 | invalid note_type + caregiver-identity requirement | CONFIRMED against tracked migration on both counts (CHECK constraint value and self-link-via-caregiver_id pattern) |

**Could not verify at all (no live DB access):** whether any of the above has already been patched directly against the live Supabase project outside of git — this is the single largest source of uncertainty across the whole audit and should be the first thing checked if/when isolated staging or read-only production schema introspection becomes available.
