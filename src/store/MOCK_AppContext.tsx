import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { AppState, User, UserRole, Patient, Task, Medication, MedicationLog, MoodEntry, Memory, Document, Activity, CareTeamMember, Reminder, BehaviorLog, VitalSigns, SleepEntry, Appointment, Goal, DashboardStats, Alert, ActivitySession, SafetyAlert, ADLAssessment, CaregiverStatus, NutritionLog, PatientData, CaregiverSettings } from '@/types';

// Initial State
const initialState: AppState = {
  currentUser: null,
  isAuthenticated: false,
  selectedRole: null,
  // Multi-patient support
  patients: [],
  selectedPatientId: null,
  caregiverSettings: {
    notificationsEnabled: true,
    emailNotifications: true,
    smsNotifications: false,
    defaultLanguage: 'en',
    measurementUnit: 'imperial',
    theme: 'light',
    defaultPatientView: 'grid',
  },
  // Legacy single patient support
  patient: null,
  tasks: [],
  medications: [],
  medicationLogs: [],
  moodEntries: [],
  behaviorLogs: [],
  memories: [],
  documents: [],
  activities: [],
  activitySessions: [],
  careTeam: [],
  reminders: [],
  vitalSigns: [],
  sleepEntries: [],
  appointments: [],
  goals: [],
  dashboardStats: null,
  alerts: [],
  // New clinical tracking
  safetyAlerts: [],
  adlAssessments: [],
  caregiverStatus: null,
  nutritionLogs: [],
  isLoading: false,
  error: null,
  currentView: 'landing',
  sidebarOpen: true,
};

