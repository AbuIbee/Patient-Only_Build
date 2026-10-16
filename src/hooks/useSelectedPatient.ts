import { useApp } from '@/store/useApp';
import type { Patient } from '@/types';

// PHASE 3 (MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009): rewritten against the
// actual `AppState` shape. The previous version read `state.selectedPatientId`
// and `state.patients` (a multi-patient, caregiver-dashboard-style list with
// an active selection) — neither field exists anywhere on `AppState`
// (src/store/AppContext.tsx) or is set by any reducer action in this
// codebase; `PatientData` was never exported from `@/types` either. This is
// a single-patient, patient-only app (CLAUDE.md: "a dementia-care
// companion app built for patients only") — `state.patient` IS the one
// current patient, with no selection concept. The previous version's
// `!state.selectedPatientId` check always evaluated true at runtime (the
// property is simply absent, not merely empty), so it always returned
// null/empty without ever reaching the now-removed `.patients.find(...)` —
// it never actually crashed, but was already dead logic wearing a stale
// multi-patient-shaped type. Its only confirmed consumer,
// src/components/MediaUploader.tsx, always receives an explicit
// `patientId` prop from its one real call site (PatientLayout.tsx) and
// only ever used this hook as an always-unreached fallback.
export function useSelectedPatient(): Patient | null {
  const { state } = useApp();
  return state.patient ?? null;
}

export function useSelectedPatientId(): string | null {
  const { state } = useApp();
  return state.patient?.id ?? null;
}
