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
export type UserRole = 'admin' | 'therapist' | 'caregiver' | 'patient' | 'pending'

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
          // PHASE 3: five columns below are missing from 001's tracked
          // CREATE TABLE but confirmed by real, live application usage:
          // `must_change_password`/`mfa_enabled`/`provisioning_status`/
          // `phone_normalized` are explicitly named in
          // 012_profiles_revoke_client_role_authority.sql's own column
          // GRANT list (the clearest possible confirmation — a migration
          // granting write access to a column it did not itself create
          // only makes sense if the column already exists live);
          // `username` has no tracked migration evidence at all (same
          // "tracked != live" situation as several other tables in this
          // file) but is read/written/uniqueness-checked directly by
          // src/pages/common/PricingPage.tsx's signup flow — confirmed via
          // that application code, not invented.
          must_change_password: boolean | null
          mfa_enabled: boolean | null
          provisioning_status: string | null
          phone_normalized: string | null
          username: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          first_name: string
          last_name: string
          // RELEASE-BLOCKER-CLOSURE PHASE 1: optional, not required —
          // 012_profiles_revoke_client_role_authority.sql:121 runs `ALTER
          // TABLE public.profiles ALTER COLUMN role SET DEFAULT 'patient'`,
          // confirmed-live-by-migration (not guessed), so an INSERT that
          // omits `role` is valid and takes that default.
          role?: UserRole
          phone?: string | null
          photo_url?: string | null
          must_change_password?: boolean | null
          mfa_enabled?: boolean | null
          provisioning_status?: string | null
          phone_normalized?: string | null
          username?: string | null
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
          must_change_password?: boolean | null
          mfa_enabled?: boolean | null
          provisioning_status?: string | null
          phone_normalized?: string | null
          username?: string | null
          created_at?: string
          updated_at?: string
        }
        // REPAIR D: `profiles.id REFERENCES auth.users(id)` is real
        // (001_initial_schema.sql) but targets the `auth` schema, which
        // this Database type (public schema only) has no Tables entry
        // for — expressing it here would reference a relation this type
        // doesn't model, not a real public-schema embedding target.
        // Genuinely no outgoing public-schema FK on this table otherwise.
        Relationships: []
      }
      patients: {
        Row: {
          id: string
          // Confirmed NOT NULL, no default, by independent production
          // catalog read (MYMEMORIA FINAL MIGRATION CLOSURE review,
          // 2026-10-17) — previously missing from this hand-maintained
          // type file even though real call sites (PricingPage.tsx's own
          // `.from('patients').upsert({id, first_name, last_name, ...})`)
          // already depend on them.
          first_name: string
          last_name: string
          date_of_birth: string | null
          diagnosis: string | null
          dementia_stage: DementiaStage | null
          diagnosis_date: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          // PHASE 3: `emergency_contact_email`/`phone`/
          // `preferences_first_session_done` confirmed via
          // src/pages/patient/PatientLayout.tsx's own SELECT list;
          // `voice_storage_path`/`voice_label` confirmed via
          // src/pages/patient/PatientHome.tsx's select/update of this
          // table (the "custom voice" feature) — none of these five are
          // in 001_initial_schema.sql's tracked CREATE TABLE, same
          // "tracked != live" situation as several other tables/columns
          // in this file.
          emergency_contact_email: string | null
          phone: string | null
          preferences_first_session_done: boolean | null
          voice_storage_path: string | null
          voice_label: string | null
          // PHASE 3: confirmed via src/pages/patient/PatientProfileSetup.tsx's
          // own select (read-only fallback source for the "medications"
          // field there; never written anywhere in tracked app code).
          medications_summary: string | null
          preferred_name: string | null
          location: string | null
          address: string | null
          // ROUND 6: confirmed via 001_initial_schema.sql's tracked
          // CREATE TABLE (photo_url) — never previously selected by any
          // tracked call site until EnterpriseStaffPatientView.tsx's
          // Round 6 patient-header query, which is what surfaced this
          // pre-existing gap in this hand-maintained type file.
          photo_url: string | null
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
          // Optional here (unlike Row, where both are always non-null):
          // every existing call site that omits them does so on an
          // UPSERT against an ALREADY-EXISTING row (the value persists
          // from the original INSERT) — never a bare fresh INSERT
          // without them. A genuinely fresh INSERT (this round's new
          // caregiver_claim_new_patient RPC) always supplies both.
          first_name?: string
          last_name?: string
          date_of_birth?: string | null
          diagnosis?: string | null
          dementia_stage?: DementiaStage | null
          diagnosis_date?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_email?: string | null
          phone?: string | null
          preferences_first_session_done?: boolean | null
          voice_storage_path?: string | null
          voice_label?: string | null
          medications_summary?: string | null
          preferred_name?: string | null
          location?: string | null
          address?: string | null
          photo_url?: string | null
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
          first_name?: string
          last_name?: string
          date_of_birth?: string | null
          diagnosis?: string | null
          dementia_stage?: DementiaStage | null
          diagnosis_date?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_email?: string | null
          phone?: string | null
          preferences_first_session_done?: boolean | null
          voice_storage_path?: string | null
          voice_label?: string | null
          medications_summary?: string | null
          preferred_name?: string | null
          location?: string | null
          address?: string | null
          photo_url?: string | null
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
        // REPAIR D: `patients` has no outgoing FK columns of its own in
        // 001_initial_schema.sql — it is the REFERENCED side of every
        // relationship above, never the referencing side.
        Relationships: []
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
            referencedRelation: "patients"
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
            referencedRelation: "patients"
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_notification_preferences: {
        Row: {
          channel: string
          notify_follow_up_due: boolean
          notify_help_alerts: boolean
          notify_messages: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          notify_follow_up_due?: boolean
          notify_help_alerts?: boolean
          notify_messages?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          notify_follow_up_due?: boolean
          notify_help_alerts?: boolean
          notify_messages?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
            referencedRelation: "patients"
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
            referencedRelation: "patients"
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
            referencedRelation: "patients"
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_patients: {
        Row: {
          id: string
          caregiver_id: string
          patient_id: string
          relationship_type: RelationshipType
          is_primary: boolean
          // CAREGIVER DASHBOARD-FIRST NAVIGATION item 4 / migration 033:
          // caregiver-chosen display name for this ONE relationship —
          // never the patient's actual identity. Only this column (plus
          // updated_at) is writable by `authenticated`; caregiver_id/
          // patient_id/relationship_type/is_primary are column-privilege
          // protected (REVOKE UPDATE ... then a scoped re-GRANT).
          display_label: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          caregiver_id: string
          patient_id: string
          relationship_type?: RelationshipType
          is_primary?: boolean
          display_label?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          caregiver_id?: string
          patient_id?: string
          relationship_type?: RelationshipType
          is_primary?: boolean
          display_label?: string | null
          created_at?: string
          updated_at?: string
        }
        // REPAIR D (FUNCTIONAL-REPAIR-005): confirmed via
        // 001_initial_schema.sql's inline `REFERENCES` clauses —
        // `caregiver_id UUID NOT NULL REFERENCES profiles(id)`,
        // `patient_id UUID NOT NULL REFERENCES patients(id)`. Constraint
        // names are Postgres' own default for an unnamed inline FK
        // (`<table>_<column>_fkey`), not invented.
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
        // REPAIR D: `therapist_relationships` is not defined in ANY tracked
        // migration (same "tracked != live" situation `subscriptions` was
        // in before 010-013) — no `REFERENCES` clause for this table
        // exists anywhere in this repo to confirm real FK targets/
        // constraint names against. Left empty rather than guessed; see
        // Functions section below for the same caution applied elsewhere.
        Relationships: []
      }
      // ENTERPRISE CONSOLIDATED DELIVERY / migration 035. See that file's
      // own header comment for the full design rationale.
      organizations: {
        Row: {
          id: string
          name: string
          package_type: "therapist" | "integrated_care"
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          package_type: "therapist" | "integrated_care"
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          package_type?: "therapist" | "integrated_care"
          created_by?: string
          created_at?: string
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
        ]
      }
      organization_memberships: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          org_role: "director" | "caregiver" | "therapist" | "medical_professional" | "billing_admin"
          status: "invited" | "active" | "revoked" | "declined"
          invited_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          org_role: "director" | "caregiver" | "therapist" | "medical_professional" | "billing_admin"
          status?: "invited" | "active" | "revoked" | "declined"
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          org_role?: "director" | "caregiver" | "therapist" | "medical_professional" | "billing_admin"
          status?: "invited" | "active" | "revoked" | "declined"
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
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
      organization_licenses: {
        Row: {
          id: string
          organization_id: string
          licensed_seats: number | null
          covered_patient_capacity: number | null
          annual_license_fee: number | null
          status: "proposed" | "active" | "expired" | "canceled" | "unpaid"
          activated_by: string | null
          activated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          licensed_seats?: number | null
          covered_patient_capacity?: number | null
          annual_license_fee?: number | null
          status?: "proposed" | "active" | "expired" | "canceled" | "unpaid"
          activated_by?: string | null
          activated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          licensed_seats?: number | null
          covered_patient_capacity?: number | null
          annual_license_fee?: number | null
          status?: "proposed" | "active" | "expired" | "canceled" | "unpaid"
          activated_by?: string | null
          activated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_licenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_patient_assignments: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          patient_id: string
          org_role: "caregiver" | "therapist" | "medical_professional"
          is_active: boolean
          assigned_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          patient_id: string
          org_role: "caregiver" | "therapist" | "medical_professional"
          is_active?: boolean
          assigned_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          patient_id?: string
          org_role?: "caregiver" | "therapist" | "medical_professional"
          is_active?: boolean
          assigned_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      covered_patient_memberships: {
        Row: {
          id: string
          organization_id: string
          patient_id: string
          status: "active" | "ended"
          started_at: string
          ended_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          patient_id: string
          status?: "active" | "ended"
          started_at?: string
          ended_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          patient_id?: string
          status?: "active" | "ended"
          started_at?: string
          ended_at?: string | null
          created_by?: string | null
        }
        Relationships: [
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // ENTERPRISE CONSOLIDATED DELIVERY / migration 036. See that file's
      // own header comment for the full design rationale — access is
      // controlled entirely by conversation_participants, never by any
      // other relationship table.
      conversations: {
        Row: {
          id: string
          patient_id: string
          subject: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          subject?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          subject?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          participant_role: "patient" | "caregiver" | "therapist" | "medical_professional"
          added_by: string
          added_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          participant_role: "patient" | "caregiver" | "therapist" | "medical_professional"
          added_by: string
          added_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          participant_role?: "patient" | "caregiver" | "therapist" | "medical_professional"
          added_by?: string
          added_at?: string
        }
        Relationships: [
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
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          sender_role: "patient" | "caregiver" | "therapist" | "medical_professional"
          body: string
          is_urgent: boolean
          reply_to_message_id: string | null
          created_at: string
          message_type: "message" | "care_update"
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          sender_role: "patient" | "caregiver" | "therapist" | "medical_professional"
          body: string
          is_urgent?: boolean
          reply_to_message_id?: string | null
          created_at?: string
          message_type?: "message" | "care_update"
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          sender_role?: "patient" | "caregiver" | "therapist" | "medical_professional"
          body?: string
          is_urgent?: boolean
          reply_to_message_id?: string | null
          created_at?: string
          message_type?: "message" | "care_update"
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
      message_acknowledgments: {
        Row: {
          id: string
          message_id: string
          user_id: string
          read_at: string | null
          acknowledged_at: string | null
          follow_up_requested: boolean
          follow_up_note: string | null
          follow_up_resolved: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          read_at?: string | null
          acknowledged_at?: string | null
          follow_up_requested?: boolean
          follow_up_note?: string | null
          follow_up_resolved?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          read_at?: string | null
          acknowledged_at?: string | null
          follow_up_requested?: boolean
          follow_up_note?: string | null
          follow_up_resolved?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_acknowledgments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      // CRITICAL OWNER-REPORTED REMEDIATION Correction F — migration 048.
      help_activations: {
        Row: {
          id: string
          patient_id: string
          phone_dialed: string | null
          conversation_id: string | null
          message_id: string | null
          caregiver_count_at_time: number
          notification_status: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          phone_dialed?: string | null
          conversation_id?: string | null
          message_id?: string | null
          caregiver_count_at_time?: number
          notification_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          phone_dialed?: string | null
          conversation_id?: string | null
          message_id?: string | null
          caregiver_count_at_time?: number
          notification_status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_activations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_activations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
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
        // REPAIR D: `patient_id` confirmed via 001_initial_schema.sql
        // (`REFERENCES patients(id)`); `author_id` confirmed via
        // 006_patient_notes_author.sql's `ADD COLUMN author_id UUID
        // REFERENCES profiles(id)` — matches this Row's actual column
        // (not 001's original `caregiver_id`, which this generated snapshot
        // does not carry).
        Relationships: [
          {
            foreignKeyName: "patient_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          // RELEASE-BLOCKER-CLOSURE PHASE 1: not in 001's tracked CREATE
          // TABLE at all (same "tracked != live" situation as several
          // other columns in this file) — confirmed by real read AND
          // write usage in src/pages/patient/PatientMedications.tsx
          // (written as `{ id, time, daysOfWeek }[]` on insert, read back
          // via `row.schedule || []` to populate dose times on load; the
          // entire medication-scheduling feature depends on it).
          schedule: Json
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
          schedule?: Json
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
          schedule?: Json
          side_effects?: string[]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        // REPAIR D: confirmed via 001_initial_schema.sql's `patient_id
        // UUID NOT NULL REFERENCES patients(id)`.
        Relationships: [
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
          refusal_reason: string | null
          status_updated_by: string | null
          status_updated_at: string | null
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
          refusal_reason?: string | null
          status_updated_by?: string | null
          status_updated_at?: string | null
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
          refusal_reason?: string | null
          status_updated_by?: string | null
          status_updated_at?: string | null
        }
        Relationships: [
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
      // RELEASE-BLOCKER-CLOSURE PHASE 1: not in 001's tracked CREATE TABLE
      // and not tracked by any migration 001-024 at all (same "tracked !=
      // live" situation as several other tables in this file; this is the
      // exact gap FQA-006 named). Confirmed real by the one, read-only
      // application call site (PatientLayout.tsx's own SELECT list) — no
      // insert/update/delete call site exists anywhere in tracked app
      // code (confirmed by repo-wide grep), so Insert/Update exist here
      // only for Database-type shape completeness, not because any write
      // path uses them.
      reminders: {
        Row: {
          id: string
          patient_id: string
          title: string | null
          message: string | null
          type: string | null
          time: string | null
          days_of_week: number[] | null
          is_active: boolean | null
          sound: string | null
          vibrate: boolean | null
          created_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          title?: string | null
          message?: string | null
          type?: string | null
          time?: string | null
          days_of_week?: number[] | null
          is_active?: boolean | null
          sound?: string | null
          vibrate?: boolean | null
          created_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          title?: string | null
          message?: string | null
          type?: string | null
          time?: string | null
          days_of_week?: number[] | null
          is_active?: boolean | null
          sound?: string | null
          vibrate?: boolean | null
          created_at?: string | null
          created_by?: string | null
        }
        Relationships: []
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
        // REPAIR D: confirmed via 001_initial_schema.sql's `patient_id
        // UUID NOT NULL REFERENCES patients(id)`.
        Relationships: [
          {
            foreignKeyName: "mood_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
        // REPAIR D: confirmed via 001_initial_schema.sql's `patient_id
        // UUID NOT NULL REFERENCES patients(id)`.
        Relationships: [
          {
            foreignKeyName: "memories_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
        // REPAIR D: confirmed via 001_initial_schema.sql's `patient_id
        // UUID NOT NULL REFERENCES patients(id)`.
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
        // REPAIR D: confirmed via 001_initial_schema.sql's `patient_id
        // UUID NOT NULL REFERENCES patients(id)`.
        Relationships: [
          {
            foreignKeyName: "care_team_members_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // REPAIR 008 / REPAIR D: added — previously missing entirely (see the
      // note above SubscriptionRow). Shape confirmed against
      // 013_subscriptions_atomic_lifecycle.sql's authoritative
      // `CREATE TABLE`/`ALTER TABLE` statements (the one that supersedes
      // 010's wrong first draft — see 013's own header note), with the
      // `plan` (017_daily_care_full_support_plan_identity.sql) and
      // `program` (018_temporary_companion_program_identity.sql) columns
      // layered on top exactly as those files add them. `tier`/`status`
      // are kept as plain `string`, not narrowed to TierName/
      // SubscriptionStatus — consistent with every other loosely-typed
      // enum-like TEXT column already in this file (e.g. `role: UserRole`
      // is the one exception, used because UserRole is itself exported
      // from this same generated-types module; TierName/SubscriptionStatus
      // live in src/types/subscription.ts, a hand-written application
      // file this generated-types file does not import from).
      subscriptions: {
        Row: {
          id: string
          user_id: string
          tier: string
          plan: string | null
          program: string | null
          status: string
          trial_started_at: string
          trial_ends_at: string
          current_period_start: string | null
          current_period_end: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          canceled_at: string | null
          promo_code: string | null
          promo_expires_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          tier: string
          plan?: string | null
          program?: string | null
          status: string
          trial_started_at?: string
          trial_ends_at?: string
          current_period_start?: string | null
          current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          canceled_at?: string | null
          promo_code?: string | null
          promo_expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          tier?: string
          plan?: string | null
          program?: string | null
          status?: string
          trial_started_at?: string
          trial_ends_at?: string
          current_period_start?: string | null
          current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          canceled_at?: string | null
          promo_code?: string | null
          promo_expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        // REPAIR D: confirmed via 013_subscriptions_atomic_lifecycle.sql's
        // `user_id UUID NOT NULL UNIQUE REFERENCES profiles(id)` — unnamed
        // inline FK, so Postgres' own default naming convention applies
        // (same convention already relied on elsewhere in this file).
        // `isOneToOne: true` because `user_id` carries its own UNIQUE
        // constraint (and a second, defensively-added
        // `subscriptions_user_id_unique` constraint of the same shape) —
        // unlike every `patient_id` FK above, at most one subscriptions row
        // can ever reference a given profile.
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
      // PHASE 3 (MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009): added — like
      // `subscriptions` before this engagement's REPAIR 008/D, this table
      // had no Tables entry at all. Shape confirmed against
      // 009_patient_intake.sql's CREATE TABLE, with `intake_completed`
      // (021_patient_intake_self_access_and_schema_gaps.sql) layered on
      // top exactly as that file adds it.
      patient_intake: {
        Row: {
          id: string
          patient_profile_id: string | null
          caregiver_profile_id: string | null
          patient_first_name: string
          patient_last_name: string
          patient_preferred_name: string | null
          patient_date_of_birth: string | null
          patient_diagnosis_date: string | null
          patient_dementia_stage: string | null
          patient_street_address: string | null
          patient_city: string | null
          patient_state: string | null
          patient_zip_code: string | null
          patient_phone: string | null
          patient_email: string | null
          preferred_hospital: string | null
          doctor_therapist_name: string | null
          doctor_therapist_phone: string | null
          caregiver_name: string | null
          caregiver_relationship: string | null
          caregiver_phone: string | null
          medications_and_dosage: string | null
          emergency_contact_full_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_email: string | null
          emergency_contact_relationship: string | null
          intake_completed: boolean
          created_by: string | null
          created_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          id: string
          patient_profile_id?: string | null
          caregiver_profile_id?: string | null
          patient_first_name: string
          patient_last_name: string
          patient_preferred_name?: string | null
          patient_date_of_birth?: string | null
          patient_diagnosis_date?: string | null
          patient_dementia_stage?: string | null
          patient_street_address?: string | null
          patient_city?: string | null
          patient_state?: string | null
          patient_zip_code?: string | null
          patient_phone?: string | null
          patient_email?: string | null
          preferred_hospital?: string | null
          doctor_therapist_name?: string | null
          doctor_therapist_phone?: string | null
          caregiver_name?: string | null
          caregiver_relationship?: string | null
          caregiver_phone?: string | null
          medications_and_dosage?: string | null
          emergency_contact_full_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_email?: string | null
          emergency_contact_relationship?: string | null
          intake_completed?: boolean
          created_by?: string | null
          created_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          id?: string
          patient_profile_id?: string | null
          caregiver_profile_id?: string | null
          patient_first_name?: string
          patient_last_name?: string
          patient_preferred_name?: string | null
          patient_date_of_birth?: string | null
          patient_diagnosis_date?: string | null
          patient_dementia_stage?: string | null
          patient_street_address?: string | null
          patient_city?: string | null
          patient_state?: string | null
          patient_zip_code?: string | null
          patient_phone?: string | null
          patient_email?: string | null
          preferred_hospital?: string | null
          doctor_therapist_name?: string | null
          doctor_therapist_phone?: string | null
          caregiver_name?: string | null
          caregiver_relationship?: string | null
          caregiver_phone?: string | null
          medications_and_dosage?: string | null
          emergency_contact_full_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_email?: string | null
          emergency_contact_relationship?: string | null
          intake_completed?: boolean
          created_by?: string | null
          created_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        // REPAIR D: confirmed via 009_patient_intake.sql's own inline
        // `REFERENCES profiles(id)` on all four columns.
        Relationships: [
          {
            foreignKeyName: "patient_intake_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "patient_intake_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: tracked (007_patient_documents_storage.sql).
      patient_document_uploads: {
        Row: {
          id: string
          patient_id: string
          section: 'medical_docs' | 'medical_bills'
          file_name: string
          file_type: string | null
          storage_path: string
          note_text: string | null
          uploaded_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          section: 'medical_docs' | 'medical_bills'
          file_name: string
          file_type?: string | null
          storage_path: string
          note_text?: string | null
          uploaded_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          section?: 'medical_docs' | 'medical_bills'
          file_name?: string
          file_type?: string | null
          storage_path?: string
          note_text?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_document_uploads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/services/mediaService.ts's own insert/select column list (the
      // real backing table for the "Media" feature's uploader/caption/
      // sharing metadata; actual files live in the `patient-media` storage
      // bucket, referenced here only by path in `file_url`).
      media_uploads: {
        Row: {
          id: string
          uploader_id: string
          uploader_name: string
          uploader_role: string
          patient_id: string
          file_url: string
          file_type: 'video' | 'image' | 'audio' | 'document'
          file_name: string
          file_size: number
          caption: string | null
          shared_with: string[] | null
          created_at: string | null
        }
        Insert: {
          id?: string
          uploader_id: string
          uploader_name: string
          uploader_role: string
          patient_id: string
          file_url: string
          file_type: 'video' | 'image' | 'audio' | 'document'
          file_name: string
          file_size: number
          caption?: string | null
          shared_with?: string[] | null
          created_at?: string | null
        }
        Update: {
          id?: string
          uploader_id?: string
          uploader_name?: string
          uploader_role?: string
          patient_id?: string
          file_url?: string
          file_type?: 'video' | 'image' | 'audio' | 'document'
          file_name?: string
          file_size?: number
          caption?: string | null
          shared_with?: string[] | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_uploads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientHome.tsx's own select/insert column list
      // (the "Show Me Home" loved-one-photos feature's metadata; actual
      // files live in the `patient-media` storage bucket).
      patient_loved_one_photos: {
        Row: {
          id: string
          patient_id: string
          name: string
          storage_path: string
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          name: string
          storage_path: string
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          name?: string
          storage_path?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_loved_one_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/components/ShowMeHomeDialog.tsx's own select/insert column
      // list. A DIFFERENT table from `patient_loved_one_photos` above —
      // two separate untracked "home photo"-style features used by two
      // different components.
      patient_home_photos: {
        Row: {
          id: string
          patient_id: string
          label: string
          storage_path: string
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          label: string
          storage_path: string
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          label?: string
          storage_path?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_home_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientRoutine.tsx's own select/insert/update
      // column list ("My Day" custom activities — distinct from the
      // tracked `tasks` table, which this same component also reads/
      // writes for its built-in app tasks).
      patient_routine_items: {
        Row: {
          id: string
          patient_id: string
          title: string
          emoji: string
          time_of_day: string
          scheduled_time: string
          completed: boolean
          completed_date: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          title: string
          emoji: string
          time_of_day: string
          scheduled_time: string
          completed?: boolean
          completed_date?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          title?: string
          emoji?: string
          time_of_day?: string
          scheduled_time?: string
          completed?: boolean
          completed_date?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_routine_items_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientReminders.tsx's own select/insert/update
      // column list (a second, distinct "My Tasks" to-do list on that same
      // page — separate from `patient_calendar_notes` below).
      patient_task_items: {
        Row: {
          id: string
          patient_id: string
          text: string
          period: string
          completed: boolean
          completed_date: string | null
          week_key: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          text: string
          period: string
          completed?: boolean
          completed_date?: string | null
          week_key?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          text?: string
          period?: string
          completed?: boolean
          completed_date?: string | null
          week_key?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_task_items_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: tracked (001_initial_schema.sql + 003_medication_integrity.sql's
      // ADD COLUMN medication_name/undone_at/undone_by and its UNIQUE
      // constraint on (medication_id, date, scheduled_time)).
      medication_logs: {
        Row: {
          id: string
          medication_id: string
          patient_id: string
          medication_name: string | null
          date: string
          scheduled_time: string
          taken_time: string | null
          status: string
          recorded_by: string | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          id?: string
          medication_id: string
          patient_id: string
          medication_name?: string | null
          date: string
          scheduled_time: string
          taken_time?: string | null
          status: string
          recorded_by?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          id?: string
          medication_id?: string
          patient_id?: string
          medication_name?: string | null
          date?: string
          scheduled_time?: string
          taken_time?: string | null
          status?: string
          recorded_by?: string | null
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientReminders.tsx's own select/insert/update
      // column list ("My Day" calendar notes — this component's own
      // defensive `if (error) return` comment already documents the
      // table may not exist in a given environment).
      patient_calendar_notes: {
        Row: {
          id: string
          patient_id: string
          date: string
          text: string
          type: string
        }
        Insert: {
          id?: string
          patient_id: string
          date: string
          text: string
          type: string
        }
        Update: {
          id?: string
          patient_id?: string
          date?: string
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_calendar_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration (016_free_tier_entitlement_
      // backend_enforcement.sql's own note already flags this) — shape
      // confirmed via src/pages/patient/CarePartnerCheckin.tsx's own
      // insert column list and its CheckInData interface's field types.
      care_partner_checkins: {
        Row: {
          id: string
          patient_id: string
          submitted_by: string
          submitted_by_name: string
          check_in_date: string
          fn_dressing: string
          fn_bathing: string
          fn_toileting: string
          fn_transfers: string
          fn_mobility: string
          fn_medication: string
          fn_comments: string
          nu_appetite: string
          nu_meal_pct: string
          nu_fluids: string
          nu_swallowing: string
          nu_comments: string
          co_urinary: string
          co_bowel: string
          co_skin: string
          co_comments: string
          sa_falls: string
          sa_injury_details: string
          sa_wandering: string
          sa_safety_concerns: boolean
          sa_safety_checklist: string[]
          sa_comments: string
          be_behaviors: string[]
          be_trigger: string
          be_comments: string
          be_agitation: string
          be_wandering_risk: string
          be_responsiveness: string
          be_hallucinations: string
          mo_mood: string
          mo_social: string
          mo_sleep: string
          mo_comments: string
          sy_symptoms: string[]
          sy_severity: string
          sy_other: string
          sy_comments: string
          sy_pain: string
          sy_respiratory: string
          sy_gi: string
          sy_neurological: string
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          submitted_by: string
          submitted_by_name: string
          check_in_date: string
          fn_dressing?: string
          fn_bathing?: string
          fn_toileting?: string
          fn_transfers?: string
          fn_mobility?: string
          fn_medication?: string
          fn_comments?: string
          nu_appetite?: string
          nu_meal_pct?: string
          nu_fluids?: string
          nu_swallowing?: string
          nu_comments?: string
          co_urinary?: string
          co_bowel?: string
          co_skin?: string
          co_comments?: string
          sa_falls?: string
          sa_injury_details?: string
          sa_wandering?: string
          sa_safety_concerns?: boolean
          sa_safety_checklist?: string[]
          sa_comments?: string
          be_behaviors?: string[]
          be_trigger?: string
          be_comments?: string
          be_agitation?: string
          be_wandering_risk?: string
          be_responsiveness?: string
          be_hallucinations?: string
          mo_mood?: string
          mo_social?: string
          mo_sleep?: string
          mo_comments?: string
          sy_symptoms?: string[]
          sy_severity?: string
          sy_other?: string
          sy_comments?: string
          sy_pain?: string
          sy_respiratory?: string
          sy_gi?: string
          sy_neurological?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          submitted_by?: string
          submitted_by_name?: string
          check_in_date?: string
          fn_dressing?: string
          fn_bathing?: string
          fn_toileting?: string
          fn_transfers?: string
          fn_mobility?: string
          fn_medication?: string
          fn_comments?: string
          nu_appetite?: string
          nu_meal_pct?: string
          nu_fluids?: string
          nu_swallowing?: string
          nu_comments?: string
          co_urinary?: string
          co_bowel?: string
          co_skin?: string
          co_comments?: string
          sa_falls?: string
          sa_injury_details?: string
          sa_wandering?: string
          sa_safety_concerns?: boolean
          sa_safety_checklist?: string[]
          sa_comments?: string
          be_behaviors?: string[]
          be_trigger?: string
          be_comments?: string
          be_agitation?: string
          be_wandering_risk?: string
          be_responsiveness?: string
          be_hallucinations?: string
          mo_mood?: string
          mo_social?: string
          mo_sleep?: string
          mo_comments?: string
          sy_symptoms?: string[]
          sy_severity?: string
          sy_other?: string
          sy_comments?: string
          sy_pain?: string
          sy_respiratory?: string
          sy_gi?: string
          sy_neurological?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_partner_checkins_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // OWNER-MANUAL-TEST-CORRECTIONS item 5 / supabase/migrations/031_....sql
      // — free-text notes for all 7 Care Partner categories (A–G),
      // accessible to every tier. One current row per (patient_id,
      // category) — see carePartnerNotesService.ts.
      care_partner_notes: {
        Row: {
          id: string
          patient_id: string
          category: string
          note: string
          updated_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          category: string
          note?: string
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          category?: string
          note?: string
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_partner_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientDocuments.tsx's own `LogRow` type and
      // select column list (a THIRD, distinct care-partner-related table
      // from `care_partner_checkins`/`patient_care_partners` above — this
      // one backs the "Care Partner Logs" history view on the Documents
      // page specifically).
      care_partner_logs: {
        Row: {
          id: string
          patient_id: string
          report_date: string
          submitted_at: string
          mood: string | null
          meals: string | null
          hydration: string | null
          medications: string | null
          mobility: string | null
          exercise: string | null
          sleep_quality: string | null
          pain_level: number | null
          notes: string | null
          answers: Json | null
        }
        Insert: {
          id?: string
          patient_id: string
          report_date: string
          submitted_at?: string
          mood?: string | null
          meals?: string | null
          hydration?: string | null
          medications?: string | null
          mobility?: string | null
          exercise?: string | null
          sleep_quality?: string | null
          pain_level?: number | null
          notes?: string | null
          answers?: Json | null
        }
        Update: {
          id?: string
          patient_id?: string
          report_date?: string
          submitted_at?: string
          mood?: string | null
          meals?: string | null
          hydration?: string | null
          medications?: string | null
          mobility?: string | null
          exercise?: string | null
          sleep_quality?: string | null
          pain_level?: number | null
          notes?: string | null
          answers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "care_partner_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/admin/AdminAudit.tsx's own select/interface (a live,
      // rendered admin screen — AdminLayout.tsx imports AdminAudit).
      audit_logs: {
        Row: {
          id: string
          created_at: string
          user_id: string | null
          user_email: string | null
          user_role: string | null
          action: string
          resource_type: string | null
          resource_id: string | null
          before_state: Json | null
          after_state: Json | null
          ip_address: string | null
          severity: 'info' | 'warning' | 'critical'
          details: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          before_state?: Json | null
          after_state?: Json | null
          ip_address?: string | null
          severity?: 'info' | 'warning' | 'critical'
          details?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          action?: string
          resource_type?: string | null
          resource_id?: string | null
          before_state?: Json | null
          after_state?: Json | null
          ip_address?: string | null
          severity?: 'info' | 'warning' | 'critical'
          details?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/components/Hipaacompliancepage.tsx's own `ComplianceRecord`
      // interface. No confirmed import/render call anywhere in this
      // codebase (see the completion report) — typed anyway since it is
      // real, evidence-based application code, not invented.
      compliance_records: {
        Row: {
          id: string
          record_type: string
          status: string
          signed_at: string | null
          signed_by: string | null
          expires_at: string | null
          notes: string | null
          organization_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          record_type: string
          status?: string
          signed_at?: string | null
          signed_by?: string | null
          expires_at?: string | null
          notes?: string | null
          organization_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          record_type?: string
          status?: string
          signed_at?: string | null
          signed_by?: string | null
          expires_at?: string | null
          notes?: string | null
          organization_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientEmergencyContacts.tsx's own select/
      // upsert column list (the "Care Partner" info panel on that page —
      // distinct from the `care_partner_checkins` table above).
      patient_care_partners: {
        Row: {
          patient_id: string
          full_name: string
          email: string | null
          phone: string | null
          relationship: string | null
          education_level: string | null
          medical_experience: string | null
          employment_relevant: string | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          patient_id: string
          full_name: string
          email?: string | null
          phone?: string | null
          relationship?: string | null
          education_level?: string | null
          medical_experience?: string | null
          employment_relevant?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          patient_id?: string
          full_name?: string
          email?: string | null
          phone?: string | null
          relationship?: string | null
          education_level?: string | null
          medical_experience?: string | null
          employment_relevant?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_partners_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // PHASE 3: NOT in any tracked migration — shape confirmed via
      // src/pages/patient/PatientEmergencyContacts.tsx's own insert/
      // update column list (the "Emergency Contacts" list on that page —
      // one patient may have several).
      patient_emergency_contacts: {
        Row: {
          id: string
          patient_id: string
          full_name: string
          email: string | null
          phone: string | null
          relationship: string | null
          address: string | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          full_name: string
          email?: string | null
          phone?: string | null
          relationship?: string | null
          address?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          full_name?: string
          email?: string | null
          phone?: string | null
          relationship?: string | null
          address?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_emergency_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // MYMEMORIA ALLY caregiver self-service patient registration —
      // migration 030. Zero client-facing RLS policy (RLS enabled, no
      // policy = fail closed); every access goes through the two
      // SECURITY DEFINER RPCs below. Never selected directly by any
      // tracked application code — present here only so `supabase.rpc()`
      // return types (which reference this table's Row shape) type-check.
      pending_caregiver_registrations: {
        Row: {
          id: string
          caregiver_id: string
          claim_token: string
          patient_first_name: string
          patient_last_name: string
          patient_email: string
          patient_preferred_name: string | null
          patient_date_of_birth: string | null
          patient_diagnosis_date: string | null
          patient_dementia_stage: string | null
          patient_location: string | null
          patient_address: string | null
          emergency_contact_name: string | null
          emergency_contact_relationship: string | null
          emergency_contact_phone: string | null
          emergency_contact_email: string | null
          relationship_type: string
          created_at: string
          consumed_at: string | null
          patient_id: string | null
          provisioned_auth_user_id: string | null
          deletion_locked_at: string | null
          deletion_operation_id: string | null
          deletion_destructive_authorized_at: string | null
          deletion_outcome: string | null
        }
        Insert: {
          id?: string
          caregiver_id: string
          claim_token?: string
          patient_first_name: string
          patient_last_name: string
          patient_email: string
          patient_preferred_name?: string | null
          patient_date_of_birth?: string | null
          patient_diagnosis_date?: string | null
          patient_dementia_stage?: string | null
          patient_location?: string | null
          patient_address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_email?: string | null
          relationship_type?: string
          created_at?: string
          consumed_at?: string | null
          patient_id?: string | null
          provisioned_auth_user_id?: string | null
          deletion_locked_at?: string | null
          deletion_operation_id?: string | null
          deletion_destructive_authorized_at?: string | null
          deletion_outcome?: string | null
        }
        Update: {
          id?: string
          caregiver_id?: string
          claim_token?: string
          patient_first_name?: string
          patient_last_name?: string
          patient_email?: string
          patient_preferred_name?: string | null
          patient_date_of_birth?: string | null
          patient_diagnosis_date?: string | null
          patient_dementia_stage?: string | null
          patient_location?: string | null
          patient_address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_email?: string | null
          relationship_type?: string
          created_at?: string
          consumed_at?: string | null
          patient_id?: string | null
          provisioned_auth_user_id?: string | null
          deletion_locked_at?: string | null
          deletion_operation_id?: string | null
          deletion_destructive_authorized_at?: string | null
          deletion_outcome?: string | null
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
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      // CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 — migration 051.
      pending_therapist_connections: {
        Row: {
          id: string
          patient_id: string
          caregiver_id: string
          therapist_id: string
          relationship_type: string
          status: string
          created_at: string
          responded_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          caregiver_id: string
          therapist_id: string
          relationship_type?: string
          status?: string
          created_at?: string
          responded_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          caregiver_id?: string
          therapist_id?: string
          relationship_type?: string
          status?: string
          created_at?: string
          responded_at?: string | null
        }
        Relationships: [
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
    }
    // NOTE: both views below are proposed for removal by
    // 014_caregiver_relationship_authorization_and_view_hardening.sql
    // (SEC-001 — they bypass caller-level RLS, see that file for the full
    // finding). That migration is still an unexecuted draft, so the real,
    // currently-live database is believed to still have both views as
    // described here; this types file describes the REAL schema as it
    // stands today, not a schema some other unexecuted proposal assumes.
    // Views don't carry their own FK constraints (only the underlying
    // tables they SELECT from do) — `Relationships: []` is accurate for a
    // view regardless, not merely a placeholder.
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
        Relationships: []
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
        Relationships: []
      }
    }
    Functions: {
      has_patient_access: { Args: { p_patient_id: string }; Returns: boolean }
      is_professional_staff_for_patient: {
        Args: { p_patient_id: string }
        Returns: boolean
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
      get_my_org_supervisor: {
        Args: { p_org_id: string }
        Returns: {
          first_name: string
          last_name: string
          member_user_id: string
        }[]
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
      file_incident_report: {
        Args: {
          p_description: string
          p_incident_type: string
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
      // RELEASE-BLOCKER-CLOSURE PHASE 1: corrected to match the actual
      // function (024_release_blocker_closure_phase_a.sql) — parameterless,
      // checks auth.uid() internally. It is an RLS-internal helper (used
      // only inside USING clauses on `profiles`), never called via
      // supabase.rpc() from any client code (confirmed: zero call sites) —
      // a parameterized "check an arbitrary given user" signature was never
      // actually implemented or used anywhere.
      is_admin: {
        Args: Record<PropertyKey, never>
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
      // CORRECTIVE-002 / CORRECTION D: trusted SECURITY DEFINER RPCs added
      // across 012/013/014 (migrations in supabase/migrations/, all still
      // unexecuted drafts) had no entry here, so every supabase.rpc(...)
      // call site using them typed its second argument as `undefined` —
      // a real TypeScript diagnostic (TS2345), not a false positive, since
      // nothing here described their actual argument shape. Declared below
      // so those call sites type-check against the RPCs' real signatures
      // instead of silently falling back to `undefined`.
      //
      // STALE NOTE, CORRECTED (REPAIR 008 / REPAIR D): this comment
      // previously recorded that every `supabase.rpc(...)` call still
      // failed with "not assignable to parameter of type 'undefined'"
      // because none of this file's Tables entries carried a
      // `Relationships` field. That has since been fixed — every Tables
      // entry below now has one (`subscriptions` included, added in this
      // same repair) — and re-running `tsc --noEmit` confirms that
      // specific error no longer reproduces anywhere in the project.
      // Left as a historical note rather than deleted outright: if this
      // error class reappears after a future schema change, the
      // `GenericSchema`/`Relationships` constraint above is exactly where
      // to look first.
      admin_set_role: {
        Args: { p_user_id: string; p_role: string }
        Returns: void
      }
      admin_set_subscription: {
        // REPAIR 006: `p_plan` added (migration 017) — required (non-null)
        // whenever p_tier='paid_tier', must be null otherwise.
        // REPAIR 007: `p_program` added (migration 018) — only valid when
        // p_tier='free_tier'; when set, the RPC computes trial_ends_at
        // itself (p_trial_ends_at is ignored for a program assignment).
        Args: {
          p_user_id: string
          p_tier: string
          p_plan: string | null
          p_program: string | null
          p_status: string
          p_trial_started_at: string | null
          p_trial_ends_at: string | null
          p_promo_expires_at: string | null
        }
        Returns: SubscriptionRow
      }
      provision_free_subscription: {
        Args: Record<PropertyKey, never>
        Returns: SubscriptionRow
      }
      redeem_promo_code: {
        Args: { p_code: string }
        Returns: SubscriptionRow
      }
      create_patient_with_caregiver: {
        Args: {
          p_patient_id: string
          p_preferred_name?: string | null
          p_date_of_birth?: string | null
          p_diagnosis_date?: string | null
          p_dementia_stage?: string | null
          p_location?: string | null
          p_address?: string | null
          p_affirmation?: string | null
          p_emergency_contact_name?: string | null
          p_emergency_contact_relationship?: string | null
          p_emergency_contact_phone?: string | null
          p_emergency_contact_email?: string | null
          p_relationship_type?: string
        }
        Returns: Database['public']['Tables']['patients']['Row']
      }
      // MYMEMORIA ALLY caregiver self-service patient registration
      // (migration 030) — step 1, server-generates the claim token.
      // Caller must already be an authenticated role='caregiver' account.
      caregiver_initiate_patient_registration: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_email: string
          p_preferred_name?: string | null
          p_date_of_birth?: string | null
          p_diagnosis_date?: string | null
          p_dementia_stage?: string | null
          p_location?: string | null
          p_address?: string | null
          p_emergency_contact_name?: string | null
          p_emergency_contact_relationship?: string | null
          p_emergency_contact_phone?: string | null
          p_emergency_contact_email?: string | null
          p_relationship_type?: string
        }
        Returns: Database['public']['Tables']['pending_caregiver_registrations']['Row']
      }
      // Step 2 — consumes the token, creates patients + caregiver_patients
      // atomically, idempotent on retry. See migration 030's own comment
      // block for the full security rationale (server-generated token,
      // never routed through Auth user_metadata).
      caregiver_claim_new_patient: {
        Args: {
          p_registration_id: string
          p_claim_token: string
          p_patient_id: string
        }
        Returns: Database['public']['Tables']['patients']['Row']
      }
      // CAREGIVER DASHBOARD-FIRST NAVIGATION item 5 / migration 033: the
      // caller's own unconsumed pending_caregiver_registrations rows,
      // scoped by auth.uid() server-side — never a caller-supplied
      // caregiver id. resumable_patient_id is non-null only when the
      // patient's Auth account was actually created and is still
      // provisioning_status='profile_created'.
      get_my_pending_registrations: {
        Args: Record<PropertyKey, never>
        Returns: {
          registration_id: string
          claim_token: string
          patient_first_name: string
          patient_last_name: string
          patient_email: string
          created_at: string
          resumable_patient_id: string | null
        }[]
      }
      // ENTERPRISE CONSOLIDATED DELIVERY / migration 034: the "Delete"
      // action for an incomplete registration — only ever deletes the
      // caller's own unconsumed row.
      cancel_my_pending_registration: {
        Args: { p_registration_id: string }
        Returns: boolean
      }
      // ENTERPRISE CONSOLIDATED DELIVERY / migration 035 — see that
      // file's own header comment for the full design rationale.
      is_active_org_director: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      is_active_org_member: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      create_organization: {
        Args: { p_name: string; p_package_type: string }
        Returns: Database['public']['Tables']['organizations']['Row']
      }
      org_configure_license: {
        Args: {
          p_org_id: string
          p_licensed_seats: number | null
          p_covered_patient_capacity: number | null
          p_annual_license_fee: number | null
        }
        Returns: Database['public']['Tables']['organization_licenses']['Row']
      }
      invite_org_member: {
        Args: { p_org_id: string; p_email: string; p_org_role: string }
        Returns: Database['public']['Tables']['organization_memberships']['Row']
      }
      respond_to_org_invite: {
        Args: { p_membership_id: string; p_accept: boolean }
        Returns: Database['public']['Tables']['organization_memberships']['Row']
      }
      remove_org_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      cover_patient: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: Database['public']['Tables']['covered_patient_memberships']['Row']
      }
      cover_patient_via_staff_registration: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: Database['public']['Tables']['covered_patient_memberships']['Row']
      }
      end_patient_coverage: {
        Args: { p_org_id: string; p_patient_id: string }
        Returns: boolean
      }
      assign_staff_to_patient: {
        Args: { p_org_id: string; p_user_id: string; p_patient_id: string; p_org_role: string }
        Returns: Database['public']['Tables']['staff_patient_assignments']['Row']
      }
      unassign_staff_from_patient: {
        Args: { p_org_id: string; p_user_id: string; p_patient_id: string }
        Returns: boolean
      }
      get_my_organizations: {
        Args: Record<PropertyKey, never>
        Returns: {
          organization_id: string
          organization_name: string
          package_type: string
          org_role: string
        }[]
      }
      get_my_pending_org_invites: {
        Args: Record<PropertyKey, never>
        Returns: {
          membership_id: string
          organization_id: string
          organization_name: string
          org_role: string
          created_at: string
        }[]
      }
      get_my_staff_patients: {
        Args: Record<PropertyKey, never>
        Returns: {
          organization_id: string
          organization_name: string
          patient_id: string
          first_name: string
          last_name: string
          preferred_name: string | null
          org_role: string
        }[]
      }
      is_my_enterprise_coverage_active: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      // ENTERPRISE CONSOLIDATED DELIVERY / migration 036 — Care
      // Communications. See that file's own header comment for the full
      // design rationale.
      is_authorized_for_patient: {
        Args: { p_user_id: string; p_patient_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      create_conversation: {
        Args: { p_patient_id: string; p_recipient_user_ids: string[]; p_subject: string | null }
        Returns: ConversationRow
      }
      add_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: ConversationParticipantRow
      }
      remove_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      send_message: {
        Args: { p_conversation_id: string; p_body: string; p_is_urgent: boolean; p_reply_to_message_id: string | null; p_message_type?: string }
        Returns: MessageRow
      }
      mark_message_read: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      acknowledge_message: {
        Args: { p_message_id: string; p_follow_up_requested: boolean | null; p_follow_up_note: string | null }
        Returns: MessageAcknowledgmentRow
      }
      resolve_follow_up: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      get_my_conversations: {
        Args: { p_patient_id: string | null }
        Returns: {
          conversation_id: string
          patient_id: string
          patient_name: string
          subject: string | null
          created_by: string
          created_at: string
          updated_at: string
          last_message_body: string | null
          last_message_at: string | null
          last_message_urgent: boolean | null
          unread_count: number
        }[]
      }
      // migration 037
      get_patient_care_circle: {
        Args: { p_patient_id: string }
        Returns: {
          user_id: string
          first_name: string
          last_name: string
          participant_role: string
        }[]
      }
      // FINAL INTEGRATION CORRECTIONS — migrations 039/041/044.
      admin_set_organization_license_status: {
        Args: { p_org_id: string; p_status: string }
        Returns: OrganizationLicenseRow
      }
      get_org_staff_patient_assignments: {
        Args: { p_org_id: string }
        Returns: {
          user_id: string
          first_name: string
          last_name: string
          patient_id: string
          patient_first_name: string
          patient_last_name: string
          patient_preferred_name: string | null
          org_role: string
          is_active: boolean
        }[]
      }
      get_org_communications_overview: {
        Args: { p_org_id: string }
        Returns: {
          active_conversations: number
          patients_with_conversations: number
          unresolved_follow_ups: number
        }[]
      }
      is_therapist_for_patient: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      is_medical_professional_for_patient: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      // CRITICAL OWNER-REPORTED REMEDIATION Correction C — migration 045.
      self_heal_my_profile: {
        Args: Record<PropertyKey, never>
        Returns: ProfileRow
      }
      // CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 — migration 051.
      caregiver_invite_therapist: {
        Args: { p_patient_id: string; p_therapist_email: string; p_relationship_type: string }
        Returns: PendingTherapistConnectionRow
      }
      respond_to_therapist_invite: {
        Args: { p_connection_id: string; p_accept: boolean }
        Returns: PendingTherapistConnectionRow
      }
      get_my_pending_therapist_invites: {
        Args: Record<PropertyKey, never>
        Returns: {
          connection_id: string
          patient_id: string
          patient_first_name: string
          patient_last_name: string
          patient_preferred_name: string | null
          caregiver_first_name: string
          caregiver_last_name: string
          relationship_type: string
          created_at: string
        }[]
      }
      get_patient_care_team_connections: {
        Args: { p_patient_id: string }
        Returns: {
          source: string
          connection_id: string
          therapist_id: string
          first_name: string
          last_name: string
          relationship_type: string
          status: string
          created_at: string
        }[]
      }
      revoke_therapist_connection: {
        Args: { p_patient_id: string; p_therapist_id: string }
        Returns: boolean
      }
      // CODEX-VERIFIED CRITICAL REMEDIATION Critical 1 — migration 049.
      caregiver_begin_registration_deletion: {
        Args: { p_registration_id: string }
        Returns: PendingCaregiverRegistrationRow
      }
      // S2 — migration 055 adds a fencing operation id, required exactly
      // by finish/cancel so a delayed call from a superseded begin can
      // never act on a newer one.
      caregiver_finish_registration_deletion: {
        Args: { p_registration_id: string; p_operation_id: string }
        Returns: boolean
      }
      caregiver_cancel_registration_deletion_lock: {
        Args: { p_registration_id: string; p_operation_id: string }
        Returns: boolean
      }
      // DEL-01/DEL-02 — migration 061. The point-of-no-return before any
      // external Auth deletion call; once committed, cancel/begin-again
      // are both permanently refused for this operation.
      caregiver_authorize_destructive_deletion: {
        Args: { p_registration_id: string; p_operation_id: string }
        Returns: PendingCaregiverRegistrationRow
      }
      // Records the real, resolved external outcome — the only thing
      // that can ever make caregiver_finish_registration_deletion
      // succeed.
      caregiver_record_deletion_outcome: {
        Args: { p_registration_id: string; p_operation_id: string; p_outcome: string }
        Returns: PendingCaregiverRegistrationRow
      }
      // Admin-only reconciliation for a registration whose deletion
      // outcome is 'requires_manual_review'. p_confirmed_deleted=true
      // completes the cleanup; false restores the registration to a
      // normal, claimable state.
      admin_reconcile_stuck_registration_deletion: {
        Args: { p_registration_id: string; p_confirmed_deleted: boolean }
        Returns: PendingCaregiverRegistrationRow
      }
      // CRITICAL OWNER-REPORTED REMEDIATION Correction A — migration 046.
      get_my_pending_registration_detail: {
        Args: { p_registration_id: string }
        Returns: PendingCaregiverRegistrationRow
      }
      // CRITICAL OWNER-REPORTED REMEDIATION Correction F — migration 048.
      record_help_activation: {
        Args: { p_phone_dialed: string | null }
        Returns: HelpActivationRow
      }
      get_patient_help_activation_history: {
        Args: { p_patient_id: string }
        Returns: {
          id: string
          created_at: string
          phone_dialed: string | null
          caregiver_count_at_time: number
          conversation_id: string | null
          notification_status: string
          acknowledged_count: number
          acknowledged_by: string[] | null
        }[]
      }
      is_patient_enterprise_covered: {
        Args: { p_patient_id: string }
        Returns: boolean
      }
      get_my_therapist_patients: {
        Args: Record<PropertyKey, never>
        Returns: {
          patient_id: string
          first_name: string
          last_name: string
          preferred_name: string | null
          relationship_type: string
        }[]
      }
      caregiver_update_pending_registration: {
        Args: {
          p_registration_id: string
          p_first_name: string
          p_last_name: string
          p_email: string
          p_preferred_name: string | null
          p_date_of_birth: string | null
          p_diagnosis_date: string | null
          p_dementia_stage: string | null
          p_location: string | null
          p_address: string | null
          p_emergency_contact_name: string | null
          p_emergency_contact_relationship: string | null
          p_emergency_contact_phone: string | null
          p_emergency_contact_email: string | null
          p_relationship_type: string
        }
        Returns: PendingCaregiverRegistrationRow
      }
      // REPAIR 007: trusted, server-`now()`-computed Temporary/Companion
      // program eligibility check (migration 018). Takes no arguments —
      // reads the caller's OWN subscriptions row via auth.uid() only.
      is_my_program_active: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: trusted,
      // server-`now()`-computed 14-day residential trial eligibility check
      // (migration 032). Same no-argument, caller's-own-row shape as
      // is_my_program_active above.
      is_my_trial_active: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      // PHASE 3: F05 (003_medication_integrity.sql); REPAIR 008 / migration
      // 019 adds an internal temp_user/expired-Companion guard with no
      // signature change — confirmed real call site:
      // src/pages/patient/PatientMedications.tsx's undoLog().
      undo_medication_dose: {
        Args: {
          p_medication_id: string
          p_date: string
          p_scheduled_time: string
        }
        Returns: void
      }
      caller_is_temp_user_program: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      caller_is_expired_companion: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
