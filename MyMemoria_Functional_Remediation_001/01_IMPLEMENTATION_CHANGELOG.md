# 01 — Implementation Changelog

Each entry: exact files/functions touched, before → after behavior, migration dependency, commit. All commits are local to branch `remediation/mymemoria-functional-001`; none pushed/merged/deployed.

---

## F01 — Login, profile hydration, session restore
**Commit:** `6037e4d7`
**Files/functions:**
- `src/App.tsx` — `PROFILE_COLUMNS` const; `restoreUser()`; `buildAuthFallbackProfile()`; `handlePasswordSet()`
- `src/pages/common/ResetPasswordPage.tsx` — `handleSubmit()`
- `src/pages/common/LoginPage.tsx` — `SignInForm.handleSubmit()` (new finding, see below)
- `src/types/index.ts` — `User.mfaEnabled` added

**Before:**
- `buildAuthFallbackProfile()` sourced `role` from `user.user_metadata?.role` — client-editable via `supabase.auth.updateUser()`, reachable whenever a profile row is missing/unreadable.
- `ResetPasswordPage.handleSubmit()` cleared `must_change_password` via `.update()` with no error check; `App.handlePasswordSet()` unconditionally cleared the local `forcedChange` flag before even re-reading the profile, and `restoreUser()` never re-checked `must_change_password` at all — so a failed/raced clear-flag write would not re-block entry.
- **Found during implementation, not in either audit pass:** `LoginPage.tsx`'s own `SignInForm.handleSubmit()` (the actual normal sign-in form) does its own profile fetch and dispatches `SET_USER`/`SET_AUTHENTICATED` directly — it **never checked `must_change_password` at all**, and `App.tsx`'s `onAuthStateChange` handler only listens for `SIGNED_OUT`/`PASSWORD_RECOVERY`, not `SIGNED_IN` — so the forced-password gate was **fully bypassable on every normal login**, not just in the narrow race condition the work order anticipated.
- `mfa_enabled` was write-only (`MFASettings.tsx`) — never read back into session state.

**After:**
- `buildAuthFallbackProfile()` hardcodes `role: 'patient'` (most restrictive), never reads `user_metadata.role`.
- `ResetPasswordPage.handleSubmit()` now checks the `.update()` error and throws (surfacing a toast, not a false "Password set!") if the clear-flag write fails.
- `App.handlePasswordSet()` re-reads the profile and only clears `forcedChange` if `must_change_password` is confirmed `false`; otherwise re-shows the forced screen.
- `LoginPage.SignInForm.handleSubmit()` now selects `must_change_password` and, if true, reloads the page so `App.tsx`'s own (now-correct) `restoreSession` path is the one that decides — rather than duplicating gate logic in two places.
- `mfa_enabled` added to `PROFILE_COLUMNS` and threaded into `restoreUser()` → `User.mfaEnabled`.

**Migration dependency:** `002_identity_and_role_contract.sql` (adds `profiles.must_change_password`, `mfa_enabled`, `photo_url`, `phone_normalized`; broadens `profiles.role` CHECK to include `admin`/`superadmin`, which the tracked schema never allowed at all).

---

## F02 — Registration and onboarding
**Commit:** `6037e4d7`
**Files/functions:** `src/services/patientService.ts` — `createPatient()`

**Before:** four sequential, un-transacted writes (auth.signUp → profiles.upsert → patients.insert → caregiver_patients.insert) with no rollback and no idempotency; a retry after a partial failure would hit "already registered" from `auth.signUp` with no path to resume. Invitation-email failure was swallowed (`console.warn` only).

**After:** checks for an existing profile by email first; if found and `provisioning_status !== 'complete'`, resumes using the existing id instead of calling `auth.signUp` again; if `'complete'`, rejects with a clear duplicate-email error before touching auth at all. `caregiver_patients` link uses `upsert` (idempotent against its existing `UNIQUE(caregiver_id, patient_id)`). Invitation-email failure now throws with an actionable message instead of silently warning.

**Not covered:** the self-serve signup flow (`PricingPage.tsx`/public pricing-selection signup) was flagged "NOT AUDITED" by the audit pass and was **not** touched in this implementation pass either — same resumability gap likely exists there; recommend as a follow-up, not claimed fixed here.

**Migration dependency:** `002_identity_and_role_contract.sql` (`profiles.provisioning_status` column).

---

## F03 — Medication list and CRUD
**Commit:** none (schema-only; no application code changed)
**Finding:** `PatientMedications.tsx` already reads/writes a `schedule` JSONB array directly on the `medications` row — consistent, working code. The tracked `001_initial_schema.sql` instead models schedule via a separate `medication_schedules` child table. Chosen repair: keep the already-in-use JSONB-on-row shape (lowest risk, matches shipped code) and add the column via migration; leave `medication_schedules` in place untouched (unknown consumers).

