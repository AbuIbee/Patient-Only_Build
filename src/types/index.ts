// CareCompanion - Comprehensive Type Definitions

export type UserRole = 'patient' | 'caregiver' | 'therapist' | 'admin' | 'pending';

export interface User {
  id: string;
  email?: string;
  role?: UserRole;  // Make optional
  firstName?: string;  // Make optional
  lastName?: string;   // Make optional
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
  
  // Supabase fields (keep these for compatibility)
  app_metadata?: {
    provider?: string;
    [key: string]: any;
  };
  user_metadata?: {
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    phone?: string;
    [key: string]: any;
  };
  aud?: string;
  created_at?: string;
  confirmed_at?: string;
  last_sign_in_at?: string;
  updated_at?: string;
}

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
}

export interface Patient {
  id: string;
  userId: string;
  email?: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth?: string;
  photoUrl?: string;
  location: string;
  address?: string;
  affirmation: string;
  emergencyContact: EmergencyContact;
  familiarFaces: FamiliarFace[];
  diagnosisDate?: string;
  dementiaStage?: 'early' | 'middle' | 'late';
  preferences: PatientPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  icon: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  scheduledTime: string;
  daysOfWeek: number[];
  status: 'pending' | 'completed' | 'skipped';
  completedAt?: string;
  isRecurring: boolean;
  difficulty: 'early' | 'middle' | 'late';
  isActive: boolean;
}

export interface MedicationSchedule {
  id: string;
  time: string;
  daysOfWeek: number[];
}

