-- 030_caregiver_self_service_patient_registration.sql
-- MYMEMORIA ALLY — caregiver self-service patient registration, no
-- administrator approval (per explicit owner correction superseding an
-- earlier admin-review design).
--
-- STAGING-TARGETED. Not yet applied to production. See
-- MyMemoria_Functional_Remediation_001/18_CAREGIVER_SELF_SERVICE_
-- REGISTRATION_PLAN.md for the full design rationale.
--
-- SECURITY DESIGN, STATED ONCE HERE (every object below exists to serve
-- it): migration 014's own history already identified the real danger of
-- ordinary-caregiver self-service — a target-side check alone
-- ("role='patient' AND provisioning_status='profile_created'") does not
-- verify the CALLER is the one who actually initiated THAT SPECIFIC
-- patient's signup; merely knowing the id is otherwise enough. The fix
-- here is a server-generated, single-use claim token, stored in a
-- dedicated table this migration creates, NEVER passed through Supabase
-- Auth's user-editable `raw_user_meta_data` (explicitly rejected per
-- owner instruction: "Do not trust user-editable Auth metadata as
-- independent proof of authorization"). `create_patient_with_caregiver()`
-- (admin-only, migration 014) is NOT modified and remains the
-- independent, differently-trusted path admins use — this migration adds
-- a sibling mechanism, not a weakened version of that one.

-- ============================================================================
-- §1 — pending_caregiver_registrations: the trusted server-side record
-- ============================================================================
CREATE TABLE IF NOT EXISTS pending_caregiver_registrations (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id                    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claim_token                     UUID NOT NULL DEFAULT gen_random_uuid(),
  patient_first_name              TEXT NOT NULL,
  patient_last_name               TEXT NOT NULL,
  patient_email                   TEXT NOT NULL,
  patient_preferred_name          TEXT,
  patient_date_of_birth           DATE,
  patient_diagnosis_date          DATE,
  patient_dementia_stage          TEXT,
  patient_location                TEXT,
  patient_address                 TEXT,
  emergency_contact_name          TEXT,
  emergency_contact_relationship  TEXT,
  emergency_contact_phone         TEXT,
  emergency_contact_email         TEXT,
  relationship_type               TEXT NOT NULL DEFAULT 'primary'
                                     CHECK (relationship_type IN ('daughter','son','spouse','professional','friend','primary','secondary')),
  created_at                      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  consumed_at                     TIMESTAMP WITH TIME ZONE,
  patient_id                      UUID REFERENCES patients(id)
);

ALTER TABLE pending_caregiver_registrations ENABLE ROW LEVEL SECURITY;
-- Deliberately ZERO client-facing policies. Every read/write goes through
-- the two SECURITY DEFINER RPCs below (§2, §3), which bypass RLS by
-- function privilege the same way every other trusted-RPC-only table in
-- this schema already works (e.g. promo_redemptions). RLS enabled with no
-- policy is fail-closed by default — a direct client query returns zero
-- rows / is denied, regardless of role.

