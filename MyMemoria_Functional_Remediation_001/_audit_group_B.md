# Audit Group B — F08, F09, F10, F13, F14, F15, F16
Source-to-runtime contract audit against commit `3279111436458b9e2b2f03dfcf3c27ac6cb3a883`, branch `remediation/mymemoria-functional-001`, clean tree verified before reading.

## CROSS-CUTTING FINDING (affects every feature below)
`supabase/migrations/` contains exactly one file: `001_initial_schema.sql`. It defines a **caregiver-centric** schema (`caregiver_patients` junction table, `profiles.role IN ('patient','caregiver','therapist')`, every RLS policy keyed off `caregiver_patients`). It does NOT define: `patient_intake`, `subscriptions`, `patient_document_uploads`, `care_partner_logs`, any storage bucket (`patient-documents`, `patient-media`, `audio-files`, `music-files`), or any `storage.objects` policy.
Yet 24 files under `src/` reference these exact names (confirmed via grep). **Conclusion: the live production schema the app actually depends on is not captured anywhere in this repo's version control.** Every claim below about "does X policy/table/bucket exist" can only be evaluated against the *client code's expectations*, not against verified live RLS/bucket config — flagged per-feature as UNVERIFIABLE IN REPO.

## F08 — Documents and bills
- `src/pages/patient/PatientDocuments.tsx:48` — `const DOC_BUCKET = 'patient-documents'`.
- Upload: `uploadDoc()` L269-324, writes file via `supabase.storage.from(DOC_BUCKET).upload(...)` (L286-288) then inserts metadata row into `patient_document_uploads` (L291-304). Two-step, **no compensating action**: if the DB insert at L291 fails after the storage upload at L286 succeeds, the orphaned storage object is never cleaned up (no catch branch removes it — only `setError` at L320).
- Load: `loadDocs()` L187-220 reads `patient_document_uploads`, signs each row via `signDocUrl()` L52-56 (`createSignedUrl`, not `getPublicUrl` — correct private-bucket pattern).
- Delete: `removeDoc`/`removeBill` L333-339, L360-365 — delete DB row first, then storage object; if storage `.remove()` fails silently (error not checked, L336/L363) the file is orphaned in storage with no DB reference, but functionally harmless to the user.
- **CONFIRMED**: `patient-documents` bucket referenced nowhere in `supabase/migrations/`. Work order's claim is TRUE as far as repo evidence goes; whether it exists in production is UNVERIFIABLE from here.
- UI text at L505/L651 says "up to 5 GB" but `MAX_DOC_SIZE = 5 * 1024 * 1024` (L49) = 5 MB. **Copy/code mismatch**, independent defect not in original 16 but adjacent to F08's scope.

## F09 — Public patient intake
- `src/services/publicPatientIntakeService.ts:36-40` — `supabase.from('patient_intake').insert(payload).select('id').single()`.
- If the live RLS grants `anon` INSERT but not SELECT on `patient_intake` (as the work order states), PostgREST returns the inserted row set as empty under `RETURNING` semantics scoped by SELECT policy, so `.select('id').single()` throws (`JSON object requested, multiple (or no) rows returned` / PGRST116), even though the row was persisted. Code at L42-50 maps RLS errors to a specific message but does NOT special-case "insert succeeded, select empty" — it will show a generic failure to a user whose data was actually saved.
- `patient_intake` table/policies: **absent from repo migrations** — same cross-cutting gap. CONFIRMED the code shape matches the failure mode described; the actual RLS grant is UNVERIFIABLE here.
- No client-side de-dupe/idempotency key on the insert — resubmission on this false failure would create a duplicate row.

## F10 — Admin account types
- `src/pages/admin/AdminLayout.tsx:181-199` — `saveAccountType(userId, key)`: builds `{ tier, status, trial_ends_at: trialEndsAt, ... }` (L196-199) purely client-side from a static lookup table (`def`, ~L61-120) and writes directly to `subscriptions` from the browser (confirmed by surrounding `.from('subscriptions')` calls, e.g. L652) — no edge function / server-authoritative RPC in the call path.
- `trial_ends_at` NOT NULL claim: **cannot be verified** — column constraints live only in the (missing) subscriptions migration, which does not exist in this repo. Code at L187-188 computes `trialEndsAt` as `null` specifically when `def.tier === 'master'`, implying the author already hit a NOT NULL constraint in production and special-cased around it client-side rather than fixing the schema — consistent with, but not proof of, the work order's claim.
- Client sends `tier`/`status` fields directly (L196-197) with no server-side transition validation — matches "client-trusted fields" claim. CONFIRMED by code shape.

