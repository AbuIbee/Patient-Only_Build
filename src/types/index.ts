// My Memoria Ally - Patient + Admin + Caregiver Types

export type UserRole = 'patient' | 'admin' | 'caregiver';

export interface User {
  id: string;
  email?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
  mfaEnabled?: boolean;

  app_metadata?: {
    provider?: string;
    [key: string]: unknown;
  };
  user_metadata?: {
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    phone?: string;
    [key: string]: unknown;
  };
}

// ---------------- PATIENT CORE ----------------

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface FamiliarFace {
  id: string;
  name: string;
  relationship: string;
  photoUrl?: string;
  phone?: string;
}

export interface PatientPreferences {
  language: string;
  fontSize: 'normal' | 'large' | 'extra-large';
  highContrast: boolean;
  audioEnabled: boolean;
  notificationsEnabled: boolean;
  tone: 'gentle' | 'professional' | 'friendly';
  firstSessionDone?: boolean;
}

export interface Patient {
  id: string;
  userId: string;
  email?: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  photoUrl?: string;
  // PHASE 3 (MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009): the five fields
  // below are already set by both real `SET_PATIENT` dispatch sites
  // (src/pages/patient/PatientLayout.tsx's own real-data branch,
  // src/services/patientService.ts's buildPatient()) without ever being
  // declared here — confirmed real, existing usage, not new fields
  // invented for this fix.
  phone?: string;
  dateOfBirth?: string;
  diagnosisDate?: string;
  dementiaStage?: 'early' | 'middle' | 'late';
  address?: string;
  location: string;
  affirmation: string;
  emergencyContact: EmergencyContact;
  familiarFaces: FamiliarFace[];
  preferences: PatientPreferences;
  createdAt: string;
  updatedAt: string;
}

// ---------------- TASKS ----------------

export interface Task {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  icon: string;
  // PHASE 3 (MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009): the five fields
  // below were already being mapped into every dispatched Task
  // (src/pages/patient/PatientLayout.tsx's own `SET_TASKS` payload) and
  // read back out (src/pages/patient/PatientRoutine.tsx's `task.timeOfDay`)
  // without ever being declared here — confirmed real, existing usage,
  // not new fields invented for this fix.
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  daysOfWeek?: number[];
  completedAt?: string | null;
  isRecurring?: boolean;
  difficulty?: 'early' | 'middle' | 'late' | null;
  scheduledTime: string;
  // ROUND 6: 'not_applicable' added (migration 071) alongside the
  // Enterprise caregiver dashboard's task-status options — a task a
  // caregiver marked not applicable is a real possible value flowing
  // through this same shared `tasks` table/query path into the
  // patient's own view; widened here so that value is representable
  // rather than silently mistyped.
  status: 'pending' | 'completed' | 'skipped' | 'not_applicable';
  isActive: boolean;
}

// ---------------- MEDICATION ----------------

export interface MedicationSchedule {
  id: string;
  time: string;
  daysOfWeek: number[];
}

