// My Memoria Ally - Patient + Admin Only Types

export type UserRole = 'patient' | 'admin';

export interface User {
  id: string;
  email?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;

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
}

export interface Patient {
  id: string;
  userId: string;
  email?: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  photoUrl?: string;
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
  scheduledTime: string;
  status: 'pending' | 'completed' | 'skipped';
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
  isActive: boolean;
  createdAt: string;
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