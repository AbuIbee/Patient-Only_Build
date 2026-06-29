// Supabase table types based on your database schema
export interface Tables {
  patients: {
    Row: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      preferred_name: string | null;
      date_of_birth: string | null;
      photo_url: string | null;
      location: string | null;
      address: string | null;
      affirmation: string | null;
      diagnosis_date: string | null;
      dementia_stage: string | null;
      emergency_contact_name: string | null;
      emergency_contact_relationship: string | null;
      emergency_contact_phone: string | null;
      emergency_contact_email: string | null;
      preferences_language: string | null;
      preferences_font_size: string | null;
      preferences_high_contrast: boolean | null;
      preferences_audio_enabled: boolean | null;
      preferences_notifications_enabled: boolean | null;
      preferences_tone: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      preferred_name?: string | null;
      date_of_birth?: string | null;
      photo_url?: string | null;
      location?: string | null;
      address?: string | null;
      affirmation?: string | null;
      diagnosis_date?: string | null;
      dementia_stage?: string | null;
      emergency_contact_name?: string | null;
      emergency_contact_relationship?: string | null;
      emergency_contact_phone?: string | null;
      emergency_contact_email?: string | null;
      preferences_language?: string | null;
      preferences_font_size?: string | null;
      preferences_high_contrast?: boolean | null;
      preferences_audio_enabled?: boolean | null;
      preferences_notifications_enabled?: boolean | null;
      preferences_tone?: string | null;
      created_at?: string;
      updated_at?: string;
    };
  };
  caregiver_patients: {
    Row: {
      caregiver_id: string;
      patient_id: string;
      relationship: string | null;
      is_primary: boolean;
      created_at: string;
    };
    Insert: {
      caregiver_id: string;
      patient_id: string;
      relationship?: string | null;
      is_primary?: boolean;
      created_at?: string;
    };
  };
  patient_notes: {
    Row: {
      id: string;
      patient_id: string;
      caregiver_id: string;
      note: string;
      note_type: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      patient_id: string;
      caregiver_id: string;
      note: string;
      note_type?: string;
      created_at?: string;
    };
  };
  tasks: {
    Row: {
      id: string;
      patient_id: string;
      title: string;
      description: string | null;
      icon: string;
      time_of_day: string;
      scheduled_time: string;
      days_of_week: number[];
      status: string;
      completed_at: string | null;
      is_recurring: boolean;
      difficulty: string;
      is_active: boolean;
    };
  };
  medications: {
    Row: {
      id: string;
      patient_id: string;
      name: string;
      generic_name: string | null;
      dosage: string;
      form: string;
      instructions: string;
      prescribed_by: string;
      prescription_date: string | null;
      side_effects: string[] | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    };
  };
  medication_logs: {
    Row: {
      id: string;
      medication_id: string;
      patient_id: string;
      scheduled_time: string;
      taken_time: string | null;
      status: string;
      notes: string | null;
      recorded_by: string;
      date: string;
    };
  };
  mood_entries: {
    Row: {
      id: string;
      patient_id: string;
      mood: string;
      intensity: number | null;
      note: string | null;
      triggers: string[] | null;
      time_of_day: string;
      timestamp: string;
      recorded_by: string;
    };
  };
  memories: {
    Row: {
      id: string;
      patient_id: string;
      title: string;
      description: string | null;
      photo_url: string | null;
      audio_url: string | null;
      date: string | null;
      location: string | null;
      people: string[] | null;
      category: string;
      tags: string[] | null;
      is_favorite: boolean;
      created_at: string;
      created_by: string;
    };
  };
  care_team_members: {
    Row: {
      id: string;
      patient_id: string;
      name: string;
      role: string;
      specialty: string | null;
      organization: string | null;
      phone: string;
      email: string | null;
      is_primary: boolean;
    };
  };
  appointments: {
    Row: {
      id: string;
      patient_id: string;
      title: string;
      provider: string;
      location: string | null;
      date: string;
      time: string;
      notes: string | null;
      reminder_set: boolean;
      created_at: string;
    };
  };
}