import { supabase } from '@/lib/supabase';
import { normalizeEmail, assertUniqueProfileIdentity, isUniqueConstraintError, uniqueIdentityMessage } from '@/lib/identity';
import { getErrorMessage } from '@/lib/utils';
import type { PatientIntakeFormData } from '@/types/patientIntake';

/**
 * ENTERPRISE CONSOLIDATED DELIVERY — fixes the reported "Edge Function
 * non-2xx / HTTP 400 registration failure."
 *
 * Root cause, confirmed by reading @supabase/functions-js directly
 * (FunctionsClient.js): on ANY non-2xx response, `invoke()` throws a
 * `FunctionsHttpError` BEFORE ever reading the response body — `data` is
 * always `null` in that case, and `error.message` is hardcoded to the
 * generic string "Edge Function returned a non-2xx status code". Every
 * intentional error this app's Edge Functions return as JSON (duplicate
 * email, capacity reached, a bad field, etc.) was therefore NEVER actually
 * shown to the caregiver — only that one generic, unhelpful string,
 * regardless of which specific validation failed server-side. This is the
 * exact, confirmed explanation for the reported symptom.
 *
 * The real body is still readable from `error.context` (the raw,
 * not-yet-consumed Response object) — this helper reads it.
 */
async function extractEdgeFunctionError(error: unknown, fallback: string): Promise<{
  message: string;
  body: Record<string, unknown> | null;
}> {
  const context = (error as { name?: string; context?: unknown } | null)?.context;
  if (
    error && typeof error === 'object' && (error as { name?: string }).name === 'FunctionsHttpError' &&
    context && typeof (context as Response).json === 'function'
  ) {
    try {
      const body = await (context as Response).clone().json() as Record<string, unknown>;
      const message = typeof body?.error === 'string' ? body.error : fallback;
      return { message, body };
    } catch {
      // Body wasn't JSON (or was already consumed) — fall through to the
      // generic message rather than throwing a second error.
    }
  }
  return { message: getErrorMessage(error, fallback), body: null };
}

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
    // On success, `data` is the parsed JSON body as usual. On failure,
    // invoke() never populates `data` at all (see the helper's own
    // comment) — the real message/fields live in `error.context`'s body.
    const { message, body } = error
      ? await extractEdgeFunctionError(error, 'Could not complete patient registration.')
      : { message: data?.error || 'Could not complete patient registration.', body: data as Record<string, unknown> | null };
    return {
      success: false,
      error: isUniqueConstraintError({ message } as { message: string }) ? uniqueIdentityMessage({ message } as { message: string }) : message,
      resumable: Boolean(body?.resumable),
      resumeRegistrationId: body?.resumeRegistrationId as string | undefined,
      resumeClaimToken: body?.resumeClaimToken as string | undefined,
      resumePatientId: body?.resumePatientId as string | undefined,
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

// ─── My Patients ──────────────────────────────────────────────────────────
export interface LinkedPatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  isPrimary: boolean;
  /** CAREGIVER DASHBOARD-FIRST NAVIGATION item 4: caregiver-chosen label
   * for THIS relationship only — never the patient's real identity. */
  displayLabel: string | null;
  /** item 2: "a stable patient reference" — the short, non-sensitive tail
   * of the immutable database UUID (never the full id, never guessable as
   * a sequential/incrementing value). Display only; every actual access
   * check uses the full `id`. */
  shortReference: string;
}

/** Last 8 characters of the patient's immutable UUID, uppercased — a
 * short, stable, human-referenceable id that is NOT a new identifier (no
 * schema change) and never substitutes for the real id in any access
 * check. */
function shortReferenceFor(patientId: string): string {
  return patientId.replace(/-/g, '').slice(-8).toUpperCase();
}

