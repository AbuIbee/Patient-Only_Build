export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'therapist' | 'caregiver' | 'patient'

export type DementiaStage = 'early' | 'middle' | 'late'

export type NoteType = 'general' | 'medical' | 'behavior' | 'mood' | 'activity'

export type MedicationForm = 'pill' | 'liquid' | 'injection' | 'patch' | 'inhaler'

export type TaskStatus = 'pending' | 'completed' | 'skipped'

export type MoodType = 'happy' | 'calm' | 'sad' | 'anxious' | 'angry' | 'confused' | 'scared' | 'worried'

export type MemoryCategory = 'photo' | 'audio' | 'video' | 'story'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export type RelationshipType = 'daughter' | 'son' | 'spouse' | 'professional' | 'friend' | 'primary' | 'secondary'

export type TherapistRelationshipType = 'primary' | 'consulting' | 'supervising' | 'secondary'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          first_name: string
          last_name: string
          role: UserRole
          phone: string | null
          photo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          first_name: string
          last_name: string
          role: UserRole
          phone?: string | null
          photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          first_name?: string
          last_name?: string
          role?: UserRole
          phone?: string | null
          photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      patients: {
        Row: {
          id: string
          date_of_birth: string | null
          diagnosis: string | null
          dementia_stage: DementiaStage | null
          diagnosis_date: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          preferred_name: string | null
          location: string | null
          address: string | null
          affirmation: string
          preferences_language: string
          preferences_font_size: 'normal' | 'large' | 'extra-large'
          preferences_high_contrast: boolean
          preferences_audio_enabled: boolean
          preferences_notifications_enabled: boolean
          preferences_tone: 'gentle' | 'professional' | 'friendly'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          date_of_birth?: string | null
          diagnosis?: string | null
          dementia_stage?: DementiaStage | null
          diagnosis_date?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          preferred_name?: string | null
          location?: string | null
          address?: string | null
          affirmation?: string
          preferences_language?: string
          preferences_font_size?: 'normal' | 'large' | 'extra-large'
          preferences_high_contrast?: boolean
          preferences_audio_enabled?: boolean
          preferences_notifications_enabled?: boolean
          preferences_tone?: 'gentle' | 'professional' | 'friendly'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date_of_birth?: string | null
          diagnosis?: string | null
          dementia_stage?: DementiaStage | null
          diagnosis_date?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          preferred_name?: string | null
          location?: string | null
          address?: string | null
          affirmation?: string
          preferences_language?: string
          preferences_font_size?: 'normal' | 'large' | 'extra-large'
          preferences_high_contrast?: boolean
          preferences_audio_enabled?: boolean
          preferences_notifications_enabled?: boolean
          preferences_tone?: 'gentle' | 'professional' | 'friendly'
          created_at?: string
          updated_at?: string
        }
      }
      caregiver_patients: {
        Row: {
          id: string
          caregiver_id: string
          patient_id: string
          relationship_type: RelationshipType
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          caregiver_id: string
          patient_id: string
          relationship_type?: RelationshipType
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          caregiver_id?: string
          patient_id?: string
          relationship_type?: RelationshipType
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      therapist_relationships: {
        Row: {
          id: string
          therapist_id: string
          patient_id: string | null
          caregiver_id: string | null
          relationship_type: TherapistRelationshipType
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          therapist_id: string
          patient_id?: string | null
          caregiver_id?: string | null
          relationship_type?: TherapistRelationshipType
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          therapist_id?: string
          patient_id?: string | null
          caregiver_id?: string | null
          relationship_type?: TherapistRelationshipType
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      patient_notes: {
        Row: {
          id: string
          patient_id: string
          author_id: string
          note: string
          note_type: NoteType
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          author_id: string
          note: string
          note_type?: NoteType
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          author_id?: string
          note?: string
          note_type?: NoteType
          created_at?: string
          updated_at?: string
        }
      }
      medications: {
        Row: {
          id: string
          patient_id: string
          name: string
          generic_name: string | null
          dosage: string
          form: MedicationForm | null
          instructions: string
          prescribed_by: string | null
          prescription_date: string | null
          side_effects: string[]
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          name: string
          generic_name?: string | null
          dosage: string
          form?: MedicationForm | null
          instructions: string
          prescribed_by?: string | null
          prescription_date?: string | null
          side_effects?: string[]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          name?: string
          generic_name?: string | null
          dosage?: string
          form?: MedicationForm | null
          instructions?: string
          prescribed_by?: string | null
          prescription_date?: string | null
          side_effects?: string[]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          patient_id: string
          title: string
          description: string | null
          icon: string
          time_of_day: TimeOfDay | null
          scheduled_time: string | null
          days_of_week: number[]
          status: TaskStatus
          completed_at: string | null
          is_recurring: boolean
          difficulty: DementiaStage | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          title: string
          description?: string | null
          icon?: string
          time_of_day?: TimeOfDay | null
          scheduled_time?: string | null
          days_of_week?: number[]
          status?: TaskStatus
          completed_at?: string | null
          is_recurring?: boolean
          difficulty?: DementiaStage | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          title?: string
          description?: string | null
          icon?: string
          time_of_day?: TimeOfDay | null
          scheduled_time?: string | null
          days_of_week?: number[]
          status?: TaskStatus
          completed_at?: string | null
          is_recurring?: boolean
          difficulty?: DementiaStage | null
          is_active?: boolean
          created_at?: string
        }
      }
      mood_entries: {
        Row: {
          id: string
          patient_id: string
          mood: MoodType
          intensity: number
          note: string | null
          triggers: string[]
          time_of_day: TimeOfDay | null
          timestamp: string
          recorded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          mood: MoodType
          intensity: number
          note?: string | null
          triggers?: string[]
          time_of_day?: TimeOfDay | null
          timestamp?: string
          recorded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          mood?: MoodType
          intensity?: number
          note?: string | null
          triggers?: string[]
          time_of_day?: TimeOfDay | null
          timestamp?: string
          recorded_by?: string
          created_at?: string
        }
      }
      memories: {
        Row: {
          id: string
          patient_id: string
          title: string
          description: string | null
          photo_url: string | null
          audio_url: string | null
          date: string | null
          location: string | null
          people: string[]
          category: MemoryCategory
          tags: string[]
          is_favorite: boolean
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          patient_id: string
          title: string
          description?: string | null
          photo_url?: string | null
          audio_url?: string | null
          date?: string | null
          location?: string | null
          people?: string[]
          category: MemoryCategory
          tags?: string[]
          is_favorite?: boolean
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          patient_id?: string
          title?: string
          description?: string | null
          photo_url?: string | null
          audio_url?: string | null
          date?: string | null
          location?: string | null
          people?: string[]
          category?: MemoryCategory
          tags?: string[]
          is_favorite?: boolean
          created_at?: string
          created_by?: string
        }
      }
      appointments: {
        Row: {
          id: string
          patient_id: string
          title: string
          provider: string
          location: string | null
          date: string
          time: string
          notes: string | null
          reminder_set: boolean
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          title: string
          provider: string
          location?: string | null
          date: string
          time: string
          notes?: string | null
          reminder_set?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          title?: string
          provider?: string
          location?: string | null
          date?: string
          time?: string
          notes?: string | null
          reminder_set?: boolean
          created_at?: string
        }
      }
      care_team_members: {
        Row: {
          id: string
          patient_id: string
          name: string
          role: string
          specialty: string | null
          organization: string | null
          phone: string
          email: string | null
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          name: string
          role: string
          specialty?: string | null
          organization?: string | null
          phone: string
          email?: string | null
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          name?: string
          role?: string
          specialty?: string | null
          organization?: string | null
          phone?: string
          email?: string | null
          is_primary?: boolean
          created_at?: string
        }
      }
    }
    Views: {
      caregiver_patient_list: {
        Row: {
          caregiver_id: string
          patient_id: string
          relationship_type: RelationshipType
          is_primary: boolean
          first_name: string
          last_name: string
          preferred_name: string | null
          photo_url: string | null
          role: UserRole
          dementia_stage: DementiaStage | null
          location: string | null
          date_of_birth: string | null
        }
      }
      therapist_relationship_list: {
        Row: {
          therapist_id: string
          patient_id: string | null
          caregiver_id: string | null
          relationship_type: TherapistRelationshipType
          is_active: boolean
          related_first_name: string
          related_last_name: string
          related_type: 'patient' | 'caregiver'
        }
      }
    }
    Functions: {
      is_admin: {
        Args: { user_id: string }
        Returns: boolean
      }
      get_caregiver_patients: {
        Args: { caregiver_uuid: string }
        Returns: { patient_id: string }[]
      }
      get_therapist_patients: {
        Args: { therapist_uuid: string }
        Returns: { patient_id: string }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
