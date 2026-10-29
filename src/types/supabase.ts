export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// PHASE 3 / PHASE 1.3 (MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009): `pending`
// added — confirmed real, extensively-used value (AdminDashboard.tsx,
// AdminPendingApprovals.tsx both query/count `profiles.role = 'pending'`
// for the "Pending Approvals" admin screen) that was missing from both
// this type AND the tracked `profiles_role_check` CHECK constraint
// (002_identity_and_role_contract.sql) — see migration
// 022_pending_role_support.sql for the schema side and its own BLOCKER
// note (nothing in tracked signup code currently ever WRITES this value;
// only the admin-side read/filter/approve/reject path currently exists).
export type UserRole = 'admin' | 'superadmin' | 'therapist' | 'caregiver' | 'patient' | 'pending'

export type DementiaStage = 'early' | 'middle' | 'late'

// PHASE 3: `care_partner_personal` added — confirmed via
// 006_patient_notes_author.sql's own widened CHECK constraint
// (`patient_notes_note_type_check`), itself added because
// src/pages/patient/PatientDocuments.tsx writes this exact value.
export type NoteType = 'general' | 'medical' | 'behavior' | 'mood' | 'activity' | 'care_partner_personal' | 'therapist_session' | 'clinical_observation'

export type MedicationForm = 'pill' | 'liquid' | 'injection' | 'patch' | 'inhaler'

export type TaskStatus = 'pending' | 'completed' | 'skipped' | 'not_applicable'

export type MoodType = 'happy' | 'calm' | 'sad' | 'anxious' | 'angry' | 'confused' | 'scared' | 'worried'

// RELEASE-BLOCKER-CLOSURE PHASE 1: corrected from the tracked-but-unused
// 'photo'|'audio'|'video'|'story' (001's CHECK constraint, never actually
// read or written anywhere in tracked app code) to the taxonomy
// PatientMemories.tsx actually and exclusively reads/writes — see
// 025_memories_category_taxonomy_correction.sql for the full evidence and
// the matching CHECK-constraint correction.
export type MemoryCategory = 'family' | 'travel' | 'milestones' | 'daily'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export type RelationshipType = 'daughter' | 'son' | 'spouse' | 'professional' | 'friend' | 'primary' | 'secondary'

export type TherapistRelationshipType = 'primary' | 'consulting' | 'supervising' | 'secondary'

// REPAIR 008 / REPAIR D: `subscriptions` now has a real Tables entry below
// (it did not before — the root cause of every ".from('subscriptions')"
// diagnostic reported in Repair 007's completion report: the `from()`
// overload only accepts keys of Tables|Views, `subscriptions` was a key of
// neither, so TS fell through every OTHER table name and failed all of
// them). `SubscriptionRow` is kept as a type alias — not redefined as a
// separate interface — so it stays structurally identical to the real
// Tables Row by construction instead of by manual upkeep, and every
// existing import of this name (the Functions map below) keeps working
// unchanged. Type aliases may reference a type declared later in the same
// module (TS resolves the type space independent of declaration order),
// so this is safe to place before the `Database` interface it reads from.
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row']
export type ConversationRow = Database['public']['Tables']['conversations']['Row']
export type ConversationParticipantRow = Database['public']['Tables']['conversation_participants']['Row']
export type MessageRow = Database['public']['Tables']['messages']['Row']
export type MessageAcknowledgmentRow = Database['public']['Tables']['message_acknowledgments']['Row']
export type OrganizationLicenseRow = Database['public']['Tables']['organization_licenses']['Row']
export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type PendingCaregiverRegistrationRow = Database['public']['Tables']['pending_caregiver_registrations']['Row']
export type HelpActivationRow = Database['public']['Tables']['help_activations']['Row']
export type PendingTherapistConnectionRow = Database['public']['Tables']['pending_therapist_connections']['Row']

