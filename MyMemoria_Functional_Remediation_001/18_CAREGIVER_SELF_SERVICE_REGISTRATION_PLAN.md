# Caregiver self-service patient registration — corrected implementation plan

Supersedes `17_...` (discarded per owner correction: **no approval
process**). **Status: PLANNING ONLY.** No code written, no SQL executed,
no files changed outside this document.

## 0. The core security problem this plan has to solve, stated precisely

Migration 014's own history (already in this repo) explains exactly why
ordinary-caregiver self-service was originally removed, in its
FINALIZATION-003 correction:

> *"...`create_patient_with_caregiver(<any existing role='patient' profile
> id>, ...)` successfully, as long as that id had no `patients` row yet.
> Knowing (by any means — a referral link, a prior unrelated relationship,
> log exposure, an abandoned signup) an existing profile's UUID was
> sufficient; nothing tied the CALLER to being the specific caregiver who
> initiated THAT SPECIFIC patient's enrollment."*

The `role='patient' AND provisioning_status='profile_created'` check
alone does **not** fix this — it only confirms the target is a genuine,
unclaimed, mid-signup patient; it says nothing about whether *this
specific caller* is the one who actually initiated *that specific*
signup. Requirement 7 ("must never claim... merely by supplying an email
address, UUID, or other patient information") is this exact problem,
restated as a requirement. Admin-only calling was a blunt fix for it
(narrow the trust tier to one that's independently vetted). This plan
needs a fix that works for an **unvetted, ordinary caregiver** instead —
which means the authorization anchor can no longer be "who is calling,"
it has to be **"does the caller possess something only the legitimate
initiator could have."**

**Design: a single-use claim token**, minted client-side at the moment
the caregiver's own browser initiates the new patient's Auth signup,
carried through `auth.users.raw_user_meta_data`, and required as proof of
possession by the linking RPC. An attacker who learns a patient's UUID
(by any means) does not have this token and cannot derive it — it is
never persisted anywhere the client can read it back, never put in a URL,
never logged. This is what makes self-service safe without an
administrator in the loop, and it is the "rigorously justified
modification... that preserves existing-patient protections" the
instruction asked for, as a **new, sibling RPC** — `create_patient_
with_caregiver()` itself is not modified, not reused by direct call, and
stays admin-only exactly as migration 014 left it.

## 1. Exact files and database changes

### 1a. Database — additive only

```sql
-- One new column. NULL for every row from every OTHER existing flow
-- (patient self-service, admin-direct creation) — neither is touched.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_claim_token UUID;