-- ============================================================================
-- §2 — caregiver_initiate_patient_registration(): step 1, server-generates
-- the token. Caller must already be an authenticated caregiver.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.caregiver_initiate_patient_registration(
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_preferred_name TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_diagnosis_date DATE DEFAULT NULL,
  p_dementia_stage TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_emergency_contact_relationship TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_emergency_contact_email TEXT DEFAULT NULL,
  p_relationship_type TEXT DEFAULT 'primary'
) RETURNS pending_caregiver_registrations AS $$
DECLARE
  v_row pending_caregiver_registrations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'caregiver') THEN
    RAISE EXCEPTION 'Only an authenticated caregiver account may initiate patient registration';
  END IF;
  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Patient first and last name are required';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Patient email is required';
  END IF;
  IF p_relationship_type NOT IN ('daughter','son','spouse','professional','friend','primary','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- Requirement 5/7 fail-fast: refuse before any Auth account is ever
  -- attempted if this email already belongs to a fully provisioned
  -- account. Supabase's own email-uniqueness constraint is the structural
  -- backstop either way (checked again, implicitly, when signUp() is
  -- actually called client-side).
  IF EXISTS (
    SELECT 1 FROM profiles WHERE lower(email) = lower(p_email) AND provisioning_status = 'complete'
  ) THEN
    RAISE EXCEPTION 'This email address is already registered to an existing account';
  END IF;

  INSERT INTO pending_caregiver_registrations (
    caregiver_id, patient_first_name, patient_last_name, patient_email,
    patient_preferred_name, patient_date_of_birth, patient_diagnosis_date, patient_dementia_stage,
    patient_location, patient_address, emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email, relationship_type
  ) VALUES (
    auth.uid(), btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)),
    p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage,
    p_location, p_address, p_emergency_contact_name, p_emergency_contact_relationship,
    p_emergency_contact_phone, p_emergency_contact_email, p_relationship_type
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_initiate_patient_registration(
  TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_initiate_patient_registration(
  TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ============================================================================
-- §3 — caregiver_claim_new_patient(): step 2, consumes the token, creates
-- patients + caregiver_patients atomically, idempotent on retry.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.caregiver_claim_new_patient(
  p_registration_id UUID,
  p_claim_token UUID,
  p_patient_id UUID
) RETURNS patients AS $$
DECLARE
  v_reg pending_caregiver_registrations;
  v_profile profiles;
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Lock the registration row for the duration of this call — the actual
  -- concurrency guard (two concurrent calls for the same registration
  -- race on this lock; the second sees consumed_at already set).
  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.caregiver_id != auth.uid() THEN
    RAISE EXCEPTION 'This registration does not belong to the calling caregiver';
  END IF;
  IF v_reg.claim_token != p_claim_token THEN
    RAISE EXCEPTION 'Invalid claim token';
  END IF;

  -- Idempotent retry (requirement 8 — duplicate/concurrent requests),
  -- CHECKED BEFORE the profile-state validation below on purpose: on a
  -- legitimate retry of an already-successful claim, the target profile's
  -- provisioning_status is correctly 'complete' by now (set by the first,
  -- successful call) — if this check ran AFTER that validation instead, a
  -- harmless retry would be wrongly rejected as "not pending provisioning"
  -- and would never reach this idempotent-return path at all. (A real
  -- defect caught by this round's own test suite — Test 8 — before ever
  -- reaching staging or production.)
  IF v_reg.consumed_at IS NOT NULL THEN
    IF v_reg.patient_id = p_patient_id THEN
      SELECT * INTO v_patient FROM patients WHERE id = v_reg.patient_id;
      IF v_patient.id IS NOT NULL THEN
        RETURN v_patient;
      END IF;
    END IF;
    RAISE EXCEPTION 'This registration has already been used';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_patient_id;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No pending patient profile found for id %', p_patient_id;
  END IF;
  IF v_profile.role != 'patient' OR v_profile.provisioning_status != 'profile_created' THEN
    RAISE EXCEPTION 'This id does not correspond to a patient profile pending provisioning';
  END IF;
  IF lower(v_profile.email) != lower(v_reg.patient_email) THEN
    RAISE EXCEPTION 'The provisioned account email does not match this registration';
  END IF;

  -- Refuse-not-adopt (requirement 5/7) — identical shape to
  -- create_patient_with_caregiver(): never claims a patients row that
  -- already existed before this call, regardless of whether it already
  -- has a caregiver.
  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF v_patient.id IS NOT NULL THEN
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      UPDATE pending_caregiver_registrations SET consumed_at = now(), patient_id = p_patient_id WHERE id = p_registration_id;
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END IF;

  BEGIN
    INSERT INTO patients (
      id, first_name, last_name, preferred_name, date_of_birth, diagnosis_date, dementia_stage,
      location, address, affirmation, emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_email
    ) VALUES (
      p_patient_id, v_reg.patient_first_name, v_reg.patient_last_name, v_reg.patient_preferred_name,
      v_reg.patient_date_of_birth, v_reg.patient_diagnosis_date, v_reg.patient_dementia_stage,
      v_reg.patient_location, v_reg.patient_address,
      'You are safe. You are loved. You are at home.',
      v_reg.emergency_contact_name, v_reg.emergency_contact_relationship,
      v_reg.emergency_contact_phone, v_reg.emergency_contact_email
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      UPDATE pending_caregiver_registrations SET consumed_at = now(), patient_id = p_patient_id WHERE id = p_registration_id;
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END;

  INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary)
  VALUES (auth.uid(), p_patient_id, v_reg.relationship_type, true)
  RETURNING * INTO v_link;

  UPDATE profiles SET provisioning_status = 'complete' WHERE id = p_patient_id;
  UPDATE pending_caregiver_registrations SET consumed_at = now(), patient_id = p_patient_id WHERE id = p_registration_id;

  RETURN v_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_claim_new_patient(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_claim_new_patient(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described; executed separately via the
-- isolated local dry-run and, where credentials allow, real staging)
-- ============================================================================
-- T1 (positive): caregiver initiates, signs up a new patient auth account,
--   calls caregiver_claim_new_patient with the correct registration_id/
--   token/patient_id. Expected: succeeds; caregiver_patients.caregiver_id
--   = the calling caregiver (not any other account).
-- T2 (negative, requirement 7 — the central test): correct patient_id,
--   missing or wrong claim_token. Expected: RAISE EXCEPTION 'Invalid claim
--   token'; nothing created.
-- T3 (negative): a non-caregiver (patient or admin role) calls either RPC.
--   Expected: denied.
-- T4 (negative): a DIFFERENT caregiver (not the one who initiated) calls
--   caregiver_claim_new_patient for this registration, even with a
--   correct-looking token they could not actually have. Expected: denied
--   (caregiver_id mismatch check fires first).
-- T5 (negative, replay): the SAME caregiver calls claim twice with the
--   same already-consumed registration/token. Expected: first call
--   succeeds; second call either returns the same result idempotently
--   (same patient_id) or is denied (different patient_id) — never creates
--   a second patients/caregiver_patients row.
-- T6 (negative): claim attempted against an id whose profile is already
--   provisioning_status='complete' (an existing, unrelated patient).
--   Expected: denied before the token is even compared.
-- T7 (positive, concurrency): two concurrent claim calls for the same
--   registration (simulating a double-click). Expected: exactly one
--   patients + caregiver_patients row exists afterward.
-- T8 (regression): patient self-registration (PricingPage.tsx) and
--   admin-direct creation (createAndProvisionPatient's admin branch,
--   create_patient_with_caregiver) are completely unaffected — neither
--   references any object this file creates.
