import { supabase } from '@/lib/supabase';
import type { Patient, PatientData, Note } from '@/types';
import type { Tables } from '@/types/supabase-tables';

// Get all patients for a caregiver
export async function getCaregiverPatients(): Promise<PatientData[]> {
  // First check if we have a session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    console.log('No active session, returning empty patient list');
    return []; // Return empty array instead of throwing
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData.user) {
    console.error('Auth error:', userError);
    return []; // Return empty array instead of throwing
  }


 // if (userError) {
 //   console.error('Auth error:', userError);
 //   throw userError;  }

  if (!userData.user) {
    throw new Error('No authenticated user found');
  }

  const caregiverId = userData.user.id;

  const { data, error } = await supabase
    .from('caregiver_patients')
    .select('patient:patients(*)')
    .eq('caregiver_id', caregiverId);

  if (error) {
    console.error('Error fetching caregiver patients:', error);
    throw error;
  }

  // Transform to PatientData format
  const patientDataList: PatientData[] = await Promise.all(
    (data || []).map(async (item: any) => {
      const patient = transformPatientFromDB(item.patient);
      return await loadPatientData(patient);
    })
  );

  return patientDataList;
}

// Get a single patient by ID
export async function getPatientById(patientId: string): Promise<PatientData | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single();

  if (error || !data) {
    console.error('Error fetching patient:', error);
    return null;
  }

  const patient = transformPatientFromDB(data);
  return await loadPatientData(patient);
}

// Create a new patient
export async function createPatient(
  patientData: Partial<Patient>,
  caregiverId: string,
  relationship?: string
): Promise<Patient> {
  
  // 1️⃣ FIRST: Create the auth user
  // Generate a temporary password
  const tempPassword = Math.random().toString(36).slice(-8) + '1!';
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: patientData.email!,
    password: tempPassword,
    options: {
      data: {
        first_name: patientData.firstName,
        last_name: patientData.lastName,
        role: 'patient'
      }
    }
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    throw new Error(`Failed to create user account: ${authError.message}`);
  }
  
  if (!authData.user) {
    throw new Error('Failed to create user account - no user returned');
  }

  // 2️⃣ SECOND: Insert patient with the auth user's ID
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({
      id: authData.user.id,  // Use the auth user ID
      first_name: patientData.firstName,
      last_name: patientData.lastName,
      preferred_name: patientData.preferredName,
      date_of_birth: patientData.dateOfBirth,
      photo_url: patientData.photoUrl,
      location: patientData.location,
      address: patientData.address,
      affirmation: patientData.affirmation,
      diagnosis_date: patientData.diagnosisDate,
      dementia_stage: patientData.dementiaStage,
      emergency_contact_name: patientData.emergencyContact?.name,
      emergency_contact_relationship: patientData.emergencyContact?.relationship,
      emergency_contact_phone: patientData.emergencyContact?.phone,
      emergency_contact_email: patientData.emergencyContact?.email,
    })
    .select()
    .single();

  if (patientError || !patient) {
    console.error('Error creating patient:', patientError);
    throw patientError;
  }

  // 3️⃣ THIRD: Create caregiver-patient relationship
  const { error: relError } = await supabase
    .from('caregiver_patients')
    .insert({
      caregiver_id: caregiverId,
      patient_id: patient.id,
      relationship: relationship || 'Primary Caregiver',
      is_primary: true,
    });

  if (relError) {
    console.error('Error creating caregiver relationship:', relError);
    throw relError;
  }

  // Optional: Show the temporary password (you'll need to handle this in the UI)
  console.log('Temporary password for patient:', tempPassword);
  
  return transformPatientFromDB(patient);
}

// Update a patient
export async function updatePatient(
  patientId: string,
  updates: Partial<Patient>
): Promise<Patient> {
  const { data, error } = await supabase
    .from('patients')
    .update({
      first_name: updates.firstName,
      last_name: updates.lastName,
      preferred_name: updates.preferredName,
      date_of_birth: updates.dateOfBirth,
      photo_url: updates.photoUrl,
      location: updates.location,
      address: updates.address,
      affirmation: updates.affirmation,
      diagnosis_date: updates.diagnosisDate,
      dementia_stage: updates.dementiaStage,
      emergency_contact_name: updates.emergencyContact?.name,
      emergency_contact_relationship: updates.emergencyContact?.relationship,
      emergency_contact_phone: updates.emergencyContact?.phone,
      emergency_contact_email: updates.emergencyContact?.email,
      updated_at: new Date().toISOString(),
    })
    .eq('id', patientId)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating patient:', error);
    throw error;
  }

  return transformPatientFromDB(data);
}