-- Never client-readable, under any policy, for any role. The caregiver's
-- own browser already holds the token in memory from generating it — it
-- never needs to be read back from the database. This is the second half
-- of the security mechanism: even if §0's token design were somehow
-- bypassed for writing, nothing can read an existing token for a
-- DIFFERENT patient_id to forge a claim.
REVOKE SELECT (pending_claim_token) ON public.profiles FROM PUBLIC, anon, authenticated;
```

`handle_new_user()` (the trigger — already touched in this engagement's
production migration package, so this is one further additive line in a
function already under active revision, not a new modification target)
gets one more column in its existing INSERT:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, pending_claim_token)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    CASE WHEN requested_role IN ('patient', 'caregiver') THEN requested_role ELSE 'patient' END,
    NULLIF(NEW.raw_user_meta_data->>'claim_token', '')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

A normal patient self-service signup (`PricingPage.tsx`, no `claim_token`
in its metadata — confirmed by direct read, unchanged by this plan) gets
`pending_claim_token = NULL`. **This is itself a protection**: such a
profile can never be claimed through the new RPC below, token or no
token — closing the edge case of a caregiver trying to "claim" an
ordinary patient who happens to be self-registering at the same moment.

One new `SECURITY DEFINER` RPC (full body below) —
`caregiver_claim_new_patient()`. Nothing else in the database changes;
`create_patient_with_caregiver()`, `createPatient()`, every existing RLS
policy, and every existing column are untouched.

```sql
CREATE OR REPLACE FUNCTION public.caregiver_claim_new_patient(
  p_patient_id UUID,
  p_claim_token UUID,
  p_first_name TEXT,
  p_last_name TEXT,
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
  v_profile profiles;
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_patient_id = auth.uid() THEN
    RAISE EXCEPTION 'A caregiver cannot claim themselves as their own patient';
  END IF;

  -- Caller must be an ordinary caregiver account. Admins keep using
  -- create_patient_with_caregiver(); this is a SEPARATE, sibling path,
  -- not a widened version of that one.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'caregiver'
  ) THEN
    RAISE EXCEPTION 'Only an authenticated caregiver account may register a new patient through this path';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_patient_id;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No pending patient profile found for id %', p_patient_id;
  END IF;
  IF v_profile.role != 'patient' OR v_profile.provisioning_status != 'profile_created' THEN
    RAISE EXCEPTION 'This id does not correspond to a patient profile pending provisioning';
  END IF;

  -- THE central check (§0): possession of the one-time secret minted at
  -- THIS patient's own signup call. Defense in depth on top of the role/
  -- provisioning_status check above, not a replacement for it.
  IF v_profile.pending_claim_token IS NULL OR v_profile.pending_claim_token != p_claim_token THEN
    RAISE EXCEPTION 'Invalid or missing claim token for this patient profile';
  END IF;

  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'p_first_name and p_last_name are required';
  END IF;
  IF p_relationship_type NOT IN ('daughter','son','spouse','professional','friend','primary','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- Same refuse-not-adopt + idempotent-retry shape as
  -- create_patient_with_caregiver() (requirement 5 / 7 — never claims a
  -- pre-existing patients row, regardless of whether it already has a
  -- caregiver; a retry by the SAME caregiver for the SAME patient_id
  -- returns the existing result rather than erroring).
  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF v_patient.id IS NOT NULL THEN
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END IF;

  BEGIN
    INSERT INTO patients (
      id, first_name, last_name, preferred_name, date_of_birth, diagnosis_date, dementia_stage, location, address,
      affirmation, emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_email
    ) VALUES (
      p_patient_id, p_first_name, p_last_name, p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage, p_location, p_address,
      COALESCE(p_affirmation, 'You are safe. You are loved. You are at home.'),
      p_emergency_contact_name, p_emergency_contact_relationship, p_emergency_contact_phone, p_emergency_contact_email
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END;

  INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary)
  VALUES (auth.uid(), p_patient_id, p_relationship_type, true)
  RETURNING * INTO v_link;

  -- Single-use: burn the token, mark the profile fully provisioned.
  UPDATE profiles SET provisioning_status = 'complete', pending_claim_token = NULL WHERE id = p_patient_id;

  RETURN v_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_claim_new_patient(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_claim_new_patient(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
```

### 1b. Frontend — new and modified files

| File | Change |
|---|---|
| `src/App.tsx` | **One line**: `case 'caregiver': return <CaregiverPortal />;` in the existing role switch (~line 463) — same gap identified in the prior plan, still required: a `caregiver`-role account currently falls through to the patient app. |
| `src/pages/common/LoginPage.tsx` | **Minimal addition**: a second entry point from the existing landing choice-card ("Create account" → add "...as a caregiver" alongside the existing patient option), reusing the SAME form fields/component already built for patient signup, differing only in the `role: 'caregiver'` metadata value and the post-confirmation destination. No change to the patient signup path, no visual redesign. |
| `src/pages/caregiver/CaregiverPortal.tsx` | **New.** Two sections: (a) "Register a New Patient" — the registration form (reuses the same field set/types as `PatientIntakeFormData`, same components `PatientIntakeForm.tsx` already uses for rendering them); (b) "My Patients" — a list of linked patients, read via the already-existing, unmodified `caregiver_patients`/`patients` SELECT policies (`caregiver_id = auth.uid()`, live since migration 001 — no new RLS needed for this read). Responsive layout using the same existing UI primitives (`src/components/ui/`) every other screen already uses — not a new design system. |
| `src/services/patientIntakeService.ts` | **Modify `createAndProvisionPatient()`**: its existing "not self" branch currently always calls `createPatient()` (the admin-only RPC path) regardless of the caller's actual role — it already fetches `existingProfile.role` to compute `isPatientSelf`; this adds a sibling check (`isCaregiver = existingProfile?.role === 'caregiver'`) and a new branch that performs §2's orchestration instead. **The existing admin branch is completely unchanged** — same call, same RPC, same behavior, selected only when the caller is not a caregiver. |
| `src/services/patientIntakeService.ts` or new `src/services/caregiverService.ts` | Add `getMyLinkedPatients()` — a thin read wrapper, reusing the existing RLS-scoped query (no new policy). |

No change to any subscription file, the homepage/landing page's own
content, navigation structure beyond the one switch case, or any
admin-facing file.

## 2. Provisioning orchestration (client-side, step by step)

Supabase Auth account creation is an HTTP call to GoTrue, not a SQL
statement — the same platform constraint `create_patient_with_caregiver()`
already documents. The flow is therefore client-orchestrated, each step
independently safe/resumable:

1. **Generate the token**: `const claimToken = crypto.randomUUID();` — held
   only in the caregiver's own browser memory for the duration of this
   flow (component state), never sent anywhere except the two calls below.
2. **Create the new patient's Auth account** using an **isolated, throwaway
   Supabase client** — `createClient(url, anonKey, { auth: {
   persistSession: false, autoRefreshToken: false } })` — **not** the
   shared app-wide client the caregiver's own session lives in. This is
   the direct answer to "do not use a flow that unexpectedly switches the
   [caller's] authenticated session": a `persistSession: false` instance
   never writes to the `sessionStorage` key the main client's session
   occupies, and its own in-memory state is discarded when the call
   returns — the caregiver's real session object, held by the main
   client, is a separate JS instance never touched.
   ```js
   await tempClient.auth.signUp({
     email: formData.patientEmail,
     password: tempPassword, // caregiver sets this, same as the existing admin-direct flow already does
     options: { data: { first_name, last_name, role: 'patient', claim_token: claimToken } },
   });
   ```
   **Before this call**, reuse `createPatient()`'s existing
   `assertUniqueProfileIdentity()` check (same function, same call) — this
   is requirement 7's "duplicate accounts" / "claim an existing patient by
   email" protection, already proven, not reinvented. Supabase's own
   email-uniqueness constraint is the structural backstop either way.
3. **Insert the `patient_intake` record** — reuses the EXACT existing
   `patient_intake` INSERT already present in `createAndProvisionPatient()`
   (`caregiver_profile_id: realUserId`, `patient_profile_id: null`) — no
   new column, no new table, this round's instruction removed the review-
   state additions from the prior plan, and this insert never needed them
   in the first place; it is purely a record of what was submitted.
4. **Finish the profile row** — client upserts `profiles` with
   `provisioning_status: 'profile_created'`, `must_change_password: true`
   — same pattern `createPatient()`'s existing step 2 already uses.
5. **Claim and link**: call `caregiver_claim_new_patient(newPatientId,
   claimToken, ...)` on the caregiver's own (main, normal) session/client.
   On success: back-fill `patient_intake.patient_profile_id` (same
   existing statement `createAndProvisionPatient()` already has for the
   admin path), show the new patient in "My Patients."
6. **Failure recovery, explicit** (requirement 8):
   - Step 2 fails (network/email collision) → nothing else has happened;
     no orphan; caregiver sees a clear error and can retry the whole
     form.
   - Step 5 fails after step 2 succeeded (network drop, tab closed) →
     the patient profile sits at `provisioning_status='profile_created'`
     with its token intact. If the caregiver is still in the same browser
     session (token still held in component state), the UI offers
     **"Finish registration"**, retrying only step 5 — no re-signup, no
     duplicate account. If the browser session is gone (token lost,
     unrecoverable by design — it was never persisted anywhere readable),
     the orphaned mid-signup profile is **not a security problem** (no
     relationship was ever created, nothing is claimable without the
     token) — it is recoverable the same way any `profile_created`-only
     profile already is today: an **administrator** can still complete it
     via the existing, unmodified `create_patient_with_caregiver()`
     (which has no token requirement — a different, independently-vetted
     trust tier) as a manual fallback. This is a natural consequence of
     the two RPCs coexisting, not new recovery machinery.
7. **Concurrency / duplicates** (requirement 8): the token is single-use
   (cleared on first successful claim); a second call with the same
   `(patient_id, token)` pair, or a different caregiver entirely, fails —
   either the token no longer matches (already cleared) or the "already
   exists, not linked to caller" branch fires. `caregiver_patients`' own
   `UNIQUE(caregiver_id, patient_id)` constraint (migration 001, already
   live) is a second, structural backstop.

## 3. Authorization and RLS model, summarized

- **No service-role key anywhere** (requirement 9) — every step above
  uses the anon key only, exactly like the already-existing patient
  self-service signup (`PricingPage.tsx`). The isolated client in step 2
  is a second instance of the SAME anon-key client, not a privileged one.
- **Unauthorized claiming is prevented by proof-of-possession, not by
  caller identity** — the token (§0), not "is this caller an admin," is
  the trust anchor. This is what makes the mechanism safe for an
  ordinary, unvetted caregiver role without reintroducing the exact
  defect migration 014 closed.
- `create_patient_with_caregiver()` — **zero changes**, remains admin-only,
  remains the fallback recovery path for orphaned self-service attempts.
- `patients`/`caregiver_patients` INSERT privilege for `authenticated` —
  **unchanged** (both remain `REVOKE`d from migration 014; the new RPC is
  `SECURITY DEFINER` and bypasses this exactly like the existing RPC
  already does — no widening of the client-facing grant).
- `pending_claim_token` — write-only via the trigger at signup time,
  read-only via the RPC internally, never client-SELECT-able under any
  role (§1a).
- "My Patients" list — reuses migration 001's own, unmodified
  `caregiver_patients`/`patients` SELECT policies (`caregiver_id =
  auth.uid()`) — no new policy required for this read.

## 4. Focused acceptance tests

**Positive**
- P1: Caregiver signs up (`role: 'caregiver'`), confirms email, logs in →
  lands on `CaregiverPortal`, not `PatientLayout`.
- P2: Caregiver submits the registration form → new patient auth account +
  profile created, `caregiver_claim_new_patient` succeeds →
  `caregiver_patients.caregiver_id` = **the registering caregiver**,
  `patients` row has the submitted demographic data, `profiles.
  provisioning_status = 'complete'`, token cleared.
- P3: The new patient now appears in the caregiver's "My Patients" list.
- P4: A step-5 network failure is simulated after a successful step 2 →
  retrying "Finish registration" with the SAME held token succeeds, with
  **no duplicate** `patients`/`caregiver_patients` row.
- P5: Existing patient self-registration (`PricingPage.tsx`) — unaffected,
  `pending_claim_token` is `NULL` for these rows.
- P6: Existing admin-direct patient creation
  (`createAndProvisionPatient()`'s admin branch, `create_patient_with_
  caregiver()`) — unaffected, byte-for-byte same code path as before.
- P7: An orphaned (token lost) `profile_created` row from a failed
  self-service attempt is still completable by an **admin** via the
  existing RPC.

**Negative**
- N1: A caller supplies a correct `patient_id` (learned by any means) but
  **no or an incorrect token** — denied, `RAISE EXCEPTION 'Invalid or
  missing claim token'`. This is THE test for requirement 7.
- N2: A caller attempts `SELECT pending_claim_token FROM profiles WHERE
  id = '<any patient id>'` directly — denied by the column-level `REVOKE`
  (§1a), regardless of row-level policy.
- N3: A non-caregiver (patient or admin role) calls `caregiver_claim_
  new_patient` directly, even with a valid token — denied by the
  `role = 'caregiver'` check (admins have, and should use, the separate
  existing RPC instead).
- N4: The same caregiver calls `caregiver_claim_new_patient` twice for the
  same patient_id with the same (now-cleared) token — second call denied
  (token no longer matches `NULL`).
- N5: A DIFFERENT caregiver, who did not perform the signup and does not
  have the token, attempts to claim the same mid-signup patient_id —
  denied, same as N1.
- N6: Caregiver attempts to call `caregiver_claim_new_patient` against an
  already-`provisioning_status='complete'` existing patient's id (even
  with a guessed/replayed token value) — denied (role/provisioning_status
  check fails before the token is even compared; also structurally
  impossible to have a matching token, since it was cleared at that
  patient's own completion).
- N7: Two concurrent "Finish registration" retries (e.g., double-click)
  for the same patient_id — exactly one succeeds via the idempotent
  "already exists, return existing" branch; no duplicate row, no error
  surfaced to the caller that completed successfully.

## 5. Rollback strategy

Everything in §1a is additive — one column, one column-level `REVOKE`, one
new function, one extended (not replaced) trigger body. Nothing existing
is redefined.

```sql
DROP FUNCTION IF EXISTS public.caregiver_claim_new_patient(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);
-- Revert handle_new_user() to the version without pending_claim_token
-- (the version already live in the production migration package, minus
-- this plan's one added column/line) — CREATE OR REPLACE back to that
-- exact prior body.
-- Only if zero caregivers have used this flow yet (check: any non-null
-- pending_claim_token, or any caregiver_patients row created via this
-- path — distinguishable from admin-created ones only by timing/audit,
-- so check usage before dropping):
ALTER TABLE profiles DROP COLUMN IF EXISTS pending_claim_token;
```

Frontend: remove the one `App.tsx` switch case, delete
`CaregiverPortal.tsx`, revert `createAndProvisionPatient()`'s new branch
(the admin branch is untouched either way), remove the caregiver signup
entry point from `LoginPage.tsx`. No other file is touched by this plan.

**Decision requested**: approve this plan before any implementation
begins. No production SQL, deployment, merge, or Stripe change is proposed
or performed by this document.
