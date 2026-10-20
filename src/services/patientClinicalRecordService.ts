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
    p_patient_id: patientId, p_condition_name: conditionName, p_diagnosed_date: diagnosedDate ?? null, p_notes: notes ?? null, p_source: source,
  });
  return { error: error ? errMsg(error, 'Could not record this diagnosis.') : null };
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
    p_patient_id: patientId, p_allergen: allergen, p_reaction: reaction ?? null, p_severity: severity, p_notes: notes ?? null, p_source: source,
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
    p_patient_id: patientId, p_goals: goals, p_permitted_tasks: permittedTasks ?? null, p_effective_date: effectiveDate ?? new Date().toISOString().slice(0, 10),
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
    p_patient_id: patientId, p_blood_pressure: vitals.bloodPressure ?? null, p_pulse_bpm: vitals.pulseBpm ?? null,
    p_temperature_f: vitals.temperatureF ?? null, p_oxygen_saturation: vitals.oxygenSaturation ?? null,
    p_weight_lbs: vitals.weightLbs ?? null, p_pain_level: vitals.painLevel ?? null, p_notes: vitals.notes ?? null,
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
  const { error } = await supabase.rpc('record_therapy_goal', { p_patient_id: patientId, p_objective: objective, p_progress_notes: progressNotes ?? null });
  return { error: error ? errMsg(error, 'Could not record this therapy goal.') : null };
}

export async function updateTherapyGoalProgress(goalId: string, progressNotes: string, status?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_therapy_goal_progress', { p_goal_id: goalId, p_progress_notes: progressNotes, p_status: status ?? null });
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
  const { error } = await supabase.rpc('record_care_preference', { p_patient_id: patientId, p_category: category, p_description: description, p_reported_by: reportedBy ?? null });
  return { error: error ? errMsg(error, 'Could not record this care preference.') : null };
}
