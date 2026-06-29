import { supabase } from '@/lib/supabase';
import { createPatient } from '@/services/patientService';
import type { PatientIntake, PatientIntakeFormData } from '@/types/patientIntake';

/**
 * Complete patient creation/update flow.
 *
 * Handles TWO scenarios:
 *   A) A patient logs in and fills out their own intake form
 *      → update their existing profile/patients rows directly (no new auth user)
 *   B) An admin adds a new patient through the admin portal
 *      → create a full new auth account + profile + patients row
 */
export async function createAndProvisionPatient(
  formData: PatientIntakeFormData,
  _caregiverIdIgnored: string
): Promise<{ patientProfileId: string; intakeId: string; error: Error | null }> {

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { patientProfileId: '', intakeId: '', error: new Error('You must be logged in. Please sign in again.') };
  }
  const realUserId = user.id;

  // ── Detect whether the logged-in user is already a patient ───────────────
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', realUserId)
    .maybeSingle();

  const isPatientSelf = existingProfile?.role === 'patient';

  // ── Step 1: Save intake record ────────────────────────────────────────────
  const { data: intakeRow, error: intakeError } = await supabase
    .from('patient_intake')
    .insert({
      patient_profile_id:              isPatientSelf ? realUserId : null,
      caregiver_profile_id:            isPatientSelf ? null : realUserId,
      patient_first_name:              formData.patientFirstName,
      patient_last_name:               formData.patientLastName,
      patient_preferred_name:          formData.patientPreferredName          || null,
      patient_date_of_birth:           formData.patientDateOfBirth            || null,
      patient_diagnosis_date:          formData.patientDiagnosisDate          || null,
      patient_dementia_stage:          formData.patientDementiaStage          || null,
      patient_street_address:          formData.patientStreetAddress          || null,
      patient_city:                    formData.patientCity                   || null,
      patient_state:                   formData.patientState                  || null,
      patient_zip_code:                formData.patientZipCode                || null,
      patient_phone:                   formData.patientPhone                  || null,
      patient_email:                   formData.patientEmail                  || null,
      preferred_hospital:              formData.preferredHospital             || null,
      doctor_therapist_name:           formData.doctorTherapistName           || null,
      doctor_therapist_phone:          formData.doctorTherapistPhone          || null,
      caregiver_name:                  formData.caregiverName                 || null,
      caregiver_relationship:          formData.caregiverRelationship         || null,
      caregiver_phone:                 formData.caregiverPhone                || null,
      medications_and_dosage:          formData.medicationsAndDosage          || null,
      emergency_contact_full_name:     formData.emergencyContactFullName      || null,
      emergency_contact_phone:         formData.emergencyContactPhone         || null,
      emergency_contact_email:         formData.emergencyContactEmail         || null,
      emergency_contact_relationship:  formData.emergencyContactRelationship  || null,
      created_by:                      realUserId,
    })
    .select('id')
    .single();

  if (intakeError || !intakeRow) {
    const msg = intakeError?.message?.includes('row-level security')
      ? 'Permission denied saving your information. Please sign out, sign back in, and try again.'
      : intakeError?.message || 'Failed to save patient data.';
    return { patientProfileId: '', intakeId: '', error: new Error(msg) };
  }

  const intakeId = intakeRow.id as string;

  // ── Step 2A: Patient is filling in their OWN profile ─────────────────────
  // Just upsert their patients row and update their profile — no new auth user.
  if (isPatientSelf) {
    try {
      // Upsert into patients table (may not exist yet for this user)
      await supabase.from('patients').upsert({
        id:                             realUserId,
        preferred_name:                 formData.patientPreferredName          || null,
        date_of_birth:                  formData.patientDateOfBirth            || null,
        diagnosis_date:                 formData.patientDiagnosisDate          || null,
        dementia_stage:                 formData.patientDementiaStage          || null,
        location:                       formData.patientCity                   || null,
        address:                        [formData.patientStreetAddress, formData.patientCity, formData.patientState, formData.patientZipCode]
                                          .filter(Boolean).join(', ')          || null,
        emergency_contact_name:         formData.emergencyContactFullName      || null,
        emergency_contact_relationship: formData.emergencyContactRelationship  || null,
        emergency_contact_phone:        formData.emergencyContactPhone         || null,
        emergency_contact_email:        formData.emergencyContactEmail         || null,
        updated_at:                     new Date().toISOString(),
      }, { onConflict: 'id' });

      // Update their profile with any name/phone changes from the form
      await supabase.from('profiles').update({
        first_name: formData.patientFirstName  || undefined,
        last_name:  formData.patientLastName   || undefined,
        phone:      formData.patientPhone      || null,
        updated_at: new Date().toISOString(),
      }).eq('id', realUserId);

      return { patientProfileId: realUserId, intakeId, error: null };
    } catch (err: any) {
      return {
        patientProfileId: '',
        intakeId,
        error: new Error('Profile info saved but patient record update failed: ' + (err?.message || 'unknown error')),
      };
    }
  }

  // ── Step 2B: Admin/caregiver adding a NEW patient ─────────────────────────
  // Create a full auth account + profile + patients row.
  let patientProfileId = '';
  try {
    const patient = await createPatient(
      {
        firstName:     formData.patientFirstName,
        lastName:      formData.patientLastName,
        preferredName: formData.patientPreferredName || undefined,
        email:         formData.patientEmail,
        tempPassword:  (formData as any).patientTempPassword || undefined,
        dateOfBirth:   formData.patientDateOfBirth   || undefined,
        dementiaStage: formData.patientDementiaStage as 'early' | 'middle' | 'late' | undefined,
        diagnosisDate: formData.patientDiagnosisDate || undefined,
        emergencyContact: {
          name:         formData.emergencyContactFullName     || '',
          phone:        formData.emergencyContactPhone        || '',
          relationship: formData.emergencyContactRelationship || '',
        },
        location: formData.patientCity || undefined,
        address:  [formData.patientStreetAddress, formData.patientCity, formData.patientState, formData.patientZipCode]
          .filter(Boolean).join(', ') || undefined,
      },
      realUserId,
      formData.caregiverRelationship || 'primary'
    );

    patientProfileId = patient.id;

    // Back-fill intake with the new patient's profile id
    await supabase
      .from('patient_intake')
      .update({ patient_profile_id: patientProfileId })
      .eq('id', intakeId);

  } catch (err: any) {
    return {
      patientProfileId: '',
      intakeId,
      error: new Error('Patient info saved, but account creation failed: ' + (err?.message || 'unknown error')),
    };
  }

  return { patientProfileId, intakeId, error: null };
}

