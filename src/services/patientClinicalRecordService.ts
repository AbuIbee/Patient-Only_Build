// ROUND 6 — client wrappers for migration 070's new clinical-record
// tables/RPCs (P02 Diagnoses, P03 Allergies, P08 Care Plan, P10
// Vitals, P19 Therapy Goals, P21 Care Preferences). Every write goes
// through a SECURITY DEFINER RPC that re-verifies authorization and
// the professional_observation source-claim gate server-side; reads
// go directly against tables whose RLS (has_patient_access()) covers
// both residential caregiver_patients and Enterprise
// staff_patient_assignments callers identically.
import { supabase } from '@/lib/supabase';

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export type ProvenanceSource = 'verified_source' | 'caregiver_report' | 'professional_observation' | 'unknown';

export interface PatientDiagnosis {
  id: string; conditionName: string; diagnosedDate: string | null; notes: string | null;
  source: ProvenanceSource; authorId: string; isActive: boolean; createdAt: string;
}

export async function getPatientDiagnoses(patientId: string): Promise<PatientDiagnosis[]> {
  const { data, error } = await supabase.from('patient_diagnoses').select('*').eq('patient_id', patientId).order('diagnosed_date', { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, conditionName: r.condition_name, diagnosedDate: r.diagnosed_date, notes: r.notes,
    source: r.source as ProvenanceSource, authorId: r.author_id, isActive: r.is_active, createdAt: r.created_at,
  }));
}

export async function recordPatientDiagnosis(
  patientId: string, conditionName: string, diagnosedDate?: string, notes?: string, source: ProvenanceSource = 'caregiver_report',
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_patient_diagnosis', {
    p_patient_id: patientId, p_condition_name: conditionName, p_diagnosed_date: diagnosedDate, p_notes: notes, p_source: source,
  });
  return { error: error ? errMsg(error, 'Could not record this diagnosis.') : null };
}

export interface PatientCareProvider {
  id: string; providerName: string; providerRole: string; phone: string | null; email: string | null;
  notes: string | null; source: ProvenanceSource; authorId: string; createdAt: string;
}

export async function getPatientProviders(patientId: string): Promise<PatientCareProvider[]> {
  const { data, error } = await supabase.from('patient_care_providers').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, providerName: r.provider_name, providerRole: r.provider_role, phone: r.phone, email: r.email,
    notes: r.notes, source: r.source as ProvenanceSource, authorId: r.author_id, createdAt: r.created_at,
  }));
}

export async function recordPatientProvider(
  patientId: string, providerName: string, providerRole: string, phone?: string, email?: string, notes?: string, source: ProvenanceSource = 'caregiver_report',
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_patient_provider', {
    p_patient_id: patientId, p_provider_name: providerName, p_provider_role: providerRole, p_phone: phone, p_email: email, p_notes: notes, p_source: source,
  });
  return { error: error ? errMsg(error, 'Could not record this provider.') : null };
}

export interface PatientAllergy {
  id: string; allergen: string; reaction: string | null; severity: string | null; notes: string | null;
  source: ProvenanceSource; authorId: string; createdAt: string;
}

export async function getPatientAllergies(patientId: string): Promise<PatientAllergy[]> {
  const { data, error } = await supabase.from('patient_allergies').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, allergen: r.allergen, reaction: r.reaction, severity: r.severity, notes: r.notes,
    source: r.source as ProvenanceSource, authorId: r.author_id, createdAt: r.created_at,
  }));
}

export async function recordPatientAllergy(
  patientId: string, allergen: string, reaction?: string, severity = 'unknown', notes?: string, source: ProvenanceSource = 'caregiver_report',
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_patient_allergy', {
    p_patient_id: patientId, p_allergen: allergen, p_reaction: reaction, p_severity: severity, p_notes: notes, p_source: source,
  });
  return { error: error ? errMsg(error, 'Could not record this allergy.') : null };
}

export interface PatientCarePlan {
  id: string; goals: string; permittedTasks: string | null; effectiveDate: string; version: number;
  authorId: string; isCurrent: boolean; createdAt: string;
}

export async function getPatientCarePlans(patientId: string): Promise<PatientCarePlan[]> {
  const { data, error } = await supabase.from('patient_care_plans').select('*').eq('patient_id', patientId).order('version', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, goals: r.goals, permittedTasks: r.permitted_tasks, effectiveDate: r.effective_date, version: r.version,
    authorId: r.author_id, isCurrent: r.is_current, createdAt: r.created_at,
  }));
}

export async function recordPatientCarePlan(patientId: string, goals: string, permittedTasks?: string, effectiveDate?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_patient_care_plan', {
    p_patient_id: patientId, p_goals: goals, p_permitted_tasks: permittedTasks, p_effective_date: effectiveDate ?? new Date().toISOString().slice(0, 10),
  });
  return { error: error ? errMsg(error, 'Could not record this care plan.') : null };
}

