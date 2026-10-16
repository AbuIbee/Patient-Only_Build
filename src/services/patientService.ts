import { supabase } from '@/lib/supabase';
import type { Patient, PatientData } from '@/types';
import type { Database, NoteType } from '@/types/supabase';
import { assertUniqueProfileIdentity, normalizeEmail } from '@/lib/identity';
import { getErrorMessage } from '@/lib/utils';

type PatientRow = Database['public']['Tables']['patients']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
// buildPatient()/loadPatientData() read fields defined on PatientRow/
// ProfileRow plus a handful of columns neither table type declares
// (dbRow.email/phone — actually on ProfileRow, kept here only for the
// `dbRow.x || profile.x` fallback pattern already in use). A partial
// profile shape covers every call site (full row, `{}`, or a narrow
// `.select()` subset).
type PartialProfile = Partial<ProfileRow>;

// ─── Get all patients for the logged-in caregiver ────────────────────────────
export async function getCaregiverPatients(): Promise<PatientData[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const caregiverId = session.user.id;

  // Get patient IDs linked to this caregiver
  const { data: links, error: linksError } = await supabase
    .from('caregiver_patients')
    .select('patient_id')
    .eq('caregiver_id', caregiverId);

  if (linksError) { console.error('caregiver_patients error:', linksError); return []; }
  if (!links || links.length === 0) return [];

  const patientIds = links.map((r) => r.patient_id);
  return fetchPatientsById(patientIds);
}

// ─── Get all patients assigned to the logged-in therapist ────────────────────
export async function getTherapistPatients(): Promise<PatientData[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const therapistId = session.user.id;

  const { data: links, error } = await supabase
    .from('therapist_relationships')
    .select('patient_id')
    .eq('therapist_id', therapistId)
    .eq('is_active', true);

  if (error) { console.error('therapist_relationships error:', error); return []; }
  if (!links || links.length === 0) return [];

  const patientIds = links
    .map((r) => r.patient_id)
    .filter((id): id is string => Boolean(id));

  if (patientIds.length === 0) return [];
  return fetchPatientsById(patientIds);
}

