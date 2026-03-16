import { supabase } from '@/lib/supabase';
import type { PatientIntake, PatientIntakeFormData } from '@/types/patientIntake';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-patient`;

/**
 * Create a new patient intake record (Step 1)
 * This stores the canonical patient data in patient_intake
 */
export async function createPatientIntake(
  formData: PatientIntakeFormData,
  caregiverId: string
): Promise<{ intakeId: string; error: Error | null }> {
  const { data, error } = await supabase
    .from('patient_intake')
    .insert({
      // Linkage (will be set during provisioning)
      patient_profile_id: null,
      caregiver_profile_id: caregiverId,

      // Patient information
      patient_first_name: formData.patientFirstName,
      patient_last_name: formData.patientLastName,
      patient_preferred_name: formData.patientPreferredName || null,
      patient_date_of_birth: formData.patientDateOfBirth || null,
      patient_diagnosis_date: formData.patientDiagnosisDate || null,
      patient_dementia_stage: formData.patientDementiaStage || null,
      patient_street_address: formData.patientStreetAddress || null,
      patient_city: formData.patientCity || null,
      patient_state: formData.patientState || null,
      patient_zip_code: formData.patientZipCode || null,
      patient_phone: formData.patientPhone || null,
      patient_email: formData.patientEmail || null,

      // Doctor/therapist information
      preferred_hospital: formData.preferredHospital || null,
      doctor_therapist_name: formData.doctorTherapistName || null,
      doctor_therapist_phone: formData.doctorTherapistPhone || null,

      // Caregiver information (snapshot)
      caregiver_name: formData.caregiverName || null,
      caregiver_relationship: formData.caregiverRelationship || null,
      caregiver_phone: formData.caregiverPhone || null,

      // Medications (single free-text field)
      medications_and_dosage: formData.medicationsAndDosage || null,

      // Emergency contact
      emergency_contact_full_name: formData.emergencyContactFullName || null,
      emergency_contact_phone: formData.emergencyContactPhone || null,
      emergency_contact_email: formData.emergencyContactEmail || null,
      emergency_contact_relationship: formData.emergencyContactRelationship || null,

      // Metadata
      created_by: caregiverId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating patient intake:', error);
    return { intakeId: '', error };
  }

  return { intakeId: data.id, error: null };
}

/**
 * Provision patient from intake (Step 2)
 * Calls Edge Function to create auth user and link everything
 */
export async function provisionPatient(
  intakeId: string,
  patientEmail: string,
  patientFirstName: string,
  patientLastName: string,
  caregiverProfileId: string,
  patientPhone?: string
): Promise<{ patientProfileId: string; error: Error | null }> {
  // Get current session for auth header
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return { patientProfileId: '', error: new Error('Not authenticated') };
  }

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        intake_id: intakeId,
        patient_email: patientEmail,
        patient_first_name: patientFirstName,
        patient_last_name: patientLastName,
        patient_phone: patientPhone,
        caregiver_profile_id: caregiverProfileId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { 
        patientProfileId: '', 
        error: new Error(result.error || 'Failed to provision patient') 
      };
    }

    return { patientProfileId: result.patient_profile_id, error: null };
  } catch (error) {
    console.error('Error calling provision-patient Edge Function:', error);
    return { patientProfileId: '', error: error as Error };
  }
}

/**
 * Complete patient creation flow (Step 1 + Step 2)
 */
export async function createAndProvisionPatient(
  formData: PatientIntakeFormData,
  caregiverId: string
): Promise<{ patientProfileId: string; intakeId: string; error: Error | null }> {
  // Step 1: Create intake
  const { intakeId, error: intakeError } = await createPatientIntake(formData, caregiverId);
  
  if (intakeError || !intakeId) {
    return { patientProfileId: '', intakeId: '', error: intakeError || new Error('Failed to create intake') };
  }

  // Step 2: Provision patient
  const { patientProfileId, error: provisionError } = await provisionPatient(
    intakeId,
    formData.patientEmail,
    formData.patientFirstName,
    formData.patientLastName,
    caregiverId,
    formData.patientPhone
  );

  if (provisionError) {
    return { patientProfileId: '', intakeId, error: provisionError };
  }

  return { patientProfileId, intakeId, error: null };
}

/**
 * Get patient intake by ID
 */
export async function getPatientIntake(intakeId: string): Promise<PatientIntake | null> {
  const { data, error } = await supabase
    .from('patient_intake')
    .select('*')
    .eq('id', intakeId)
    .single();

  if (error || !data) {
    console.error('Error fetching patient intake:', error);
    return null;
  }

  return transformDbToPatientIntake(data);
}

/**
 * Get patient intake by patient profile ID
 */
export async function getPatientIntakeByProfileId(patientProfileId: string): Promise<PatientIntake | null> {
  const { data, error } = await supabase
    .from('patient_intake')
    .select('*')
    .eq('patient_profile_id', patientProfileId)
    .single();

  if (error || !data) {
    console.error('Error fetching patient intake by profile:', error);
    return null;
  }

  return transformDbToPatientIntake(data);
}

/**
 * Get all intakes for a caregiver
 */
export async function getCaregiverIntakes(caregiverId: string): Promise<PatientIntake[]> {
  const { data, error } = await supabase
    .from('patient_intake')
    .select('*')
    .eq('caregiver_profile_id', caregiverId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching caregiver intakes:', error);
    return [];
  }

  return (data || []).map(transformDbToPatientIntake);
}

/**
 * Update patient intake
 */
export async function updatePatientIntake(
  intakeId: string,
  updates: Partial<PatientIntakeFormData>
): Promise<{ success: boolean; error: Error | null }> {
  const updateData: Record<string, any> = {};

  if (updates.patientFirstName !== undefined) updateData.patient_first_name = updates.patientFirstName;
  if (updates.patientLastName !== undefined) updateData.patient_last_name = updates.patientLastName;
  if (updates.patientPreferredName !== undefined) updateData.patient_preferred_name = updates.patientPreferredName;
  if (updates.patientDateOfBirth !== undefined) updateData.patient_date_of_birth = updates.patientDateOfBirth;
  if (updates.patientDiagnosisDate !== undefined) updateData.patient_diagnosis_date = updates.patientDiagnosisDate;
  if (updates.patientDementiaStage !== undefined) updateData.patient_dementia_stage = updates.patientDementiaStage;
  if (updates.patientStreetAddress !== undefined) updateData.patient_street_address = updates.patientStreetAddress;
  if (updates.patientCity !== undefined) updateData.patient_city = updates.patientCity;
  if (updates.patientState !== undefined) updateData.patient_state = updates.patientState;
  if (updates.patientZipCode !== undefined) updateData.patient_zip_code = updates.patientZipCode;
  if (updates.patientPhone !== undefined) updateData.patient_phone = updates.patientPhone;
  if (updates.patientEmail !== undefined) updateData.patient_email = updates.patientEmail;
  if (updates.preferredHospital !== undefined) updateData.preferred_hospital = updates.preferredHospital;
  if (updates.doctorTherapistName !== undefined) updateData.doctor_therapist_name = updates.doctorTherapistName;
  if (updates.doctorTherapistPhone !== undefined) updateData.doctor_therapist_phone = updates.doctorTherapistPhone;
  if (updates.caregiverName !== undefined) updateData.caregiver_name = updates.caregiverName;
  if (updates.caregiverRelationship !== undefined) updateData.caregiver_relationship = updates.caregiverRelationship;
  if (updates.caregiverPhone !== undefined) updateData.caregiver_phone = updates.caregiverPhone;
  if (updates.medicationsAndDosage !== undefined) updateData.medications_and_dosage = updates.medicationsAndDosage;
  if (updates.emergencyContactFullName !== undefined) updateData.emergency_contact_full_name = updates.emergencyContactFullName;
  if (updates.emergencyContactPhone !== undefined) updateData.emergency_contact_phone = updates.emergencyContactPhone;
  if (updates.emergencyContactEmail !== undefined) updateData.emergency_contact_email = updates.emergencyContactEmail;
  if (updates.emergencyContactRelationship !== undefined) updateData.emergency_contact_relationship = updates.emergencyContactRelationship;

  const { error } = await supabase
    .from('patient_intake')
    .update(updateData)
    .eq('id', intakeId);

  if (error) {
    console.error('Error updating patient intake:', error);
    return { success: false, error };
  }

  return { success: true, error: null };
}

/**
 * Delete patient intake
 */
export async function deletePatientIntake(intakeId: string): Promise<{ success: boolean; error: Error | null }> {
  const { error } = await supabase
    .from('patient_intake')
    .delete()
    .eq('id', intakeId);

  if (error) {
    console.error('Error deleting patient intake:', error);
    return { success: false, error };
  }

  return { success: true, error: null };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformDbToPatientIntake(data: any): PatientIntake {
  return {
    id: data.id,
    patientProfileId: data.patient_profile_id,
    caregiverProfileId: data.caregiver_profile_id,
    
    // Patient information
    patientFirstName: data.patient_first_name,
    patientLastName: data.patient_last_name,
    patientPreferredName: data.patient_preferred_name,
    patientDateOfBirth: data.patient_date_of_birth,
    patientDiagnosisDate: data.patient_diagnosis_date,
    patientDementiaStage: data.patient_dementia_stage,
    patientStreetAddress: data.patient_street_address,
    patientCity: data.patient_city,
    patientState: data.patient_state,
    patientZipCode: data.patient_zip_code,
    patientPhone: data.patient_phone,
    patientEmail: data.patient_email,
    
    // Doctor/therapist information
    preferredHospital: data.preferred_hospital,
    doctorTherapistName: data.doctor_therapist_name,
    doctorTherapistPhone: data.doctor_therapist_phone,
    
    // Caregiver information
    caregiverName: data.caregiver_name,
    caregiverRelationship: data.caregiver_relationship,
    caregiverPhone: data.caregiver_phone,
    
    // Medications
    medicationsAndDosage: data.medications_and_dosage,
    
    // Emergency contact
    emergencyContactFullName: data.emergency_contact_full_name,
    emergencyContactPhone: data.emergency_contact_phone,
    emergencyContactEmail: data.emergency_contact_email,
    emergencyContactRelationship: data.emergency_contact_relationship,
    
    // Metadata
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