export interface PatientVitals {
  id: string; measuredAt: string; bloodPressure: string | null; pulseBpm: number | null; temperatureF: number | null;
  oxygenSaturation: number | null; weightLbs: number | null; painLevel: number | null; notes: string | null;
  source: ProvenanceSource; authorId: string;
}

export async function getPatientVitals(patientId: string): Promise<PatientVitals[]> {
  const { data, error } = await supabase.from('patient_vitals').select('*').eq('patient_id', patientId).order('measured_at', { ascending: false }).limit(50);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, measuredAt: r.measured_at, bloodPressure: r.blood_pressure, pulseBpm: r.pulse_bpm, temperatureF: r.temperature_f,
    oxygenSaturation: r.oxygen_saturation, weightLbs: r.weight_lbs, painLevel: r.pain_level, notes: r.notes,
    source: r.source as ProvenanceSource, authorId: r.author_id,
  }));
}

export async function recordPatientVitals(patientId: string, vitals: {
  bloodPressure?: string; pulseBpm?: number; temperatureF?: number; oxygenSaturation?: number; weightLbs?: number; painLevel?: number; notes?: string; source?: ProvenanceSource;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_patient_vitals', {
    p_patient_id: patientId, p_blood_pressure: vitals.bloodPressure, p_pulse_bpm: vitals.pulseBpm,
    p_temperature_f: vitals.temperatureF, p_oxygen_saturation: vitals.oxygenSaturation,
    p_weight_lbs: vitals.weightLbs, p_pain_level: vitals.painLevel, p_notes: vitals.notes,
    p_source: vitals.source ?? 'caregiver_report',
  });
  return { error: error ? errMsg(error, 'Could not record vitals.') : null };
}

export interface TherapyGoal {
  id: string; objective: string; progressNotes: string | null; status: string; authorId: string; createdAt: string; updatedAt: string;
}

export async function getTherapyGoals(patientId: string): Promise<TherapyGoal[]> {
  const { data, error } = await supabase.from('patient_therapy_goals').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, objective: r.objective, progressNotes: r.progress_notes, status: r.status, authorId: r.author_id, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export async function recordTherapyGoal(patientId: string, objective: string, progressNotes?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_therapy_goal', { p_patient_id: patientId, p_objective: objective, p_progress_notes: progressNotes });
  return { error: error ? errMsg(error, 'Could not record this therapy goal.') : null };
}

export async function updateTherapyGoalProgress(goalId: string, progressNotes: string, status?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_therapy_goal_progress', { p_goal_id: goalId, p_progress_notes: progressNotes, p_status: status });
  return { error: error ? errMsg(error, 'Could not update this therapy goal.') : null };
}

export interface CarePreference {
  id: string; category: string; description: string; reportedBy: string | null; authorId: string; createdAt: string;
}

export async function getCarePreferences(patientId: string): Promise<CarePreference[]> {
  const { data, error } = await supabase.from('patient_care_preferences').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, category: r.category, description: r.description, reportedBy: r.reported_by, authorId: r.author_id, createdAt: r.created_at }));
}

export async function recordCarePreference(patientId: string, category: string, description: string, reportedBy?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_care_preference', { p_patient_id: patientId, p_category: category, p_description: description, p_reported_by: reportedBy });
  return { error: error ? errMsg(error, 'Could not record this care preference.') : null };
}

// ROUND 7 CORRECTIVE — P01 communication needs, P16 safety plan/code
// status, W14 note amendments, P13 overnight HELP acknowledgment
// (migration 075).
export async function recordCommunicationNeeds(patientId: string, communicationNeeds: string, source: ProvenanceSource = 'caregiver_report'): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_communication_needs', { p_patient_id: patientId, p_communication_needs: communicationNeeds, p_source: source });
  return { error: error ? errMsg(error, 'Could not record communication needs.') : null };
}

export type CodeStatus = 'unknown' | 'full_code' | 'dnr';

export async function recordPatientSafetyPlan(patientId: string, fields: {
  preferredHospital?: string; safetyResponseInstructions?: string; codeStatus?: CodeStatus; codeStatusSource?: ProvenanceSource;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_patient_safety_plan', {
    p_patient_id: patientId, p_preferred_hospital: fields.preferredHospital, p_safety_response_instructions: fields.safetyResponseInstructions,
    p_code_status: fields.codeStatus, p_code_status_source: fields.codeStatusSource ?? 'caregiver_report',
  });
  return { error: error ? errMsg(error, 'Could not record the safety plan.') : null };
}

export async function recordNoteAmendment(originalNoteId: string, correctedNote: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_note_amendment', { p_original_note_id: originalNoteId, p_corrected_note: correctedNote });
  return { error: error ? errMsg(error, 'Could not record this amendment.') : null };
}

export async function acknowledgeHelpActivation(helpActivationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('acknowledge_help_activation', { p_help_activation_id: helpActivationId });
  return { error: error ? errMsg(error, 'Could not acknowledge this HELP activation.') : null };
}
