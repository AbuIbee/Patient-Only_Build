import { createContext, useContext, type Dispatch } from 'react';
import type { AppState } from '@/types';
import type { Action } from './AppContext';

// RELEASE-BLOCKER-CLOSURE PHASE 2: the context object and this hook live
// here (not in AppContext.tsx), because that file also exports the
// AppProvider component — Vite Fast Refresh (react-refresh/only-export-
// components) requires a component-exporting file to export components
// only.
export interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export function useApp() {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }

  return context;
}
