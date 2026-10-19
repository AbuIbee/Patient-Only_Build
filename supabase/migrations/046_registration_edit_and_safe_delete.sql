-- 046_registration_edit_and_safe_delete.sql
-- CRITICAL OWNER-REPORTED REMEDIATION Correction A — registration
-- management: Edit Registration, and the data-layer half of a safe
-- Delete Registration that does not leave a permanently orphaned
-- identity behind.
--
-- Confirmed defect: cancel_my_pending_registration() (migration 034)
-- only ever DELETEs the pending_caregiver_registrations metadata row.
-- When the patient's Auth account + profile were already created
-- (resumable_patient_id present — Step 2/3 of provision-caregiver-
-- patient succeeded, only the final claim failed) and the caregiver
-- clicks Delete instead of Finish, that profile/Auth account is now
-- PERMANENTLY stranded: no caregiver_patients link will ever be created
-- for it, and because the email now belongs to a real, confirmed
-- auth.users row, that email can never be used to register a patient
-- again ("already registered to an account" — Supabase Auth's own
-- uniqueness constraint, independent of profiles.provisioning_status).
-- This migration adds the RPCs; the actual auth.users deletion (which
-- requires the admin API, not available from plain SQL) is a companion
-- Edge Function — see delete-pending-registration/index.ts.
--
-- STAGING-TARGETED. Not yet applied to production.

-- get_my_pending_registration_detail(): the FULL stored fields for one
-- of the caller's own unconsumed registrations — what "Edit Registration"
-- reloads into the form. pending_caregiver_registrations has zero
-- client-facing policies (migration 030) by design; this is the only
-- read path, exactly like get_my_pending_registrations() already is.
CREATE OR REPLACE FUNCTION public.get_my_pending_registration_detail(p_registration_id UUID)
RETURNS pending_caregiver_registrations AS $$
DECLARE
  v_row pending_caregiver_registrations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_row FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No editable registration found for this id';
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_pending_registration_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_registration_detail(UUID) TO authenticated;

-- caregiver_update_pending_registration(): corrects an unconsumed
-- registration's fields and resubmits, WITHOUT ever creating a second
-- identity. The email may only be changed while no Auth account has
-- been created yet for this registration (resumable_patient_id null,
-- checked by looking for a matching orphaned profile) — once an Auth
-- account exists for the original email, changing the target email here
-- without also abandoning that account would desync
-- caregiver_claim_new_patient()'s own email-match check (migration 030),
-- producing a confusing late failure instead of a clear one now. When a
-- resumable orphan DOES exist, this also keeps its profile's name fields
-- in sync with the correction, since caregiver_claim_new_patient() will
-- otherwise create the `patients` row from this (corrected)
-- registration row while the orphaned profile keeps stale values.
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

  SELECT id INTO v_orphan_profile_id FROM profiles
    WHERE lower(email) = lower(v_reg.patient_email) AND role = 'patient' AND provisioning_status = 'profile_created';

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

REVOKE ALL ON FUNCTION public.caregiver_update_pending_registration(
  UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_update_pending_registration(
  UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