// Action Types
type Action =
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_AUTHENTICATED'; payload: boolean }
  | { type: 'SET_ROLE'; payload: UserRole | null }
  // Multi-patient actions
  | { type: 'SET_PATIENTS'; payload: PatientData[] }
  | { type: 'SELECT_PATIENT'; payload: string | null }
  | { type: 'ADD_PATIENT'; payload: PatientData }
  | { type: 'UPDATE_PATIENT'; payload: { patientId: string; data: Partial<PatientData> } }
  | { type: 'REMOVE_PATIENT'; payload: string }
  | { type: 'SET_CAREGIVER_SETTINGS'; payload: Partial<CaregiverSettings> }
  // Legacy single patient support
  | { type: 'SET_PATIENT'; payload: Patient | null }
  | { type: 'SET_TASKS'; payload: Task[] }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'SET_MEDICATIONS'; payload: Medication[] }
  | { type: 'ADD_MEDICATION'; payload: Medication }
  | { type: 'SET_MEDICATION_LOGS'; payload: MedicationLog[] }
  | { type: 'ADD_MEDICATION_LOG'; payload: MedicationLog }
  | { type: 'SET_MOOD_ENTRIES'; payload: MoodEntry[] }
  | { type: 'ADD_MOOD_ENTRY'; payload: MoodEntry }
  | { type: 'SET_BEHAVIOR_LOGS'; payload: BehaviorLog[] }
  | { type: 'ADD_BEHAVIOR_LOG'; payload: BehaviorLog }
  | { type: 'SET_MEMORIES'; payload: Memory[] }
  | { type: 'ADD_MEMORY'; payload: Memory }
  | { type: 'SET_DOCUMENTS'; payload: Document[] }
  | { type: 'ADD_DOCUMENT'; payload: Document }
  | { type: 'SET_ACTIVITIES'; payload: Activity[] }
  | { type: 'ADD_ACTIVITY_SESSION'; payload: ActivitySession }
  | { type: 'SET_CARE_TEAM'; payload: CareTeamMember[] }
  | { type: 'SET_REMINDERS'; payload: Reminder[] }
  | { type: 'ADD_REMINDER'; payload: Reminder }
  | { type: 'SET_VITAL_SIGNS'; payload: VitalSigns[] }
  | { type: 'SET_SLEEP_ENTRIES'; payload: SleepEntry[] }
  | { type: 'SET_APPOINTMENTS'; payload: Appointment[] }
  | { type: 'SET_GOALS'; payload: Goal[] }
  | { type: 'SET_DASHBOARD_STATS'; payload: DashboardStats | null }
  | { type: 'SET_ALERTS'; payload: Alert[] }
  | { type: 'MARK_ALERT_READ'; payload: string }
  // New clinical tracking actions
  | { type: 'SET_SAFETY_ALERTS'; payload: SafetyAlert[] }
  | { type: 'SET_ADL_ASSESSMENTS'; payload: ADLAssessment[] }
  | { type: 'SET_CAREGIVER_STATUS'; payload: CaregiverStatus | null }
  | { type: 'SET_NUTRITION_LOGS'; payload: NutritionLog[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_VIEW'; payload: string }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'LOGOUT' };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, currentUser: action.payload };
    case 'SET_AUTHENTICATED':
      return { ...state, isAuthenticated: action.payload };
    case 'SET_ROLE':
      return { ...state, selectedRole: action.payload };
    // Multi-patient reducer cases
    case 'SET_PATIENTS':
      return { ...state, patients: action.payload };
    case 'SELECT_PATIENT':
      return { ...state, selectedPatientId: action.payload };
    case 'ADD_PATIENT':
      return { 
        ...state, 
        patients: [...state.patients, action.payload],
        selectedPatientId: action.payload.patient.id
      };
    case 'UPDATE_PATIENT':
      return {
        ...state,
        patients: state.patients.map(p => 
          p.patient.id === action.payload.patientId 
            ? { ...p, ...action.payload.data }
            : p
        )
      };
    case 'REMOVE_PATIENT':
      return {
        ...state,
        patients: state.patients.filter(p => p.patient.id !== action.payload),
        selectedPatientId: state.selectedPatientId === action.payload 
          ? (state.patients.find(p => p.patient.id !== action.payload)?.patient.id || null)
          : state.selectedPatientId
      };
    case 'SET_CAREGIVER_SETTINGS':
      return {
        ...state,
        caregiverSettings: { ...state.caregiverSettings, ...action.payload }
      };
    // Legacy single patient support
    case 'SET_PATIENT':
      return { ...state, patient: action.payload };
    case 'SET_TASKS':
      return { ...state, tasks: action.payload };
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t),
      };
    case 'SET_MEDICATIONS':
      return { ...state, medications: action.payload };
    case 'ADD_MEDICATION':
      return { ...state, medications: [...state.medications, action.payload] };
    case 'SET_MEDICATION_LOGS':
      return { ...state, medicationLogs: action.payload };
    case 'ADD_MEDICATION_LOG':
      return { ...state, medicationLogs: [action.payload, ...state.medicationLogs] };
    case 'SET_MOOD_ENTRIES':
      return { ...state, moodEntries: action.payload };
    case 'ADD_MOOD_ENTRY':
      return { ...state, moodEntries: [action.payload, ...state.moodEntries] };
    case 'SET_BEHAVIOR_LOGS':
      return { ...state, behaviorLogs: action.payload };
    case 'ADD_BEHAVIOR_LOG':
      return { ...state, behaviorLogs: [action.payload, ...state.behaviorLogs] };
    case 'SET_MEMORIES':
      return { ...state, memories: action.payload };
    case 'ADD_MEMORY':
      return { ...state, memories: [action.payload, ...state.memories] };
    case 'SET_DOCUMENTS':
      return { ...state, documents: action.payload };
    case 'ADD_DOCUMENT':
      return { ...state, documents: [...state.documents, action.payload] };
    case 'SET_ACTIVITIES':
      return { ...state, activities: action.payload };
    case 'ADD_ACTIVITY_SESSION':
      return { ...state, activitySessions: [action.payload, ...state.activitySessions] };
    case 'SET_CARE_TEAM':
      return { ...state, careTeam: action.payload };
    case 'SET_REMINDERS':
      return { ...state, reminders: action.payload };
    case 'ADD_REMINDER':
      return { ...state, reminders: [...state.reminders, action.payload] };
    case 'SET_VITAL_SIGNS':
      return { ...state, vitalSigns: action.payload };
    case 'SET_SLEEP_ENTRIES':
      return { ...state, sleepEntries: action.payload };
    case 'SET_APPOINTMENTS':
      return { ...state, appointments: action.payload };
    case 'SET_GOALS':
      return { ...state, goals: action.payload };
    case 'SET_DASHBOARD_STATS':
      return { ...state, dashboardStats: action.payload };
    case 'SET_ALERTS':
      return { ...state, alerts: action.payload };
    case 'MARK_ALERT_READ':
      return {
        ...state,
        alerts: state.alerts.map(a => a.id === action.payload ? { ...a, isRead: true } : a),
      };
    // New clinical tracking reducers
    case 'SET_SAFETY_ALERTS':
      return { ...state, safetyAlerts: action.payload };
    case 'SET_ADL_ASSESSMENTS':
      return { ...state, adlAssessments: action.payload };
    case 'SET_CAREGIVER_STATUS':
      return { ...state, caregiverStatus: action.payload };
    case 'SET_NUTRITION_LOGS':
      return { ...state, nutritionLogs: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
}

