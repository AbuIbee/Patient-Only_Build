import { supabase } from '@/lib/supabase';
import type { Patient, PatientData } from '@/types';

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

  const patientIds = links.map((r: any) => r.patient_id);
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
    .map((r: any) => r.patient_id)
    .filter(Boolean);

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

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

  return Promise.all(
    patients.map(async (p: any) => {
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
export async function createPatient(
  patientData: Partial<Patient>,
  caregiverId: string,
  relationship?: string
): Promise<Patient> {
  // Use caregiver-provided temp password, or auto-generate one
  const tempPassword = (patientData as any).tempPassword?.trim() || (Math.random().toString(36).slice(-8) + 'Mm1!');

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: patientData.email!,
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

  const patientId = authData.user.id;

  // 2. Create profile row
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: patientId, email: patientData.email!,
    first_name: patientData.firstName || '',
    last_name:  patientData.lastName  || '',
    role: 'patient', phone: patientData.phone || null,
    must_change_password: true,  // Forces patient to set their own password on first login
  });
  if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`);

  // 3. Create patients row
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({
      id:                             patientId,
      preferred_name:                 patientData.preferredName                  || null,
      date_of_birth:                  patientData.dateOfBirth                    || null,
      diagnosis_date:                 patientData.diagnosisDate                  || null,
      dementia_stage:                 patientData.dementiaStage                  || null,
      location:                       patientData.location                       || null,
      address:                        patientData.address                        || null,
      affirmation:                    patientData.affirmation                    || null,
      emergency_contact_name:         patientData.emergencyContact?.name         || null,
      emergency_contact_relationship: patientData.emergencyContact?.relationship || null,
      emergency_contact_phone:        patientData.emergencyContact?.phone        || null,
      emergency_contact_email:        patientData.emergencyContact?.email        || null,
    })
    .select().single();
  if (patientError || !patient) throw new Error(`Failed to create patient record: ${patientError?.message}`);

  // 4. Link caregiver to patient
  const { error: relError } = await supabase
    .from('caregiver_patients')
    .insert({
      caregiver_id:      caregiverId,
      patient_id:        patientId,
      relationship_type: relationship || 'primary',
      is_primary:        true,
    });
  if (relError) throw new Error(`Failed to link caregiver: ${relError.message}`);

  // 5. Send invitation email so patient can set their password
  try {
    // redirectTo must match the URL configured in Supabase Auth → URL Configuration
    // This ensures the password-reset link works on both localhost and production
    const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
    await supabase.auth.resetPasswordForEmail(patientData.email!, {
      redirectTo: siteUrl,
    });
  } catch {
    console.warn('Invitation email could not be sent');
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

// ─── Get therapists assigned to a patient ────────────────────────────────────
export async function getPatientTherapists(patientId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('therapist_relationships')
    .select('therapist_id, relationship_type, is_active')
    .eq('patient_id', patientId)
    .eq('is_active', true);

  if (error || !data) return [];

  const therapistIds = data.map((r: any) => r.therapist_id);
  if (therapistIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone')
    .in('id', therapistIds);

  return (profiles || []).map((p: any) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    email: p.email,
    phone: p.phone,
  }));
}

// ─── Get all therapists in the system ────────────────────────────────────────
export async function getAllTherapists(): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone')
    .eq('role', 'therapist')
    .order('last_name');

  if (error || !data) return [];
  return data.map((p: any) => ({
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
function buildPatient(dbRow: any, profile: any = {}): Patient {
  return {
    id:            dbRow.id,
    userId:        dbRow.id,
    firstName:     profile.first_name  || dbRow.first_name  || '',
    lastName:      profile.last_name   || dbRow.last_name   || '',
    email:         profile.email       || dbRow.email       || '',
    phone:         profile.phone       || dbRow.phone       || undefined,
    preferredName: dbRow.preferred_name || profile.first_name || '',
    dateOfBirth:   dbRow.date_of_birth  || undefined,
    photoUrl:      profile.photo_url    || dbRow.photo_url  || undefined,
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

  const tasksCompleted = (tasks || []).filter((t: any) => t.status === 'completed').length;
  const tasksTotal     = (tasks || []).length;
  const latestMood     = (moodEntries || []).length > 0 ? (moodEntries as any[])[0] : null;

  return {
    patient,
    tasks: (tasks || []).map((t: any) => ({
      id: t.id, patientId: t.patient_id, title: t.title, description: t.description,
      icon: t.icon, timeOfDay: t.time_of_day, scheduledTime: t.scheduled_time,
      daysOfWeek: t.days_of_week, status: t.status, completedAt: t.completed_at,
      isRecurring: t.is_recurring, difficulty: t.difficulty, isActive: t.is_active,
    })),
    medications: (medications || []).map((m: any) => ({
      id: m.id, patientId: m.patient_id, name: m.name, genericName: m.generic_name,
      dosage: m.dosage, form: m.form, instructions: m.instructions,
      prescribedBy: m.prescribed_by, prescriptionDate: m.prescription_date,
      sideEffects: m.side_effects || [], schedule: [], isActive: m.is_active,
      createdAt: m.created_at, updatedAt: m.updated_at,
    })),
    medicationLogs: [],
    moodEntries: (moodEntries || []).map((m: any) => ({
      id: m.id, patientId: m.patient_id, mood: m.mood, intensity: m.intensity,
      note: m.note, triggers: m.triggers || [], timeOfDay: m.time_of_day,
      timestamp: m.timestamp, recordedBy: m.recorded_by,
    })),
    behaviorLogs: [],
    memories: (memories || []).map((m: any) => ({
      id: m.id, patientId: m.patient_id, title: m.title, description: m.description,
      photoUrl: m.photo_url, audioUrl: m.audio_url, date: m.date, location: m.location,
      people: m.people || [], category: m.category, tags: m.tags || [],
      isFavorite: m.is_favorite, createdAt: m.created_at, createdBy: m.created_by,
    })),
    documents: [],
    careTeam: (careTeam || []).map((c: any) => ({
      id: c.id, patientId: c.patient_id, name: c.name, role: c.role,
      specialty: c.specialty, organization: c.organization,
      phone: c.phone, email: c.email, isPrimary: c.is_primary,
    })),
    reminders: [], vitalSigns: [], sleepEntries: [],
    appointments: (appointments || []).map((a: any) => ({
      id: a.id, patientId: a.patient_id, title: a.title, provider: a.provider,
      location: a.location, date: a.date, time: a.time, notes: a.notes,
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
    notes: (notes || []).map((n: any) => ({
      id: n.id, patientId: n.patient_id, caregiverId: n.author_id,
      caregiverName: 'Unknown', note: n.note, noteType: n.note_type, createdAt: n.created_at,
    })),
  };
}

// ─── Patient Notes ────────────────────────────────────────────────────────────
export async function getPatientNotes(patientId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('patient_notes')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error fetching notes:', error); return []; }
  return (data || []).map((n: any) => ({
    id:            n.id,
    patientId:     n.patient_id,
    caregiverId:   n.author_id,
    caregiverName: n.author_name || 'Unknown',
    note:          n.note,
    noteType:      n.note_type,
    createdAt:     n.created_at,
  }));
}

export async function addPatientNote(
  patientId:  string,
  authorId:   string,
  note:       string,
  noteType:   string = 'general'
): Promise<any> {
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