**Migration dependency:** `003_medication_integrity.sql` (`medications.schedule JSONB DEFAULT '[]'`).

---

## F04 — Mark dose taken/skipped
**Commit:** `cbdfa0e4`
**Files/functions:** `src/pages/patient/PatientMedications.tsx` — `logDose()`

**Before:** optimistic taken/skipped state applied unconditionally; `catch {}` swallowed every upsert error (RLS denial, missing unique constraint, network failure) with a comment stating the optimistic state intentionally stays.

**After:** catches the upsert error explicitly, removes the optimistic temp entry, and shows a toast naming the failure. Durable completion is only ever shown after the write is confirmed.

**Migration dependency:** `003_medication_integrity.sql` (`medication_logs.medication_name` column; `UNIQUE(medication_id, date, scheduled_time)` constraint matching the existing `onConflict` the code already specifies).

---

## F05 — Undo medication dose
**Commit:** `cbdfa0e4`
**Files/functions:** `src/pages/patient/PatientMedications.tsx` — `undoLog()`

**Before:** removed the log from local state unconditionally, then called `.delete()` directly against `medication_logs`, wrapped in a `catch {}` that explicitly ignored the error. Against the tracked RLS (SELECT/INSERT only, no UPDATE/DELETE policy at all), this delete cannot succeed for any actor, including the row's own owner.

**After:** calls a new `undo_medication_dose(p_medication_id, p_date, p_scheduled_time)` RPC. The RPC (not the client) verifies the caller is the owning patient or an approved caregiver, then performs a **soft reversal** (`status → 'pending'`, `taken_time → NULL`, `undone_at`/`undone_by` set) rather than a hard delete, preserving an audit trail. Local state is only cleared after the RPC confirms success. No blanket UPDATE/DELETE grant was added to the table.

**Migration dependency:** `003_medication_integrity.sql` (`undone_at`/`undone_by` columns + the `undo_medication_dose()` SECURITY DEFINER function, `EXECUTE` granted to `authenticated` only).

---

## F06 — Memories
**Status: BLOCKED pending SEC-003** (per explicit work-order text: "dependent on SEC-003 approval")
**Files/functions:** none changed — `PatientMemories.tsx`'s insert/upload error handling (`handleUploaded()`) was already correct (checked both the storage-upload and the DB-insert error, rolled back the optimistic entry on either failure). The only defect is the missing patient-self RLS policy.

**Migration proposal (not applied):** `005_memories_patient_self_access_PENDING_SEC-003.sql` — same `patient_id = auth.uid()` policy shape as F07, written and ready, but deliberately kept in its own file and explicitly labeled pending, per the work order's security gating. **Do not apply without independent SEC-003 sign-off.**

---

## F07 — Mood and personal tasks
**Commit:** none (application code already correct)
**Files/functions:** `PatientMoodTracker.tsx` (`submitMood()`), `PatientLayout.tsx` reads — both reviewed; both already check errors and roll back correctly. No silent-catch pattern found (the audit flagged this as needing a closer look; confirmed clean during implementation).

**Migration dependency:** `004_patient_self_access_core.sql` (patient-self SELECT/INSERT policies on `tasks`, `mood_entries`). Not gated on a named SEC finding in the work order text, unlike F06.

---

## F11 — Routine checklist
**Commit:** `7a601ae8`
**Files/functions:** `src/pages/patient/PatientRoutine.tsx` — `handleAppTaskComplete()`

**Before:** pure synchronous `dispatch({ type: 'UPDATE_TASK', ... })` — zero I/O. A reload (which rebuilds `state.tasks` from a fresh `tasks` SELECT) silently reverted every completion.

**After:** made async; persists `status`/`completed_at` to the `tasks` table keyed by `id` + `patient_id`, with the same optimistic-update-and-rollback-on-failure shape already used by the adjacent (and already-correct) `handleCustomComplete()`.

**Migration dependency:** `004_patient_self_access_core.sql` (patient-self UPDATE policy on `tasks` — the same policy F07 needs).

---

## F12 — Care partner personal notes
**Commit:** `7a601ae8`
**Files/functions:** `src/pages/patient/PatientDocuments.tsx` — the localStorage-migration insert (~L146) and `addCareNote()` (~L368)