// Context
interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Helper function to generate patient-specific mock data
function generatePatientData(patientId: string, patientInfo: Partial<Patient>): PatientData {
  const patient: Patient = {
    id: patientId,
    userId: `u${patientId}`,
    firstName: patientInfo.firstName || 'Patient',
    lastName: patientInfo.lastName || 'Name',
    preferredName: patientInfo.preferredName || patientInfo.firstName || 'Patient',
    dateOfBirth: patientInfo.dateOfBirth || '1950-01-01',
    photoUrl: patientInfo.photoUrl,
    location: patientInfo.location || 'Raleigh',
    address: patientInfo.address,
    affirmation: patientInfo.affirmation || 'You are safe. You are loved. You are at home.',
    emergencyContact: patientInfo.emergencyContact || {
      name: 'Emergency Contact',
      relationship: 'Family',
      phone: '(919) 555-0000',
    },
    familiarFaces: patientInfo.familiarFaces || [],
    diagnosisDate: patientInfo.diagnosisDate,
    dementiaStage: patientInfo.dementiaStage || 'middle',
    preferences: patientInfo.preferences || {
      language: 'en',
      fontSize: 'large',
      highContrast: false,
      audioEnabled: true,
      notificationsEnabled: true,
      tone: 'gentle',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const tasks: Task[] = [
    { id: `${patientId}-t1`, patientId, title: 'Eat breakfast', icon: 'utensils', timeOfDay: 'morning', scheduledTime: '8:00 AM', daysOfWeek: [0,1,2,3,4,5,6], status: 'completed', completedAt: new Date().toISOString(), isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t2`, patientId, title: 'Take morning medication', icon: 'pill', timeOfDay: 'morning', scheduledTime: '8:30 AM', daysOfWeek: [0,1,2,3,4,5,6], status: 'completed', completedAt: new Date().toISOString(), isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t3`, patientId, title: 'Get dressed', icon: 'shirt', timeOfDay: 'morning', scheduledTime: '9:00 AM', daysOfWeek: [0,1,2,3,4,5,6], status: 'completed', completedAt: new Date().toISOString(), isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t4`, patientId, title: 'Walk outside', icon: 'sun', timeOfDay: 'morning', scheduledTime: '10:00 AM', daysOfWeek: [0,1,2,3,4,5,6], status: 'pending', isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t5`, patientId, title: 'Eat lunch', icon: 'utensils', timeOfDay: 'afternoon', scheduledTime: '12:00 PM', daysOfWeek: [0,1,2,3,4,5,6], status: 'pending', isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t6`, patientId, title: 'Take afternoon medication', icon: 'pill', timeOfDay: 'afternoon', scheduledTime: '2:00 PM', daysOfWeek: [0,1,2,3,4,5,6], status: 'pending', isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t7`, patientId, title: 'Rest time', icon: 'moon', timeOfDay: 'afternoon', scheduledTime: '3:00 PM', daysOfWeek: [0,1,2,3,4,5,6], status: 'pending', isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t8`, patientId, title: 'Eat dinner', icon: 'utensils', timeOfDay: 'evening', scheduledTime: '6:00 PM', daysOfWeek: [0,1,2,3,4,5,6], status: 'pending', isRecurring: true, difficulty: 'early', isActive: true },
    { id: `${patientId}-t9`, patientId, title: 'Take evening medication', icon: 'pill', timeOfDay: 'evening', scheduledTime: '8:00 PM', daysOfWeek: [0,1,2,3,4,5,6], status: 'pending', isRecurring: true, difficulty: 'early', isActive: true },
  ];

  const medications: Medication[] = [
    {
      id: `${patientId}-m1`, patientId, name: 'Donepezil', genericName: 'Donepezil Hydrochloride', dosage: '5mg', form: 'pill',
      instructions: 'Take with food in the morning', prescribedBy: 'Dr. Sarah Johnson', prescriptionDate: '2024-01-15',
      sideEffects: ['Nausea', 'Diarrhea', 'Insomnia', 'Muscle cramps'],
      schedule: [{ id: `${patientId}-ms1`, time: '8:30 AM', daysOfWeek: [0,1,2,3,4,5,6] }],
      isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: `${patientId}-m2`, patientId, name: 'Memantine', genericName: 'Memantine Hydrochloride', dosage: '10mg', form: 'pill',
      instructions: 'Take in the afternoon with water', prescribedBy: 'Dr. Sarah Johnson', prescriptionDate: '2024-01-15',
      sideEffects: ['Dizziness', 'Headache', 'Constipation', 'Confusion'],
      schedule: [{ id: `${patientId}-ms2`, time: '2:00 PM', daysOfWeek: [0,1,2,3,4,5,6] }],
      isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: `${patientId}-m3`, patientId, name: 'Vitamin D3', dosage: '1000 IU', form: 'pill',
      instructions: 'Take with dinner', prescribedBy: 'Dr. Sarah Johnson', prescriptionDate: '2024-01-15',
      sideEffects: [],
      schedule: [{ id: `${patientId}-ms3`, time: '8:00 PM', daysOfWeek: [0,1,2,3,4,5,6] }],
      isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ];

  const medicationLogs: MedicationLog[] = [
    { id: `${patientId}-ml1`, medicationId: `${patientId}-m1`, patientId, medicationName: 'Donepezil 5mg', scheduledTime: '8:30 AM', takenTime: '8:35 AM', status: 'taken', recordedBy: 'Caregiver', date: new Date().toISOString().split('T')[0] },
    { id: `${patientId}-ml2`, medicationId: `${patientId}-m2`, patientId, medicationName: 'Memantine 10mg', scheduledTime: '2:00 PM', status: 'pending', recordedBy: 'System', date: new Date().toISOString().split('T')[0] },
    { id: `${patientId}-ml3`, medicationId: `${patientId}-m3`, patientId, medicationName: 'Vitamin D3 1000 IU', scheduledTime: '8:00 PM', status: 'pending', recordedBy: 'System', date: new Date().toISOString().split('T')[0] },
  ];

  const moodEntries: MoodEntry[] = [
    { id: `${patientId}-me1`, patientId, mood: 'calm', intensity: 7, note: 'Enjoyed looking at photo album', triggers: [], timeOfDay: 'morning', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), recordedBy: 'Caregiver' },
    { id: `${patientId}-me2`, patientId, mood: 'happy', intensity: 8, note: 'Laughed during music time', triggers: [], timeOfDay: 'afternoon', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), recordedBy: 'Caregiver' },
  ];

  const behaviorLogs: BehaviorLog[] = [
    { id: `${patientId}-bl1`, patientId, behavior: 'Repetitive questioning', description: 'Asked where family was multiple times', severity: 'mild', triggers: ['evening'], interventions: ['Validation', 'Distraction'], outcome: 'Calmed after 10 minutes', duration: 15, timeOfDay: 'evening', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), recordedBy: 'Caregiver' },
  ];

  const memories: Memory[] = [
    { id: `${patientId}-mem1`, patientId, title: 'Wedding Day', description: 'Special day with family', photoUrl: '/images/memory_photo_1.jpg', date: '1965-06-12', people: ['Spouse'], category: 'photo', tags: ['wedding', 'family'], isFavorite: true, createdAt: new Date().toISOString(), createdBy: 'Caregiver' },
    { id: `${patientId}-mem2`, patientId, title: 'Family Vacation', description: 'Summer vacation with the children', photoUrl: '/images/memory_photo_2.jpg', date: '1978-07-15', location: 'Lake Tahoe', people: ['Family'], category: 'photo', tags: ['vacation', 'family'], isFavorite: true, createdAt: new Date().toISOString(), createdBy: 'Caregiver' },
  ];

  const careTeam: CareTeamMember[] = [
    { id: `${patientId}-ct1`, patientId, name: 'Dr. Sarah Johnson', role: 'Neurologist', specialty: 'Memory Care', organization: 'Raleigh Neurology', phone: '(919) 555-0145', email: 's.johnson@raleighneuro.com', isPrimary: true },
    { id: `${patientId}-ct2`, patientId, name: 'Maria Garcia', role: 'Occupational Therapist', specialty: 'Geriatric Care', organization: 'Home Health', phone: '(919) 555-0167', email: 'm.garcia@homehealth.com', isPrimary: false },
  ];

  const reminders: Reminder[] = [
    { id: `${patientId}-r1`, patientId, title: 'Morning Medication', message: 'Time to take morning medications', type: 'medication', time: '08:30', daysOfWeek: [0,1,2,3,4,5,6], isActive: true, sound: 'gentle', vibrate: true, createdAt: new Date().toISOString(), createdBy: 'Caregiver' },
    { id: `${patientId}-r2`, patientId, title: 'Afternoon Medication', message: 'Time to take afternoon medications', type: 'medication', time: '14:00', daysOfWeek: [0,1,2,3,4,5,6], isActive: true, sound: 'gentle', vibrate: true, createdAt: new Date().toISOString(), createdBy: 'Caregiver' },
  ];

  const appointments: Appointment[] = [
    { id: `${patientId}-ap1`, patientId, title: 'Neurology Checkup', provider: 'Dr. Sarah Johnson', location: 'Raleigh Neurology', date: '2024-02-15', time: '10:00 AM', reminderSet: true, createdAt: new Date().toISOString() },
  ];

  const goals: Goal[] = [
    { id: `${patientId}-g1`, patientId, title: 'Dress Independently', description: 'Put on clothes without assistance', category: 'functional', status: 'active', progress: 75, milestones: [{ id: `${patientId}-gm1`, title: 'Select clothes', completed: true }, { id: `${patientId}-gm2`, title: 'Put on top', completed: true }], createdAt: new Date().toISOString(), createdBy: 'Therapist' },
  ];

  const alerts: Alert[] = [
    { id: `${patientId}-al1`, patientId, type: 'medication_missed', title: 'Medication Missed', message: 'Afternoon medication was not taken yesterday', severity: 'medium', isRead: false, createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  ];

  const dashboardStats: DashboardStats = {
    patientId, tasksCompleted: 3, tasksTotal: 9, tasksCompletionRate: 33,
    medicationsTaken: 1, medicationsTotal: 3, medicationsAdherenceRate: 85,
    moodToday: 'calm', moodTrend: 'stable', sleepHours: 7, sleepQuality: 'good',
    activitiesCompleted: 2, behaviorIncidents: 0, alerts,
  };

  const safetyAlerts: SafetyAlert[] = [
    { id: `${patientId}-sa1`, patientId, type: 'fall', category: 'red', title: 'Fall Incident', description: 'Patient fell in bathroom 3 days ago', count: 1, lastOccurred: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), recommendedAction: 'Schedule physical therapy evaluation', isResolved: false, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: `${patientId}-sa2`, patientId, type: 'sundowning', category: 'yellow', title: 'Increased Sundowning', description: 'Agitation increasing in evenings', count: 3, lastOccurred: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), recommendedAction: 'Establish calming evening routine', isResolved: false, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    { id: `${patientId}-sa3`, patientId, type: 'positive_engagement', category: 'green', title: 'Positive Engagement', description: 'Actively participating in activities', count: 5, lastOccurred: new Date().toISOString(), recommendedAction: 'Continue meaningful activities', isResolved: true, createdAt: new Date().toISOString() },
  ];

  const adlAssessments: ADLAssessment[] = [
    { id: `${patientId}-adl1`, patientId, date: '2024-01-15', assessedBy: 'Maria Garcia, OT', dressing: 3, eating: 2, bathing: 4, toileting: 3, transferring: 3, continence: 2, mealPreparation: 5, medicationManagement: 4, phoneUse: 3, finances: 5, transportation: 5, shopping: 5, notes: 'Baseline assessment' },
  ];

  const nutritionLogs: NutritionLog[] = [
    { id: `${patientId}-nl1`, patientId, date: new Date().toISOString().split('T')[0], mealsEaten: 2, mealsTotal: 3, fluidIntakeOz: 32, appetite: 'fair', notes: 'Ate well at breakfast', loggedBy: 'Caregiver' },
  ];

  return {
    patient, tasks, medications, medicationLogs, moodEntries, behaviorLogs,
    memories, documents: [], careTeam, reminders, vitalSigns: [],
    sleepEntries: [], appointments, goals, dashboardStats, alerts,
    safetyAlerts, adlAssessments, nutritionLogs,
  };
}

// Mock Data Initialization - Multi-Patient Support
export function initializeMockData(dispatch: Dispatch<Action>) {
  // Create multiple patients
  const patient1 = generatePatientData('p1', {
    firstName: 'Eleanor',
    lastName: 'Thompson',
    preferredName: 'Ellie',
    dateOfBirth: '1950-03-15',
    photoUrl: '/images/patient_profile.jpg',
    location: 'Raleigh',
    address: '123 Oak Street, Raleigh, NC 27601',
    affirmation: 'You are safe. You are loved. You are at home.',
    emergencyContact: { name: 'Mary Thompson', relationship: 'Daughter', phone: '(919) 555-0123', email: 'mary.thompson@email.com' },
    familiarFaces: [
      { id: 'f1', name: 'Mary', relationship: 'Your daughter', photoUrl: '/images/familiar_face_1.jpg', phone: '(919) 555-0123' },
      { id: 'f2', name: 'David', relationship: 'Your son', photoUrl: '/images/familiar_face_2.jpg', phone: '(919) 555-0456' },
      { id: 'f3', name: 'Sophie', relationship: 'Your granddaughter', photoUrl: '/images/familiar_face_3.jpg' },
    ],
    diagnosisDate: '2022-06-15',
    dementiaStage: 'middle',
  });

  const patient2 = generatePatientData('p2', {
    firstName: 'Robert',
    lastName: 'Anderson',
    preferredName: 'Bob',
    dateOfBirth: '1945-08-22',
    photoUrl: '/images/patient2_profile.jpg',
    location: 'Durham',
    address: '456 Maple Ave, Durham, NC 27701',
    affirmation: 'Every day is a new beginning.',
    emergencyContact: { name: 'Susan Anderson', relationship: 'Wife', phone: '(919) 555-0234', email: 'susan.anderson@email.com' },
    familiarFaces: [
      { id: 'f4', name: 'Susan', relationship: 'Your wife', photoUrl: '/images/familiar_face_4.jpg', phone: '(919) 555-0234' },
      { id: 'f5', name: 'Michael', relationship: 'Your son', photoUrl: '/images/familiar_face_5.jpg', phone: '(919) 555-0567' },
    ],
    diagnosisDate: '2023-01-10',
    dementiaStage: 'early',
  });

  const patient3 = generatePatientData('p3', {
    firstName: 'Margaret',
    lastName: 'Wilson',
    preferredName: 'Maggie',
    dateOfBirth: '1942-11-05',
    photoUrl: '/images/patient3_profile.jpg',
    location: 'Chapel Hill',
    address: '789 Pine Road, Chapel Hill, NC 27514',
    affirmation: 'You are surrounded by love and care.',
    emergencyContact: { name: 'James Wilson', relationship: 'Son', phone: '(919) 555-0345', email: 'james.wilson@email.com' },
    familiarFaces: [
      { id: 'f6', name: 'James', relationship: 'Your son', photoUrl: '/images/familiar_face_6.jpg', phone: '(919) 555-0345' },
      { id: 'f7', name: 'Linda', relationship: 'Your daughter', photoUrl: '/images/familiar_face_7.jpg', phone: '(919) 555-0678' },
    ],
    diagnosisDate: '2021-03-20',
    dementiaStage: 'late',
  });

  const allPatients = [patient1, patient2, patient3];

  // Dispatch multi-patient data
  dispatch({ type: 'SET_PATIENTS', payload: allPatients });
  dispatch({ type: 'SELECT_PATIENT', payload: 'p1' });

  // Also set legacy data for backward compatibility (using first patient)
  dispatch({ type: 'SET_PATIENT', payload: patient1.patient });
  dispatch({ type: 'SET_TASKS', payload: patient1.tasks });
  dispatch({ type: 'SET_MEDICATIONS', payload: patient1.medications });
  dispatch({ type: 'SET_MEDICATION_LOGS', payload: patient1.medicationLogs });
  dispatch({ type: 'SET_MOOD_ENTRIES', payload: patient1.moodEntries });
  dispatch({ type: 'SET_BEHAVIOR_LOGS', payload: patient1.behaviorLogs });
  dispatch({ type: 'SET_MEMORIES', payload: patient1.memories });
  dispatch({ type: 'SET_CARE_TEAM', payload: patient1.careTeam });
  dispatch({ type: 'SET_REMINDERS', payload: patient1.reminders });
  dispatch({ type: 'SET_APPOINTMENTS', payload: patient1.appointments });
  dispatch({ type: 'SET_GOALS', payload: patient1.goals });
  dispatch({ type: 'SET_ALERTS', payload: patient1.alerts });
  dispatch({ type: 'SET_DASHBOARD_STATS', payload: patient1.dashboardStats });
  dispatch({ type: 'SET_SAFETY_ALERTS', payload: patient1.safetyAlerts });
  dispatch({ type: 'SET_ADL_ASSESSMENTS', payload: patient1.adlAssessments });
  dispatch({ type: 'SET_NUTRITION_LOGS', payload: patient1.nutritionLogs });

  // Mock Activities (shared across patients)
  const mockActivities: Activity[] = [
    { id: 'a1', title: 'Beautiful Landscapes', description: 'Travel the world through peaceful pictures', icon: 'camera', type: 'photo_journey', difficulty: 'easy', duration: 10, content: { images: ['/images/activity_photo_1.jpg', '/images/activity_photo_2.jpg'] }, isActive: true },
    { id: 'a2', title: 'Pattern Match', description: 'Match the shapes together', icon: 'puzzle', type: 'brain_game', difficulty: 'easy', duration: 5, isActive: true },
    { id: 'a3', title: 'Gentle Stretching', description: 'Easy stretches you can do sitting down', icon: 'activity', type: 'movement', difficulty: 'easy', duration: 10, isActive: true },
    { id: 'a4', title: 'Calm Breathing', description: 'Breathe along with the circle', icon: 'wind', type: 'breathing', difficulty: 'easy', duration: 5, isActive: true },
    { id: 'a5', title: 'Familiar Music', description: 'Listen to songs from your life', icon: 'music', type: 'music', difficulty: 'easy', duration: 15, isActive: true },
  ];
  dispatch({ type: 'SET_ACTIVITIES', payload: mockActivities });

  // Mock Caregiver Status
  const mockCaregiverStatus: CaregiverStatus = {
    caregiverId: 'cg1',
    patientId: 'p1',
    stressLevel: 'medium',
    lastRespiteBreak: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    supportSystemStrength: 'moderate',
    hoursOfCareThisWeek: 52,
    nightsInterruptedSleep: 5,
    emergencyCallsMade: 1,
    lastCheckIn: new Date().toISOString(),
    burnoutRisk: 'moderate',
    recommendedActions: [
      'Schedule weekly respite care',
      'Connect with local caregiver support group',
      'Consider adult day program 2x per week',
      'Review sleep strategies with care team',
    ],
  };
  dispatch({ type: 'SET_CAREGIVER_STATUS', payload: mockCaregiverStatus });
}
