-- 049_registration_identity_security.sql
-- CODEX-VERIFIED CRITICAL REMEDIATION — Critical 1/2/4.
--
-- CRITICAL 1: delete-pending-registration identified its deletion target
-- by matching profiles.email + role + provisioning_status — not an
-- immutable, provenance-verified link to THIS registration. Fixed by
-- recording the Auth user id the MOMENT it is created (Step 2 of
-- provision-caregiver-patient, before any other step can fail), so
-- deletion ever after reads that stored id directly — never email,
-- name, or status matching.
--
-- Concurrency: caregiver_begin_registration_deletion() locks the
-- registration row (SELECT ... FOR UPDATE, same primitive
-- caregiver_claim_new_patient() already uses) and sets
-- deletion_locked_at, which caregiver_claim_new_patient() and
-- caregiver_update_pending_registration() now both also check — a claim
-- or edit started while a deletion is in flight is rejected with a clear
-- error instead of racing it. Because Supabase Auth's deleteUser() is an
-- HTTP admin-API call that cannot share a Postgres transaction with any
-- of this, the lock is HELD (not released) if deletion fails after being
-- begun — caregiver_cancel_registration_deletion_lock() is the explicit
-- compensation step the Edge Function calls to release it safely so the
-- caregiver can retry, rather than leaving the registration stuck.
--
-- CRITICAL 4 (the two items handled here):
-- - "Public can submit patient intake" had WITH CHECK (true) — truly
--   unrestricted for the anon role. Any anonymous client could attach a
--   fabricated intake row to an arbitrary EXISTING patient_profile_id or
--   caregiver_profile_id simply by including it in the POST body. Fixed
--   to require all three identity columns be NULL for an anonymous
--   submission — exactly what the client already sends, now also
--   enforced server-side.
-- - The authenticated INSERT policy only checked created_by = auth.uid()
--   — it never verified that a supplied patient_profile_id was actually
--   the caller's own id OR a patient they are the registered caregiver
--   of, so an authenticated caregiver could attribute an intake record
--   to an unrelated patient. Fixed to require one of: no patient_profile_id,
--   it equals the caller's own id (patient self-submission), or the
--   caller is that patient's registered caregiver.
--
-- STAGING-TARGETED. Not yet applied to production.

ALTER TABLE public.pending_caregiver_registrations ADD COLUMN IF NOT EXISTS provisioned_auth_user_id UUID;
ALTER TABLE public.pending_caregiver_registrations ADD COLUMN IF NOT EXISTS deletion_locked_at TIMESTAMP WITH TIME ZONE;

-- caregiver_claim_new_patient(): now also refuses when a deletion is in
-- flight for this registration — otherwise a claim could race the
-- Edge Function's own admin.deleteUser() call and "resurrect" an
-- identity mid-deletion.
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

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.caregiver_id != auth.uid() THEN
    RAISE EXCEPTION 'This registration does not belong to the calling caregiver';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration is currently being deleted and cannot be claimed';
  END IF;
  IF v_reg.claim_token != p_claim_token THEN
    RAISE EXCEPTION 'Invalid claim token';
  END IF;

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

