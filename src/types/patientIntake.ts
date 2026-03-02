// Patient Intake Types - Canonical Source of Truth
// All patient form data flows through these types

export type DementiaStage = 'early' | 'middle' | 'late';

/**
 * Form data for creating a new patient intake
 * Matches exactly the form fields in the UI
 */
export interface PatientIntakeFormData {
  // Patient Information
  patientFirstName: string;
  patientLastName: string;
  patientPreferredName?: string;
  patientDateOfBirth?: string; // ISO date string
  patientDiagnosisDate?: string; // ISO date string
  patientDementiaStage?: DementiaStage;
  patientStreetAddress?: string;
  patientCity?: string;
  patientState?: string;
  patientZipCode?: string;
  patientPhone?: string;
  patientEmail: string;

  // Doctor/Therapist Information
  preferredHospital?: string;
  doctorTherapistName?: string;
  doctorTherapistPhone?: string;

  // Caregiver Information (snapshot)
  caregiverName?: string;
  caregiverRelationship?: string;
  caregiverPhone?: string;

  // Medications (single free-text field)
  medicationsAndDosage?: string;

  // Emergency Contact
  emergencyContactFullName?: string;
  emergencyContactPhone?: string;
  emergencyContactEmail?: string;
  emergencyContactRelationship?: string;
}

/**
 * Complete patient intake record from database
 * Includes linkage IDs and metadata
 */
export interface PatientIntake extends PatientIntakeFormData {
  // Database fields
  id: string;
  patientProfileId: string | null;
  caregiverProfileId: string | null;
  
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Simplified patient info for lists/dashboards
 * Read from v_patient_intake_core view
 */
export interface PatientIntakeCore {
  intakeId: string;
  patientProfileId: string | null;
  caregiverProfileId: string | null;
  patientFirstName: string;
  patientLastName: string;
  patientPreferredName: string | null;
  patientDateOfBirth: string | null;
  patientDiagnosisDate: string | null;
  patientDementiaStage: DementiaStage | null;
  patientStreetAddress: string | null;
  patientCity: string | null;
  patientState: string | null;
  patientZipCode: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Doctor/therapist info
 * Read from v_patient_intake_doctor view
 */
export interface PatientIntakeDoctor {
  intakeId: string;
  patientProfileId: string | null;
  preferredHospital: string | null;
  doctorTherapistName: string | null;
  doctorTherapistPhone: string | null;
}

/**
 * Caregiver info snapshot
 * Read from v_patient_intake_caregiver view
 */
export interface PatientIntakeCaregiver {
  intakeId: string;
  patientProfileId: string | null;
  caregiverProfileId: string | null;
  caregiverName: string | null;
  caregiverRelationship: string | null;
  caregiverPhone: string | null;
}

/**
 * Medications info
 * Read from v_patient_intake_medications view
 */
export interface PatientIntakeMedications {
  intakeId: string;
  patientProfileId: string | null;
  medicationsAndDosage: string | null;
}

/**
 * Emergency contact info
 * Read from v_patient_intake_emergency view
 */
export interface PatientIntakeEmergency {
  intakeId: string;
  patientProfileId: string | null;
  emergencyContactFullName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactEmail: string | null;
  emergencyContactRelationship: string | null;
}

/**
 * Full patient intake (all fields)
 * Read from v_patient_full_intake view
 */
export interface PatientIntakeFull extends PatientIntake {
  // Linked profile info (if provisioned)
  profileEmail: string | null;
  profileFirstName: string | null;
  profileLastName: string | null;
}

/**
 * Patient with intake data combined
 * Used in the UI for displaying patient details
 */
export interface PatientWithIntake {
  // From profiles/patients (minimal)
  profileId: string;
  role: 'patient';
  
  // From patient_intake (canonical)
  intake: PatientIntake;
  
  // Computed/display fields
  displayName: string;
  age?: number;
}

/**
 * Validation errors for the intake form
 */
export interface PatientIntakeValidationErrors {
  patientFirstName?: string;
  patientLastName?: string;
  patientEmail?: string;
  patientDateOfBirth?: string;
  patientDementiaStage?: string;
  [key: string]: string | undefined;
}

/**
 * Intake creation result
 */
export interface IntakeCreationResult {
  success: boolean;
  intakeId?: string;
  patientProfileId?: string;
  error?: string;
}