**Before:** both write sites used `note_type: 'care_partner_personal'` (not in the tracked `note_type` CHECK, which only allows `general/medical/behavior/mood/activity`) and `caregiver_id: patientId` — the patient's own id written into a column that is `NOT NULL REFERENCES profiles(id)`, as a self-impersonation workaround with no real caregiver authoring the note.

**After:** both sites now write `author_id: patientId` instead of `caregiver_id: patientId`.

**Migration dependency:** `006_patient_notes_author.sql` — adds `patient_notes.author_id`, drops `caregiver_id`'s `NOT NULL`, adds a CHECK requiring exactly one of `caregiver_id`/`author_id` to be set, broadens the `note_type` CHECK to include `care_partner_personal`, and adds patient-self SELECT/INSERT/DELETE policies scoped to `author_id = auth.uid()` only (does **not** widen access to caregiver-authored notes).

---

## F08 — Documents and bills
**Commit:** `7a601ae8`
**Files/functions:** `src/pages/patient/PatientDocuments.tsx` — `uploadDoc()`, `removeDoc()`, `removeBill()`, plus two UI copy strings

**Before:** `uploadDoc()` had no compensating action if the `patient_document_uploads` insert failed after the storage upload already succeeded (orphaned, billed, undiscoverable file). `removeDoc()`/`removeBill()` didn't check the storage `.remove()` error at all. UI text said "up to 5 GB"; the actual code enforces 5 MB (`MAX_DOC_SIZE = 5 * 1024 * 1024`).

