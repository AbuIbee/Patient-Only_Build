// B6 (RELEASE-BLOCKER-CLOSURE): calendar-day helpers for fields that
// represent a DAY (a medication dose date, a mood-entry day, a check-in
// date), not an instant. `new Date('yyyy-MM-dd')` parses as UTC MIDNIGHT
// per the ECMA spec — but Date's own getDate()/setDate()/getDay() all
// operate in LOCAL time. Mixing the two (as several call sites across
// this app did before this fix) can shift a date-only string by one day
// depending on the caller's timezone offset. These helpers never round-
// trip through UTC for a calendar-day value.

/** Parse a "yyyy-MM-dd" string as LOCAL midnight, not UTC midnight. */
export function parseLocalDate(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}
