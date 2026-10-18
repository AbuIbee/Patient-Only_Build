> **SUPERSEDED — DISCARDED PER OWNER CORRECTION ("MYMEMORIA ALLY: OWNER
> CORRECTION TO PATIENT REGISTRATION").** The owner has clarified patient
> registration requires NO approval process whatsoever. Everything below
> (the admin-review workflow, `pending_review`/`approved`/`rejected`
> states, the two approval RPCs) is **discarded as an implementation
> specification** and must not be built. See
> `18_CAREGIVER_SELF_SERVICE_REGISTRATION_PLAN.md` for the corrected plan.
> Kept here, unmodified below this notice, only as a record of what was
> considered and rejected.

# Caregiver-initiated registration + administrator approval — implementation plan

**Status: PLANNING ONLY. No code written, no SQL executed, no files
changed outside this document.** Stops at the plan for owner approval, per
instruction.

## 0. Preconditions this plan assumes, stated explicitly

- **How a `caregiver`-role account comes to exist is out of scope for this
  plan.** No tracked, reachable signup path currently creates one
  (`PricingPage.tsx`'s self-service signup always passes `role: 'patient'`
  — confirmed by direct read). The trigger (`handle_new_user()`) already
  accepts `role: 'caregiver'` from signup metadata if a caller ever passed
  it, and `admin_set_role()` already lets an existing admin convert any
  account to `caregiver`. This plan takes "an authenticated caregiver"
  (requirement 1) as a given precondition, provisioned by whatever process
  the owner already uses — building caregiver self-signup is a separate,
  unscoped feature this plan does not touch.
- **A genuine structural gap, found while scoping this**: `App.tsx`'s role
  switch (`src/App.tsx` ~line 463) has cases for `'patient'` and `'admin'`
  only; `'caregiver'` falls through to `default: PatientLayout` — a
  caregiver-role account that logs in today sees the PATIENT app (built
  around "you are the patient"), which is wrong for them. Requirement 1
  cannot be satisfied without giving a caregiver SOME place to land. The
  smallest fix for this is in §1 below — a single new `switch` case, not a
  navigation redesign.

## 1. Exact files and database changes

### 1a. Database — additive only, nothing existing is redefined

```sql
-- New columns on patient_intake (009/021's existing table — reviewed_by/
-- reviewed_at already exist there and are reused, not duplicated).
ALTER TABLE patient_intake
  ADD COLUMN IF NOT EXISTS review_status TEXT
    CHECK (review_status IN ('pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
-- review_status stays NULL ("not applicable") for every row from the
-- EXISTING flows (public anon intake, patient self-service, admin-direct
-- creation) — none of them change behavior. Only the NEW RPC in §1a-3
-- below ever writes 'pending_review'.

-- Column-level lockdown — THE central authorization fix this plan depends
-- on. 021's existing "Patients and caregivers can update their own intake
-- record" policy is ROW-level only (USING, no WITH CHECK, no column
-- scope) — without this, a caregiver could directly
-- `UPDATE patient_intake SET review_status='approved' WHERE id=<their own
-- row>` and skip administrator review entirely. Same for 009's existing
-- "Admins can update patient intake review state" (also unrestricted) —
-- both ROW policies remain exactly as-is; this REVOKE is a separate,
-- column-level privilege layer that applies regardless of which row
-- policy a caller satisfies (the same mechanism migration 012 already
-- uses for profiles.role, for the identical reason: a Postgres ROLE
-- ('authenticated') cannot distinguish "this specific caller happens to
-- be an admin" — that's a ROW VALUE, not a role — so RPCs, not raw
-- client writes, are the only way to let admins write these columns
-- without also exposing them to every authenticated caller).
REVOKE INSERT (review_status, rejection_reason) ON public.patient_intake FROM authenticated;
REVOKE UPDATE (review_status, reviewed_by, reviewed_at, rejection_reason) ON public.patient_intake FROM authenticated;
-- No replacement GRANT for any role — these four columns become
-- RPC-only, for everyone, including admins. Confirmed safe: no existing
-- tracked call site writes reviewed_by/reviewed_at/rejection_reason
-- directly (`grep -rn "reviewed_by\|reviewed_at" src/` — zero INSERT/
-- UPDATE payload hits anywhere today).
```

Three new SECURITY DEFINER RPCs (full bodies specified in §3-4 below, not
repeated here):
1. `submit_caregiver_patient_intake(...)` — requirement 1/2.
2. `admin_set_intake_review_status(p_intake_id, p_new_status, p_rejection_reason)` — requirement 3 (reject) + the "claim" half of approve.
3. `admin_provision_caregiver_intake_patient(p_intake_id, p_patient_id, p_relationship_type)` — requirement 4 (the "provision" half of approve).

No existing function (`create_patient_with_caregiver`, `createPatient`,
`createAndProvisionPatient`) is modified. No existing column, constraint,
or policy is dropped or altered.

### 1b. New/changed frontend files

| File | Change |
|---|---|
| `src/App.tsx` | **One line**: add `case 'caregiver': return <CaregiverPortal />;` to the existing role switch (~line 463). No other change to routing/navigation. |
| `src/pages/caregiver/CaregiverPortal.tsx` | **New.** Minimal: a "Register a New Patient" form (reuses the SAME field set/types as `PatientIntakeFormData` — ideally the same field-rendering sub-components `PatientIntakeForm.tsx` already uses, not a parallel reimplementation) + a status list of the caregiver's own submitted intakes (pending/approved/rejected), reusing `getCaregiverIntakes()`. |
| `src/pages/admin/AdminCaregiverIntakeReview.tsx` | **New.** Modeled directly on the existing `AdminPendingApprovals.tsx` (same list/approve/reject UI pattern), data source is `patient_intake WHERE review_status = 'pending_review'` instead of `profiles WHERE role = 'pending'`. |
| `src/pages/admin/AdminLayout.tsx` | Add one new nav entry/route to the new review screen — same pattern as its existing entries, not a layout change. |
| `src/services/patientIntakeService.ts` | **Modify, don't replace**: `createPatientIntake()` (currently dead code, never called) is replaced by a thin wrapper calling the new `submit_caregiver_patient_intake` RPC instead of a raw `.insert()` — needed because `review_status` must be server-set, not client-supplied (§1a). `getCaregiverIntakes()` is unchanged (already correct, just finally gets a caller). Add `getPendingCaregiverIntakes()` (admin-side list) and `approveCaregiverIntake()`/`rejectCaregiverIntake()` wrapper functions calling the two new admin RPCs. **`createAndProvisionPatient()` and `createPatient()` are untouched.** |

No change to `src/pages/common/LoginPage.tsx`, `PricingPage.tsx`,
`LandingPage.tsx`, any subscription file, or any navigation/layout
component beyond the one-line switch addition and one new admin nav entry.

## 2. Existing components and RPCs reused or adapted

| Existing | Role in this plan |
|---|---|
| `patient_intake` table (009/021) | Reused as-is, structurally already shaped for exactly this (`caregiver_profile_id` distinct from `patient_profile_id`, already designed for a caregiver-submits/admin-reviews shape that was simply never wired up). |
| `createPatientIntake()` / `getCaregiverIntakes()` (patientIntakeService.ts) | The two functions already written for this exact purpose, previously dead code. Reused (the first adapted to call the new RPC instead of a raw insert; the second used unmodified). |
| `AdminPendingApprovals.tsx` | Not reused by import, but its list/approve/reject UI PATTERN is the direct template for the new admin review screen — same shape of problem, same established solution shape. |
| `createPatient()`'s resumable-provisioning pattern (email-based existing-profile detection, `must_change_password`, `provisioning_status` lifecycle) | Reused conceptually in §3's provisioning step — same email-collision guard, same profile lifecycle, so "existing patients cannot be claimed" (requirement 5) is enforced the same proven way, not reinvented. |
| `is_admin()` (this engagement's own earlier fix) | Reused for both new admin RPCs' authorization gate. |
| The "SECURITY DEFINER RPC is the only trusted state-transition path" pattern (`admin_set_role`, `admin_set_subscription`, `create_patient_with_caregiver`) | Reused directly — all three new RPCs follow this exact, already-established shape. |
| `patient_intake`'s EXISTING admin SELECT policy ("Admins can review patient intake submissions", 009) | Already sufficient for the new admin review screen's read access — no new SELECT policy needed. |

## 3. Authorization and RLS model

- **Submission** (`submit_caregiver_patient_intake`): `SECURITY DEFINER`.
  Verifies `auth.uid() IS NOT NULL` and the caller's own `profiles.role =
  'caregiver'` (only — not admin, not patient; this is specifically the
  ordinary-caregiver path requirement 1 names). Inserts with
  `caregiver_profile_id = auth.uid()`, `created_by = auth.uid()`,
  `patient_profile_id = NULL`, `review_status = 'pending_review'` —
  **all four of these identity/status values are set server-side, never
  accepted as a parameter**, so a caller cannot submit on another
  caregiver's behalf or pre-set their own status.
- **Review visibility**: existing 009 admin SELECT policy, unmodified —
  admins already see every `patient_intake` row; the new admin screen
  simply filters client-side (or server-side via the query) to
  `review_status = 'pending_review'`. No new SELECT policy required.
- **Reject / claim-for-approval** (`admin_set_intake_review_status`):
  `SECURITY DEFINER`. Verifies `is_admin()`. Does **one atomic conditional
  UPDATE**: `UPDATE patient_intake SET review_status = p_new_status,
  reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason =
  p_rejection_reason WHERE id = p_intake_id AND review_status =
  'pending_review' RETURNING *`. If zero rows affected, `RAISE EXCEPTION
  'This intake has already been reviewed (or does not exist)'` — this
  single `WHERE review_status = 'pending_review'` clause, combined with
  Postgres's own row-level locking during `UPDATE`, is the entire
  concurrency guarantee for requirement 5's "concurrent approval cannot
  produce duplicate state": two simultaneous admin clicks race on the same
  row lock, exactly one UPDATE commits, the other sees 0 rows and reports
  the clean "already reviewed" error instead of silently double-acting.
- **Provisioning** (`admin_provision_caregiver_intake_patient`):
  `SECURITY DEFINER`. Verifies `is_admin()`. Looks up the intake row by
  `p_intake_id` and requires `review_status = 'approved'` (i.e., must have
  already gone through the claim step above — provisioning can never run
  against a still-`pending_review` or `rejected` row). Reads
  `v_caregiver_id := intake.caregiver_profile_id` **from the stored row,
  never from a client parameter** — this is the exact mechanism that
  makes requirement 4 ("the originating caregiver, not the approving
  administrator") trustworthy: the admin's own `auth.uid()` is used only
  to pass the authorization gate, never as the value written to
  `caregiver_patients.caregiver_id`.
- **`create_patient_with_caregiver()` itself is NOT reused by direct call**
  (its `caregiver_id = auth.uid()` hardcoding is exactly the thing this
  new flow needs to NOT do) — `admin_provision_caregiver_intake_patient()`
  is a sibling function with the same NOT-NULL/idempotency protections,
  parameterized by the intake-derived caregiver id instead. Both
  coexist; neither is modified.
- **Patient self-registration and admin-direct creation (requirement 7)**:
  completely untouched. Neither reads nor is affected by any new
  column/RPC — `createPatient()`/`create_patient_with_caregiver()` are not
  modified, and the new `review_status` column defaults to `NULL` for
  every row either flow creates, so neither flow's existing behavior
  changes in any way.

## 4. Provisioning and failure-recovery design

**Why this cannot be one atomic step**: Supabase Auth account creation
(`auth.signUp()`) is an HTTP call to GoTrue, not a SQL statement — it
cannot participate in the same Postgres transaction as the
patient/caregiver_patients rows, the same platform constraint
`create_patient_with_caregiver()`'s own design already documents and
works around. The approval flow is therefore necessarily multi-step,
client-orchestrated, with the SQL side re-verifiable/idempotent at each
point so a failure between steps is always safely resumable:

1. **Claim** (`admin_set_intake_review_status(id, 'approved')`) — DB-only,
   atomic, described above. If this fails (lost the race, already
   rejected), nothing else happens — clean stop, no orphaned state.
2. **Provision the Auth account** — client-side, using an **isolated,
   throwaway Supabase client instance** (`createClient(url, anonKey, {
   auth: { persistSession: false, autoRefreshToken: false } })`, NOT the
   shared app-wide client the admin's own session lives in) to call
   `auth.signUp()` for the new patient. This is the direct answer to "do
   not use a flow that unexpectedly switches the administrator's
   session": a second, `persistSession: false` client instance never
   writes to the shared `sessionStorage` key the main client's session
   lives in, and its own in-memory session state is simply discarded when
   the call completes — the admin's own active session object is a
   separate JS instance that is never touched. **Failure mode**: if this
   HTTP call fails (network error, email already registered by a
   DIFFERENT, unrelated process in the interim, etc.), the intake row is
   already `review_status = 'approved'` but has no `patient_profile_id` —
   this is a **defined, visible, resumable state** (see step 5), not a
   silent dead end.
   - **Requirement 5's "existing patients cannot be claimed" enforced
     here**: before calling `auth.signUp()`, check `profiles WHERE email =
     <intake.patient_email>` (the exact guard `createPatient()` already
     uses) — if a matching row exists with `provisioning_status =
     'complete'`, refuse with a clear error ("this email is already a
     registered patient") rather than attempting signup. This is the SAME
     proven check, reused, not reinvented.
3. **Finish the profile** — client-side, same pattern as `createPatient()`
   step 2: upsert `profiles` with `provisioning_status = 'profile_created'`,
   `must_change_password = true`.
4. **Link** (`admin_provision_caregiver_intake_patient(intake_id,
   new_patient_id)`) — DB-only, `SECURITY DEFINER`, creates `patients` +
   `caregiver_patients` (caregiver_id from the intake row) in one function
   body (one implicit transaction — if the second INSERT fails, the first
   rolls back too, same guarantee `create_patient_with_caregiver()`
   already provides). Sets `profiles.provisioning_status = 'complete'` and
   backfills `patient_intake.patient_profile_id` at the end.
5. **Resumability, explicit**: any `patient_intake` row with
   `review_status = 'approved' AND patient_profile_id IS NULL` is, by
   definition, "approved but not yet successfully provisioned" — the admin
   review screen shows a **"Finish provisioning"** action for exactly this
   state (distinct from the normal "Approve" action, which only appears
   for `pending_review` rows). Clicking it re-runs steps 2-4 above. Step
   2's existing-profile-by-email check makes this safe to retry after a
   partial failure: if step 2 already succeeded once but step 3 or 4
   failed, the retry finds the existing, still-`profile_created` profile
   and resumes from there instead of erroring "already registered" — the
   exact resumable design `createPatient()` already relies on, reused
   unchanged.
6. **Idempotent double-click / duplicate-approval protection
   (requirement 5)**: `admin_provision_caregiver_intake_patient()` checks
   `intake.patient_profile_id IS NOT NULL` first and, if already set,
   returns the existing `patients` row unchanged rather than attempting a
   second creation — same idempotent-retry shape
   `create_patient_with_caregiver()` already uses for its own case. The
   `patients.id` primary key and `caregiver_patients`' structure provide a
   second, structural backstop against an accidental duplicate even if
   the idempotency check were somehow bypassed.
7. **Rejection (requirement 6)**: a single RPC call
   (`admin_set_intake_review_status(id, 'rejected', reason)`). No patient
   is ever created. The intake row remains, visibly `rejected`, with the
   reason recorded — a complete, inspectable end state, not a deletion
   (preserves the record for the caregiver to see why, and for any future
   re-submission decision, without exposing anything about OTHER,
   unrelated patients — the review screen's query is always scoped to
   `review_status = 'pending_review'`/`'approved' AND patient_profile_id
   IS NULL`, never a general patient browser).

## 5. Focused acceptance tests (to run before this plan is approved for implementation, not yet executed)

**Positive**
- P1: Caregiver submits via `submit_caregiver_patient_intake` → row has
  `review_status='pending_review'`, `caregiver_profile_id=` the caregiver's
  own id, `patient_profile_id IS NULL`.
- P2: Admin sees it in the pending-review query; a non-admin, non-caregiver
  (plain patient) query for the same does not.
- P3: Admin claims it (`admin_set_intake_review_status(..., 'approved')`)
  → `review_status='approved'`, `reviewed_by`=that admin.
- P4: Full provisioning completes → `caregiver_patients.caregiver_id` =
  the ORIGINATING caregiver's id, **not** the approving admin's id (the
  specific case this whole plan exists to fix — the one assertion that
  must never silently regress).
- P5: Admin rejects a different pending intake with a reason → row shows
  `review_status='rejected'`, reason stored, no patient created.
- P6: A provisioning step 2/3 failure is simulated (e.g., email already
  taken) → intake stays `approved`/`patient_profile_id IS NULL`; clicking
  "Finish provisioning" again, after the conflict is resolved, succeeds
  without a duplicate `patients` row.
- P7: Existing patient self-registration (`PatientIntakeForm.tsx`'s own
  upsert) still succeeds unchanged.
- P8: Existing admin-direct patient creation
  (`createAndProvisionPatient()`'s Step 2B, admin as both submitter and
  caregiver) still succeeds unchanged, `caregiver_patients.caregiver_id`
  = the admin, exactly as before.

**Negative**
- N1: A plain caregiver (not admin) calls `admin_set_intake_review_status`
  or `admin_provision_caregiver_intake_patient` directly — denied.
- N2: A caregiver attempts a raw `UPDATE patient_intake SET
  review_status='approved' WHERE id=<their own row>` — denied at the
  column-privilege layer (the central fix in §1a).
- N3: Two admins (or one admin double-clicking) call
  `admin_set_intake_review_status` on the same `pending_review` row
  concurrently — exactly one succeeds, the other gets the clean
  "already reviewed" exception, zero duplicate state.
- N4: Admin attempts to provision an intake whose `patient_email` already
  matches an existing, `provisioning_status='complete'` profile — refused,
  no new auth account created, no existing patient's data touched.
- N5: Admin calls `admin_provision_caregiver_intake_patient` against an
  intake still at `review_status='pending_review'` (skipping the claim
  step) — denied.
- N6: Admin attempts to re-provision an already-fully-provisioned intake
  (`patient_profile_id IS NOT NULL`) — returns the existing patient
  idempotently, creates nothing new.
- N7: An unrelated caregiver (not the submitter) queries their own
  `getCaregiverIntakes()` — does not see another caregiver's submissions
  (021's existing self-access policy, unmodified, already enforces this).
- N8: The admin review screen's query, run as an admin, never returns rows
  for patients unrelated to pending/approved-unprovisioned intakes (no
  general patient-browsing capability is introduced).

## 6. Rollback strategy

Every change in §1a is additive (new columns, new column-level REVOKEs,
new functions) — nothing existing is redefined, dropped, or altered. This
makes rollback unusually clean, and safe to describe precisely now:

```sql
-- Reverse order of creation.
DROP FUNCTION IF EXISTS public.admin_provision_caregiver_intake_patient(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_set_intake_review_status(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_caregiver_patient_intake(/* full signature */);

-- Only safe if zero rows have used the new flow yet (check first: any
-- non-null review_status). If any caregiver has already submitted
-- through this feature, do NOT drop the columns — leave them (harmless,
-- inert for every other flow) and just stop routing new traffic to them
-- by reverting the frontend changes below instead.
ALTER TABLE patient_intake DROP COLUMN IF EXISTS review_status;
ALTER TABLE patient_intake DROP COLUMN IF EXISTS rejection_reason;
-- Column grants: no re-GRANT needed on rollback (REVOKE-only changes
-- revert to "no one could write these anyway" by simply dropping the
-- now-unused columns above; if the columns are kept per the caveat
-- above, leave the REVOKEs in place too — they protect columns that
-- would otherwise be writable by anyone).
```

Frontend: remove the one new `App.tsx` switch case, delete
`CaregiverPortal.tsx` and `AdminCaregiverIntakeReview.tsx`, remove the one
new admin nav entry, and revert `createPatientIntake()` to its current
(dead-code, harmless either way) form. No other file is touched by this
plan, so no other file needs reverting.

**Decision requested**: approve this plan before any implementation
begins. No production SQL, deployment, merge, or Stripe change is proposed
or performed by this document.