export interface Medication {
  id: string;
  patientId: string;
  name: string;
  genericName?: string;
  dosage: string;
  form: 'pill' | 'liquid' | 'injection' | 'patch' | 'inhaler';
  instructions: string;
  prescribedBy: string;
  prescriptionDate?: string;
  sideEffects: string[];
  schedule: MedicationSchedule[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  patientId: string;
  medicationName: string;
  scheduledTime: string;
  takenTime?: string;
  status: 'taken' | 'missed' | 'pending' | 'skipped';
  notes?: string;
  recordedBy: string;
  date: string;
}

export type MoodType = 'happy' | 'calm' | 'sad' | 'anxious' | 'angry' | 'confused' | 'scared' | 'worried';

export interface MoodEntry {
  id: string;
  patientId: string;
  mood: MoodType;
  intensity: number;
  note?: string;
  triggers?: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  timestamp: string;
  recordedBy: string;
}

export interface BehaviorLog {
  id: string;
  patientId: string;
  behavior: string;
  description: string;
  severity: 'mild' | 'moderate' | 'severe';
  triggers?: string[];
  interventions?: string[];
  outcome?: string;
  duration?: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  timestamp: string;
  recordedBy: string;
}

export interface Memory {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  photoUrl?: string;
  audioUrl?: string;
  date?: string;
  location?: string;
  people?: string[];
  category: 'photo' | 'audio' | 'video' | 'story';
  tags?: string[];
  isFavorite: boolean;
  createdAt: string;
  createdBy: string;
}

export interface Document {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: 'medical' | 'legal' | 'insurance' | 'care_plan' | 'other';
  uploadedBy: string;
  createdAt: string;
}

export interface ActivityContent {
  images?: string[];
  audioUrl?: string;
  questions?: { question: string; options: string[]; correctAnswer: number }[];
  breathingPattern?: { inhale: number; hold: number; exhale: number };
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: 'brain_game' | 'breathing' | 'music' | 'photo_journey' | 'movement' | 'puzzle';
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number;
  content?: ActivityContent;
  isActive: boolean;
}

export interface ActivitySession {
  id: string;
  activityId: string;
  patientId: string;
  activityTitle: string;
  startedAt: string;
  completedAt?: string;
  score?: number;
  notes?: string;
}

export interface CareTeamMember {
  id: string;
  patientId: string;
  name: string;
  role: string;
  specialty?: string;
  organization?: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
}

export interface Reminder {
  id: string;
  patientId: string;
  title: string;
  message: string;
  type: 'medication' | 'appointment' | 'task' | 'custom';
  time: string;
  daysOfWeek: number[];
  isActive: boolean;
  sound: string;
  vibrate: boolean;
  createdAt: string;
  createdBy: string;
}

export interface VitalSigns {
  id: string;
  patientId: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperature?: number;
  weight?: number;
  bloodSugar?: number;
  oxygenSaturation?: number;
  notes?: string;
  recordedAt: string;
  recordedBy: string;
}

export interface SleepEntry {
  id: string;
  patientId: string;
  bedTime: string;
  wakeTime: string;
  duration: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  interruptions: number;
  notes?: string;
  date: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  title: string;
  provider: string;
  location?: string;
  date: string;
  time: string;
  notes?: string;
  reminderSet: boolean;
  createdAt: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

export interface Goal {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  category: 'functional' | 'cognitive' | 'emotional' | 'physical';
  status: 'active' | 'completed' | 'paused';
  progress: number;
  targetDate?: string;
  milestones: GoalMilestone[];
  createdAt: string;
  createdBy: string;
}

export interface Alert {
  id: string;
  patientId: string;
  type: 'medication_missed' | 'appointment_upcoming' | 'mood_change' | 'behavior_incident' | 'safety' | 'system';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  isRead: boolean;
  createdAt: string;
}

export interface DashboardStats {
  patientId: string;
  tasksCompleted: number;
  tasksTotal: number;
  tasksCompletionRate: number;
  medicationsTaken: number;
  medicationsTotal: number;
  medicationsAdherenceRate: number;
  moodToday?: MoodType;
  moodTrend: 'improving' | 'stable' | 'declining';
  sleepHours?: number;
  sleepQuality?: string;
  activitiesCompleted: number;
  behaviorIncidents: number;
  alerts: Alert[];
}

// Note type for patient timeline
export interface Note {
  id: string;
  patientId: string;
  caregiverId: string;
  caregiverName: string;
  note: string;
  noteType: 'general' | 'medical' | 'behavior' | 'mood' | 'activity';
  createdAt: string;
}

// Multi-patient support types
export interface PatientData {
  patient: Patient;
  tasks: Task[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  moodEntries: MoodEntry[];
  behaviorLogs: BehaviorLog[];
  memories: Memory[];
  documents: Document[];
  careTeam: CareTeamMember[];
  reminders: Reminder[];
  vitalSigns: VitalSigns[];
  sleepEntries: SleepEntry[];
  appointments: Appointment[];
  goals: Goal[];
  dashboardStats: DashboardStats | null;
  alerts: Alert[];
  safetyAlerts: SafetyAlert[];
  adlAssessments: ADLAssessment[];
  nutritionLogs: NutritionLog[];
  notes?: Note[];
}

export interface CaregiverSettings {
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  defaultLanguage: string;
  measurementUnit: 'metric' | 'imperial';
  theme: 'light' | 'dark' | 'auto';
  defaultPatientView: 'grid' | 'list';
}

export interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  selectedRole: UserRole | null;
  // Multi-patient support
  patients: PatientData[];
  selectedPatientId: string | null;
  caregiverSettings: CaregiverSettings;
  // Legacy single patient support (for backward compatibility)
  patient: Patient | null;
  tasks: Task[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  moodEntries: MoodEntry[];
  behaviorLogs: BehaviorLog[];
  memories: Memory[];
  documents: Document[];
  activities: Activity[];
  activitySessions: ActivitySession[];
  careTeam: CareTeamMember[];
  reminders: Reminder[];
  vitalSigns: VitalSigns[];
  sleepEntries: SleepEntry[];
  appointments: Appointment[];
  goals: Goal[];
  dashboardStats: DashboardStats | null;
  alerts: Alert[];
  // New clinical tracking
  safetyAlerts: SafetyAlert[];
  adlAssessments: ADLAssessment[];
  caregiverStatus: CaregiverStatus | null;
  nutritionLogs: NutritionLog[];
  isLoading: boolean;
  error: string | null;
  currentView: string;
  sidebarOpen: boolean;
  isDemoMode: boolean;
}

export interface EducationModule {
  id: string;
  title: string;
  description: string;
  category: 'dementia_basics' | 'communication' | 'behavior_management' | 'self_care' | 'legal';
  content: string;
  duration: number;
  isCompleted: boolean;
}

export interface WellnessCheckIn {
  id: string;
  caregiverId: string;
  stressLevel: number;
  sleepQuality: number;
  mood: string;
  needsBreak: boolean;
  notes?: string;
  timestamp: string;
}

// Safety Alert Types for Red Flag Dashboard
export interface SafetyAlert {
  id: string;
  patientId: string;
  type: 'fall' | 'wandering' | 'medication_refusal' | 'sundowning' | 'sleep_disturbance' | 'appetite_change' | 'stable_period' | 'positive_engagement' | 'caregiver_coping';
  category: 'red' | 'yellow' | 'green';
  title: string;
  description: string;
  count?: number;
  lastOccurred?: string;
  recommendedAction?: string;
  isResolved: boolean;
  createdAt: string;
}

// ADL (Activities of Daily Living) Tracking
export interface ADLAssessment {
  id: string;
  patientId: string;
  date: string;
  assessedBy: string;
  // Basic ADLs (1=independent, 5=completely dependent)
  dressing: number;
  eating: number;
  bathing: number;
  toileting: number;
  transferring: number;
  continence: number;
  // IADLs
  mealPreparation: number;
  medicationManagement: number;
  phoneUse: number;
  finances: number;
  transportation: number;
  shopping: number;
  notes?: string;
}

// Caregiver Status for Clinician Dashboard
export interface CaregiverStatus {
  caregiverId: string;
  patientId: string;
  stressLevel: 'low' | 'medium' | 'high';
  lastRespiteBreak: string;
  supportSystemStrength: 'weak' | 'moderate' | 'strong';
  hoursOfCareThisWeek: number;
  nightsInterruptedSleep: number;
  emergencyCallsMade: number;
  lastCheckIn: string;
  burnoutRisk: 'low' | 'moderate' | 'high';
  recommendedActions: string[];
}

// Sleep Tracking for Patient
export interface SleepTracker {
  id: string;
  patientId: string;
  date: string;
  bedTime: string;
  wakeTime: string;
  totalHours: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  interruptions: number;
  daytimeNapping: number;
  notes?: string;
}

// Nutrition/Hydration Tracking
export interface NutritionLog {
  id: string;
  patientId: string;
  date: string;
  mealsEaten: number;
  mealsTotal: number;
  fluidIntakeOz: number;
  appetite: 'poor' | 'fair' | 'good' | 'excellent';
  weight?: number;
  notes?: string;
  loggedBy: string;
}