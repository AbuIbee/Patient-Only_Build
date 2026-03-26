import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react';
import type {
  AppState,
  User,
  UserRole,
  Patient,
  Task,
  Medication,
  MedicationLog,
  MoodEntry,
  Memory,
  Document,
  Reminder,
} from '@/types';

// Initial State
const initialState: AppState = {
  currentUser: null,
  isAuthenticated: false,
  selectedRole: null,

  patient: null,
  tasks: [],
  medications: [],
  medicationLogs: [],
  moodEntries: [],
  memories: [],
  documents: [],
  reminders: [],

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
  | { type: 'SET_PATIENT'; payload: Patient | null }
  | { type: 'SET_TASKS'; payload: Task[] }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'SET_MEDICATIONS'; payload: Medication[] }
  | { type: 'ADD_MEDICATION'; payload: Medication }
  | { type: 'SET_MEDICATION_LOGS'; payload: MedicationLog[] }
  | { type: 'ADD_MEDICATION_LOG'; payload: MedicationLog }
  | { type: 'SET_MOOD_ENTRIES'; payload: MoodEntry[] }
  | { type: 'ADD_MOOD_ENTRY'; payload: MoodEntry }
  | { type: 'SET_MEMORIES'; payload: Memory[] }
  | { type: 'ADD_MEMORY'; payload: Memory }
  | { type: 'SET_DOCUMENTS'; payload: Document[] }
  | { type: 'ADD_DOCUMENT'; payload: Document }
  | { type: 'SET_REMINDERS'; payload: Reminder[] }
  | { type: 'ADD_REMINDER'; payload: Reminder }
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

    case 'SET_PATIENT':
      return { ...state, patient: action.payload };

    case 'SET_TASKS':
      return { ...state, tasks: action.payload };

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.payload.id ? action.payload : task
        ),
      };

    case 'SET_MEDICATIONS':
      return { ...state, medications: action.payload };

    case 'ADD_MEDICATION':
      return { ...state, medications: [...state.medications, action.payload] };

    case 'SET_MEDICATION_LOGS':
      return { ...state, medicationLogs: action.payload };

    case 'ADD_MEDICATION_LOG':
      return {
        ...state,
        medicationLogs: [action.payload, ...state.medicationLogs],
      };

    case 'SET_MOOD_ENTRIES':
      return { ...state, moodEntries: action.payload };

    case 'ADD_MOOD_ENTRY':
      return { ...state, moodEntries: [action.payload, ...state.moodEntries] };

    case 'SET_MEMORIES':
      return { ...state, memories: action.payload };

    case 'ADD_MEMORY':
      return { ...state, memories: [action.payload, ...state.memories] };

    case 'SET_DOCUMENTS':
      return { ...state, documents: action.payload };

    case 'ADD_DOCUMENT':
      return { ...state, documents: [...state.documents, action.payload] };

    case 'SET_REMINDERS':
      return { ...state, reminders: action.payload };

    case 'ADD_REMINDER':
      return { ...state, reminders: [...state.reminders, action.payload] };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_VIEW':
      return { ...state, currentView: action.payload };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'LOGOUT':
      return {
        ...initialState,
        currentView: 'landing',
      };

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

// Optional mock data initializer for local testing
export function initializeMockData(dispatch: Dispatch<Action>) {
  const patient: Patient = {
    id: 'p1',
    userId: 'u1',
    email: 'patient@example.com',
    firstName: 'Eleanor',
    lastName: 'Thompson',
    preferredName: 'Ellie',
    photoUrl: '/images/patient_profile.jpg',
    location: 'Raleigh',
    affirmation: 'You are safe. You are loved. You are at home.',
    emergencyContact: {
      name: 'Mary Thompson',
      relationship: 'Daughter',
      phone: '(919) 555-0123',
      email: 'mary.thompson@email.com',
    },
    familiarFaces: [
      {
        id: 'f1',
        name: 'Mary',
        relationship: 'Your daughter',
        photoUrl: '/images/familiar_face_1.jpg',
        phone: '(919) 555-0123',
      },
      {
        id: 'f2',
        name: 'David',
        relationship: 'Your son',
        photoUrl: '/images/familiar_face_2.jpg',
        phone: '(919) 555-0456',
      },
    ],
    preferences: {
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
    {
      id: 't1',
      patientId: 'p1',
      title: 'Eat breakfast',
      description: 'Have your morning meal',
      icon: 'utensils',
      scheduledTime: '8:00 AM',
      status: 'completed',
      isActive: true,
    },
    {
      id: 't2',
      patientId: 'p1',
      title: 'Take morning medication',
      description: 'Take your prescribed morning medicine',
      icon: 'pill',
      scheduledTime: '8:30 AM',
      status: 'pending',
      isActive: true,
    },
    {
      id: 't3',
      patientId: 'p1',
      title: 'Walk outside',
      description: 'Take a short walk',
      icon: 'sun',
      scheduledTime: '10:00 AM',
      status: 'pending',
      isActive: true,
    },
  ];

  const medications: Medication[] = [
    {
      id: 'm1',
      patientId: 'p1',
      name: 'Donepezil',
      dosage: '5mg',
      form: 'pill',
      instructions: 'Take with food in the morning',
      schedule: [
        {
          id: 'ms1',
          time: '8:30 AM',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
      ],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const medicationLogs: MedicationLog[] = [
    {
      id: 'ml1',
      medicationId: 'm1',
      patientId: 'p1',
      scheduledTime: '8:30 AM',
      takenTime: '8:35 AM',
      status: 'taken',
      date: new Date().toISOString().split('T')[0],
    },
  ];

  const moodEntries: MoodEntry[] = [
    {
      id: 'me1',
      patientId: 'p1',
      mood: 'calm',
      intensity: 7,
      note: 'Feeling peaceful this morning',
      timestamp: new Date().toISOString(),
    },
  ];

  const memories: Memory[] = [
    {
      id: 'mem1',
      patientId: 'p1',
      title: 'Wedding Day',
      description: 'A beautiful family celebration',
      photoUrl: '/images/memory_photo_1.jpg',
      date: '1965-06-12',
      isFavorite: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const reminders: Reminder[] = [
    {
      id: 'r1',
      patientId: 'p1',
      title: 'Morning Medication',
      message: 'Time to take your morning medication',
      type: 'medication',
      time: '08:30',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  dispatch({ type: 'SET_PATIENT', payload: patient });
  dispatch({ type: 'SET_TASKS', payload: tasks });
  dispatch({ type: 'SET_MEDICATIONS', payload: medications });
  dispatch({ type: 'SET_MEDICATION_LOGS', payload: medicationLogs });
  dispatch({ type: 'SET_MOOD_ENTRIES', payload: moodEntries });
  dispatch({ type: 'SET_MEMORIES', payload: memories });
  dispatch({ type: 'SET_DOCUMENTS', payload: [] });
  dispatch({ type: 'SET_REMINDERS', payload: reminders });
}