export interface Medication {
  id: string;
  patientId: string;
  name: string;
  dosage: string;
  form: 'pill' | 'liquid' | 'injection' | 'patch' | 'inhaler';
  instructions: string;
  schedule: MedicationSchedule[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  patientId: string;
  scheduledTime: string;
  takenTime?: string;
  status: 'taken' | 'missed' | 'pending' | 'skipped';
  date: string;
}

// ---------------- MOOD ----------------

export type MoodType =
  | 'happy'
  | 'calm'
  | 'sad'
  | 'angry'
  | 'confused'
  | 'worried'
  | 'anxious'
  | 'scared';

export interface MoodEntry {
  id: string;
  patientId: string;
  mood: MoodType;
  intensity: number;
  note?: string;
  // RELEASE-BLOCKER-CLOSURE PHASE 1: real, confirmed DB columns
  // (mood_entries.triggers/time_of_day/recorded_by, src/types/supabase.ts)
  // read and dispatched by PatientMoodTracker.tsx but never declared here.
  triggers?: string[];
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  recordedBy?: string;
  timestamp: string;
}

// ---------------- MEMORY ----------------

export interface Memory {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  photoUrl?: string;
  date?: string;
  isFavorite: boolean;
  createdAt: string;
}

// ---------------- DOCUMENTS ----------------

export interface Document {
  id: string;
  patientId: string;
  title: string;
  fileUrl: string;
  fileType: string;
  createdAt: string;
}

// ---------------- REMINDERS ----------------

export interface Reminder {
  id: string;
  patientId: string;
  title: string;
  message: string;
  type: 'medication' | 'appointment' | 'task' | 'custom';
  time: string;
  daysOfWeek?: number[];  // 0=Sun..6=Sat, JS Date.getDay() convention; empty/undefined = every day
  isActive: boolean;
  sound?: string;
  vibrate?: boolean;
  createdAt: string;
  createdBy?: string;
}

// ---------------- PATIENT DATA AGGREGATE ----------------
// PHASE 3 (MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009): this type was never
// exported from this module at all, even though
// src/services/patientService.ts's getCaregiverPatients()/
// getTherapistPatients()/getPatientById()/loadPatientData() all declare a
// return type of `PatientData`/`PatientData[]`. Confirmed via
// `grep -rn "getCaregiverPatients\|getTherapistPatients\|getPatientById"
// src/` that none of those three exported functions has any caller
// anywhere in this codebase — this is leftover multi-patient caregiver/
// therapist-dashboard scaffolding from this project's earlier, broader
// "CareCompanion" scope (001_initial_schema.sql's own header) that
// predates the current patient-only product (CLAUDE.md). It is not wired
// to any UI and this file does not wire it up — only gives its actual,
// as-built return shape a name, so the module compiles. Several fields
// below (`medicationLogs`, `behaviorLogs`, `documents`, `reminders`,
// `vitalSigns`, `sleepEntries`, `goals`, `alerts`, `safetyAlerts`,
// `adlAssessments`, `nutritionLogs`) are hardcoded to an empty array by
// every confirmed construction site with no real element ever added to
// any of them anywhere in this codebase — `unknown[]` for those is an
// honest description of "always empty, no confirmed real shape," not a
// guess at a business meaning this engagement has no evidence for.
export interface DashboardStats {
  patientId: string;
  tasksCompleted: number;
  tasksTotal: number;
  tasksCompletionRate: number;
  medicationsTaken: number;
  medicationsTotal: number;
  medicationsAdherenceRate: number;
  moodToday?: string;
  moodTrend: string;
  sleepHours: number;
  sleepQuality: string;
  activitiesCompleted: number;
  behaviorIncidents: number;
  alerts: unknown[];
}

export interface PatientAppointment {
  id: string;
  patientId: string;
  title: string;
  provider: string;
  location?: string;
  date: string;
  time: string;
  notes?: string;
  reminderSet?: boolean;
  createdAt: string;
}

export interface PatientCareTeamMember {
  id: string;
  patientId: string;
  name: string;
  role: string;
  specialty?: string;
  organization?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface PatientNoteRecord {
  id: string;
  patientId: string;
  caregiverId?: string;
  caregiverName: string;
  note: string;
  noteType: string;
  createdAt: string;
}

export interface PatientData {
  patient: Patient;
  tasks: Task[];
  medications: Medication[];
  medicationLogs: unknown[];
  moodEntries: MoodEntry[];
  behaviorLogs: unknown[];
  memories: Memory[];
  documents: unknown[];
  careTeam: PatientCareTeamMember[];
  reminders: unknown[];
  vitalSigns: unknown[];
  sleepEntries: unknown[];
  appointments: PatientAppointment[];
  goals: unknown[];
  dashboardStats: DashboardStats;
  alerts: unknown[];
  safetyAlerts: unknown[];
  adlAssessments: unknown[];
  nutritionLogs: unknown[];
  notes: PatientNoteRecord[];
}

// ---------------- APP STATE ----------------

export interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  selectedRole: UserRole | null;

  patient: Patient | null;
  tasks: Task[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  moodEntries: MoodEntry[];
  memories: Memory[];
  documents: Document[];
  reminders: Reminder[];

  isLoading: boolean;
  error: string | null;
  currentView: string;
  sidebarOpen: boolean;
}