**After:** `uploadDoc()` now removes the just-uploaded storage object if the metadata insert fails. `removeDoc()`/`removeBill()` now log (don't silently ignore) a storage-cleanup failure. Both "up to 5 GB" strings corrected to "up to 5 MB".

**Migration dependency:** `007_patient_documents_storage.sql` — proposes the `patient_document_uploads` table (not in tracked migrations at all) and a private `patient-documents` storage bucket with per-patient-folder RLS, since neither exists in version control today.

---

## F09 — Public patient intake
**Commit:** `f7b4c000`
**Files/functions:** `src/services/publicPatientIntakeService.ts` — `createPublicPatientIntake()`; `src/pages/common/PublicPatientIntakePage.tsx` — `handleSubmit()`

**Before:** `.insert(payload).select('id').single()` — under the described RLS (anon INSERT, no anon SELECT), PostgREST returns an empty representation and `.single()` throws `PGRST116`, even though the row was saved. No idempotency key — a retry on this false failure would create a duplicate row.

**After:** the client generates its own receipt id (`crypto.randomUUID()`) and the insert never asks for a representation back — no SELECT grant is ever needed. The page holds that id in a `useRef` so a retry of the *same* attempt reuses it; a duplicate-key error (`23505`) on retry is treated as the already-submitted success case rather than an error, via `isUniqueConstraintError()` (reused from `src/lib/identity.ts`).

**Migration dependency:** `009_patient_intake.sql` — the `patient_intake` table itself does not exist in tracked migrations; proposes it with anon-INSERT-only (no anon SELECT ever) and admin-only review SELECT/UPDATE.

---

## F10 — Admin account types
**Commit:** `f7b4c000`
**Files/functions:** `src/pages/admin/AdminLayout.tsx` — `saveAccountType()`

**Before:** built the full `subscriptions` payload (tier/status/trial_ends_at/promo_expires_at) client-side and `upsert`'d it directly from the browser — no server-side validation of the tier/status transition. `trial_ends_at` was given a fixed `'2099-12-31'` "never" value specifically for `tier === 'master'`, implying the author had already hit a NOT NULL constraint live and routed around it client-side for that one case — while `canceled`/`companion` (which pass `null`) would hit the same constraint unaddressed.

**After:** calls a new `admin_set_subscription()` RPC instead of upserting directly. The RPC re-verifies the caller's `profiles.role` is `admin`/`superadmin` and validates `tier`/`status` against an explicit allow-list server-side, independent of whatever the admin UI sends. The client no longer needs (or sends) the `'2099-12-31'` workaround.

**Migration dependency:** `010_subscriptions_and_admin_rpc.sql` — the `subscriptions` table itself does not exist in tracked migrations; proposes it with `trial_ends_at` **nullable**, no client-facing INSERT/UPDATE policy at all, and the `admin_set_subscription()` SECURITY DEFINER RPC as the only write path.

---

## F13 — Tell Me a Story playback
**Commit:** none — no application code change needed
**Finding:** `TellMeAStoryDialog.tsx` already uses `createSignedUrl` (never `getPublicUrl`) for the `audio-files` bucket — the component itself follows the private-bucket pattern correctly. The work order's claim is about a missing `storage.objects` SELECT policy on that bucket, which cannot be confirmed or denied from this repo (no storage policy SQL exists anywhere in version control for any bucket).

**Migration proposal (not applied):** `007_patient_documents_storage.sql` includes a narrowly-scoped SELECT policy proposal for `audio-files`, explicitly caveated that it assumes the bucket holds only licensed/shareable story content — **this assumption must be confirmed against the actual bucket contents before applying**, or scoped to a subfolder if any private uploads share the bucket.

---

## F14 — Calm Me video upload validation
**Status: BLOCKED pending SEC-006** (per explicit work-order text)
**Commit:** `f0e3284e`
**Files/functions:** `src/components/CalmMeDialog.tsx` — `handleVideoUpload()`

**Before:** UI enforced a 5 GiB client-side limit while the work order states the actual bucket cap is 250 MiB; any file between those sizes would pass the client check and fail server-side with a generic error. Videos were written into `music-files`, a bucket shared with non-video content, under unknown/unreviewed storage policies.

**After:** two changes. (1) The size constant was reconciled to 250 MiB with an accurate error message — a pure correctness fix, not gated. (2) Per the work order's explicit instruction ("block persistence until SEC-006 secure storage is approved"), **video-upload persistence into the shared bucket is now actually blocked** in code (`VIDEO_UPLOAD_BLOCKED_PENDING_SEC_006 = true` short-circuits before any storage call), with a user-facing "temporarily unavailable" message. Existing video playback/delete is unaffected. This is a deliberate, explicit feature gate, not a silent regression — flip the flag once SEC-006 clears.

**Migration proposal (not applied):** `008_calm_me_video_PENDING_SEC-006.sql` — a commented-out proposal for a dedicated `patient-calm-videos` bucket with strict per-patient path scoping, for the owner/security review to accept or reject.

---

## F15 — Password recovery entry point
**Commit:** `6037e4d7`
**Files/functions:** `src/pages/common/LoginPage.tsx` — new `ForgotPasswordForm` component; `SignInForm` wired to show it

**Before:** `resetPasswordForEmail` was used only from admin-triggered paths (`AdminLayout.tsx`, `AdminPatients.tsx`, `AdminPendingApprovals.tsx`, provisioning-time in `patientService.ts`). `ResetPasswordPage.tsx` handles *landing* on a recovery link but nothing in the login UI *initiated* one. Grepping `LoginPage.tsx` for `forgot|reset` found no matches.

**After:** added a "Forgot password?" link on the sign-in form that shows `ForgotPasswordForm`, which calls `resetPasswordForEmail` and shows an **identical** "check your email" message regardless of whether the address is registered (does not leak account existence — Supabase's own API already doesn't, and this UI preserves that rather than special-casing "not found").

**Migration dependency:** none.

---

## F16 — Background reminders
**Status: IMPLEMENTED / UNVERIFIED IN RUNTIME** (explicitly, per work order's own P2/UNVERIFIED classification — no device/emulator was available to confirm actual OS-level delivery)
**Commit:** `f0e3284e`
**Files/functions:** new `src/lib/reminderScheduler.ts`; wired into `src/pages/patient/PatientLayout.tsx` (re-sync on `state.reminders` change) and `src/App.tsx` (cancel-all on `SIGNED_OUT`)

**Before:** `PatientReminders.tsx` displayed the text "You'll see notifications at the scheduled times." Grepping the entire `src/` tree for `@capacitor/local-notifications` usage found zero matches, despite it being a declared `package.json` dependency. No scheduling call, no permission request, nothing — not even a foreground-timer stand-in.

**After:** `reminderScheduler.ts` implements real scheduling via `@capacitor/local-notifications`'s weekly-repeating trigger (`schedule.on.{weekday,hour,minute}`), converting this app's `0=Sunday` day convention to Capacitor's `1=Sunday` convention explicitly. It is a deliberate no-op outside a native build (`Capacitor.isNativePlatform()` check) — **not** a setTimeout/foreground-timer substitute, which the work order explicitly prohibits as a false claim of reliability. Permission is requested once per session via `ensureReminderPermission()`. Re-sync is a full cancel-and-reschedule on every `state.reminders` change, which correctly handles edit/delete/duplicate-schedule cases at the cost of redoing the whole set each time.

**Not verified:** no isolated device/emulator was available in this pass. The exact `@capacitor/local-notifications` 8.0.2 API shape used here could not be typechecked against its installed types either (see `04_OUTSTANDING_BLOCKERS.md`) — `tsc` passed on this file in this pass's own run (see `03_TEST_EVIDENCE.csv`), which is a signal but not device confirmation.