export async function getMyLinkedPatients(): Promise<LinkedPatientSummary[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Reuses the EXISTING, unmodified caregiver_patients SELECT policy
  // (migration 001: caregiver_id = auth.uid()) — no new policy needed.
  const { data: links, error: linksError } = await supabase
    .from('caregiver_patients')
    .select('patient_id, is_primary, display_label')
    .eq('caregiver_id', user.id);

  if (linksError || !links || links.length === 0) return [];

  const patientIds = links.map((l) => l.patient_id);
  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, first_name, last_name, preferred_name')
    .in('id', patientIds);

  if (patientsError || !patients) return [];

  const linkByPatientId = new Map(links.map((l) => [l.patient_id, l]));
  return patients.map((p) => {
    const link = linkByPatientId.get(p.id);
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      preferredName: p.preferred_name,
      isPrimary: !!link?.is_primary,
      displayLabel: link?.display_label ?? null,
      shortReference: shortReferenceFor(p.id),
    };
  });
}

/**
 * CAREGIVER DASHBOARD-FIRST NAVIGATION item 4: sets (or clears, with an
 * empty string) the caregiver's own display label for one patient
 * relationship. Scoped entirely server-side by migration 033's RLS policy
 * (caregiver_id = auth.uid()) and column grant (display_label/updated_at
 * ONLY) — a caregiver can never rename or touch any other relationship,
 * their own or another caregiver's, through this call. Never writes to
 * patients.first_name/last_name/preferred_name/id.
 */
export async function setPatientDisplayLabel(patientId: string, label: string): Promise<{ error: string | null }> {
  const trimmed = label.trim();
  const { error } = await supabase
    .from('caregiver_patients')
    .update({ display_label: trimmed || null, updated_at: new Date().toISOString() })
    .eq('patient_id', patientId);
  return { error: error?.message ?? null };
}

/**
 * CAREGIVER DASHBOARD-FIRST NAVIGATION item 3: the ONE server-verified
 * check every "Open Patient Account" action (and every re-navigation /
 * session refresh into that view) must pass before rendering any
 * patient-scoped data. Reuses the SAME caregiver_patients SELECT RLS
 * policy as getMyLinkedPatients() — a caregiver can never get `true` back
 * for a patient_id their own caregiver_patients row doesn't reference,
 * regardless of what id a URL or component prop claims.
 */
export async function verifyCaregiverPatientLink(patientId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('caregiver_patients')
    .select('patient_id')
    .eq('patient_id', patientId)
    .maybeSingle();
  return !error && !!data;
}

// ─── Incomplete / resumable registrations (dashboard visibility) ──────────
export interface PendingRegistrationSummary {
  registrationId: string;
  claimToken: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  /** Present only when the patient's Auth account was actually created and
   * is still awaiting claim — the dashboard offers "Finish Registration"
   * ONLY in that case; otherwise it shows the incomplete state with no
   * false recovery action (item 5). */
  resumablePatientId: string | null;
}

export async function getMyPendingRegistrations(): Promise<PendingRegistrationSummary[]> {
  const { data, error } = await supabase.rpc('get_my_pending_registrations');
  if (error || !data) return [];
  return data.map((r) => ({
    registrationId: r.registration_id,
    claimToken: r.claim_token,
    firstName: r.patient_first_name,
    lastName: r.patient_last_name,
    email: r.patient_email,
    createdAt: r.created_at,
    resumablePatientId: r.resumable_patient_id,
  }));
}

/** ENTERPRISE CONSOLIDATED DELIVERY: the "Delete" control for an
 * incomplete registration — the dashboard's "Continue/Edit/Delete"
 * requirement. Only the owning caregiver's own unconsumed registration
 * can ever be deleted (migration 034).
 *
 * CRITICAL OWNER-REPORTED REMEDIATION Correction A: this bare RPC call is
 * now used ONLY when the registration has no resumable patient id (no
 * Auth account was ever created for it) — see
 * deletePendingRegistrationSafely() below for the case where one was. */
export async function cancelMyPendingRegistration(registrationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_my_pending_registration', { p_registration_id: registrationId });
  return { error: error?.message ?? null };
}

