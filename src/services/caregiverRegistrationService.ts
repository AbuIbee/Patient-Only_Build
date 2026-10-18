import { supabase, createIsolatedAuthClient } from '@/lib/supabase';
import { normalizeEmail, assertUniqueProfileIdentity, isUniqueConstraintError, uniqueIdentityMessage } from '@/lib/identity';
import { getErrorMessage } from '@/lib/utils';
import type { PatientIntakeFormData } from '@/types/patientIntake';

// ─── Caregiver account self-service signup ──────────────────────────────────
export interface CaregiverSignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export async function signUpCaregiver(input: CaregiverSignUpInput): Promise<{ confirmationRequired: boolean; error: Error | null }> {
  const normalizedEmail = normalizeEmail(input.email);
  try {
    await assertUniqueProfileIdentity({ email: normalizedEmail });
  } catch (err) {
    return { confirmationRequired: false, error: err instanceof Error ? err : new Error(getErrorMessage(err, 'Could not verify that email address.')) };
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        role: 'caregiver',
      },
    },
  });

  if (error) {
    return { confirmationRequired: false, error: new Error(isUniqueConstraintError(error) ? uniqueIdentityMessage(error) : error.message) };
  }
  if (!data.user) {
    return { confirmationRequired: false, error: new Error('Sign-up failed. Please try again.') };
  }

  // Same email-confirmation-required branch every other signup in this app
  // already handles (PricingPage.tsx) — if Supabase withholds a session,
  // the caregiver must confirm their email, then sign in normally.
  return { confirmationRequired: !data.session, error: null };
}

// ─── New patient registration (no administrator approval) ──────────────────
export interface CaregiverPatientRegistrationResult {
  success: boolean;
  patientId?: string;
  error?: string;
  /** True when the Auth account was created but the final claim step
   * failed — a resumable state. `resumeToken`/`resumeRegistrationId`/
   * `resumePatientId` let the caller retry ONLY the claim step without
   * re-running signUp(). */
  resumable?: boolean;
  resumeRegistrationId?: string;
  resumeClaimToken?: string;
  resumePatientId?: string;
}

function mapIntakeToRegistrationArgs(formData: PatientIntakeFormData) {
  return {
    p_first_name: formData.patientFirstName.trim(),
    p_last_name: formData.patientLastName.trim(),
    p_email: normalizeEmail(formData.patientEmail),
    p_preferred_name: formData.patientPreferredName || null,
    p_date_of_birth: formData.patientDateOfBirth || null,
    p_diagnosis_date: formData.patientDiagnosisDate || null,
    p_dementia_stage: formData.patientDementiaStage || null,
    p_location: formData.patientCity || null,
    p_address: [formData.patientStreetAddress, formData.patientCity, formData.patientState, formData.patientZipCode]
      .filter(Boolean).join(', ') || null,
    p_emergency_contact_name: formData.emergencyContactFullName || null,
    p_emergency_contact_relationship: formData.emergencyContactRelationship || null,
    p_emergency_contact_phone: formData.emergencyContactPhone || null,
    p_emergency_contact_email: formData.emergencyContactEmail || null,
    p_relationship_type: formData.caregiverRelationship || 'primary',
  };
}

/**
 * Full self-service registration: initiate (server-generates the claim
 * token) → create the new patient's Auth account on an isolated client
 * (never the caller's own session) → finish the profile row → claim/link.
 * Each step after the first is safely resumable on failure — see
 * `resumeCaregiverPatientRegistration` below.
 */
export async function registerPatientAsCaregiver(
  formData: PatientIntakeFormData,
  tempPassword: string,
): Promise<CaregiverPatientRegistrationResult> {
  // Step 1 — server-side token generation. Never touches Auth at all yet.
  const { data: registration, error: initError } = await supabase.rpc(
    'caregiver_initiate_patient_registration',
    mapIntakeToRegistrationArgs(formData),
  );
  if (initError || !registration) {
    return { success: false, error: initError?.message || 'Could not start registration.' };
  }

  // Step 2 — create the new patient's Auth account on an ISOLATED client.
  const isolatedClient = createIsolatedAuthClient();
  const { data: authData, error: authError } = await isolatedClient.auth.signUp({
    email: registration.patient_email,
    password: tempPassword,
    options: {
      data: {
        first_name: registration.patient_first_name,
        last_name: registration.patient_last_name,
        role: 'patient',
      },
    },
  });

  if (authError || !authData.user) {
    return {
      success: false,
      error: isUniqueConstraintError(authError) ? uniqueIdentityMessage(authError) : (authError?.message || 'Failed to create the patient account.'),
    };
  }

  const patientId = authData.user.id;

  // Step 3 — finish the profile row. The trigger already created a basic
  // row (role='patient'); this upsert only touches columns confirmed
  // writable by `authenticated` (migration 012's column grant) —
  // deliberately NOT including `email` (already correct from the trigger)
  // to avoid any ON CONFLICT DO UPDATE SET on a locked-down column.
  const { error: profileError } = await supabase.from('profiles').update({
    first_name: registration.patient_first_name,
    last_name: registration.patient_last_name,
    must_change_password: true,
    provisioning_status: 'profile_created',
    updated_at: new Date().toISOString(),
  }).eq('id', patientId);

  if (profileError) {
    // Resumable: the Auth account exists; the caller can retry the claim
    // step directly once this is resolved (claim itself re-verifies
    // provisioning_status, so a retry after fixing this is safe).
    return {
      success: false,
      error: 'Patient account created, but the profile could not be finished: ' + profileError.message,
      resumable: true,
      resumeRegistrationId: registration.id,
      resumeClaimToken: registration.claim_token,
      resumePatientId: patientId,
    };
  }

  // Step 4 — claim and link.
  return finishCaregiverPatientClaim(registration.id, registration.claim_token, patientId);
}

/** Retry ONLY the claim step — used after a step-3/4 failure, with the
 * token/ids the original caller already held in memory. No re-signup. */
export async function finishCaregiverPatientClaim(
  registrationId: string,
  claimToken: string,
  patientId: string,
): Promise<CaregiverPatientRegistrationResult> {
  const { data: patient, error: claimError } = await supabase.rpc('caregiver_claim_new_patient', {
    p_registration_id: registrationId,
    p_claim_token: claimToken,
    p_patient_id: patientId,
  });

  if (claimError || !patient) {
    return {
      success: false,
      error: claimError?.message || 'Could not complete patient registration.',
      resumable: true,
      resumeRegistrationId: registrationId,
      resumeClaimToken: claimToken,
      resumePatientId: patientId,
    };
  }

  return { success: true, patientId: patient.id };
}

// ─── My Patients (read-only) ─────────────────────────────────────────────────
export interface LinkedPatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  isPrimary: boolean;
}

export async function getMyLinkedPatients(): Promise<LinkedPatientSummary[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Reuses the EXISTING, unmodified caregiver_patients SELECT policy
  // (migration 001: caregiver_id = auth.uid()) — no new policy needed.
  const { data: links, error: linksError } = await supabase
    .from('caregiver_patients')
    .select('patient_id, is_primary')
    .eq('caregiver_id', user.id);

  if (linksError || !links || links.length === 0) return [];

  const patientIds = links.map((l) => l.patient_id);
  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, first_name, last_name, preferred_name')
    .in('id', patientIds);

  if (patientsError || !patients) return [];

  const primaryById = new Map(links.map((l) => [l.patient_id, l.is_primary]));
  return patients.map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    preferredName: p.preferred_name,
    isPrimary: !!primaryById.get(p.id),
  }));
}