-- caregiver_update_pending_registration(): also refuses while a
-- deletion is in flight.
CREATE OR REPLACE FUNCTION public.caregiver_update_pending_registration(
  p_registration_id UUID,
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
  v_reg pending_caregiver_registrations;
  v_new_email TEXT := lower(btrim(p_email));
  v_orphan_profile_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Patient first and last name are required';
  END IF;
  IF v_new_email IS NULL OR v_new_email = '' THEN
    RAISE EXCEPTION 'Patient email is required';
  END IF;
  IF p_relationship_type NOT IN ('daughter','son','spouse','professional','friend','primary','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No editable registration found for this id';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration is currently being deleted and cannot be edited';
  END IF;

  v_orphan_profile_id := v_reg.provisioned_auth_user_id;

  IF v_orphan_profile_id IS NOT NULL AND v_new_email != lower(v_reg.patient_email) THEN
    RAISE EXCEPTION 'An account was already created for the original email on this registration. Delete this registration first (which also removes that unused account), then register again with the new email.';
  END IF;

  UPDATE pending_caregiver_registrations SET
    patient_first_name = btrim(p_first_name),
    patient_last_name = btrim(p_last_name),
    patient_email = v_new_email,
    patient_preferred_name = p_preferred_name,
    patient_date_of_birth = p_date_of_birth,
    patient_diagnosis_date = p_diagnosis_date,
    patient_dementia_stage = p_dementia_stage,
    patient_location = p_location,
    patient_address = p_address,
    emergency_contact_name = p_emergency_contact_name,
    emergency_contact_relationship = p_emergency_contact_relationship,
    emergency_contact_phone = p_emergency_contact_phone,
    emergency_contact_email = p_emergency_contact_email,
    relationship_type = p_relationship_type
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  IF v_orphan_profile_id IS NOT NULL THEN
    UPDATE profiles SET first_name = btrim(p_first_name), last_name = btrim(p_last_name), updated_at = now()
    WHERE id = v_orphan_profile_id;
  END IF;

  RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- caregiver_begin_registration_deletion(): acquires the lock, returns
-- the IMMUTABLE provisioned_auth_user_id (never re-derived from email).
-- Idempotent-safe: a lock already held for under 2 minutes is treated as
-- an in-flight attempt (reject, do not grant a second one); a lock older
-- than that is treated as abandoned (a prior attempt's Edge Function
-- crashed before compensating) and is safely re-acquired.
CREATE OR REPLACE FUNCTION public.caregiver_begin_registration_deletion(p_registration_id UUID)
RETURNS pending_caregiver_registrations AS $$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid()
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration has already been claimed and linked to a patient record — it cannot be deleted this way';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL AND v_reg.deletion_locked_at > now() - INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'A deletion is already in progress for this registration';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_locked_at = now()
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_begin_registration_deletion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_begin_registration_deletion(UUID) TO authenticated;

-- caregiver_finish_registration_deletion(): the ONLY path that actually
-- removes the registration row, and only once a deletion was properly
-- begun (deletion_locked_at IS NOT NULL) — proving the caller went
-- through the lock step, not a bypass of it.
CREATE OR REPLACE FUNCTION public.caregiver_finish_registration_deletion(p_registration_id UUID)
RETURNS boolean AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND caregiver_id = auth.uid()
    AND consumed_at IS NULL
    AND deletion_locked_at IS NOT NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No in-progress deletion found for this registration — call caregiver_begin_registration_deletion() first';
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_finish_registration_deletion(UUID) TO authenticated;

-- caregiver_cancel_registration_deletion_lock(): the compensation step —
-- called when the Edge Function's admin.deleteUser() call itself fails,
-- so the registration is not left permanently locked and unusable.
CREATE OR REPLACE FUNCTION public.caregiver_cancel_registration_deletion_lock(p_registration_id UUID)
RETURNS boolean AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  UPDATE pending_caregiver_registrations SET deletion_locked_at = NULL
  WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_cancel_registration_deletion_lock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_cancel_registration_deletion_lock(UUID) TO authenticated;

-- cancel_my_pending_registration(): unchanged behavior, but now also
-- guarded against a registration whose Auth account was already
-- provisioned — that case MUST go through the begin/finish deletion
-- lock pair above (via the Edge Function) so the orphaned Auth account
-- is actually removed, never left behind. This function remains the
-- correct, sufficient path ONLY when provisioned_auth_user_id IS NULL
-- (nothing was ever created to clean up).
CREATE OR REPLACE FUNCTION public.cancel_my_pending_registration(
  p_registration_id UUID
) RETURNS boolean AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND caregiver_id = auth.uid()
    AND consumed_at IS NULL
    AND provisioned_auth_user_id IS NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No cancelable registration found for this id — it may already be complete, have a provisioned account requiring the safe-delete flow, belong to another caregiver, or not exist.';
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- CRITICAL 4 — anonymous public-intake identity-spoofing fix.
-- ============================================================================
DROP POLICY IF EXISTS "Public can submit patient intake" ON public.patient_intake;
CREATE POLICY "Public can submit patient intake"
  ON public.patient_intake FOR INSERT
  TO anon
  WITH CHECK (patient_profile_id IS NULL AND caregiver_profile_id IS NULL AND created_by IS NULL);

DROP POLICY IF EXISTS "Authenticated patients and caregivers can create their own inta" ON public.patient_intake;
CREATE POLICY "Authenticated patients and caregivers can create their own intake"
  ON public.patient_intake FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      patient_profile_id IS NULL
      OR patient_profile_id = auth.uid()
      OR EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = patient_intake.patient_profile_id AND cp.caregiver_id = auth.uid())
    )
  );
