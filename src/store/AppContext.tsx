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