// Delete a patient
export async function deletePatient(patientId: string): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', patientId);

  if (error) {
    console.error('Error deleting patient:', error);
    throw error;
  }
}

// Get notes for a patient
export async function getPatientNotes(patientId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('patient_notes')
    .select(`
      *,
      caregiver:profiles(first_name, last_name)
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching patient notes:', error);
    throw error;
  }

  return (data || []).map((note: any) => ({
    id: note.id,
    patientId: note.patient_id,
    caregiverId: note.caregiver_id,
    caregiverName: note.caregiver 
      ? `${note.caregiver.first_name} ${note.caregiver.last_name}`
      : 'Unknown',
    note: note.note,
    noteType: note.note_type,
    createdAt: note.created_at,
  }));
}

// Add a note for a patient
export async function addPatientNote(
  patientId: string,
  caregiverId: string,
  note: string,
  noteType: Note['noteType'] = 'general'
): Promise<Note> {
  const { data, error } = await supabase
    .from('patient_notes')
    .insert({
      patient_id: patientId,
      caregiver_id: caregiverId,
      note,
      note_type: noteType,
    })
    .select(`
      *,
      caregiver:profiles(first_name, last_name)
    `)
    .single();

  if (error || !data) {
    console.error('Error adding patient note:', error);
    throw error;
  }

  return {
    id: data.id,
    patientId: data.patient_id,
    caregiverId: data.caregiver_id,
    caregiverName: data.caregiver 
      ? `${data.caregiver.first_name} ${data.caregiver.last_name}`
      : 'Unknown',
    note: data.note,
    noteType: data.note_type,
    createdAt: data.created_at,
  };
}

// Delete a note
export async function deletePatientNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('patient_notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    console.error('Error deleting note:', error);
    throw error;
  }
}

// Helper: Transform DB patient to app Patient type
function transformPatientFromDB(dbPatient: Tables['patients']['Row']): Patient {
  return {
    id: dbPatient.id,
    userId: dbPatient.id,
    firstName: dbPatient.first_name || '',
    lastName: dbPatient.last_name || '',
    preferredName: dbPatient.preferred_name || dbPatient.first_name || '',
    dateOfBirth: dbPatient.date_of_birth || undefined,
    photoUrl: dbPatient.photo_url || undefined,
    location: dbPatient.location || 'Unknown',
    address: dbPatient.address || undefined,
    affirmation: dbPatient.affirmation || 'You are safe. You are loved. You are at home.',
    emergencyContact: {
      name: dbPatient.emergency_contact_name || 'Emergency Contact',
      relationship: dbPatient.emergency_contact_relationship || 'Family',
      phone: dbPatient.emergency_contact_phone || '',
      email: dbPatient.emergency_contact_email || undefined,
    },
    familiarFaces: [], // Load separately if needed
    diagnosisDate: dbPatient.diagnosis_date || undefined,
    dementiaStage: (dbPatient.dementia_stage as 'early' | 'middle' | 'late') || 'middle',
    preferences: {
      language: dbPatient.preferences_language || 'en',
      fontSize: (dbPatient.preferences_font_size as 'normal' | 'large' | 'extra-large') || 'large',
      highContrast: dbPatient.preferences_high_contrast || false,
      audioEnabled: dbPatient.preferences_audio_enabled || true,
      notificationsEnabled: dbPatient.preferences_notifications_enabled || true,
      tone: (dbPatient.preferences_tone as 'gentle' | 'professional' | 'friendly') || 'gentle',
    },
    createdAt: dbPatient.created_at,
    updatedAt: dbPatient.updated_at,
  };
}

// Helper: Load all patient data
async function loadPatientData(patient: Patient): Promise<PatientData> {
  // Load related data in parallel
  const [
    { data: medications },
    { data: tasks },
    { data: appointments },
    { data: notes },
    { data: memories },
    { data: moodEntries },
    { data: careTeam },
  ] = await Promise.all([
    supabase.from('medications').select('*').eq('patient_id', patient.id).eq('is_active', true),
    supabase.from('tasks').select('*').eq('patient_id', patient.id).eq('is_active', true),
    supabase.from('appointments').select('*').eq('patient_id', patient.id),
    supabase.from('patient_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('memories').select('*').eq('patient_id', patient.id).limit(10),
    supabase.from('mood_entries').select('*').eq('patient_id', patient.id).order('timestamp', { ascending: false }).limit(5),
    supabase.from('care_team_members').select('*').eq('patient_id', patient.id),
  ]);

  // Calculate dashboard stats
  const tasksCompleted = (tasks || []).filter((t: any) => t.status === 'completed').length;
  const tasksTotal = (tasks || []).length;
  const medicationsTotal = (medications || []).length;
  
  // Get today's medication logs
  const today = new Date().toISOString().split('T')[0];
  const { data: medLogs } = await supabase
    .from('medication_logs')
    .select('*')
    .eq('patient_id', patient.id)
    .eq('date', today);

  const medicationsTaken = (medLogs || []).filter((l: any) => l.status === 'taken').length;
  const medicationsAdherenceRate = medicationsTotal > 0 
    ? Math.round((medicationsTaken / medicationsTotal) * 100) 
    : 0;

  // Get latest mood
  const latestMood = moodEntries && moodEntries.length > 0 ? moodEntries[0] : null;

  return {
    patient,
    tasks: (tasks || []).map((t: any) => ({
      id: t.id,
      patientId: t.patient_id,
      title: t.title,
      description: t.description,
      icon: t.icon,
      timeOfDay: t.time_of_day,
      scheduledTime: t.scheduled_time,
      daysOfWeek: t.days_of_week,
      status: t.status,
      completedAt: t.completed_at,
      isRecurring: t.is_recurring,
      difficulty: t.difficulty,
      isActive: t.is_active,
    })),
    medications: (medications || []).map((m: any) => ({
      id: m.id,
      patientId: m.patient_id,
      name: m.name,
      genericName: m.generic_name,
      dosage: m.dosage,
      form: m.form,
      instructions: m.instructions,
      prescribedBy: m.prescribed_by,
      prescriptionDate: m.prescription_date,
      sideEffects: m.side_effects || [],
      schedule: [], // Load separately if needed
      isActive: m.is_active,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
    medicationLogs: (medLogs || []).map((l: any) => ({
      id: l.id,
      medicationId: l.medication_id,
      patientId: l.patient_id,
      medicationName: '', // Will be populated from medication
      scheduledTime: l.scheduled_time,
      takenTime: l.taken_time,
      status: l.status,
      notes: l.notes,
      recordedBy: l.recorded_by,
      date: l.date,
    })),
    moodEntries: (moodEntries || []).map((m: any) => ({
      id: m.id,
      patientId: m.patient_id,
      mood: m.mood,
      intensity: m.intensity,
      note: m.note,
      triggers: m.triggers || [],
      timeOfDay: m.time_of_day,
      timestamp: m.timestamp,
      recordedBy: m.recorded_by,
    })),
    behaviorLogs: [],
    memories: (memories || []).map((m: any) => ({
      id: m.id,
      patientId: m.patient_id,
      title: m.title,
      description: m.description,
      photoUrl: m.photo_url,
      audioUrl: m.audio_url,
      date: m.date,
      location: m.location,
      people: m.people || [],
      category: m.category,
      tags: m.tags || [],
      isFavorite: m.is_favorite,
      createdAt: m.created_at,
      createdBy: m.created_by,
    })),
    documents: [],
    careTeam: (careTeam || []).map((c: any) => ({
      id: c.id,
      patientId: c.patient_id,
      name: c.name,
      role: c.role,
      specialty: c.specialty,
      organization: c.organization,
      phone: c.phone,
      email: c.email,
      isPrimary: c.is_primary,
    })),
    reminders: [],
    vitalSigns: [],
    sleepEntries: [],
    appointments: (appointments || []).map((a: any) => ({
      id: a.id,
      patientId: a.patient_id,
      title: a.title,
      provider: a.provider,
      location: a.location,
      date: a.date,
      time: a.time,
      notes: a.notes,
      reminderSet: a.reminder_set,
      createdAt: a.created_at,
    })),
    goals: [],
    dashboardStats: {
      patientId: patient.id,
      tasksCompleted,
      tasksTotal,
      tasksCompletionRate: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
      medicationsTaken,
      medicationsTotal,
      medicationsAdherenceRate,
      moodToday: latestMood?.mood,
      moodTrend: 'stable',
      sleepHours: 7,
      sleepQuality: 'good',
      activitiesCompleted: 0,
      behaviorIncidents: 0,
      alerts: [],
    },
    alerts: [],
    safetyAlerts: [],
    adlAssessments: [],
    nutritionLogs: [],
    notes: (notes || []).map((n: any) => ({
      id: n.id,
      patientId: n.patient_id,
      caregiverId: n.caregiver_id,
      caregiverName: 'Unknown',
      note: n.note,
      noteType: n.note_type,
      createdAt: n.created_at,
    })),
  };
}