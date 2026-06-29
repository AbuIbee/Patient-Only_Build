import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import type { PatientData } from '@/types';

export function useSelectedPatient(): PatientData | null {
  const { state } = useApp();
  
  return useMemo(() => {
    if (!state.selectedPatientId) return null;
    return state.patients.find(p => p.patient.id === state.selectedPatientId) || null;
  }, [state.patients, state.selectedPatientId]);
}

export function useSelectedPatientId(): string | null {
  const { state } = useApp();
  return state.selectedPatientId;
}

export function usePatientCount(): number {
  const { state } = useApp();
  return state.patients.length;
}

export function useAllPatients(): PatientData[] {
  const { state } = useApp();
  return state.patients;
}