// ─── Shared fetch logic ───────────────────────────────────────────────────────
async function fetchPatientsById(patientIds: string[]): Promise<PatientData[]> {
  const { data: patients, error: pErr } = await supabase
    .from('patients')
    .select('*')
    .in('id', patientIds);

  if (pErr) { console.error('patients fetch error:', pErr); return []; }
  if (!patients || patients.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone, photo_url')
    .in('id', patientIds);

  const profileMap: Record<string, PartialProfile> = {};
  (profiles || []).forEach((p) => { profileMap[p.id] = p; });

  return Promise.all(
    patients.map(async (p) => {
      const patient = buildPatient(p, profileMap[p.id] || {});
      return loadPatientData(patient);
    })
  );
}

// ─── Get a single patient by ID ──────────────────────────────────────────────
export async function getPatientById(patientId: string): Promise<PatientData | null> {
  const { data: p, error } = await supabase
    .from('patients').select('*').eq('id', patientId).single();
  if (error || !p) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone, photo_url')
    .eq('id', patientId).maybeSingle();

  return loadPatientData(buildPatient(p, profile || {}));
}

// ─── Create a new patient ─────────────────────────────────────────────────────
// F02 remediation: the four writes below (profile, patient, caregiver link,
// invite email) cannot share a real DB transaction with auth.signUp (a
// separate Auth API call), so true atomicity isn't available client-side.
// Instead this is made *resumable*: `profiles.provisioning_status` records
// how far a given signup got, so a retry (operator double-click, or retry
// after a step-3/4 failure) detects the existing auth user + profile by
// email and continues from there instead of re-calling auth.signUp (which
// Supabase rejects with "already registered", previously leaving the
// operator stuck with no way to finish). Requires migration
// 003_identity_and_provisioning.sql (provisioning_status column).
// tempPassword is an input-only field for account provisioning — never a
// persisted Patient record field, so it's declared here rather than on the
// stored-record `Patient` type itself.
export interface CreatePatientInput extends Partial<Patient> {
  tempPassword?: string;
}

export async function createPatient(
  patientData: CreatePatientInput,
  // SEC-003: kept for call-site/signature compatibility, but deliberately
  // unused — the caregiver link (steps 3+4 below) now always derives the
  // caregiver from the caller's own session (auth.uid()) inside
  // create_patient_with_caregiver(), never from a client-supplied id, so a
  // caller can never link an arbitrary account as someone else's caregiver.
  _caregiverId: string,
  relationship?: string
): Promise<Patient> {
  const tempPassword = patientData.tempPassword?.trim() || (Math.random().toString(36).slice(-8) + 'Mm1!');
  const email = patientData.email!;
  const normalizedEmail = normalizeEmail(email);

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('id, provisioning_status')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingProfileError) {
    throw new Error(`Failed to check for an existing account: ${existingProfileError.message}`);
  }
  if (existingProfile && existingProfile.provisioning_status === 'complete') {
    throw new Error('This email address is already registered. Please sign in or use a different email.');
  }

  let patientId: string;

  if (existingProfile) {
    // Resume a previously partial attempt instead of re-running auth.signUp.
    patientId = existingProfile.id;
  } else {
    await assertUniqueProfileIdentity({ email, phone: patientData.phone });

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: {
          first_name: patientData.firstName,
          last_name:  patientData.lastName,
          role:       'patient',
        },
      },
    });
    if (authError) throw new Error(`Failed to create patient account: ${authError.message}`);
    if (!authData.user) throw new Error('No user returned from signup');
    patientId = authData.user.id;
  }

  // 2. Create/resume profile row. `role` is deliberately NOT sent — C02-001
  // (012_profiles_revoke_client_role_authority.sql) removes client INSERT/
  // UPDATE privilege on profiles.role entirely; new rows get it from the
  // column DEFAULT 'patient', which is exactly what every patient created
  // through this function needs.
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: patientId, email,
    first_name: patientData.firstName || '',
    last_name:  patientData.lastName  || '',
    phone: patientData.phone || null,
    must_change_password: true,  // Forces patient to set their own password on first login
    provisioning_status: 'profile_created',
  });
  if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`);

  // 3+4. Create the patients row AND link the caregiver in one atomic,
  // trusted server-side call. SEC-003 (CORRECTIVE-002:
  // 014_caregiver_relationship_authorization_and_view_hardening.sql)
  // replaces the previous two-step "insert patients row, then separately
  // claim it" design — that design let an existing, unlinked patient be
  // claimed by id alone. create_patient_with_caregiver() creates both rows
  // in a single transaction (never claims a pre-existing patients row,
  // regardless of whether it already has a caregiver) and re-derives the
  // caregiver from the caller's own session (auth.uid()), never from the
  // `_caregiverId` parameter. Idempotent for a retry of the caller's own
  // prior attempt.
  const { data: patient, error: patientError } = await supabase.rpc('create_patient_with_caregiver', {
    p_patient_id: patientId,
    p_preferred_name: patientData.preferredName || null,
    p_date_of_birth: patientData.dateOfBirth || null,
    p_diagnosis_date: patientData.diagnosisDate || null,
    p_dementia_stage: patientData.dementiaStage || null,
    p_location: patientData.location || null,
    p_address: patientData.address || null,
    p_affirmation: patientData.affirmation || null,
    p_emergency_contact_name: patientData.emergencyContact?.name || null,
    p_emergency_contact_relationship: patientData.emergencyContact?.relationship || null,
    p_emergency_contact_phone: patientData.emergencyContact?.phone || null,
    p_emergency_contact_email: patientData.emergencyContact?.email || null,
    p_relationship_type: relationship || 'primary',
  });
  if (patientError || !patient) throw new Error(`Failed to create patient record: ${patientError?.message}`);

  await supabase.from('profiles').update({ provisioning_status: 'complete' }).eq('id', patientId);

  // 5. Send invitation email so patient can set their password. The account
  // is fully provisioned at this point either way, but a failure here is
  // surfaced (not swallowed) since without this email the patient has no
  // way to set a password and the operator previously had no visible error.
  try {
    const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
    const { error: inviteError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl,
    });
    if (inviteError) throw inviteError;
  } catch (inviteErr) {
    throw new Error(
      `Patient account was created, but the password-setup email failed to send: ${
        getErrorMessage(inviteErr, 'unknown error')
      }. Use "Resend setup email" from the admin panel before the patient can log in.`
    );
  }

  return buildPatient(patient, {
    first_name: patientData.firstName, last_name: patientData.lastName,
    email: patientData.email, phone: patientData.phone, photo_url: patientData.photoUrl,
  });
}

// ─── Assign a therapist to a patient ─────────────────────────────────────────
export async function assignTherapistToPatient(
  patientId: string,
  therapistId: string,
  caregiverId: string
): Promise<void> {
  // Check if relationship already exists
  const { data: existing } = await supabase
    .from('therapist_relationships')
    .select('id, is_active')
    .eq('therapist_id', therapistId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (existing) {
    // Reactivate if previously deactivated
    const { error } = await supabase
      .from('therapist_relationships')
      .update({ is_active: true })
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to reactivate relationship: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('therapist_relationships')
      .insert({
        therapist_id:      therapistId,
        patient_id:        patientId,
        caregiver_id:      caregiverId,
        relationship_type: 'primary',
        is_active:         true,
      });
    if (error) throw new Error(`Failed to assign therapist: ${error.message}`);
  }
}

// ─── Remove a therapist from a patient ───────────────────────────────────────
export async function removeTherapistFromPatient(
  patientId: string,
  therapistId: string
): Promise<void> {
  const { error } = await supabase
    .from('therapist_relationships')
    .update({ is_active: false })
    .eq('therapist_id', therapistId)
    .eq('patient_id', patientId);
  if (error) throw new Error(`Failed to remove therapist: ${error.message}`);
}

export interface TherapistSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// ─── Get therapists assigned to a patient ────────────────────────────────────
export async function getPatientTherapists(patientId: string): Promise<TherapistSummary[]> {
  const { data, error } = await supabase
    .from('therapist_relationships')
    .select('therapist_id, relationship_type, is_active')
    .eq('patient_id', patientId)
    .eq('is_active', true);

  if (error || !data) return [];

  const therapistIds = data.map((r) => r.therapist_id);
  if (therapistIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone')
    .in('id', therapistIds);

  return (profiles || []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    email: p.email,
    phone: p.phone,
  }));
}

// ─── Get all therapists in the system ────────────────────────────────────────
export async function getAllTherapists(): Promise<TherapistSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone')
    .eq('role', 'therapist')
    .order('last_name');

  if (error || !data) return [];
  return data.map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    email: p.email,
    phone: p.phone,
  }));
}

// ─── Resend invitation email to a patient ────────────────────────────────────
export async function resendPatientInvitation(patientEmail: string): Promise<void> {
  const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
  const { error } = await supabase.auth.resetPasswordForEmail(patientEmail, {
    redirectTo: siteUrl,
  });
  if (error) throw new Error(`Failed to send invitation: ${error.message}`);
}

// ─── Update a patient ─────────────────────────────────────────────────────────
export async function updatePatient(patientId: string, updates: Partial<Patient>): Promise<Patient> {
  const { data, error } = await supabase
    .from('patients')
    .update({
      preferred_name:                 updates.preferredName,
      date_of_birth:                  updates.dateOfBirth,
      diagnosis_date:                 updates.diagnosisDate,
      dementia_stage:                 updates.dementiaStage,
      location:                       updates.location,
      address:                        updates.address,
      affirmation:                    updates.affirmation,
      emergency_contact_name:         updates.emergencyContact?.name,
      emergency_contact_relationship: updates.emergencyContact?.relationship,
      emergency_contact_phone:        updates.emergencyContact?.phone,
      emergency_contact_email:        updates.emergencyContact?.email,
      updated_at:                     new Date().toISOString(),
    })
    .eq('id', patientId).select().single();

  if (error || !data) throw error;

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, phone, photo_url')
    .eq('id', patientId).maybeSingle();

  return buildPatient(data, profile || {});
}

// ─── Delete a patient ─────────────────────────────────────────────────────────
export async function deletePatient(patientId: string): Promise<void> {
  const { error } = await supabase.from('patients').delete().eq('id', patientId);
  if (error) throw error;
}

// ─── Build Patient object ─────────────────────────────────────────────────────
function buildPatient(dbRow: PatientRow, profile: PartialProfile = {}): Patient {
  return {
    id:            dbRow.id,
    userId:        dbRow.id,
    // `patients` has no first_name/last_name/email/photo_url columns at
    // all (those live on `profiles`) — the `|| dbRow.x` fallbacks removed
    // here were always a no-op dead branch, previously hidden by `any`.
    firstName:     profile.first_name  || '',
    lastName:      profile.last_name   || '',
    email:         profile.email       || '',
    phone:         profile.phone       || undefined,
    preferredName: dbRow.preferred_name || profile.first_name || '',
    dateOfBirth:   dbRow.date_of_birth  || undefined,
    photoUrl:      profile.photo_url    || undefined,
    location:      dbRow.location       || 'Unknown',
    address:       dbRow.address        || undefined,
    affirmation:   dbRow.affirmation    || 'You are safe. You are loved. You are at home.',
    emergencyContact: {
      name:         dbRow.emergency_contact_name         || '',
      relationship: dbRow.emergency_contact_relationship || '',
      phone:        dbRow.emergency_contact_phone        || '',
      email:        dbRow.emergency_contact_email        || undefined,
    },
    familiarFaces: [],
    diagnosisDate: dbRow.diagnosis_date || undefined,
    dementiaStage: (dbRow.dementia_stage as 'early' | 'middle' | 'late') || 'middle',
    preferences: {
      language: 'en', fontSize: 'large', highContrast: false,
      audioEnabled: true, notificationsEnabled: true, tone: 'gentle',
    },
    createdAt: dbRow.created_at || new Date().toISOString(),
    updatedAt: dbRow.updated_at || new Date().toISOString(),
  };
}

// ─── Load all related data for a patient ─────────────────────────────────────
async function loadPatientData(patient: Patient): Promise<PatientData> {
  const [
    { data: medications }, { data: tasks }, { data: appointments },
    { data: memories }, { data: moodEntries }, { data: careTeam }, { data: notes },
  ] = await Promise.all([
    supabase.from('medications').select('*').eq('patient_id', patient.id).eq('is_active', true),
    supabase.from('tasks').select('*').eq('patient_id', patient.id).eq('is_active', true),
    supabase.from('appointments').select('*').eq('patient_id', patient.id),
    supabase.from('memories').select('*').eq('patient_id', patient.id).limit(10),
    supabase.from('mood_entries').select('*').eq('patient_id', patient.id).order('timestamp', { ascending: false }).limit(5),
    supabase.from('care_team_members').select('*').eq('patient_id', patient.id),
    supabase.from('patient_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(5),
  ]);

  const tasksCompleted = (tasks || []).filter((t) => t.status === 'completed').length;
  const tasksTotal     = (tasks || []).length;
  const latestMood     = (moodEntries && moodEntries.length > 0) ? moodEntries[0] : null;

  return {
    patient,
    tasks: (tasks || []).map((t) => ({
      id: t.id, patientId: t.patient_id, title: t.title, description: t.description ?? undefined,
      icon: t.icon, timeOfDay: t.time_of_day ?? undefined, scheduledTime: t.scheduled_time ?? '',
      daysOfWeek: t.days_of_week, status: t.status, completedAt: t.completed_at ?? undefined,
      isRecurring: t.is_recurring, difficulty: t.difficulty ?? undefined, isActive: t.is_active,
    })),
    medications: (medications || []).map((m) => ({
      id: m.id, patientId: m.patient_id, name: m.name, genericName: m.generic_name ?? undefined,
      dosage: m.dosage, form: m.form ?? 'pill', instructions: m.instructions,
      prescribedBy: m.prescribed_by ?? undefined, prescriptionDate: m.prescription_date ?? undefined,
      sideEffects: m.side_effects || [], schedule: [], isActive: m.is_active,
      createdAt: m.created_at, updatedAt: m.updated_at,
    })),
    medicationLogs: [],
    moodEntries: (moodEntries || []).map((m) => ({
      id: m.id, patientId: m.patient_id, mood: m.mood, intensity: m.intensity,
      note: m.note ?? undefined, triggers: m.triggers || [], timeOfDay: m.time_of_day ?? undefined,
      timestamp: m.timestamp, recordedBy: m.recorded_by,
    })),
    behaviorLogs: [],
    memories: (memories || []).map((m) => ({
      id: m.id, patientId: m.patient_id, title: m.title, description: m.description ?? undefined,
      photoUrl: m.photo_url ?? undefined, audioUrl: m.audio_url ?? undefined, date: m.date ?? undefined, location: m.location ?? undefined,
      people: m.people || [], category: m.category ?? undefined, tags: m.tags || [],
      isFavorite: m.is_favorite, createdAt: m.created_at, createdBy: m.created_by,
    })),
    documents: [],
    careTeam: (careTeam || []).map((c) => ({
      id: c.id, patientId: c.patient_id, name: c.name, role: c.role,
      specialty: c.specialty ?? undefined, organization: c.organization ?? undefined,
      phone: c.phone, email: c.email ?? undefined, isPrimary: c.is_primary,
    })),
    reminders: [], vitalSigns: [], sleepEntries: [],
    appointments: (appointments || []).map((a) => ({
      id: a.id, patientId: a.patient_id, title: a.title, provider: a.provider,
      location: a.location ?? undefined, date: a.date, time: a.time, notes: a.notes ?? undefined,
      reminderSet: a.reminder_set, createdAt: a.created_at,
    })),
    goals: [],
    dashboardStats: {
      patientId: patient.id, tasksCompleted, tasksTotal,
      tasksCompletionRate: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
      medicationsTaken: 0, medicationsTotal: (medications || []).length,
      medicationsAdherenceRate: 0, moodToday: latestMood?.mood, moodTrend: 'stable',
      sleepHours: 7, sleepQuality: 'good', activitiesCompleted: 0, behaviorIncidents: 0, alerts: [],
    },
    alerts: [], safetyAlerts: [], adlAssessments: [], nutritionLogs: [],
    notes: (notes || []).map((n) => ({
      id: n.id, patientId: n.patient_id, caregiverId: n.author_id,
      caregiverName: 'Unknown', note: n.note, noteType: n.note_type, createdAt: n.created_at,
    })),
  };
}

export interface PatientNoteSummary {
  id: string;
  patientId: string;
  caregiverId: string;
  // patient_notes has no author_name column (confirmed: src/types/supabase.ts) —
  // the caller name was never actually derivable from this table alone.
  caregiverName: string;
  note: string;
  noteType: NoteType;
  createdAt: string;
}

// ─── Patient Notes ────────────────────────────────────────────────────────────
export async function getPatientNotes(patientId: string): Promise<PatientNoteSummary[]> {
  const { data, error } = await supabase
    .from('patient_notes')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error fetching notes:', error); return []; }
  return (data || []).map((n) => ({
    id:            n.id,
    patientId:     n.patient_id,
    caregiverId:   n.author_id,
    caregiverName: 'Unknown',
    note:          n.note,
    noteType:      n.note_type,
    createdAt:     n.created_at,
  }));
}

export async function addPatientNote(
  patientId:  string,
  authorId:   string,
  note:       string,
  noteType:   NoteType = 'general'
): Promise<Omit<PatientNoteSummary, 'caregiverName'>> {
  const { data, error } = await supabase
    .from('patient_notes')
    .insert({
      patient_id: patientId,
      author_id:  authorId,
      note,
      note_type:  noteType,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add note: ${error.message}`);
  return {
    id:          data.id,
    patientId:   data.patient_id,
    caregiverId: data.author_id,
    note:        data.note,
    noteType:    data.note_type,
    createdAt:   data.created_at,
  };
}

export async function deletePatientNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('patient_notes')
    .delete()
    .eq('id', noteId);

  if (error) throw new Error(`Failed to delete note: ${error.message}`);
}