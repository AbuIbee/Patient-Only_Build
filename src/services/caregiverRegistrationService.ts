import { supabase } from '@/lib/supabase';
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
  /** One-time activation link (Supabase recovery-link flow) — replaces the
   * old plaintext temporary password. Never a password string. The
   * caregiver relays this to the patient however is appropriate; it also
   * supports a caregiver-managed patient with no independent email access,
   * since generating this link never sends an email itself. */
  activationLink?: string | null;
  /** True when the server-side call failed after the registration was
   * already initiated — a resumable state used by the Edge Function's own
   * error response. */
  resumable?: boolean;
  resumeRegistrationId?: string;
  resumeClaimToken?: string;
  resumePatientId?: string;
}

/**
 * OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase A item 1: the entire
 * registration (initiate → create the patient's Auth account → correct
 * provisioning_status → claim/link → generate an activation link) now runs
 * as ONE atomic call inside the provision-caregiver-patient Edge Function,
 * using the service-role key that exists ONLY inside that function's own
 * deployed runtime — never in this file, never in any frontend bundle.
 * This replaces the old 3-step browser sequence (isolated-client signUp() +
 * a caregiver-session profiles UPDATE that RLS silently rejected, which is
 * exactly why the Edge Function instead uses an admin client server-side).
 */
export async function registerPatientAsCaregiver(
  formData: PatientIntakeFormData,
): Promise<CaregiverPatientRegistrationResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, error: 'You must be signed in as a caregiver to register a patient.' };
  }

  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    patientId?: string;
    activationLink?: string | null;
    error?: string;
    resumable?: boolean;
    resumeRegistrationId?: string;
    resumeClaimToken?: string;
    resumePatientId?: string;
  }>('provision-caregiver-patient', {
    body: {
      firstName: formData.patientFirstName.trim(),
      lastName: formData.patientLastName.trim(),
      email: normalizeEmail(formData.patientEmail),
      preferredName: formData.patientPreferredName || null,
      dateOfBirth: formData.patientDateOfBirth || null,
      diagnosisDate: formData.patientDiagnosisDate || null,
      dementiaStage: formData.patientDementiaStage || null,
      location: formData.patientCity || null,
      address: [formData.patientStreetAddress, formData.patientCity, formData.patientState, formData.patientZipCode]
        .filter(Boolean).join(', ') || null,
      emergencyContactName: formData.emergencyContactFullName || null,
      emergencyContactRelationship: formData.emergencyContactRelationship || null,
      emergencyContactPhone: formData.emergencyContactPhone || null,
      emergencyContactEmail: formData.emergencyContactEmail || null,
      relationshipType: formData.caregiverRelationship || 'primary',
    },
  });

  if (error || !data?.success) {
    const message = data?.error || getErrorMessage(error, 'Could not complete patient registration.');
    return {
      success: false,
      error: isUniqueConstraintError({ message } as { message: string }) ? uniqueIdentityMessage({ message } as { message: string }) : message,
      resumable: data?.resumable,
      resumeRegistrationId: data?.resumeRegistrationId,
      resumeClaimToken: data?.resumeClaimToken,
      resumePatientId: data?.resumePatientId,
    };
  }

  return { success: true, patientId: data.patientId, activationLink: data.activationLink ?? null };
}

/**
 * Resumes ONLY the final claim/link step — used when the Edge Function
 * reported a resumable failure after the patient's Auth account and
 * provisioning_status were already correctly set (step 4 of the function
 * failing after steps 1–3 succeeded, e.g. a transient network error). Calls
 * the same caregiver_claim_new_patient() RPC directly as the caregiver's
 * own session — it is SECURITY DEFINER and does not need service-role
 * privilege, unlike the provisioning_status correction the Edge Function
 * already performed. Does NOT re-create the Auth account or re-run
 * initiate — no duplicate registration is possible.
 */
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
      error: claimError?.message || 'Could not complete patient registration. This may require support if the account could not be finished.',
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
