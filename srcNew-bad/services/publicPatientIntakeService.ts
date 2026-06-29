import { supabase } from '@/lib/supabase';
import type { PatientIntakeFormData } from '@/types/patientIntake';

export async function createPublicPatientIntake(
  formData: PatientIntakeFormData
): Promise<{ intakeId: string; error: Error | null }> {
  const payload = {
    patient_profile_id: null,
    caregiver_profile_id: null,
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
    preferred_hospital: formData.preferredHospital || null,
    doctor_therapist_name: formData.doctorTherapistName || null,
    doctor_therapist_phone: formData.doctorTherapistPhone || null,
    caregiver_name: formData.caregiverName || null,
    caregiver_relationship: formData.caregiverRelationship || null,
    caregiver_phone: formData.caregiverPhone || null,
    medications_and_dosage: formData.medicationsAndDosage || null,
    emergency_contact_full_name: formData.emergencyContactFullName || null,
    emergency_contact_phone: formData.emergencyContactPhone || null,
    emergency_contact_email: formData.emergencyContactEmail || null,
    emergency_contact_relationship: formData.emergencyContactRelationship || null,
    created_by: null,
  };

  const { data, error } = await supabase
    .from('patient_intake')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    return {
      intakeId: '',
      error: new Error(
        error.message?.includes('row-level security')
          ? 'Supabase rejected the insert. Apply the public INSERT policy for patient_intake first.'
          : error.message || 'Failed to submit patient intake.'
      ),
    };
  }

  return { intakeId: data.id, error: null };
}
