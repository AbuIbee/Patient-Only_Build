/**
 * Returns the current in-progress visit first, otherwise the earliest scheduled
 * visit. Input must already be filtered to the authenticated caregiver's
 * authorized today's visits. Never infer assignment or patient access here.
 *
 * This keeps the action hub independent of backend row order and time zones
 * (scheduledStart is an absolute ISO timestamp).
 */
export function selectCurrentOrNextVisit<T extends {
  status: string;
  scheduledStart: string | null;
}>(todayVisits: readonly T[]): T | undefined {
  const candidates = todayVisits.filter(
    (v) =>
      (v.status === 'in_progress' || v.status === 'scheduled') &&
      !!v.scheduledStart &&
      Number.isFinite(Date.parse(v.scheduledStart)),
  );
  candidates.sort((a, b) => {
    const aCurrent = a.status === 'in_progress' ? 0 : 1;
    const bCurrent = b.status === 'in_progress' ? 0 : 1;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;
    return Date.parse(a.scheduledStart!) - Date.parse(b.scheduledStart!);
  });
  return candidates[0];
}