// Generated from isolated HCN staging on 2026-10-29. Do not edit database definitions manually.
export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_management_audit: {
        Row: {
          action_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          organization_id: string | null
          previous_value: Json | null
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          organization_id?: string | null
          previous_value?: Json | null
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          organization_id?: string | null
          previous_value?: Json | null
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_management_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_management_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_management_audit_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string | null
          date: string
          id: string
          location: string | null
          notes: string | null
          patient_id: string
          provider: string
          reminder_set: boolean | null
          time: string
          title: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          location?: string | null
          notes?: string | null
          patient_id: string
          provider: string
          reminder_set?: boolean | null
          time: string
          title: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          location?: string | null
          notes?: string | null
          patient_id?: string
          provider?: string
          reminder_set?: boolean | null
          time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_stories: {
        Row: {
          audio_url: string
          author: string | null
          category: string
          created_at: string
          description: string | null
          duration: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
        }
        Insert: {
          audio_url: string
          author?: string | null
          category: string
          created_at?: string
          description?: string | null
          duration?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          audio_url?: string
          author?: string | null
          category?: string
          created_at?: string
          description?: string | null
          duration?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      calm_tracks: {
        Row: {
          artist: string
          audio_url: string
          category: string
          color: string
          created_at: string
          emoji: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
        }
        Insert: {
          artist?: string
          audio_url: string
          category: string
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          artist?: string
          audio_url?: string
          category?: string
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      care_partner_checkins: {
        Row: {
          be_agitation: string | null
          be_behaviors: string[] | null
          be_comments: string | null
          be_hallucinations: string | null
          be_responsiveness: string | null
          be_trigger: string | null
          be_wandering_risk: string | null
          check_in_date: string
          co_bowel: string | null
          co_comments: string | null
          co_skin: string | null
          co_urinary: string | null
          created_at: string
          fn_bathing: string | null
          fn_comments: string | null
          fn_dressing: string | null
          fn_medication: string | null
          fn_mobility: string | null
          fn_toileting: string | null
          fn_transfers: string | null
          id: string
          mo_comments: string | null
          mo_mood: string | null
          mo_sleep: string | null
          mo_social: string | null
          nu_appetite: string | null
          nu_comments: string | null
          nu_fluids: string | null
          nu_meal_pct: string | null
          nu_swallowing: string | null
          patient_id: string
          sa_comments: string | null
          sa_falls: string | null
          sa_injury_details: string | null
          sa_safety_checklist: string[] | null
          sa_safety_concerns: boolean | null
          sa_wandering: string | null
          submitted_by: string
          submitted_by_name: string | null
          sy_comments: string | null
          sy_gi: string | null
          sy_neurological: string | null
          sy_other: string | null
          sy_pain: string | null
          sy_respiratory: string | null
          sy_severity: string | null
          sy_symptoms: string[] | null
        }
        Insert: {
          be_agitation?: string | null
          be_behaviors?: string[] | null
          be_comments?: string | null
          be_hallucinations?: string | null
          be_responsiveness?: string | null
          be_trigger?: string | null
          be_wandering_risk?: string | null
          check_in_date?: string
          co_bowel?: string | null
          co_comments?: string | null
          co_skin?: string | null
          co_urinary?: string | null
          created_at?: string
          fn_bathing?: string | null
          fn_comments?: string | null
          fn_dressing?: string | null
          fn_medication?: string | null
          fn_mobility?: string | null
          fn_toileting?: string | null
          fn_transfers?: string | null
          id?: string
          mo_comments?: string | null
          mo_mood?: string | null
          mo_sleep?: string | null
          mo_social?: string | null
          nu_appetite?: string | null
          nu_comments?: string | null
          nu_fluids?: string | null
          nu_meal_pct?: string | null
          nu_swallowing?: string | null
          patient_id: string
          sa_comments?: string | null
          sa_falls?: string | null
          sa_injury_details?: string | null
          sa_safety_checklist?: string[] | null
          sa_safety_concerns?: boolean | null
          sa_wandering?: string | null
          submitted_by: string
          submitted_by_name?: string | null
          sy_comments?: string | null
          sy_gi?: string | null
          sy_neurological?: string | null
          sy_other?: string | null
          sy_pain?: string | null
          sy_respiratory?: string | null
          sy_severity?: string | null
          sy_symptoms?: string[] | null
        }
        Update: {
          be_agitation?: string | null
          be_behaviors?: string[] | null
          be_comments?: string | null
          be_hallucinations?: string | null
          be_responsiveness?: string | null
          be_trigger?: string | null
          be_wandering_risk?: string | null
          check_in_date?: string
          co_bowel?: string | null
          co_comments?: string | null
          co_skin?: string | null
          co_urinary?: string | null
          created_at?: string
          fn_bathing?: string | null
          fn_comments?: string | null
          fn_dressing?: string | null
          fn_medication?: string | null
          fn_mobility?: string | null
          fn_toileting?: string | null
          fn_transfers?: string | null
          id?: string
          mo_comments?: string | null
          mo_mood?: string | null
          mo_sleep?: string | null
          mo_social?: string | null
          nu_appetite?: string | null
          nu_comments?: string | null
          nu_fluids?: string | null
          nu_meal_pct?: string | null
          nu_swallowing?: string | null
          patient_id?: string
          sa_comments?: string | null
          sa_falls?: string | null
          sa_injury_details?: string | null
          sa_safety_checklist?: string[] | null
          sa_safety_concerns?: boolean | null
          sa_wandering?: string | null
          submitted_by?: string
          submitted_by_name?: string | null
          sy_comments?: string | null
          sy_gi?: string | null
          sy_neurological?: string | null
          sy_other?: string | null
          sy_pain?: string | null
          sy_respiratory?: string | null
          sy_severity?: string | null
          sy_symptoms?: string[] | null
        }
        Relationships: []
      }
      care_partner_logs: {
        Row: {
          answers: Json
          created_at: string
          exercise: string | null
          hydration: string | null
          id: string
          meals: string | null
          medications: string | null
          mobility: string | null
          mood: string | null
          notes: string | null
          pain_level: number | null
          patient_id: string
          report_date: string
          sleep_quality: string | null
          submitted_at: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          exercise?: string | null
          hydration?: string | null
          id?: string
          meals?: string | null
          medications?: string | null
          mobility?: string | null
          mood?: string | null
          notes?: string | null
          pain_level?: number | null
          patient_id: string
          report_date: string
          sleep_quality?: string | null
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          exercise?: string | null
          hydration?: string | null
          id?: string
          meals?: string | null
          medications?: string | null
          mobility?: string | null
          mood?: string | null
          notes?: string | null
          pain_level?: number | null
          patient_id?: string
          report_date?: string
          sleep_quality?: string | null
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      care_partner_notes: {
        Row: {
          category: string
          created_at: string | null
          id: string
          note: string
          patient_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          note?: string
          patient_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          note?: string
          patient_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_partner_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "care_partner_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_partner_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_team_members: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          name: string
          organization: string | null
          patient_id: string
          phone: string
          role: string
          specialty: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          organization?: string | null
          patient_id: string
          phone: string
          role: string
          specialty?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          organization?: string | null
          patient_id?: string
          phone?: string
          role?: string
          specialty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_team_members_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "care_team_members_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_credentials: {
        Row: {
          created_at: string
          credential_name: string
          expires_at: string | null
          id: string
          issued_at: string | null
          organization_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_name: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          organization_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_name?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          organization_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_patients: {
        Row: {
          caregiver_id: string
          created_at: string | null
          display_label: string | null
          id: string
          is_primary: boolean | null
          patient_id: string
          relationship: string | null
          relationship_type: string | null
          updated_at: string | null
        }
        Insert: {
          caregiver_id: string
          created_at?: string | null
          display_label?: string | null
          id?: string
          is_primary?: boolean | null
          patient_id: string
          relationship?: string | null
          relationship_type?: string | null
          updated_at?: string | null
        }
        Update: {
          caregiver_id?: string
          created_at?: string | null
          display_label?: string | null
          id?: string
          is_primary?: boolean | null
          patient_id?: string
          relationship?: string | null
          relationship_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_patients_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "caregiver_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_visits: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          caregiver_id: string
          created_at: string
          evv_latitude: number | null
          evv_longitude: number | null
          evv_offline_exception: boolean
          evv_required: boolean
          id: string
          organization_id: string
          patient_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          updated_at: string
          visit_notes: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          caregiver_id: string
          created_at?: string
          evv_latitude?: number | null
          evv_longitude?: number | null
          evv_offline_exception?: boolean
          evv_required?: boolean
          id?: string
          organization_id: string
          patient_id: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          updated_at?: string
          visit_notes?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          caregiver_id?: string
          created_at?: string
          evv_latitude?: number | null
          evv_longitude?: number | null
          evv_offline_exception?: boolean
          evv_required?: boolean
          id?: string
          organization_id?: string
          patient_id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          updated_at?: string
          visit_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_visits_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "caregiver_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          added_at: string
          added_by: string
          conversation_id: string
          id: string
          participant_role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          conversation_id: string
          id?: string
          participant_role: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          conversation_id?: string
          id?: string
          participant_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          patient_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          patient_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          patient_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      covered_patient_memberships: {
        Row: {
          archived_at: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          closure_reason: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          organization_id: string
          patient_id: string
          scheduled_archival_at: string | null
          started_at: string
          status: string
        }
        Insert: {
          archived_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          closure_reason?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          organization_id: string
          patient_id: string
          scheduled_archival_at?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          archived_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          closure_reason?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          organization_id?: string
          patient_id?: string
          scheduled_archival_at?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "covered_patient_memberships_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "covered_patient_memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "covered_patient_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "covered_patient_memberships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "covered_patient_memberships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_audit: {
        Row: {
          accessed_at: string
          accessed_by: string
          bucket_id: string
          id: string
          storage_path: string
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          bucket_id: string
          id?: string
          storage_path: string
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          bucket_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_audit_accessed_by_fkey"
            columns: ["accessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_billing_accounts: {
        Row: {
          billing_component: string
          billing_contact_email: string
          billing_interval: string
          created_at: string
          created_by: string
          currency: string
          id: string
          quote_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          unit_amount_cents: number
          updated_at: string
        }
        Insert: {
          billing_component?: string
          billing_contact_email: string
          billing_interval: string
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          quote_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          unit_amount_cents: number
          updated_at?: string
        }
        Update: {
          billing_component?: string
          billing_contact_email?: string
          billing_interval?: string
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          quote_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          unit_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_billing_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_billing_accounts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_billing_events: {
        Row: {
          billing_account_id: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          billing_account_id?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          billing_account_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_billing_events_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "enterprise_billing_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_contracts: {
        Row: {
          contract_type: string
          created_at: string
          created_by: string
          executed_at: string | null
          executed_by: string | null
          execution_evidence_reference: string | null
          execution_method: string | null
          id: string
          presented_at: string | null
          quote_id: string
          signatory_name: string
          signatory_title: string | null
          status: string
          supersedes_contract_id: string | null
          template_version: string
          updated_at: string
          voided_reason: string | null
        }
        Insert: {
          contract_type: string
          created_at?: string
          created_by: string
          executed_at?: string | null
          executed_by?: string | null
          execution_evidence_reference?: string | null
          execution_method?: string | null
          id?: string
          presented_at?: string | null
          quote_id: string
          signatory_name: string
          signatory_title?: string | null
          status?: string
          supersedes_contract_id?: string | null
          template_version: string
          updated_at?: string
          voided_reason?: string | null
        }
        Update: {
          contract_type?: string
          created_at?: string
          created_by?: string
          executed_at?: string | null
          executed_by?: string | null
          execution_evidence_reference?: string | null
          execution_method?: string | null
          id?: string
          presented_at?: string | null
          quote_id?: string
          signatory_name?: string
          signatory_title?: string | null
          status?: string
          supersedes_contract_id?: string | null
          template_version?: string
          updated_at?: string
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_contracts_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_contracts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_contracts_supersedes_contract_id_fkey"
            columns: ["supersedes_contract_id"]
            isOneToOne: false
            referencedRelation: "enterprise_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_coupon_redemptions: {
        Row: {
          application_id: string
          base_cents: number
          coupon_code: string
          discount_cents: number
          final_cents: number
          id: string
          redeemed_at: string
          redeemed_by: string
        }
        Insert: {
          application_id: string
          base_cents: number
          coupon_code: string
          discount_cents: number
          final_cents: number
          id?: string
          redeemed_at?: string
          redeemed_by: string
        }
        Update: {
          application_id?: string
          base_cents?: number
          coupon_code?: string
          discount_cents?: number
          final_cents?: number
          id?: string
          redeemed_at?: string
          redeemed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_coupon_redemptions_coupon_code_fkey"
            columns: ["coupon_code"]
            isOneToOne: false
            referencedRelation: "promo_coupon_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "enterprise_coupon_redemptions_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_demo_environments: {
        Row: {
          cleanup_completed_at: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          label: string
          notes: string | null
          organization_id: string | null
          retired_at: string | null
          status: string
          synthetic_data_only: boolean
          updated_at: string
        }
        Insert: {
          cleanup_completed_at?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          label: string
          notes?: string | null
          organization_id?: string | null
          retired_at?: string | null
          status?: string
          synthetic_data_only?: boolean
          updated_at?: string
        }
        Update: {
          cleanup_completed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string
          notes?: string | null
          organization_id?: string | null
          retired_at?: string | null
          status?: string
          synthetic_data_only?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_demo_environments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_demo_environments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_license_sequences: {
        Row: {
          next_value: number
          prefix: string
          year: number
        }
        Insert: {
          next_value?: number
          prefix: string
          year: number
        }
        Update: {
          next_value?: number
          prefix?: string
          year?: number
        }
        Relationships: []
      }
      enterprise_notifications: {
        Row: {
          body: string | null
          created_at: string
          dedup_key: string | null
          id: string
          notification_type: string
          read_at: string | null
          recipient_user_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          status: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          id?: string
          notification_type: string
          read_at?: string | null
          recipient_user_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          id?: string
          notification_type?: string
          read_at?: string | null
          recipient_user_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_patient_deletion_requests: {
        Row: {
          executed_at: string | null
          executed_by: string | null
          id: string
          legal_hold_cleared_at: string | null
          patient_id: string
          request_reason: string
          requested_at: string
          requested_by: string
          retention_anchor_at: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          legal_hold_cleared_at?: string | null
          patient_id: string
          request_reason: string
          requested_at?: string
          requested_by: string
          retention_anchor_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          legal_hold_cleared_at?: string | null
          patient_id?: string
          request_reason?: string
          requested_at?: string
          requested_by?: string
          retention_anchor_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_patient_deletion_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "enterprise_patient_deletion_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_retention_settings: {
        Row: {
          effective_from: string
          notes: string | null
          policy_key: string
          retention_years: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          effective_from?: string
          notes?: string | null
          policy_key: string
          retention_years: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          effective_from?: string
          notes?: string | null
          policy_key?: string
          retention_years?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      enterprise_role_catalog: {
        Row: {
          created_at: string
          description: string
          display_name: string
          is_assignable_by_director: boolean
          office_key: string | null
          role_key: string
          role_scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          display_name: string
          is_assignable_by_director?: boolean
          office_key?: string | null
          role_key: string
          role_scope: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_name?: string
          is_assignable_by_director?: boolean
          office_key?: string | null
          role_key?: string
          role_scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      help_activations: {
        Row: {
          caregiver_count_at_time: number
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          notification_status: string
          patient_id: string
          phone_dialed: string | null
        }
        Insert: {
          caregiver_count_at_time?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          notification_status?: string
          patient_id: string
          phone_dialed?: string | null
        }
        Update: {
          caregiver_count_at_time?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          notification_status?: string
          patient_id?: string
          phone_dialed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_activations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_activations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_activations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "help_activations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          incident_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          incident_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          incident_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_attachments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incident_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          incident_type: string
          occurred_at: string
          organization_id: string
          patient_id: string
          reported_by: string
          resolution_notes: string | null
          resolution_status: string
          severity: string
          supervisor_notified_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          incident_type: string
          occurred_at?: string
          organization_id: string
          patient_id: string
          reported_by: string
          resolution_notes?: string | null
          resolution_status?: string
          severity?: string
          supervisor_notified_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          incident_type?: string
          occurred_at?: string
          organization_id?: string
          patient_id?: string
          reported_by?: string
          resolution_notes?: string | null
          resolution_status?: string
          severity?: string
          supervisor_notified_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "incident_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      license_tier_catalog: {
        Row: {
          annual_fee_cents: number
          created_at: string
          display_name: string
          is_published: boolean
          specialist_slot_count: number
          tier_code: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          annual_fee_cents: number
          created_at?: string
          display_name: string
          is_published?: boolean
          specialist_slot_count: number
          tier_code: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          annual_fee_cents?: number
          created_at?: string
          display_name?: string
          is_published?: boolean
          specialist_slot_count?: number
          tier_code?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "license_tier_catalog_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      license_tier_catalog_history: {
        Row: {
          annual_fee_cents: number
          display_name: string
          id: string
          specialist_slot_count: number
          superseded_at: string
          superseded_by: string | null
          tier_code: string
          version: number
        }
        Insert: {
          annual_fee_cents: number
          display_name: string
          id?: string
          specialist_slot_count: number
          superseded_at?: string
          superseded_by?: string | null
          tier_code: string
          version: number
        }
        Update: {
          annual_fee_cents?: number
          display_name?: string
          id?: string
          specialist_slot_count?: number
          superseded_at?: string
          superseded_by?: string | null
          tier_code?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "license_tier_catalog_history_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_uploads: {
        Row: {
          caption: string
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          patient_id: string
          shared_with: string[]
          updated_at: string
          uploader_id: string
          uploader_name: string
          uploader_role: string
        }
        Insert: {
          caption?: string
          created_at?: string
          file_name?: string
          file_size?: number
          file_type: string
          file_url: string
          id?: string
          patient_id: string
          shared_with?: string[]
          updated_at?: string
          uploader_id: string
          uploader_name?: string
          uploader_role?: string
        }
        Update: {
          caption?: string
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          patient_id?: string
          shared_with?: string[]
          updated_at?: string
          uploader_id?: string
          uploader_name?: string
          uploader_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_uploads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_uploads_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_logs: {
        Row: {
          created_at: string | null
          date: string
          id: string
          medication_id: string
          medication_name: string | null
          notes: string | null
          patient_id: string
          recorded_by: string
          scheduled_time: string
          status: string | null
          taken_time: string | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          medication_id: string
          medication_name?: string | null
          notes?: string | null
          patient_id: string
          recorded_by: string
          scheduled_time: string
          status?: string | null
          taken_time?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          medication_id?: string
          medication_name?: string | null
          notes?: string | null
          patient_id?: string
          recorded_by?: string
          scheduled_time?: string
          status?: string | null
          taken_time?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "medication_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_logs_undone_by_fkey"
            columns: ["undone_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_schedules: {
        Row: {
          created_at: string | null
          days_of_week: number[] | null
          id: string
          medication_id: string
          time: string
        }
        Insert: {
          created_at?: string | null
          days_of_week?: number[] | null
          id?: string
          medication_id: string
          time: string
        }
        Update: {
          created_at?: string | null
          days_of_week?: number[] | null
          id?: string
          medication_id?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedules_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string | null
          dosage: string
          form: string | null
          generic_name: string | null
          id: string
          instructions: string
          is_active: boolean | null
          name: string
          patient_id: string
          prescribed_by: string | null
          prescription_date: string | null
          schedule: Json
          side_effects: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dosage: string
          form?: string | null
          generic_name?: string | null
          id?: string
          instructions: string
          is_active?: boolean | null
          name: string
          patient_id: string
          prescribed_by?: string | null
          prescription_date?: string | null
          schedule?: Json
          side_effects?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dosage?: string
          form?: string | null
          generic_name?: string | null
          id?: string
          instructions?: string
          is_active?: boolean | null
          name?: string
          patient_id?: string
          prescribed_by?: string | null
          prescription_date?: string | null
          schedule?: Json
          side_effects?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          audio_url: string | null
          category: string | null
          created_at: string | null
          created_by: string
          date: string | null
          description: string | null
          id: string
          is_favorite: boolean | null
          location: string | null
          patient_id: string
          people: string[] | null
          photo_url: string | null
          tags: string[] | null
          title: string
        }
        Insert: {
          audio_url?: string | null
          category?: string | null
          created_at?: string | null
          created_by: string
          date?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          location?: string | null
          patient_id: string
          people?: string[] | null
          photo_url?: string | null
          tags?: string[] | null
          title: string
        }
        Update: {
          audio_url?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string
          date?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          location?: string | null
          patient_id?: string
          people?: string[] | null
          photo_url?: string | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "memories_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_acknowledgments: {
        Row: {
          acknowledged_at: string | null
          follow_up_assigned_to: string | null
          follow_up_due_date: string | null
          follow_up_note: string | null
          follow_up_requested: boolean
          follow_up_resolved: boolean
          id: string
          message_id: string
          read_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          follow_up_assigned_to?: string | null
          follow_up_due_date?: string | null
          follow_up_note?: string | null
          follow_up_requested?: boolean
          follow_up_resolved?: boolean
          id?: string
          message_id: string
          read_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          follow_up_assigned_to?: string | null
          follow_up_due_date?: string | null
          follow_up_note?: string | null
          follow_up_requested?: boolean
          follow_up_resolved?: boolean
          id?: string
          message_id?: string
          read_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_acknowledgments_follow_up_assigned_to_fkey"
            columns: ["follow_up_assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_acknowledgments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          message_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          message_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_urgent: boolean
          message_type: string
          reply_to_message_id: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_urgent?: boolean
          message_type?: string
          reply_to_message_id?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_urgent?: boolean
          message_type?: string
          reply_to_message_id?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_entries: {
        Row: {
          created_at: string | null
          id: string
          intensity: number
          mood: string
          note: string | null
          patient_id: string
          recorded_by: string
          time_of_day: string | null
          timestamp: string | null
          triggers: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          intensity: number
          mood: string
          note?: string | null
          patient_id: string
          recorded_by: string
          time_of_day?: string | null
          timestamp?: string | null
          triggers?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          intensity?: number
          mood?: string
          note?: string | null
          patient_id?: string
          recorded_by?: string
          time_of_day?: string | null
          timestamp?: string | null
          triggers?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "mood_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "mood_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_amendment_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          director_notes?: string | null
          id?: string
          organization_id: string
          platform_owner_notes?: string | null
          request_type: string
          requested_by: string
          requested_details?: Json
          resulting_quote_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          director_notes?: string | null
          id?: string
          organization_id?: string
          platform_owner_notes?: string | null
          request_type?: string
          requested_by?: string
          requested_details?: Json
          resulting_quote_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_amendment_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_amendment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_amendment_requests_resulting_quote_id_fkey"
            columns: ["resulting_quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_amendment_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_licenses: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          annual_license_fee: number | null
          coupon_code_applied: string | null
          covered_patient_capacity: number | null
          created_at: string
          id: string
          legacy_package_type_at_issuance: string | null
          license_number: string | null
          license_tier_code: string | null
          licensed_seats: number | null
          max_billing_admin_seats: number | null
          max_caregiver_seats: number | null
          max_medical_professional_seats: number | null
          max_therapist_seats: number | null
          monthly_billing_anchor_date: string | null
          monthly_billing_timezone: string | null
          organization_id: string
          specialist_slot_count: number
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          annual_license_fee?: number | null
          coupon_code_applied?: string | null
          covered_patient_capacity?: number | null
          created_at?: string
          id?: string
          legacy_package_type_at_issuance?: string | null
          license_number?: string | null
          license_tier_code?: string | null
          licensed_seats?: number | null
          max_billing_admin_seats?: number | null
          max_caregiver_seats?: number | null
          max_medical_professional_seats?: number | null
          max_therapist_seats?: number | null
          monthly_billing_anchor_date?: string | null
          monthly_billing_timezone?: string | null
          organization_id: string
          specialist_slot_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          annual_license_fee?: number | null
          coupon_code_applied?: string | null
          covered_patient_capacity?: number | null
          created_at?: string
          id?: string
          legacy_package_type_at_issuance?: string | null
          license_number?: string | null
          license_tier_code?: string | null
          licensed_seats?: number | null
          max_billing_admin_seats?: number | null
          max_caregiver_seats?: number | null
          max_medical_professional_seats?: number | null
          max_therapist_seats?: number | null
          monthly_billing_anchor_date?: string | null
          monthly_billing_timezone?: string | null
          organization_id?: string
          specialist_slot_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_licenses_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_licenses_coupon_code_applied_fkey"
            columns: ["coupon_code_applied"]
            isOneToOne: false
            referencedRelation: "promo_coupon_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_licenses_license_tier_code_fkey"
            columns: ["license_tier_code"]
            isOneToOne: false
            referencedRelation: "license_tier_catalog"
            referencedColumns: ["tier_code"]
          },
          {
            foreignKeyName: "organization_licenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          org_role: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_role: string
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_role?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_owner_capability_grants: {
        Row: {
          capability: string
          created_at: string
          granted_by: string
          id: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          granted_by: string
          id?: string
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          granted_by?: string
          id?: string
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_owner_capability_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_owner_capability_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_owner_capability_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_owner_capability_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_ownership_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          new_director_id: string | null
          new_owner_id: string | null
          organization_id: string
          previous_director_id: string | null
          previous_owner_id: string | null
          reason: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_director_id?: string | null
          new_owner_id?: string | null
          organization_id: string
          previous_director_id?: string | null
          previous_owner_id?: string | null
          reason?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_director_id?: string | null
          new_owner_id?: string | null
          organization_id?: string
          previous_director_id?: string | null
          previous_owner_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_ownership_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_ownership_events_new_director_id_fkey"
            columns: ["new_director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_ownership_events_new_owner_id_fkey"
            columns: ["new_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_ownership_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_ownership_events_previous_director_id_fkey"
            columns: ["previous_director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_ownership_events_previous_owner_id_fkey"
            columns: ["previous_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_owner_user_id: string | null
          owner_user_id: string
          package_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_owner_user_id?: string | null
          owner_user_id: string
          package_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_owner_user_id?: string | null
          owner_user_id?: string
          package_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_organization_owner_user_id_fkey"
            columns: ["organization_owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          allergen: string
          author_id: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          reaction: string | null
          severity: string | null
          source: string
        }
        Insert: {
          allergen: string
          author_id: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          reaction?: string | null
          severity?: string | null
          source?: string
        }
        Update: {
          allergen?: string
          author_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          severity?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_calendar_notes: {
        Row: {
          created_at: string | null
          date: string
          id: string
          patient_id: string
          text: string
          type: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          patient_id: string
          text: string
          type?: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          patient_id?: string
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_calendar_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_partners: {
        Row: {
          education_level: string | null
          email: string | null
          employment_relevant: string | null
          full_name: string | null
          medical_experience: string | null
          notes: string | null
          patient_id: string
          phone: string | null
          relationship: string | null
          updated_at: string | null
        }
        Insert: {
          education_level?: string | null
          email?: string | null
          employment_relevant?: string | null
          full_name?: string | null
          medical_experience?: string | null
          notes?: string | null
          patient_id: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Update: {
          education_level?: string | null
          email?: string | null
          employment_relevant?: string | null
          full_name?: string | null
          medical_experience?: string | null
          notes?: string | null
          patient_id?: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_partners_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_plans: {
        Row: {
          author_id: string
          created_at: string
          effective_date: string
          goals: string
          id: string
          is_current: boolean
          patient_id: string
          permitted_tasks: string | null
          version: number
        }
        Insert: {
          author_id: string
          created_at?: string
          effective_date?: string
          goals: string
          id?: string
          is_current?: boolean
          patient_id: string
          permitted_tasks?: string | null
          version?: number
        }
        Update: {
          author_id?: string
          created_at?: string
          effective_date?: string
          goals?: string
          id?: string
          is_current?: boolean
          patient_id?: string
          permitted_tasks?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_plans_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_care_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_preferences: {
        Row: {
          author_id: string
          category: string
          created_at: string
          description: string
          id: string
          patient_id: string
          reported_by: string | null
        }
        Insert: {
          author_id: string
          category: string
          created_at?: string
          description: string
          id?: string
          patient_id: string
          reported_by?: string | null
        }
        Update: {
          author_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          patient_id?: string
          reported_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_preferences_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_care_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_providers: {
        Row: {
          author_id: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          patient_id: string
          phone: string | null
          provider_name: string
          provider_role: string
          source: string
        }
        Insert: {
          author_id: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          phone?: string | null
          provider_name: string
          provider_role: string
          source?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          phone?: string | null
          provider_name?: string
          provider_role?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_providers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_providers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_care_providers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_diagnoses: {
        Row: {
          author_id: string
          condition_name: string
          created_at: string
          diagnosed_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          patient_id: string
          source: string
          updated_at: string
        }
        Insert: {
          author_id: string
          condition_name: string
          created_at?: string
          diagnosed_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          condition_name?: string
          created_at?: string
          diagnosed_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_diagnoses_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_diagnoses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_document_uploads: {
        Row: {
          file_name: string
          file_type: string
          id: string
          note_text: string | null
          patient_id: string
          section: string
          storage_path: string
          uploaded_at: string | null
        }
        Insert: {
          file_name: string
          file_type: string
          id?: string
          note_text?: string | null
          patient_id: string
          section: string
          storage_path: string
          uploaded_at?: string | null
        }
        Update: {
          file_name?: string
          file_type?: string
          id?: string
          note_text?: string | null
          patient_id?: string
          section?: string
          storage_path?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_document_uploads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_document_uploads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_emergency_contacts: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          notes: string | null
          patient_id: string
          phone: string | null
          relationship: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_emergency_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_home_photos: {
        Row: {
          created_at: string
          id: string
          label: string
          patient_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          patient_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          patient_id?: string
          storage_path?: string
        }
        Relationships: []
      }
      patient_intake: {
        Row: {
          caregiver_name: string | null
          caregiver_phone: string | null
          caregiver_profile_id: string | null
          caregiver_relationship: string | null
          created_at: string
          created_by: string | null
          doctor_therapist_name: string | null
          doctor_therapist_phone: string | null
          emergency_contact_email: string | null
          emergency_contact_full_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          intake_completed: boolean
          medications_and_dosage: string | null
          patient_city: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string | null
          patient_first_name: string
          patient_last_name: string
          patient_phone: string | null
          patient_preferred_name: string | null
          patient_profile_id: string | null
          patient_state: string | null
          patient_street_address: string | null
          patient_zip_code: string | null
          preferred_hospital: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          caregiver_name?: string | null
          caregiver_phone?: string | null
          caregiver_profile_id?: string | null
          caregiver_relationship?: string | null
          created_at?: string
          created_by?: string | null
          doctor_therapist_name?: string | null
          doctor_therapist_phone?: string | null
          emergency_contact_email?: string | null
          emergency_contact_full_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id: string
          intake_completed?: boolean
          medications_and_dosage?: string | null
          patient_city?: string | null
          patient_date_of_birth?: string | null
          patient_dementia_stage?: string | null
          patient_diagnosis_date?: string | null
          patient_email?: string | null
          patient_first_name: string
          patient_last_name: string
          patient_phone?: string | null
          patient_preferred_name?: string | null
          patient_profile_id?: string | null
          patient_state?: string | null
          patient_street_address?: string | null
          patient_zip_code?: string | null
          preferred_hospital?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          caregiver_name?: string | null
          caregiver_phone?: string | null
          caregiver_profile_id?: string | null
          caregiver_relationship?: string | null
          created_at?: string
          created_by?: string | null
          doctor_therapist_name?: string | null
          doctor_therapist_phone?: string | null
          emergency_contact_email?: string | null
          emergency_contact_full_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          intake_completed?: boolean
          medications_and_dosage?: string | null
          patient_city?: string | null
          patient_date_of_birth?: string | null
          patient_dementia_stage?: string | null
          patient_diagnosis_date?: string | null
          patient_email?: string | null
          patient_first_name?: string
          patient_last_name?: string
          patient_phone?: string | null
          patient_preferred_name?: string | null
          patient_profile_id?: string | null
          patient_state?: string | null
          patient_street_address?: string | null
          patient_zip_code?: string | null
          preferred_hospital?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_intake_caregiver_profile_id_fkey"
            columns: ["caregiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_intake_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_intake_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_intake_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_legal_holds: {
        Row: {
          id: string
          patient_id: string
          placed_at: string
          placed_by: string
          reason: string
          released_at: string | null
          released_by: string | null
          status: string
        }
        Insert: {
          id?: string
          patient_id: string
          placed_at?: string
          placed_by: string
          reason: string
          released_at?: string | null
          released_by?: string | null
          status?: string
        }
        Update: {
          id?: string
          patient_id?: string
          placed_at?: string
          placed_by?: string
          reason?: string
          released_at?: string | null
          released_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_legal_holds_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_legal_holds_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_legal_holds_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_legal_holds_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_loved_one_photos: {
        Row: {
          created_at: string
          id: string
          name: string
          patient_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          patient_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          patient_id?: string
          storage_path?: string
        }
        Relationships: []
      }
      patient_notes: {
        Row: {
          author_id: string | null
          caregiver_id: string | null
          created_at: string | null
          id: string
          note: string
          note_type: string | null
          patient_id: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          caregiver_id?: string | null
          created_at?: string | null
          id?: string
          note: string
          note_type?: string | null
          patient_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          caregiver_id?: string | null
          created_at?: string | null
          id?: string
          note?: string
          note_type?: string | null
          patient_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_notes_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_representatives: {
        Row: {
          authorization_basis: string
          authorization_evidence_reference: string | null
          consent_acknowledged: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          initiated_by: string
          legal_first_name: string
          legal_last_name: string
          legal_middle_name: string | null
          organization_id: string
          patient_id: string
          relationship_to_patient: string
          replaced_by_representative_id: string | null
          representative_user_id: string
          residential_address: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          authorization_basis: string
          authorization_evidence_reference?: string | null
          consent_acknowledged?: boolean
          contact_email: string
          contact_phone: string
          created_at?: string
          id?: string
          initiated_by: string
          legal_first_name: string
          legal_last_name: string
          legal_middle_name?: string | null
          organization_id: string
          patient_id: string
          relationship_to_patient: string
          replaced_by_representative_id?: string | null
          representative_user_id: string
          residential_address: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          authorization_basis?: string
          authorization_evidence_reference?: string | null
          consent_acknowledged?: boolean
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id?: string
          initiated_by?: string
          legal_first_name?: string
          legal_last_name?: string
          legal_middle_name?: string | null
          organization_id?: string
          patient_id?: string
          relationship_to_patient?: string
          replaced_by_representative_id?: string | null
          representative_user_id?: string
          residential_address?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_representatives_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_representatives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_representatives_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_representatives_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_representatives_replaced_by_representative_id_fkey"
            columns: ["replaced_by_representative_id"]
            isOneToOne: false
            referencedRelation: "patient_representatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_representatives_representative_user_id_fkey"
            columns: ["representative_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_representatives_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_representatives_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_routine_items: {
        Row: {
          completed: boolean
          completed_date: string | null
          created_at: string
          emoji: string
          id: string
          patient_id: string
          scheduled_time: string
          time_of_day: string
          title: string
        }
        Insert: {
          completed?: boolean
          completed_date?: string | null
          created_at?: string
          emoji?: string
          id?: string
          patient_id: string
          scheduled_time?: string
          time_of_day: string
          title: string
        }
        Update: {
          completed?: boolean
          completed_date?: string | null
          created_at?: string
          emoji?: string
          id?: string
          patient_id?: string
          scheduled_time?: string
          time_of_day?: string
          title?: string
        }
        Relationships: []
      }
      patient_task_items: {
        Row: {
          completed: boolean
          completed_date: string | null
          created_at: string | null
          id: string
          patient_id: string
          period: string
          text: string
          week_key: string | null
        }
        Insert: {
          completed?: boolean
          completed_date?: string | null
          created_at?: string | null
          id?: string
          patient_id: string
          period?: string
          text: string
          week_key?: string | null
        }
        Update: {
          completed?: boolean
          completed_date?: string | null
          created_at?: string | null
          id?: string
          patient_id?: string
          period?: string
          text?: string
          week_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_task_items_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_therapy_goals: {
        Row: {
          author_id: string
          created_at: string
          id: string
          objective: string
          patient_id: string
          progress_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          objective: string
          patient_id: string
          progress_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          objective?: string
          patient_id?: string
          progress_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_therapy_goals_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_therapy_goals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_therapy_goals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_vitals: {
        Row: {
          author_id: string
          blood_pressure: string | null
          created_at: string
          id: string
          measured_at: string
          notes: string | null
          oxygen_saturation: number | null
          pain_level: number | null
          patient_id: string
          pulse_bpm: number | null
          source: string
          temperature_f: number | null
          weight_lbs: number | null
        }
        Insert: {
          author_id: string
          blood_pressure?: string | null
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          oxygen_saturation?: number | null
          pain_level?: number | null
          patient_id: string
          pulse_bpm?: number | null
          source?: string
          temperature_f?: number | null
          weight_lbs?: number | null
        }
        Update: {
          author_id?: string
          blood_pressure?: string | null
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          oxygen_saturation?: number | null
          pain_level?: number | null
          patient_id?: string
          pulse_bpm?: number | null
          source?: string
          temperature_f?: number | null
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_vitals_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          affirmation: string | null
          code_status: string
          code_status_source: string
          code_status_updated_by: string | null
          communication_needs: string | null
          communication_needs_source: string | null
          communication_needs_updated_by: string | null
          created_at: string | null
          date_of_birth: string | null
          dementia_stage: string | null
          diagnosis_date: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          id: string
          last_name: string
          location: string | null
          photo_url: string | null
          preferences_audio_enabled: boolean | null
          preferences_first_session_done: boolean
          preferences_font_size: string | null
          preferences_high_contrast: boolean | null
          preferences_language: string | null
          preferences_notifications_enabled: boolean | null
          preferences_tone: string | null
          preferred_hospital: string | null
          preferred_name: string | null
          safety_response_instructions: string | null
          updated_at: string | null
          voice_label: string | null
          voice_storage_path: string | null
        }
        Insert: {
          address?: string | null
          affirmation?: string | null
          code_status?: string
          code_status_source?: string
          code_status_updated_by?: string | null
          communication_needs?: string | null
          communication_needs_source?: string | null
          communication_needs_updated_by?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          dementia_stage?: string | null
          diagnosis_date?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name: string
          id?: string
          last_name: string
          location?: string | null
          photo_url?: string | null
          preferences_audio_enabled?: boolean | null
          preferences_first_session_done?: boolean
          preferences_font_size?: string | null
          preferences_high_contrast?: boolean | null
          preferences_language?: string | null
          preferences_notifications_enabled?: boolean | null
          preferences_tone?: string | null
          preferred_hospital?: string | null
          preferred_name?: string | null
          safety_response_instructions?: string | null
          updated_at?: string | null
          voice_label?: string | null
          voice_storage_path?: string | null
        }
        Update: {
          address?: string | null
          affirmation?: string | null
          code_status?: string
          code_status_source?: string
          code_status_updated_by?: string | null
          communication_needs?: string | null
          communication_needs_source?: string | null
          communication_needs_updated_by?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          dementia_stage?: string | null
          diagnosis_date?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string
          id?: string
          last_name?: string
          location?: string | null
          photo_url?: string | null
          preferences_audio_enabled?: boolean | null
          preferences_first_session_done?: boolean
          preferences_font_size?: string | null
          preferences_high_contrast?: boolean | null
          preferences_language?: string | null
          preferences_notifications_enabled?: boolean | null
          preferences_tone?: string | null
          preferred_hospital?: string | null
          preferred_name?: string | null
          safety_response_instructions?: string | null
          updated_at?: string | null
          voice_label?: string | null
          voice_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_code_status_updated_by_fkey"
            columns: ["code_status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_communication_needs_updated_by_fkey"
            columns: ["communication_needs_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_caregiver_registrations: {
        Row: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        Insert: {
          caregiver_id: string
          claim_token?: string
          consumed_at?: string | null
          created_at?: string
          deletion_destructive_authorized_at?: string | null
          deletion_locked_at?: string | null
          deletion_operation_id?: string | null
          deletion_outcome?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          patient_address?: string | null
          patient_date_of_birth?: string | null
          patient_dementia_stage?: string | null
          patient_diagnosis_date?: string | null
          patient_email: string
          patient_first_name: string
          patient_id?: string | null
          patient_last_name: string
          patient_location?: string | null
          patient_preferred_name?: string | null
          provisioned_auth_user_id?: string | null
          relationship_type?: string
        }
        Update: {
          caregiver_id?: string
          claim_token?: string
          consumed_at?: string | null
          created_at?: string
          deletion_destructive_authorized_at?: string | null
          deletion_locked_at?: string | null
          deletion_operation_id?: string | null
          deletion_outcome?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          patient_address?: string | null
          patient_date_of_birth?: string | null
          patient_dementia_stage?: string | null
          patient_diagnosis_date?: string | null
          patient_email?: string
          patient_first_name?: string
          patient_id?: string | null
          patient_last_name?: string
          patient_location?: string | null
          patient_preferred_name?: string | null
          provisioned_auth_user_id?: string | null
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_caregiver_registrations_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_caregiver_registrations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "pending_caregiver_registrations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_therapist_connections: {
        Row: {
          caregiver_id: string
          created_at: string
          id: string
          patient_id: string
          relationship_type: string
          responded_at: string | null
          status: string
          therapist_id: string
        }
        Insert: {
          caregiver_id: string
          created_at?: string
          id?: string
          patient_id: string
          relationship_type?: string
          responded_at?: string | null
          status?: string
          therapist_id: string
        }
        Update: {
          caregiver_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          relationship_type?: string
          responded_at?: string | null
          status?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_therapist_connections_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_therapist_connections_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "pending_therapist_connections_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_therapist_connections_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_application_documents: {
        Row: {
          application_id: string
          document_type: string
          file_name: string
          id: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          application_id: string
          document_type: string
          file_name: string
          id?: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          document_type?: string
          file_name?: string
          id?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_application_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          application_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          notes: string | null
          to_status: string | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          application_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          notes?: string | null
          to_status?: string | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          application_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_application_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "professional_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_applications: {
        Row: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        Insert: {
          annual_license_fee_snapshot_cents?: number | null
          applicant_user_id: string
          application_details?: Json
          application_reference: string
          approved_office?: string | null
          auto_verification_result?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          correction_request?: string | null
          correction_requested_at?: string | null
          correction_requested_by?: string | null
          correction_requested_fields?: Json | null
          created_at?: string
          credential_verification_evidence?: string | null
          credential_verification_status?: string
          credential_verified_at?: string | null
          credential_verified_by?: string | null
          entry_method?: string | null
          exception_review_reason?: string | null
          id?: string
          initial_expected_active_patients?: number | null
          legal_name?: string | null
          platform_owner_approval_required?: boolean
          platform_owner_approved_at?: string | null
          platform_owner_approved_by?: string | null
          preferred_name?: string | null
          profession_category?: string | null
          professional_title?: string | null
          proposed_organization_name?: string | null
          proposed_package_type?: string | null
          rejection_reason?: string | null
          requested_office: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_tier_code?: string | null
          status?: string
          target_organization_id?: string | null
          updated_at?: string
        }
        Update: {
          annual_license_fee_snapshot_cents?: number | null
          applicant_user_id?: string
          application_details?: Json
          application_reference?: string
          approved_office?: string | null
          auto_verification_result?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          correction_request?: string | null
          correction_requested_at?: string | null
          correction_requested_by?: string | null
          correction_requested_fields?: Json | null
          created_at?: string
          credential_verification_evidence?: string | null
          credential_verification_status?: string
          credential_verified_at?: string | null
          credential_verified_by?: string | null
          entry_method?: string | null
          exception_review_reason?: string | null
          id?: string
          initial_expected_active_patients?: number | null
          legal_name?: string | null
          platform_owner_approval_required?: boolean
          platform_owner_approved_at?: string | null
          platform_owner_approved_by?: string | null
          preferred_name?: string | null
          profession_category?: string | null
          professional_title?: string | null
          proposed_organization_name?: string | null
          proposed_package_type?: string | null
          rejection_reason?: string | null
          requested_office?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_tier_code?: string | null
          status?: string
          target_organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_applications_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_correction_requested_by_fkey"
            columns: ["correction_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_credential_verified_by_fkey"
            columns: ["credential_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_platform_owner_approved_by_fkey"
            columns: ["platform_owner_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_applications_selected_tier_code_fkey"
            columns: ["selected_tier_code"]
            isOneToOne: false
            referencedRelation: "license_tier_catalog"
            referencedColumns: ["tier_code"]
          },
          {
            foreignKeyName: "professional_applications_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          max_patient_capacity: number | null
          mfa_enabled: boolean
          must_change_password: boolean
          phone: string | null
          phone_normalized: string | null
          photo_url: string | null
          provisioning_status: string
          role: string
          sms_consent: boolean | null
          subscription_status: string | null
          subscription_tier: string | null
          temp_user_expires_at: string | null
          terms_accepted_at: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          max_patient_capacity?: number | null
          mfa_enabled?: boolean
          must_change_password?: boolean
          phone?: string | null
          phone_normalized?: string | null
          photo_url?: string | null
          provisioning_status?: string
          role?: string
          sms_consent?: boolean | null
          subscription_status?: string | null
          subscription_tier?: string | null
          temp_user_expires_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          max_patient_capacity?: number | null
          mfa_enabled?: boolean
          must_change_password?: boolean
          phone?: string | null
          phone_normalized?: string | null
          photo_url?: string | null
          provisioning_status?: string
          role?: string
          sms_consent?: boolean | null
          subscription_status?: string | null
          subscription_tier?: string | null
          temp_user_expires_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          days: number
          description: string | null
          expires_at: string | null
          max_uses: number | null
          plan: string | null
          tier: string
        }
        Insert: {
          code: string
          created_at?: string | null
          days: number
          description?: string | null
          expires_at?: string | null
          max_uses?: number | null
          plan?: string | null
          tier: string
        }
        Update: {
          code?: string
          created_at?: string | null
          days?: number
          description?: string | null
          expires_at?: string | null
          max_uses?: number | null
          plan?: string | null
          tier?: string
        }
        Relationships: []
      }
      promo_coupon_catalog: {
        Row: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          discount_kind: string
          expires_at: string | null
          max_redemptions_total: number | null
          notes: string | null
          redemptions_used: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applies_to?: string
          code: string
          created_at?: string
          created_by?: string | null
          discount_kind: string
          expires_at?: string | null
          max_redemptions_total?: number | null
          notes?: string | null
          redemptions_used?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string
          created_by?: string | null
          discount_kind?: string
          expires_at?: string | null
          max_redemptions_total?: number | null
          notes?: string | null
          redemptions_used?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_coupon_catalog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_catalog_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          promo_code: string
          redeemed_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          promo_code: string
          redeemed_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          promo_code?: string
          redeemed_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string | null
          created_by: string | null
          days_of_week: number[] | null
          id: string
          is_active: boolean | null
          message: string | null
          patient_id: string
          sound: string | null
          time: string | null
          title: string | null
          type: string | null
          vibrate: boolean | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          days_of_week?: number[] | null
          id?: string
          is_active?: boolean | null
          message?: string | null
          patient_id: string
          sound?: string | null
          time?: string | null
          title?: string | null
          type?: string | null
          vibrate?: boolean | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          days_of_week?: number[] | null
          id?: string
          is_active?: boolean | null
          message?: string | null
          patient_id?: string
          sound?: string | null
          time?: string | null
          title?: string | null
          type?: string | null
          vibrate?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_prospects: {
        Row: {
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          prospective_organization_name: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          prospective_organization_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          prospective_organization_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_prospects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          quote_id: string
          recipient_email: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          quote_id: string
          recipient_email: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          quote_id?: string
          recipient_email?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_invitations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          annual_license_fee: number | null
          billing_cadence: string | null
          created_at: string
          created_by: string
          discount_notes: string | null
          id: string
          package_type: string
          proposed_covered_patient_capacity: number | null
          proposed_licensed_seats: number
          prospect_id: string
          quote_term_months: number | null
          status: string
          supersedes_quote_id: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          annual_license_fee?: number | null
          billing_cadence?: string | null
          created_at?: string
          created_by: string
          discount_notes?: string | null
          id?: string
          package_type: string
          proposed_covered_patient_capacity?: number | null
          proposed_licensed_seats: number
          prospect_id: string
          quote_term_months?: number | null
          status?: string
          supersedes_quote_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          annual_license_fee?: number | null
          billing_cadence?: string | null
          created_at?: string
          created_by?: string
          discount_notes?: string | null
          id?: string
          package_type?: string
          proposed_covered_patient_capacity?: number | null
          proposed_licensed_seats?: number
          prospect_id?: string
          quote_term_months?: number | null
          status?: string
          supersedes_quote_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "sales_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_supersedes_quote_id_fkey"
            columns: ["supersedes_quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_concerns: {
        Row: {
          created_at: string
          description: string
          id: string
          organization_id: string
          patient_id: string
          reported_by: string
          status: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          organization_id: string
          patient_id: string
          reported_by: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          patient_id?: string
          reported_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_concerns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_concerns_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "scope_concerns_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_concerns_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_handoff_acknowledgments: {
        Row: {
          acknowledged_at: string
          acknowledged_by: string
          handoff_id: string
          id: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by: string
          handoff_id: string
          id?: string
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by?: string
          handoff_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_handoff_acknowledgments_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handoff_acknowledgments_handoff_id_fkey"
            columns: ["handoff_id"]
            isOneToOne: false
            referencedRelation: "shift_handoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_handoffs: {
        Row: {
          author_id: string
          concerns: string | null
          created_at: string
          id: string
          organization_id: string
          patient_id: string
          pending_tasks: string | null
          summary: string
        }
        Insert: {
          author_id: string
          concerns?: string | null
          created_at?: string
          id?: string
          organization_id: string
          patient_id: string
          pending_tasks?: string | null
          summary: string
        }
        Update: {
          author_id?: string
          concerns?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          patient_id?: string
          pending_tasks?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_handoffs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handoffs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handoffs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "shift_handoffs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_patient_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          display_label: string | null
          id: string
          is_active: boolean
          org_role: string
          organization_id: string
          patient_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          display_label?: string | null
          id?: string
          is_active?: boolean
          org_role: string
          organization_id: string
          patient_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          display_label?: string | null
          id?: string
          is_active?: boolean
          org_role?: string
          organization_id?: string
          patient_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_patient_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_patient_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_patient_assignments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "staff_patient_assignments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_patient_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string | null
          program: string | null
          promo_code: string | null
          promo_expires_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string | null
          program?: string | null
          promo_code?: string | null
          promo_expires_at?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: string
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string | null
          program?: string | null
          promo_code?: string | null
          promo_expires_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          days_of_week: number[] | null
          description: string | null
          difficulty: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_recurring: boolean | null
          patient_id: string
          refusal_reason: string | null
          scheduled_time: string | null
          status: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          time_of_day: string | null
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          days_of_week?: number[] | null
          description?: string | null
          difficulty?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          patient_id: string
          refusal_reason?: string | null
          scheduled_time?: string | null
          status?: string | null
          status_updated_at?: string | null
          status_updated_by?: string | null
          time_of_day?: string | null
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          days_of_week?: number[] | null
          description?: string | null
          difficulty?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          patient_id?: string
          refusal_reason?: string | null
          scheduled_time?: string | null
          status?: string | null
          status_updated_at?: string | null
          status_updated_by?: string | null
          time_of_day?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_relationships: {
        Row: {
          caregiver_id: string | null
          created_at: string | null
          id: string
          is_active: boolean
          patient_id: string | null
          relationship_type: string
          therapist_id: string
          updated_at: string | null
        }
        Insert: {
          caregiver_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          patient_id?: string | null
          relationship_type?: string
          therapist_id: string
          updated_at?: string | null
        }
        Update: {
          caregiver_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          patient_id?: string | null
          relationship_type?: string
          therapist_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "therapist_relationships_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_relationships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "caregiver_patient_list"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "therapist_relationships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_relationships_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_history: {
        Row: {
          email_normalized: string
          id: string
          issued_at: string
          user_id: string | null
        }
        Insert: {
          email_normalized: string
          id?: string
          issued_at?: string
          user_id?: string | null
        }
        Update: {
          email_normalized?: string
          id?: string
          issued_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      trial_registrations: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      caregiver_patient_list: {
        Row: {
          caregiver_id: string | null
          dementia_stage: string | null
          first_name: string | null
          is_primary: boolean | null
          last_name: string | null
          location: string | null
          patient_id: string | null
          photo_url: string | null
          preferred_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_patients_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acknowledge_help_activation: {
        Args: { p_help_activation_id: string }
        Returns: {
          caregiver_count_at_time: number
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          notification_status: string
          patient_id: string
          phone_dialed: string | null
        }
        SetofOptions: {
          from: "*"
          to: "help_activations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acknowledge_message: {
        Args: {
          p_follow_up_assigned_to?: string
          p_follow_up_due_date?: string
          p_follow_up_note: string
          p_follow_up_requested: boolean
          p_message_id: string
        }
        Returns: {
          acknowledged_at: string | null
          follow_up_assigned_to: string | null
          follow_up_due_date: string | null
          follow_up_note: string | null
          follow_up_requested: boolean
          follow_up_resolved: boolean
          id: string
          message_id: string
          read_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "message_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acknowledge_shift_handoff: {
        Args: { p_handoff_id: string }
        Returns: {
          acknowledged_at: string
          acknowledged_by: string
          handoff_id: string
          id: string
        }
        SetofOptions: {
          from: "*"
          to: "shift_handoff_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_enterprise_license_from_quote: {
        Args: { p_quote_id: string }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          annual_license_fee: number | null
          coupon_code_applied: string | null
          covered_patient_capacity: number | null
          created_at: string
          id: string
          legacy_package_type_at_issuance: string | null
          license_number: string | null
          license_tier_code: string | null
          licensed_seats: number | null
          max_billing_admin_seats: number | null
          max_caregiver_seats: number | null
          max_medical_professional_seats: number | null
          max_therapist_seats: number | null
          monthly_billing_anchor_date: string | null
          monthly_billing_timezone: string | null
          organization_id: string
          specialist_slot_count: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: {
          added_at: string
          added_by: string
          conversation_id: string
          id: string
          participant_role: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reconcile_stuck_registration_deletion: {
        Args: { p_confirmed_deleted: boolean; p_registration_id: string }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_organization_license_status: {
        Args: { p_justification: string; p_org_id: string; p_status: string }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          annual_license_fee: number | null
          coupon_code_applied: string | null
          covered_patient_capacity: number | null
          created_at: string
          id: string
          legacy_package_type_at_issuance: string | null
          license_number: string | null
          license_tier_code: string | null
          licensed_seats: number | null
          max_billing_admin_seats: number | null
          max_caregiver_seats: number | null
          max_medical_professional_seats: number | null
          max_therapist_seats: number | null
          monthly_billing_anchor_date: string | null
          monthly_billing_timezone: string | null
          organization_id: string
          specialist_slot_count: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_subscription: {
        Args: {
          p_plan: string
          p_program: string
          p_promo_expires_at: string
          p_status: string
          p_tier: string
          p_trial_ends_at: string
          p_trial_started_at: string
          p_user_id: string
        }
        Returns: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string | null
          program: string | null
          promo_code: string | null
          promo_expires_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      am_i_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      apply_organization_amendment_from_quote: {
        Args: { p_quote_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archival_interval: { Args: never; Returns: string }
      archive_eligible_closed_patients: {
        Args: never
        Returns: {
          archived: boolean
          detail: string
          out_organization_id: string
          out_patient_id: string
        }[]
      }
      assign_staff_to_patient: {
        Args: {
          p_org_id: string
          p_org_role: string
          p_patient_id: string
          p_user_id: string
        }
        Returns: {
          assigned_by: string | null
          created_at: string
          display_label: string | null
          id: string
          is_active: boolean
          org_role: string
          organization_id: string
          patient_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_patient_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      calculate_annual_license_charge: {
        Args: { p_coupon_code?: string; p_tier_code: string }
        Returns: {
          base_cents: number
          coupon_code: string
          coupon_rejected_reason: string
          discount_cents: number
          final_cents: number
        }[]
      }
      calculate_monthly_patient_fee_cents: {
        Args: { p_active_patients: number }
        Returns: number
      }
      caller_is_expired_companion: { Args: never; Returns: boolean }
      caller_is_temp_user_program: { Args: never; Returns: boolean }
      cancel_account_deletion_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_my_pending_registration: {
        Args: { p_registration_id: string }
        Returns: boolean
      }
      caregiver_authorize_destructive_deletion: {
        Args: { p_operation_id: string; p_registration_id: string }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caregiver_begin_registration_deletion: {
        Args: { p_registration_id: string }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caregiver_cancel_registration_deletion_lock: {
        Args: { p_operation_id: string; p_registration_id: string }
        Returns: boolean
      }
      caregiver_claim_new_patient: {
        Args: {
          p_claim_token: string
          p_patient_id: string
          p_registration_id: string
        }
        Returns: {
          address: string | null
          affirmation: string | null
          code_status: string
          code_status_source: string
          code_status_updated_by: string | null
          communication_needs: string | null
          communication_needs_source: string | null
          communication_needs_updated_by: string | null
          created_at: string | null
          date_of_birth: string | null
          dementia_stage: string | null
          diagnosis_date: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          id: string
          last_name: string
          location: string | null
          photo_url: string | null
          preferences_audio_enabled: boolean | null
          preferences_first_session_done: boolean
          preferences_font_size: string | null
          preferences_high_contrast: boolean | null
          preferences_language: string | null
          preferences_notifications_enabled: boolean | null
          preferences_tone: string | null
          preferred_hospital: string | null
          preferred_name: string | null
          safety_response_instructions: string | null
          updated_at: string | null
          voice_label: string | null
          voice_storage_path: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caregiver_finish_registration_deletion: {
        Args: { p_operation_id: string; p_registration_id: string }
        Returns: boolean
      }
      caregiver_initiate_patient_registration: {
        Args: {
          p_address?: string
          p_date_of_birth?: string
          p_dementia_stage?: string
          p_diagnosis_date?: string
          p_email: string
          p_emergency_contact_email?: string
          p_emergency_contact_name?: string
          p_emergency_contact_phone?: string
          p_emergency_contact_relationship?: string
          p_first_name: string
          p_last_name: string
          p_location?: string
          p_preferred_name?: string
          p_relationship_type?: string
        }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caregiver_invite_therapist: {
        Args: {
          p_patient_id: string
          p_relationship_type?: string
          p_therapist_email: string
        }
        Returns: {
          caregiver_id: string
          created_at: string
          id: string
          patient_id: string
          relationship_type: string
          responded_at: string | null
          status: string
          therapist_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_therapist_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caregiver_record_deletion_outcome: {
        Args: {
          p_operation_id: string
          p_outcome: string
          p_registration_id: string
        }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caregiver_update_pending_registration: {
        Args: {
          p_address?: string
          p_date_of_birth?: string
          p_dementia_stage?: string
          p_diagnosis_date?: string
          p_email: string
          p_emergency_contact_email?: string
          p_emergency_contact_name?: string
          p_emergency_contact_phone?: string
          p_emergency_contact_relationship?: string
          p_first_name: string
          p_last_name: string
          p_location?: string
          p_preferred_name?: string
          p_registration_id: string
          p_relationship_type?: string
        }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_patient_coverage: {
        Args: {
          p_notes: string
          p_org_id: string
          p_patient_id: string
          p_reason: string
        }
        Returns: {
          archived_at: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          closure_reason: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          organization_id: string
          patient_id: string
          scheduled_archival_at: string | null
          started_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "covered_patient_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_next_month_billing_anchor: {
        Args: { p_timezone?: string }
        Returns: {
          anchor_date: string
          anchor_instant: string
          anchor_unix: number
        }[]
      }
      cover_patient: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: {
          archived_at: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          closure_reason: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          organization_id: string
          patient_id: string
          scheduled_archival_at: string | null
          started_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "covered_patient_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cover_patient_via_staff_registration: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: {
          archived_at: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          closure_reason: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          organization_id: string
          patient_id: string
          scheduled_archival_at: string | null
          started_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "covered_patient_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_conversation: {
        Args: {
          p_patient_id: string
          p_recipient_user_ids: string[]
          p_subject: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          patient_id: string
          subject: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_enterprise_billing_account: {
        Args: { p_billing_contact_email: string; p_quote_id: string }
        Returns: {
          billing_component: string
          billing_contact_email: string
          billing_interval: string
          created_at: string
          created_by: string
          currency: string
          id: string
          quote_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          unit_amount_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_enterprise_monthly_billing_component: {
        Args: { p_billing_timezone?: string; p_quote_id: string }
        Returns: {
          billing_component: string
          billing_contact_email: string
          billing_interval: string
          created_at: string
          created_by: string
          currency: string
          id: string
          quote_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          unit_amount_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization: {
        Args: { p_name: string; p_package_type: string }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_patient_with_caregiver: {
        Args: {
          p_address?: string
          p_affirmation?: string
          p_date_of_birth?: string
          p_dementia_stage?: string
          p_diagnosis_date?: string
          p_emergency_contact_email?: string
          p_emergency_contact_name?: string
          p_emergency_contact_phone?: string
          p_emergency_contact_relationship?: string
          p_location?: string
          p_patient_id: string
          p_preferred_name?: string
          p_relationship_type?: string
        }
        Returns: {
          address: string | null
          affirmation: string | null
          code_status: string
          code_status_source: string
          code_status_updated_by: string | null
          communication_needs: string | null
          communication_needs_source: string | null
          communication_needs_updated_by: string | null
          created_at: string | null
          date_of_birth: string | null
          dementia_stage: string | null
          diagnosis_date: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          id: string
          last_name: string
          location: string | null
          photo_url: string | null
          preferences_audio_enabled: boolean | null
          preferences_first_session_done: boolean
          preferences_font_size: string | null
          preferences_high_contrast: boolean | null
          preferences_language: string | null
          preferences_notifications_enabled: boolean | null
          preferences_tone: string | null
          preferred_hospital: string | null
          preferred_name: string | null
          safety_response_instructions: string | null
          updated_at: string | null
          voice_label: string | null
          voice_storage_path: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_approve_application: {
        Args: { p_application_id: string }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_request_organization_amendment: {
        Args: {
          p_director_notes: string
          p_organization_id: string
          p_request_type: string
          p_requested_details: Json
        }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_withdraw_amendment_request: {
        Args: { p_request_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      discard_application_draft: {
        Args: { p_draft_id: string }
        Returns: boolean
      }
      end_caregiver_visit: {
        Args: { p_visit_id: string; p_visit_notes?: string }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          caregiver_id: string
          created_at: string
          evv_latitude: number | null
          evv_longitude: number | null
          evv_offline_exception: boolean
          evv_required: boolean
          id: string
          organization_id: string
          patient_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          updated_at: string
          visit_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "caregiver_visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_patient_coverage: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: boolean
      }
      enterprise_patient_deletion_eligibility: {
        Args: { p_request_id: string }
        Returns: {
          eligible_after: string
          eligible_for_execution: boolean
          legal_hold_reviewed: boolean
          owner_reviewed: boolean
          request_id: string
          retention_elapsed: boolean
          retention_years: number
        }[]
      }
      file_incident_report: {
        Args: {
          p_description: string
          p_incident_type: string
          p_occurred_at?: string
          p_org_id: string
          p_patient_id: string
          p_severity?: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          incident_type: string
          occurred_at: string
          organization_id: string
          patient_id: string
          reported_by: string
          resolution_notes: string | null
          resolution_status: string
          severity: string
          supervisor_notified_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "incident_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_organization_for_application: {
        Args: { p_name: string }
        Returns: {
          id: string
          name: string
          package_type: string
        }[]
      }
      get_my_account_deletion_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_application_draft: {
        Args: never
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_care_team: {
        Args: { p_org_id: string }
        Returns: {
          first_name: string
          is_director: boolean
          last_name: string
          member_user_id: string
          org_role: string
        }[]
      }
      get_my_conversations: {
        Args: { p_patient_id?: string }
        Returns: {
          conversation_id: string
          created_at: string
          created_by: string
          has_open_follow_up: boolean
          last_message_at: string
          last_message_body: string
          last_message_urgent: boolean
          patient_id: string
          patient_name: string
          subject: string
          unread_count: number
          updated_at: string
        }[]
      }
      get_my_credentials: {
        Args: never
        Returns: {
          created_at: string
          credential_name: string
          expires_at: string | null
          id: string
          issued_at: string | null
          organization_id: string | null
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "caregiver_credentials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_enterprise_billing_status: {
        Args: { p_quote_id: string }
        Returns: {
          billing_component: string
          billing_contact_email: string
          billing_interval: string
          created_at: string
          created_by: string
          currency: string
          id: string
          quote_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          unit_amount_cents: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "enterprise_billing_accounts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_enterprise_care_team: {
        Args: { p_patient_id?: string }
        Returns: {
          email: string
          first_name: string
          last_name: string
          org_role: string
          phone: string
          user_id: string
        }[]
      }
      get_my_enterprise_organization: {
        Args: { p_patient_id?: string }
        Returns: {
          organization_id: string
          organization_name: string
          package_type: string
        }[]
      }
      get_my_org_supervisor: {
        Args: { p_org_id: string }
        Returns: {
          first_name: string
          last_name: string
          member_user_id: string
        }[]
      }
      get_my_organizations: {
        Args: never
        Returns: {
          org_role: string
          organization_id: string
          organization_name: string
          package_type: string
        }[]
      }
      get_my_patient_office_subject: { Args: never; Returns: string }
      get_my_pending_org_invites: {
        Args: never
        Returns: {
          created_at: string
          membership_id: string
          org_role: string
          organization_id: string
          organization_name: string
        }[]
      }
      get_my_pending_registration_detail: {
        Args: { p_registration_id: string }
        Returns: {
          caregiver_id: string
          claim_token: string
          consumed_at: string | null
          created_at: string
          deletion_destructive_authorized_at: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_outcome: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          patient_address: string | null
          patient_date_of_birth: string | null
          patient_dementia_stage: string | null
          patient_diagnosis_date: string | null
          patient_email: string
          patient_first_name: string
          patient_id: string | null
          patient_last_name: string
          patient_location: string | null
          patient_preferred_name: string | null
          provisioned_auth_user_id: string | null
          relationship_type: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_caregiver_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_pending_registrations: {
        Args: never
        Returns: {
          claim_token: string
          created_at: string
          patient_email: string
          patient_first_name: string
          patient_last_name: string
          registration_id: string
          resumable_patient_id: string
        }[]
      }
      get_my_pending_therapist_invites: {
        Args: never
        Returns: {
          caregiver_first_name: string
          caregiver_last_name: string
          connection_id: string
          created_at: string
          patient_first_name: string
          patient_id: string
          patient_last_name: string
          patient_preferred_name: string
          relationship_type: string
        }[]
      }
      get_my_quoted_amendment_for_org: {
        Args: { p_organization_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_staff_patients: {
        Args: never
        Returns: {
          address: string
          assignment_id: string
          display_label: string
          first_name: string
          last_name: string
          location: string
          org_role: string
          organization_id: string
          organization_name: string
          patient_id: string
          preferred_name: string
        }[]
      }
      get_my_therapist_patients: {
        Args: never
        Returns: {
          first_name: string
          last_name: string
          patient_id: string
          preferred_name: string
          relationship_type: string
        }[]
      }
      get_my_visits: {
        Args: { p_patient_id?: string }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          caregiver_id: string
          created_at: string
          evv_latitude: number | null
          evv_longitude: number | null
          evv_offline_exception: boolean
          evv_required: boolean
          id: string
          organization_id: string
          patient_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          updated_at: string
          visit_notes: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "caregiver_visits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_org_communications_overview: {
        Args: { p_org_id: string }
        Returns: {
          active_conversations: number
          patients_with_conversations: number
          unresolved_follow_ups: number
        }[]
      }
      get_org_staff_credentials: {
        Args: { p_org_id: string }
        Returns: {
          credential_name: string
          expires_at: string
          first_name: string
          id: string
          issued_at: string
          last_name: string
          status: string
          user_id: string
        }[]
      }
      get_org_staff_patient_assignments: {
        Args: { p_org_id: string }
        Returns: {
          first_name: string
          is_active: boolean
          last_name: string
          org_role: string
          patient_first_name: string
          patient_id: string
          patient_last_name: string
          patient_preferred_name: string
          user_id: string
        }[]
      }
      get_organization_owner: {
        Args: { p_organization_id: string }
        Returns: string
      }
      get_patient_care_circle: {
        Args: { p_patient_id: string }
        Returns: {
          first_name: string
          last_name: string
          participant_role: string
          user_id: string
        }[]
      }
      get_patient_care_team_connections: {
        Args: { p_patient_id: string }
        Returns: {
          connection_id: string
          created_at: string
          first_name: string
          last_name: string
          relationship_type: string
          source: string
          status: string
          therapist_id: string
        }[]
      }
      get_patient_help_activation_history: {
        Args: { p_patient_id: string }
        Returns: {
          acknowledged_by: string[]
          acknowledged_count: number
          caregiver_count_at_time: number
          conversation_id: string
          created_at: string
          id: string
          notification_status: string
          phone_dialed: string
        }[]
      }
      get_patient_shift_handoffs: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: {
          acknowledged_count: number
          author_first_name: string
          author_id: string
          author_last_name: string
          concerns: string
          created_at: string
          id: string
          pending_tasks: string
          summary: string
        }[]
      }
      get_pending_account_deletion_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_patient_access: { Args: { p_patient_id: string }; Returns: boolean }
      invite_org_member: {
        Args: { p_email: string; p_org_id: string; p_org_role: string }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          org_role: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_org_auditor: { Args: { p_org_id: string }; Returns: boolean }
      is_active_org_clinical_authority: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      is_active_org_director: { Args: { p_org_id: string }; Returns: boolean }
      is_active_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_authorized_for_patient: {
        Args: { p_patient_id: string; p_user_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_medical_professional_for_patient: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      is_my_enterprise_coverage_active: { Args: never; Returns: boolean }
      is_my_program_active: { Args: never; Returns: boolean }
      is_my_trial_active: { Args: never; Returns: boolean }
      is_org_director_for_patient: {
        Args: { p_patient_id: string; p_user_id: string }
        Returns: boolean
      }
      is_organization_owner: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_patient_enterprise_covered: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      is_platform_owner: { Args: never; Returns: boolean }
      is_professional_staff_for_patient: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      is_therapist_for_patient: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      mark_message_read: { Args: { p_message_id: string }; Returns: boolean }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: {
          body: string | null
          created_at: string
          dedup_key: string | null
          id: string
          notification_type: string
          read_at: string | null
          recipient_user_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          status: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_patient_has_paid_entitlement: { Args: never; Returns: boolean }
      my_patient_office_access_active: { Args: never; Returns: boolean }
      notify_platform_owners: {
        Args: {
          p_body: string
          p_dedup_key?: string
          p_notification_type: string
          p_related_entity_id: string
          p_related_entity_type: string
          p_title: string
        }
        Returns: undefined
      }
      org_configure_license: {
        Args: {
          p_annual_license_fee: number
          p_covered_patient_capacity: number
          p_licensed_seats: number
          p_max_billing_admin_seats?: number
          p_max_caregiver_seats?: number
          p_max_medical_professional_seats?: number
          p_max_therapist_seats?: number
          p_org_id: string
        }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          annual_license_fee: number | null
          coupon_code_applied: string | null
          covered_patient_capacity: number | null
          created_at: string
          id: string
          legacy_package_type_at_issuance: string | null
          license_number: string | null
          license_tier_code: string | null
          licensed_seats: number | null
          max_billing_admin_seats: number | null
          max_caregiver_seats: number | null
          max_medical_professional_seats: number | null
          max_therapist_seats: number | null
          monthly_billing_anchor_date: string | null
          monthly_billing_timezone: string | null
          organization_id: string
          specialist_slot_count: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      org_owner_revoke_own_capability: {
        Args: { p_capability: string; p_org_id: string }
        Returns: {
          capability: string
          created_at: string
          granted_by: string
          id: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_owner_capability_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      org_owner_self_assign_capability: {
        Args: { p_capability: string; p_org_id: string }
        Returns: {
          capability: string
          created_at: string
          granted_by: string
          id: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_owner_capability_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      owner_replace_director: {
        Args: {
          p_new_director_email: string
          p_organization_id: string
          p_reason: string
        }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          org_role: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      patient_has_active_legal_hold: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      patient_has_paid_entitlement: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      place_patient_legal_hold: {
        Args: { p_patient_id: string; p_reason: string }
        Returns: {
          id: string
          patient_id: string
          placed_at: string
          placed_by: string
          reason: string
          released_at: string | null
          released_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_legal_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_approve_cancellation_request: {
        Args: { p_notes: string; p_request_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_approve_director_application: {
        Args: { p_application_id: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_owner_user_id: string | null
          owner_user_id: string
          package_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_correct_office_classification: {
        Args: {
          p_new_org_role: string
          p_new_status: string
          p_organization_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          org_role: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_create_contract: {
        Args: {
          p_contract_type: string
          p_quote_id: string
          p_signatory_name: string
          p_signatory_title: string
          p_supersedes_contract_id?: string
          p_template_version: string
        }
        Returns: {
          contract_type: string
          created_at: string
          created_by: string
          executed_at: string | null
          executed_by: string | null
          execution_evidence_reference: string | null
          execution_method: string | null
          id: string
          presented_at: string | null
          quote_id: string
          signatory_name: string
          signatory_title: string | null
          status: string
          supersedes_contract_id: string | null
          template_version: string
          updated_at: string
          voided_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_create_coupon: {
        Args: {
          p_code: string
          p_discount_kind: string
          p_expires_at: string
          p_max_redemptions_total: number
          p_notes: string
        }
        Returns: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          discount_kind: string
          expires_at: string | null
          max_redemptions_total: number | null
          notes: string | null
          redemptions_used: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_coupon_catalog"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_create_prospect: {
        Args: {
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_notes: string
          p_prospective_organization_name: string
        }
        Returns: {
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          prospective_organization_name: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_prospects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_create_quote: {
        Args: {
          p_annual_license_fee: number
          p_billing_cadence: string
          p_discount_notes: string
          p_package_type: string
          p_proposed_covered_patient_capacity: number
          p_proposed_licensed_seats: number
          p_prospect_id: string
          p_quote_term_months: number
          p_valid_until: string
        }
        Returns: {
          annual_license_fee: number | null
          billing_cadence: string | null
          created_at: string
          created_by: string
          discount_notes: string | null
          id: string
          package_type: string
          proposed_covered_patient_capacity: number | null
          proposed_licensed_seats: number
          prospect_id: string
          quote_term_months: number | null
          status: string
          supersedes_quote_id: string | null
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_delete_patient_exceptionally: {
        Args: { p_justification: string; p_patient_id: string }
        Returns: Json
      }
      platform_owner_issue_quote_invitation: {
        Args: {
          p_expires_in_hours?: number
          p_quote_id: string
          p_recipient_email: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          raw_token: string
        }[]
      }
      platform_owner_present_contract: {
        Args: { p_contract_id: string }
        Returns: {
          contract_type: string
          created_at: string
          created_by: string
          executed_at: string | null
          executed_by: string | null
          execution_evidence_reference: string | null
          execution_method: string | null
          id: string
          presented_at: string | null
          quote_id: string
          signatory_name: string
          signatory_title: string | null
          status: string
          supersedes_contract_id: string | null
          template_version: string
          updated_at: string
          voided_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_quote_amendment_request: {
        Args: {
          p_annual_license_fee: number
          p_billing_cadence: string
          p_contact_email: string
          p_contact_name: string
          p_notes: string
          p_package_type: string
          p_proposed_covered_patient_capacity: number
          p_proposed_licensed_seats: number
          p_quote_term_months: number
          p_request_id: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_record_contract_execution: {
        Args: {
          p_contract_id: string
          p_execution_evidence_reference: string
          p_execution_method: string
        }
        Returns: {
          contract_type: string
          created_at: string
          created_by: string
          executed_at: string | null
          executed_by: string | null
          execution_evidence_reference: string | null
          execution_method: string | null
          id: string
          presented_at: string | null
          quote_id: string
          signatory_name: string
          signatory_title: string | null
          status: string
          supersedes_contract_id: string | null
          template_version: string
          updated_at: string
          voided_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_recover_organization_ownership: {
        Args: {
          p_new_owner_email: string
          p_organization_id: string
          p_reason: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_owner_user_id: string | null
          owner_user_id: string
          package_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_reject_amendment_request: {
        Args: { p_notes: string; p_request_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          director_notes: string | null
          id: string
          organization_id: string
          platform_owner_notes: string | null
          request_type: string
          requested_by: string
          requested_details: Json
          resulting_quote_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_amendment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_resolve_manual_review: {
        Args: { p_application_id: string; p_decision: string; p_reason: string }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_review_account_deletion: {
        Args: { p_approve: boolean; p_notes: string; p_request_id: string }
        Returns: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_revise_quote: {
        Args: {
          p_annual_license_fee: number
          p_billing_cadence: string
          p_discount_notes: string
          p_package_type: string
          p_proposed_covered_patient_capacity: number
          p_proposed_licensed_seats: number
          p_quote_id: string
          p_quote_term_months: number
          p_valid_until: string
        }
        Returns: {
          annual_license_fee: number | null
          billing_cadence: string | null
          created_at: string
          created_by: string
          discount_notes: string | null
          id: string
          package_type: string
          proposed_covered_patient_capacity: number | null
          proposed_licensed_seats: number
          prospect_id: string
          quote_term_months: number | null
          status: string
          supersedes_quote_id: string | null
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_revoke_quote: {
        Args: { p_quote_id: string }
        Returns: {
          annual_license_fee: number | null
          billing_cadence: string | null
          created_at: string
          created_by: string
          discount_notes: string | null
          id: string
          package_type: string
          proposed_covered_patient_capacity: number | null
          proposed_licensed_seats: number
          prospect_id: string
          quote_term_months: number | null
          status: string
          supersedes_quote_id: string | null
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_revoke_quote_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          quote_id: string
          recipient_email: string
          status: string
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_quote_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_send_quote: {
        Args: { p_quote_id: string }
        Returns: {
          annual_license_fee: number | null
          billing_cadence: string | null
          created_at: string
          created_by: string
          discount_notes: string | null
          id: string
          package_type: string
          proposed_covered_patient_capacity: number | null
          proposed_licensed_seats: number
          prospect_id: string
          quote_term_months: number | null
          status: string
          supersedes_quote_id: string | null
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_set_coupon_limit: {
        Args: { p_code: string; p_max_redemptions_total: number }
        Returns: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          discount_kind: string
          expires_at: string | null
          max_redemptions_total: number | null
          notes: string | null
          redemptions_used: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_coupon_catalog"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_set_coupon_status: {
        Args: { p_code: string; p_status: string }
        Returns: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          discount_kind: string
          expires_at: string | null
          max_redemptions_total: number | null
          notes: string | null
          redemptions_used: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_coupon_catalog"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_set_license_tier_price: {
        Args: {
          p_annual_fee_cents: number
          p_display_name: string
          p_specialist_slot_count: number
          p_tier_code: string
        }
        Returns: {
          annual_fee_cents: number
          created_at: string
          display_name: string
          is_published: boolean
          specialist_slot_count: number
          tier_code: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "license_tier_catalog"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_set_license_tier_published: {
        Args: { p_is_published: boolean; p_tier_code: string }
        Returns: {
          annual_fee_cents: number
          created_at: string
          display_name: string
          is_published: boolean
          specialist_slot_count: number
          tier_code: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "license_tier_catalog"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_update_prospect_status: {
        Args: { p_prospect_id: string; p_status: string }
        Returns: {
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          prospective_organization_name: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_prospects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_owner_void_contract: {
        Args: { p_contract_id: string; p_reason: string }
        Returns: {
          contract_type: string
          created_at: string
          created_by: string
          executed_at: string | null
          executed_by: string | null
          execution_evidence_reference: string | null
          execution_method: string | null
          id: string
          presented_at: string | null
          quote_id: string
          signatory_name: string
          signatory_title: string | null
          status: string
          supersedes_contract_id: string | null
          template_version: string
          updated_at: string
          voided_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      provision_free_subscription: {
        Args: never
        Returns: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string | null
          program: string | null
          promo_code: string | null
          promo_expires_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_care_preference: {
        Args: {
          p_category: string
          p_description: string
          p_patient_id: string
          p_reported_by?: string
        }
        Returns: {
          author_id: string
          category: string
          created_at: string
          description: string
          id: string
          patient_id: string
          reported_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patient_care_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_communication_needs: {
        Args: {
          p_communication_needs: string
          p_patient_id: string
          p_source?: string
        }
        Returns: {
          address: string | null
          affirmation: string | null
          code_status: string
          code_status_source: string
          code_status_updated_by: string | null
          communication_needs: string | null
          communication_needs_source: string | null
          communication_needs_updated_by: string | null
          created_at: string | null
          date_of_birth: string | null
          dementia_stage: string | null
          diagnosis_date: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          id: string
          last_name: string
          location: string | null
          photo_url: string | null
          preferences_audio_enabled: boolean | null
          preferences_first_session_done: boolean
          preferences_font_size: string | null
          preferences_high_contrast: boolean | null
          preferences_language: string | null
          preferences_notifications_enabled: boolean | null
          preferences_tone: string | null
          preferred_hospital: string | null
          preferred_name: string | null
          safety_response_instructions: string | null
          updated_at: string | null
          voice_label: string | null
          voice_storage_path: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_credential_verification: {
        Args: {
          p_application_id: string
          p_decision: string
          p_evidence_reference: string
        }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_help_activation: {
        Args: { p_phone_dialed: string }
        Returns: {
          caregiver_count_at_time: number
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          notification_status: string
          patient_id: string
          phone_dialed: string | null
        }
        SetofOptions: {
          from: "*"
          to: "help_activations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_patient_allergy: {
        Args: {
          p_allergen: string
          p_notes?: string
          p_patient_id: string
          p_reaction?: string
          p_severity?: string
          p_source?: string
        }
        Returns: {
          allergen: string
          author_id: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          reaction: string | null
          severity: string | null
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_allergies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_patient_care_plan: {
        Args: {
          p_effective_date?: string
          p_goals: string
          p_patient_id: string
          p_permitted_tasks?: string
        }
        Returns: {
          author_id: string
          created_at: string
          effective_date: string
          goals: string
          id: string
          is_current: boolean
          patient_id: string
          permitted_tasks: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "patient_care_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_patient_diagnosis: {
        Args: {
          p_condition_name: string
          p_diagnosed_date?: string
          p_notes?: string
          p_patient_id: string
          p_source?: string
        }
        Returns: {
          author_id: string
          condition_name: string
          created_at: string
          diagnosed_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          patient_id: string
          source: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_diagnoses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_patient_provider: {
        Args: {
          p_email?: string
          p_notes?: string
          p_patient_id: string
          p_phone?: string
          p_provider_name: string
          p_provider_role: string
          p_source?: string
        }
        Returns: {
          author_id: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          patient_id: string
          phone: string | null
          provider_name: string
          provider_role: string
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_care_providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_patient_safety_plan: {
        Args: {
          p_code_status?: string
          p_code_status_source?: string
          p_patient_id: string
          p_preferred_hospital?: string
          p_safety_response_instructions?: string
        }
        Returns: {
          address: string | null
          affirmation: string | null
          code_status: string
          code_status_source: string
          code_status_updated_by: string | null
          communication_needs: string | null
          communication_needs_source: string | null
          communication_needs_updated_by: string | null
          created_at: string | null
          date_of_birth: string | null
          dementia_stage: string | null
          diagnosis_date: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          id: string
          last_name: string
          location: string | null
          photo_url: string | null
          preferences_audio_enabled: boolean | null
          preferences_first_session_done: boolean
          preferences_font_size: string | null
          preferences_high_contrast: boolean | null
          preferences_language: string | null
          preferences_notifications_enabled: boolean | null
          preferences_tone: string | null
          preferred_hospital: string | null
          preferred_name: string | null
          safety_response_instructions: string | null
          updated_at: string | null
          voice_label: string | null
          voice_storage_path: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_patient_vitals: {
        Args: {
          p_blood_pressure?: string
          p_notes?: string
          p_oxygen_saturation?: number
          p_pain_level?: number
          p_patient_id: string
          p_pulse_bpm?: number
          p_source?: string
          p_temperature_f?: number
          p_weight_lbs?: number
        }
        Returns: {
          author_id: string
          blood_pressure: string | null
          created_at: string
          id: string
          measured_at: string
          notes: string | null
          oxygen_saturation: number | null
          pain_level: number | null
          patient_id: string
          pulse_bpm: number | null
          source: string
          temperature_f: number | null
          weight_lbs: number | null
        }
        SetofOptions: {
          from: "*"
          to: "patient_vitals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_shift_handoff: {
        Args: {
          p_concerns?: string
          p_org_id: string
          p_patient_id: string
          p_pending_tasks?: string
          p_summary: string
        }
        Returns: {
          author_id: string
          concerns: string | null
          created_at: string
          id: string
          organization_id: string
          patient_id: string
          pending_tasks: string | null
          summary: string
        }
        SetofOptions: {
          from: "*"
          to: "shift_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_staff_credential: {
        Args: {
          p_credential_name: string
          p_expires_at?: string
          p_issued_at?: string
          p_org_id: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          credential_name: string
          expires_at: string | null
          id: string
          issued_at: string | null
          organization_id: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "caregiver_credentials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_therapy_goal: {
        Args: {
          p_objective: string
          p_patient_id: string
          p_progress_notes?: string
        }
        Returns: {
          author_id: string
          created_at: string
          id: string
          objective: string
          patient_id: string
          progress_notes: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_therapy_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_coupon_for_application: {
        Args: {
          p_application_id: string
          p_coupon_code: string
          p_tier_code: string
        }
        Returns: {
          application_id: string
          base_cents: number
          coupon_code: string
          discount_cents: number
          final_cents: number
          id: string
          redeemed_at: string
          redeemed_by: string
        }
        SetofOptions: {
          from: "*"
          to: "enterprise_coupon_redemptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_promo_code: {
        Args: { p_code: string }
        Returns: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string | null
          program: string | null
          promo_code: string | null
          promo_expires_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_quote_invitation: {
        Args: { p_token: string }
        Returns: {
          outcome: string
          package_type: string
          proposed_covered_patient_capacity: number
          proposed_licensed_seats: number
          prospective_organization_name: string
          quote_id: string
        }[]
      }
      register_patient_representative: {
        Args: {
          p_authorization_basis: string
          p_authorization_evidence_reference?: string
          p_consent_acknowledged: boolean
          p_contact_email: string
          p_contact_phone: string
          p_legal_first_name: string
          p_legal_last_name: string
          p_legal_middle_name?: string
          p_org_id: string
          p_patient_id: string
          p_relationship_to_patient: string
          p_representative_email: string
          p_residential_address: string
        }
        Returns: {
          authorization_basis: string
          authorization_evidence_reference: string | null
          consent_acknowledged: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          initiated_by: string
          legal_first_name: string
          legal_last_name: string
          legal_middle_name: string | null
          organization_id: string
          patient_id: string
          relationship_to_patient: string
          replaced_by_representative_id: string | null
          representative_user_id: string
          residential_address: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patient_representatives"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_application: {
        Args: { p_application_id: string; p_rejection_reason: string }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_patient_legal_hold: {
        Args: { p_hold_id: string }
        Returns: {
          id: string
          patient_id: string
          placed_at: string
          placed_by: string
          reason: string
          released_at: string | null
          released_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_legal_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      remove_org_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      replace_patient_representative: {
        Args: {
          p_authorization_basis: string
          p_authorization_evidence_reference?: string
          p_consent_acknowledged: boolean
          p_contact_email: string
          p_contact_phone: string
          p_legal_first_name: string
          p_legal_last_name: string
          p_legal_middle_name?: string
          p_old_representative_id: string
          p_reason: string
          p_relationship_to_patient: string
          p_representative_email: string
          p_residential_address: string
        }
        Returns: {
          authorization_basis: string
          authorization_evidence_reference: string | null
          consent_acknowledged: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          initiated_by: string
          legal_first_name: string
          legal_last_name: string
          legal_middle_name: string | null
          organization_id: string
          patient_id: string
          relationship_to_patient: string
          replaced_by_representative_id: string | null
          representative_user_id: string
          residential_address: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patient_representatives"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_scope_concern: {
        Args: { p_description: string; p_org_id: string; p_patient_id: string }
        Returns: {
          created_at: string
          description: string
          id: string
          organization_id: string
          patient_id: string
          reported_by: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "scope_concerns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_account_deletion: {
        Args: { p_reason: string }
        Returns: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_application_corrections: {
        Args: {
          p_application_id: string
          p_correction_fields: Json
          p_correction_request: string
        }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_enterprise_billing_customer: {
        Args: { p_quote_id: string }
        Returns: {
          organization_id: string
          reusable_stripe_customer_id: string
        }[]
      }
      resolve_follow_up: { Args: { p_message_id: string }; Returns: boolean }
      resolve_incident_report: {
        Args: {
          p_incident_id: string
          p_resolution_notes?: string
          p_resolution_status: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          incident_type: string
          occurred_at: string
          organization_id: string
          patient_id: string
          reported_by: string
          resolution_notes: string | null
          resolution_status: string
          severity: string
          supervisor_notified_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "incident_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_org_invite: {
        Args: { p_accept: boolean; p_membership_id: string }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          org_role: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_therapist_invite: {
        Args: { p_accept: boolean; p_connection_id: string }
        Returns: {
          caregiver_id: string
          created_at: string
          id: string
          patient_id: string
          relationship_type: string
          responded_at: string | null
          status: string
          therapist_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pending_therapist_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resubmit_application: {
        Args: {
          p_application_details: Json
          p_application_id: string
          p_contact_email: string
          p_contact_phone: string
          p_legal_name: string
          p_preferred_name: string
          p_profession_category: string
          p_professional_title: string
        }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_patient_representative: {
        Args: { p_reason: string; p_representative_id: string }
        Returns: {
          authorization_basis: string
          authorization_evidence_reference: string | null
          consent_acknowledged: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          initiated_by: string
          legal_first_name: string
          legal_last_name: string
          legal_middle_name: string | null
          organization_id: string
          patient_id: string
          relationship_to_patient: string
          replaced_by_representative_id: string | null
          representative_user_id: string
          residential_address: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patient_representatives"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_therapist_connection: {
        Args: { p_patient_id: string; p_therapist_id: string }
        Returns: boolean
      }
      run_automated_application_verification: {
        Args: { p_application_id: string }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_application_draft: {
        Args: {
          p_application_details: Json
          p_contact_email: string
          p_contact_phone: string
          p_legal_name: string
          p_preferred_name: string
          p_profession_category: string
          p_professional_title: string
          p_proposed_organization_name: string
          p_proposed_package_type: string
          p_requested_office: string
        }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_caregiver_visit: {
        Args: {
          p_org_id: string
          p_patient_id: string
          p_scheduled_end: string
          p_scheduled_start: string
        }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          caregiver_id: string
          created_at: string
          evv_latitude: number | null
          evv_longitude: number | null
          evv_offline_exception: boolean
          evv_required: boolean
          id: string
          organization_id: string
          patient_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          updated_at: string
          visit_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "caregiver_visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_my_conversations: {
        Args: { p_search_term: string }
        Returns: {
          conversation_id: string
        }[]
      }
      self_heal_my_profile: {
        Args: never
        Returns: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          max_patient_capacity: number | null
          mfa_enabled: boolean
          must_change_password: boolean
          phone: string | null
          phone_normalized: string | null
          photo_url: string | null
          provisioning_status: string
          role: string
          sms_consent: boolean | null
          subscription_status: string | null
          subscription_tier: string | null
          temp_user_expires_at: string | null
          terms_accepted_at: string | null
          updated_at: string | null
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_message:
        | {
            Args: {
              p_body: string
              p_conversation_id: string
              p_is_urgent: boolean
              p_reply_to_message_id: string
            }
            Returns: {
              body: string
              conversation_id: string
              created_at: string
              id: string
              is_urgent: boolean
              message_type: string
              reply_to_message_id: string | null
              sender_id: string
              sender_role: string
            }
            SetofOptions: {
              from: "*"
              to: "messages"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_body: string
              p_conversation_id: string
              p_is_urgent: boolean
              p_message_type?: string
              p_reply_to_message_id: string
            }
            Returns: {
              body: string
              conversation_id: string
              created_at: string
              id: string
              is_urgent: boolean
              message_type: string
              reply_to_message_id: string | null
              sender_id: string
              sender_role: string
            }
            SetofOptions: {
              from: "*"
              to: "messages"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      set_enterprise_license_status_for_quote: {
        Args: { p_quote_id: string; p_status: string }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          annual_license_fee: number | null
          coupon_code_applied: string | null
          covered_patient_capacity: number | null
          created_at: string
          id: string
          legacy_package_type_at_issuance: string | null
          license_number: string | null
          license_tier_code: string | null
          licensed_seats: number | null
          max_billing_admin_seats: number | null
          max_caregiver_seats: number | null
          max_medical_professional_seats: number | null
          max_therapist_seats: number | null
          monthly_billing_anchor_date: string | null
          monthly_billing_timezone: string | null
          organization_id: string
          specialist_slot_count: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_caregiver_visit: {
        Args: { p_latitude?: number; p_longitude?: number; p_visit_id: string }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          caregiver_id: string
          created_at: string
          evv_latitude: number | null
          evv_longitude: number | null
          evv_offline_exception: boolean
          evv_required: boolean
          id: string
          organization_id: string
          patient_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          updated_at: string
          visit_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "caregiver_visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_self_service_application: {
        Args: {
          p_application_details: Json
          p_contact_email: string
          p_coupon_code?: string
          p_initial_expected_active_patients: number
          p_invitation_token?: string
          p_legal_name: string
          p_selected_tier_code: string
        }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_professional_application: {
        Args: {
          p_application_details: Json
          p_contact_email: string
          p_contact_phone: string
          p_draft_id?: string
          p_legal_name: string
          p_preferred_name: string
          p_profession_category: string
          p_professional_title: string
          p_proposed_organization_name: string
          p_proposed_package_type: string
          p_requested_office: string
          p_target_organization_id: string
        }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unassign_staff_from_patient: {
        Args: { p_org_id: string; p_patient_id: string; p_user_id: string }
        Returns: boolean
      }
      undo_medication_dose: {
        Args: {
          p_date: string
          p_medication_id: string
          p_scheduled_time: string
        }
        Returns: undefined
      }
      update_therapy_goal_progress: {
        Args: { p_goal_id: string; p_progress_notes: string; p_status?: string }
        Returns: {
          author_id: string
          created_at: string
          id: string
          objective: string
          patient_id: string
          progress_notes: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_therapy_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_director_application_payload: {
        Args: { p_contact_email: string; p_details: Json }
        Returns: undefined
      }
      verify_patient_representative: {
        Args: { p_representative_id: string }
        Returns: {
          authorization_basis: string
          authorization_evidence_reference: string | null
          consent_acknowledged: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          initiated_by: string
          legal_first_name: string
          legal_last_name: string
          legal_middle_name: string | null
          organization_id: string
          patient_id: string
          relationship_to_patient: string
          replaced_by_representative_id: string | null
          representative_user_id: string
          residential_address: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patient_representatives"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_application: {
        Args: { p_application_id: string }
        Returns: {
          annual_license_fee_snapshot_cents: number | null
          applicant_user_id: string
          application_details: Json
          application_reference: string
          approved_office: string | null
          auto_verification_result: Json | null
          contact_email: string | null
          contact_phone: string | null
          correction_request: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_requested_fields: Json | null
          created_at: string
          credential_verification_evidence: string | null
          credential_verification_status: string
          credential_verified_at: string | null
          credential_verified_by: string | null
          entry_method: string | null
          exception_review_reason: string | null
          id: string
          initial_expected_active_patients: number | null
          legal_name: string | null
          platform_owner_approval_required: boolean
          platform_owner_approved_at: string | null
          platform_owner_approved_by: string | null
          preferred_name: string | null
          profession_category: string | null
          professional_title: string | null
          proposed_organization_name: string | null
          proposed_package_type: string | null
          rejection_reason: string | null
          requested_office: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_tier_code: string | null
          status: string
          target_organization_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "professional_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