export async function createPatientIntake(formData: PatientIntakeFormData, caregiverId: string): Promise<{ intakeId: string; error: Error | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const realId = user?.id ?? caregiverId;
  const { data, error } = await supabase.from('patient_intake').insert({
    patient_profile_id: null, caregiver_profile_id: realId,
    patient_first_name: formData.patientFirstName, patient_last_name: formData.patientLastName,
    patient_preferred_name: formData.patientPreferredName || null, patient_date_of_birth: formData.patientDateOfBirth || null,
    patient_diagnosis_date: formData.patientDiagnosisDate || null, patient_dementia_stage: formData.patientDementiaStage || null,
    patient_street_address: formData.patientStreetAddress || null, patient_city: formData.patientCity || null,
    patient_state: formData.patientState || null, patient_zip_code: formData.patientZipCode || null,
    patient_phone: formData.patientPhone || null, patient_email: formData.patientEmail || null,
    preferred_hospital: formData.preferredHospital || null, doctor_therapist_name: formData.doctorTherapistName || null,
    doctor_therapist_phone: formData.doctorTherapistPhone || null, caregiver_name: formData.caregiverName || null,
    caregiver_relationship: formData.caregiverRelationship || null, caregiver_phone: formData.caregiverPhone || null,
    medications_and_dosage: formData.medicationsAndDosage || null,
    emergency_contact_full_name: formData.emergencyContactFullName || null, emergency_contact_phone: formData.emergencyContactPhone || null,
    emergency_contact_email: formData.emergencyContactEmail || null, emergency_contact_relationship: formData.emergencyContactRelationship || null,
    created_by: realId,
  }).select('id').single();
  if (error) return { intakeId: '', error };
  return { intakeId: data.id, error: null };
}

