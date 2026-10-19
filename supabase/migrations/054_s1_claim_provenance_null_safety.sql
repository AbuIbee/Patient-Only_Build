-- S1 — registration-claim provenance + NULL-safe checks + fail-closed
-- provisioning (Senior Architect Execution Contract, Section 2).
--
-- CONFIRMED EXPLOITABLE (live-tested on staging against a disposable
-- fixture registration, cleaned up immediately after): the former
-- caregiver_claim_new_patient used `IF v_reg.claim_token != p_claim_token
-- THEN RAISE EXCEPTION 'Invalid claim token'`. A caller supplying
-- p_claim_token = NULL makes the comparison evaluate to NULL (not
-- TRUE/FALSE), and `IF NULL THEN ...` in plpgsql is treated as false —
-- the exception never fired. Reproduced: calling with a real
-- registration id, NULL claim token, and an arbitrary patient id
-- produced "No pending patient profile found for id ..." (a LATER
-- error), not "Invalid claim token" — proving the token gate was
-- skipped entirely. Anyone who learned a registration_id and a pending
-- patient_id (e.g. via another channel) could have claimed that
-- caregiver's registration with no knowledge of the actual claim token.
--
-- This migration rewrites the function with every identity/ownership
-- comparison expressed via `IS DISTINCT FROM` (NULL-safe: a NULL on
-- either side always reads as "different," never as "unknown" that
-- falls through). It also stops trusting the client-supplied
-- p_patient_id as independent proof of which Auth account belongs to
-- this registration: when provisioned_auth_user_id is set (migration
-- 049, written server-side at Auth-creation time), the supplied
-- p_patient_id must exactly match it. A registration with no
-- provisioned_auth_user_id at all (a legacy row predating migration 049,
-- or one where Auth-account creation never actually completed) is
-- quarantined with an explicit "requires manual review" exception rather
-- than silently trusting the client's claimed patient id — confirmed via
-- a live staging query that zero unconsumed registrations currently
-- lack provenance, so this tightening affects no in-flight legitimate
-- registration.

CREATE OR REPLACE FUNCTION public.caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid)
RETURNS patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
  v_profile profiles;
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_registration_id IS NULL OR p_claim_token IS NULL OR p_patient_id IS NULL THEN
    RAISE EXCEPTION 'registration id, claim token, and patient id are all required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.caregiver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This registration does not belong to the calling caregiver';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration is currently being deleted and cannot be claimed';
  END IF;
  IF v_reg.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Invalid claim token';
  END IF;

  -- Trust the server-recorded provenance over the client-supplied
  -- patient id, not alongside it. A legacy registration with no
  -- provenance at all is quarantined rather than silently trusted.
  IF v_reg.provisioned_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'This registration has no recorded Auth-account provenance and requires manual review before it can be claimed';
  END IF;
  IF v_reg.provisioned_auth_user_id IS DISTINCT FROM p_patient_id THEN
    RAISE EXCEPTION 'The supplied patient id does not match the Auth account created for this registration';
  END IF;

  IF v_reg.consumed_at IS NOT NULL THEN
    IF v_reg.patient_id IS NOT DISTINCT FROM p_patient_id THEN
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
  IF v_profile.role IS DISTINCT FROM 'patient' OR v_profile.provisioning_status IS DISTINCT FROM 'profile_created' THEN
    RAISE EXCEPTION 'This id does not correspond to a patient profile pending provisioning';
  END IF;
  IF lower(v_profile.email) IS DISTINCT FROM lower(v_reg.patient_email) THEN
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
$function$;

-- get_my_pending_registrations()'s "resumable_patient_id" column was
-- purely informational (surfaced in the UI as "you can resume this"),
-- never itself the authorization decision (caregiver_claim_new_patient
-- re-verifies everything above regardless) — but it derived that id via
-- an email LEFT JOIN, the exact kind of lookup this contract flags as
-- untrustworthy. Now prefers the authoritative, server-recorded
-- provisioned_auth_user_id when present, falling back to the email join
-- only for legacy rows that still lack it.
CREATE OR REPLACE FUNCTION public.get_my_pending_registrations()
RETURNS TABLE(registration_id uuid, claim_token uuid, patient_first_name text, patient_last_name text, patient_email text, created_at timestamp with time zone, resumable_patient_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    r.id, r.claim_token, r.patient_first_name, r.patient_last_name, r.patient_email, r.created_at,
    COALESCE(r.provisioned_auth_user_id, p.id) AS resumable_patient_id
  FROM pending_caregiver_registrations r
  LEFT JOIN profiles p
    ON r.provisioned_auth_user_id IS NULL
    AND lower(p.email) = lower(r.patient_email)
    AND p.role = 'patient'
    AND p.provisioning_status = 'profile_created'
  WHERE r.caregiver_id = auth.uid()
    AND r.consumed_at IS NULL
  ORDER BY r.created_at DESC;
$function$;