/**
 * CRITICAL OWNER-REPORTED REMEDIATION Correction A: the orphan-safe
 * "Delete Registration" for a registration whose Auth account was
 * already created (resumablePatientId present). cancelMyPendingRegistration()
 * alone would strand that account permanently — unclaimed, unlinked, and
 * blocking its email from ever being used again. This instead calls the
 * delete-pending-registration Edge Function, which removes that unused
 * account first (server-side, admin API) and only then removes the
 * registration record. Safe to call even when no such account exists —
 * the function checks and reports removedUnusedAccount: false in that case.
 */
export async function deletePendingRegistrationSafely(registrationId: string): Promise<{ removedUnusedAccount: boolean; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { removedUnusedAccount: false, error: 'You must be signed in as a caregiver.' };
  }
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; removedUnusedAccount?: boolean; error?: string }>(
    'delete-pending-registration',
    { body: { registrationId } },
  );
  if (error || !data?.success) {
    const { message } = error
      ? await extractEdgeFunctionError(error, 'Could not delete this registration.')
      : { message: data?.error || 'Could not delete this registration.' };
    return { removedUnusedAccount: false, error: message };
  }
  return { removedUnusedAccount: Boolean(data.removedUnusedAccount), error: null };
}

/** CRITICAL OWNER-REPORTED REMEDIATION Correction A: "Edit Registration" —
 * reloads every stored field for one of the caller's own unconsumed
 * registrations. */
export interface PendingRegistrationDetail {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  diagnosisDate: string | null;
  dementiaStage: string | null;
  location: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  emergencyContactEmail: string | null;
  relationshipType: string;
  /** True once an Auth account already exists for this registration's
   * email — the email field becomes read-only in the edit form in that
   * case (see caregiver_update_pending_registration()'s own check). */
  hasResumableAccount: boolean;
}

export async function getPendingRegistrationDetail(registrationId: string): Promise<{ detail: PendingRegistrationDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_pending_registration_detail', { p_registration_id: registrationId });
  if (error || !data) {
    return { detail: null, error: error?.message ?? 'Could not load this registration.' };
  }
  const pending = await getMyPendingRegistrations();
  const summary = pending.find((p) => p.registrationId === registrationId);
  return {
    detail: {
      registrationId: data.id,
      firstName: data.patient_first_name,
      lastName: data.patient_last_name,
      email: data.patient_email,
      preferredName: data.patient_preferred_name,
      dateOfBirth: data.patient_date_of_birth,
      diagnosisDate: data.patient_diagnosis_date,
      dementiaStage: data.patient_dementia_stage,
      location: data.patient_location,
      address: data.patient_address,
      emergencyContactName: data.emergency_contact_name,
      emergencyContactRelationship: data.emergency_contact_relationship,
      emergencyContactPhone: data.emergency_contact_phone,
      emergencyContactEmail: data.emergency_contact_email,
      relationshipType: data.relationship_type,
      hasResumableAccount: Boolean(summary?.resumablePatientId),
    },
    error: null,
  };
}

export interface PendingRegistrationEditInput {
  firstName: string;
  lastName: string;
  email: string;
  preferredName?: string | null;
  dateOfBirth?: string | null;
  diagnosisDate?: string | null;
  dementiaStage?: string | null;
  location?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactEmail?: string | null;
  relationshipType?: string;
}

export async function updatePendingRegistration(
  registrationId: string, input: PendingRegistrationEditInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('caregiver_update_pending_registration', {
    p_registration_id: registrationId,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_email: normalizeEmail(input.email),
    p_preferred_name: input.preferredName || null,
    p_date_of_birth: input.dateOfBirth || null,
    p_diagnosis_date: input.diagnosisDate || null,
    p_dementia_stage: input.dementiaStage || null,
    p_location: input.location || null,
    p_address: input.address || null,
    p_emergency_contact_name: input.emergencyContactName || null,
    p_emergency_contact_relationship: input.emergencyContactRelationship || null,
    p_emergency_contact_phone: input.emergencyContactPhone || null,
    p_emergency_contact_email: input.emergencyContactEmail || null,
    p_relationship_type: input.relationshipType || 'primary',
  });
  return { error: error?.message ?? null };
}