export async function getPatientIntake(intakeId: string): Promise<PatientIntake | null> {
  const { data, error } = await supabase.from('patient_intake').select('*').eq('id', intakeId).single();
  if (error || !data) return null;
  return transformDbToPatientIntake(data);
}

export async function getPatientIntakeByProfileId(patientProfileId: string): Promise<PatientIntake | null> {
  const { data, error } = await supabase.from('patient_intake').select('*').eq('patient_profile_id', patientProfileId).single();
  if (error || !data) return null;
  return transformDbToPatientIntake(data);
}

export async function getCaregiverIntakes(caregiverId: string): Promise<PatientIntake[]> {
  const { data, error } = await supabase.from('patient_intake').select('*').eq('caregiver_profile_id', caregiverId).order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(transformDbToPatientIntake);
}

export async function updatePatientIntake(intakeId: string, updates: Partial<PatientIntakeFormData>): Promise<{ success: boolean; error: Error | null }> {
  const d: Record<string, any> = {};
  if (updates.patientFirstName !== undefined) d.patient_first_name = updates.patientFirstName;
  if (updates.patientLastName !== undefined) d.patient_last_name = updates.patientLastName;
  if (updates.patientEmail !== undefined) d.patient_email = updates.patientEmail;
  if (updates.patientPhone !== undefined) d.patient_phone = updates.patientPhone;
  if (updates.medicationsAndDosage !== undefined) d.medications_and_dosage = updates.medicationsAndDosage;
  const { error } = await supabase.from('patient_intake').update(d).eq('id', intakeId);
  if (error) return { success: false, error };
  return { success: true, error: null };
}

export async function deletePatientIntake(intakeId: string): Promise<{ success: boolean; error: Error | null }> {
  const { error } = await supabase.from('patient_intake').delete().eq('id', intakeId);
  if (error) return { success: false, error };
  return { success: true, error: null };
}

function transformDbToPatientIntake(data: any): PatientIntake {
  return {
    id: data.id, patientProfileId: data.patient_profile_id, caregiverProfileId: data.caregiver_profile_id,
    patientFirstName: data.patient_first_name, patientLastName: data.patient_last_name,
    patientPreferredName: data.patient_preferred_name, patientDateOfBirth: data.patient_date_of_birth,
    patientDiagnosisDate: data.patient_diagnosis_date, patientDementiaStage: data.patient_dementia_stage,
    patientStreetAddress: data.patient_street_address, patientCity: data.patient_city,
    patientState: data.patient_state, patientZipCode: data.patient_zip_code,
    patientPhone: data.patient_phone, patientEmail: data.patient_email,
    preferredHospital: data.preferred_hospital, doctorTherapistName: data.doctor_therapist_name,
    doctorTherapistPhone: data.doctor_therapist_phone, caregiverName: data.caregiver_name,
    caregiverRelationship: data.caregiver_relationship, caregiverPhone: data.caregiver_phone,
    medicationsAndDosage: data.medications_and_dosage, emergencyContactFullName: data.emergency_contact_full_name,
    emergencyContactPhone: data.emergency_contact_phone, emergencyContactEmail: data.emergency_contact_email,
    emergencyContactRelationship: data.emergency_contact_relationship,
    createdBy: data.created_by, createdAt: data.created_at, updatedAt: data.updated_at,
  };
}