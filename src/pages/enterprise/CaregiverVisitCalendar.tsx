import { useEffect, useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getMyVisitsResult, type CaregiverVisit } from '@/services/enterpriseCaregiverWorkToolsService';
import type { StaffPatient } from '@/services/organizationService';
import { OfficeCard } from './EnterpriseOfficeShell';

export default function CaregiverVisitCalendar({ orgId, patients, selectedDay, onSelectDay, onOpenVisit }: {
  orgId: string;
  patients: StaffPatient[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onOpenVisit: (visit: CaregiverVisit) => void;
}) {
  const [visits, setVisits] = useState<CaregiverVisit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const patientNames = useMemo(() => new Map(patients.map(patient => [
    patient.patientId, patient.preferredName || (patient.firstName + ' ' + patient.lastName).trim(),
  ])), [patients]);

  useEffect(() => {
    let current = true;
    void getMyVisitsResult().then(result => {
      if (!current) return;
      setVisits(result.data ?? []);
      setError(result.error);
    }).catch(() => {
      if (current) setError('Your assigned visits could not be loaded.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [orgId, attempt]);

  const visitsByDay = useMemo(() => {
    const result = new Map<string, CaregiverVisit[]>();
    for (const visit of visits) {
      if (visit.organizationId !== orgId || !patientNames.has(visit.patientId) || !visit.scheduledStart || visit.status === 'canceled') continue;
      const day = format(new Date(visit.scheduledStart), 'yyyy-MM-dd');
      const rows = result.get(day) ?? [];
      rows.push(visit);
      result.set(day, rows);
    }
    for (const rows of result.values()) {
      rows.sort((left, right) => Date.parse(left.scheduledStart!) - Date.parse(right.scheduledStart!));
    }
    return result;
  }, [visits, orgId, patientNames]);

  const now = new Date();
  const monthStart = startOfMonth(selectedDay);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(selectedDay)) });
  const selectedVisits = visitsByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  const calendarButton = 'min-h-10 rounded-lg border border-ent-line px-2 text-ent-ink hover:bg-ent-pale';
  const selectDay = (day: Date, dayVisits: CaregiverVisit[]) => {
    onSelectDay(day);
    if (dayVisits.length === 1) onOpenVisit(dayVisits[0]);
  };

  return (
    <OfficeCard>
      <h2 className="flex items-center gap-2 font-bold text-ent-ink"><Calendar className="size-5 text-ent-bronze" aria-hidden="true" /> Assigned Patient Calendar</h2>
      <p className="text-sm text-ent-muted">Choose a visit day to open the patient’s visit overview.</p>
      <div className="flex flex-wrap items-center gap-2">
        <h3 aria-live="polite" className="flex-1 font-semibold text-ent-ink">{format(selectedDay, 'MMMM yyyy')}</h3>
        <button type="button" className={calendarButton} onClick={() => onSelectDay(now)}>Today</button>
        <button type="button" aria-label="Previous month" className={calendarButton} onClick={() => onSelectDay(addMonths(monthStart, -1))}><ChevronLeft className="size-5" aria-hidden="true" /></button>
        <button type="button" aria-label="Next month" className={calendarButton} onClick={() => onSelectDay(addMonths(monthStart, 1))}><ChevronRight className="size-5" aria-hidden="true" /></button>
      </div>
      <div aria-label="Monthly assigned visits" className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.slice(0, 7).map(day => <span key={format(day, 'EEE')} className="text-center text-xs font-semibold text-ent-muted">{format(day, 'EEE')}</span>)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          if (!isSameMonth(day, selectedDay)) return <span key={key} aria-hidden="true" />;
          const dayVisits = visitsByDay.get(key) ?? [];
          const selected = isSameDay(day, selectedDay);
          const description = dayVisits.length ? dayVisits.length + (dayVisits.length === 1 ? ' visit' : ' visits') : 'no visits';
          return (
            <button key={key} type="button" aria-label={format(day, 'EEEE, MMMM d, yyyy') + ', ' + description}
              aria-current={isSameDay(day, now) ? 'date' : undefined} aria-pressed={selected}
              className={`min-h-12 min-w-0 rounded-lg border px-0.5 text-sm sm:min-h-16 ${selected ? 'border-ent-forest bg-ent-forest text-white' : dayVisits.length ? 'border-ent-line bg-ent-green text-ent-forest hover:border-ent-forest' : 'border-ent-line text-ent-muted hover:bg-ent-pale'}`}
              onClick={() => selectDay(day, dayVisits)}>
              <span className="block font-semibold">{day.getDate()}</span>
              {dayVisits.length > 0 && <span className="block text-[10px] leading-tight sm:text-xs">{description}</span>}
            </button>
          );
        })}
      </div>
      {loading && <p role="status" className="text-sm text-ent-muted">Loading assigned visits…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-ent-rust">
        {error}
        <button type="button" className={calendarButton} onClick={() => { setLoading(true); setError(null); setAttempt(value => value + 1); }}>Retry</button>
      </div>}
      {!loading && !error && (
        <section aria-label="Visits on selected day" className="space-y-2">
          <h3 className="font-semibold text-ent-ink">{format(selectedDay, 'EEEE, MMMM d')}</h3>
          {selectedVisits.length ? (
            <ul className="space-y-2">
              {selectedVisits.map(visit => (
                <li key={visit.id}>
                  <button type="button" className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-ent-line bg-ent-pale px-3 py-2 text-left text-ent-ink"
                    onClick={() => onOpenVisit(visit)}>
                    <span className="font-semibold">{patientNames.get(visit.patientId)}</span>
                    <span className="text-sm">{new Date(visit.scheduledStart!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · <span className="capitalize">{visit.status.replace('_', ' ')}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ent-muted">No assigned visits on this day.</p>}
        </section>
      )}
    </OfficeCard>
  );
}