## F13 — Tell Me a Story playback
- `src/components/TellMeAStoryDialog.tsx:212` — `const BUCKET = 'audio-files'`; playback uses `createSignedUrl` (L265, L322), not `getPublicUrl` — so the component code itself follows the private-bucket pattern correctly.
- Whether `storage.objects` actually has a SELECT policy permitting the calling (authenticated) role to mint a signed URL for this bucket: **UNVERIFIABLE** — no storage policy SQL exists anywhere in the repo. If the work order is correct that this policy is missing in production, `createSignedUrl` itself would fail at the API call (Supabase Storage requires the caller be authorized to read before it will sign), which matches "lacks required SELECT policy" as a plausible live failure — but this repo has no evidence either way.

## F14 — Calm Me video upload
- `src/components/CalmMeDialog.tsx:145-146` — `const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024` (5 GiB), checked before upload at L146.
- `BUCKET = 'music-files'` (L29), `VIDEO_FOLDER = 'videos'` (L30) — video is written into the same bucket used for other music-files content, not a dedicated bucket. CONFIRMED shared-bucket claim.
- Actual bucket-level size cap (claimed 250 MiB by work order): **UNVERIFIABLE**, not in repo. UI-side 5 GiB constant is confirmed as-is; if production bucket is actually capped lower, every upload >250 MiB would fail server-side after passing the client check, with whatever generic error surfaces from the failed `.upload()` call (no distinct handling found for this case in the grep'd region).

## F15 — Password recovery entry point
- `supabase.auth.resetPasswordForEmail` IS used in the repo, but only from **admin-triggered** paths: `src/pages/admin/AdminLayout.tsx:436`, `src/pages/admin/AdminPatients.tsx:307-309` (admin clicks "reset" for a patient), `src/pages/admin/AdminPendingApprovals.tsx:53`, and `src/services/patientService.ts:160,267` (provisioning-time, also admin/system-initiated).
- `src/pages/common/ResetPasswordPage.tsx` exists and is wired into `App.tsx:313,326` — it handles the *landing* on a recovery link, but nothing initiates that link from a patient's own action.
- Grepped `src/pages/common/LoginPage.tsx` for `forgot|reset` (case-insensitive): **no matches**. CONFIRMED — there is no patient-initiated "Forgot password?" entry point anywhere in the login UI. The work order's framing ("Add visible accessible entry point") is accurate; it is not that recovery is entirely unbuilt, only that the patient-facing trigger is missing.
- Aside, out of this audit's scope: `src/pages/admin/indexError.txt` is a ~80,000-line file sitting inside `src/pages/admin/` that looks like a dumped minified bundle / source-map error trace (it contains compiled Supabase JS internals and hundreds of `"code-path": "src/pages/common/ResetPasswordPage.tsx:NNN:NN"` entries). This is almost certainly a stray debug artifact, not application source, and should be flagged separately — not touched by this audit.

## F16 — Background reminders
- Grepped all of `src/` for `@capacitor/local-notifications` import and `LocalNotifications.` usage: **zero matches**, despite `@capacitor/local-notifications: ^8.0.2` being a declared dependency in `package.json`.
- `src/pages/patient/PatientReminders.tsx:674` contains only the user-facing claim text: *"You'll see notifications at the scheduled times."* No scheduling call, no permission-request call, nothing that would make that sentence true exists in the grepped file.
- CONFIRMED, strongly: this is advertised, patient-facing functionality with **no implementation at all** behind it — not even a foreground-timer stand-in found in this file. (Did not exhaustively search every file in the repo for an alternate reminder-scheduling module outside `PatientReminders.tsx`; flagged as the one claim in this group where "implementation exists elsewhere" could not be fully ruled out without a wider search.)

## Summary of CONFIRMED / REFUTED / PARTIAL / UNVERIFIABLE
- F08: CONFIRMED (bucket not in migrations; also found an unreported orphan-cleanup gap and a 5GB/5MB copy mismatch).
- F09: CONFIRMED by code shape; underlying RLS grant UNVERIFIABLE (not in repo).
- F10: CONFIRMED (client-trusted writes); NOT NULL constraint claim UNVERIFIABLE but circumstantially corroborated by a client-side `null`-for-master special case.
- F13: PARTIAL — component code already uses signed URLs correctly; the missing-policy claim itself is UNVERIFIABLE from repo contents alone.
- F14: CONFIRMED (UI limit, shared bucket); actual backend cap UNVERIFIABLE.
- F15: CONFIRMED — recovery plumbing exists for admin-initiated resets only; no patient self-service entry point anywhere in LoginPage.
- F16: CONFIRMED, no implementation found at all in the reminders file; not exhaustively searched repo-wide.
