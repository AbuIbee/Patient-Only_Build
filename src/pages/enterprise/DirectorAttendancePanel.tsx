import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  getOrgVisitsResult, getOrgVisitsWindow, type OrgVisit,
} from '@/services/organizationDirectorOpsService';
import { getVisitExceptions, type VisitException } from '@/services/hcnDirectorDashboardInsights';

type AttendanceView = 'all' | 'exceptions';

function localZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

function formatTime(value: string | null): string {
  if (!value) return 'Not recorded';
  const valueDate = new Date(value);
  return Number.isFinite(valueDate.getTime()) ? valueDate.toLocaleString() : 'Not recorded';
}

function AttendanceRow({ visit, exception }: { visit: OrgVisit; exception?: VisitException }) {
  const status = visit.status === 'in_progress' ? 'Working now' : visit.status.replaceAll('_', ' ');
  return (
    <li>
      <Dialog>
        <DialogTrigger className="group relative block w-full space-y-1 rounded-xl border border-ent-line bg-ent-bg p-3 pr-10 text-left hover:bg-ent-pale">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ent-ink">{visit.caregiverName} — {visit.patientName}</span>
            <span className="text-xs capitalize text-ent-muted">{status}</span>
          </span>
          {exception && <span className="block text-sm font-semibold text-ent-rust">{exception.reasons.join(' · ')}</span>}
          <span className="block text-xs text-ent-muted">
            Scheduled: {formatTime(visit.scheduledStart)} – {formatTime(visit.scheduledEnd)}
          </span>
          <span className="block text-sm text-ent-text">
            Clock in: {formatTime(visit.actualStart)} · Clock out: {formatTime(visit.actualEnd)}
          </span>
          <span className="block text-sm font-semibold text-ent-forest group-hover:underline">Review visit details and notes</span>
          <ChevronRight size={17} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-ent-forest" />
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>Visit details and notes</DialogTitle>
          <DialogDescription>{visit.caregiverName} — {visit.patientName}</DialogDescription>
          {exception && <p className="rounded-lg bg-ent-bg p-3 text-sm font-semibold text-ent-rust">{exception.reasons.join(' · ')}</p>}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-ent-ink">Scheduled start</dt><dd>{formatTime(visit.scheduledStart)}</dd></div>
            <div><dt className="font-semibold text-ent-ink">Scheduled end</dt><dd>{formatTime(visit.scheduledEnd)}</dd></div>
            <div><dt className="font-semibold text-ent-ink">Clock in</dt><dd>{formatTime(visit.actualStart)}</dd></div>
            <div><dt className="font-semibold text-ent-ink">Clock out</dt><dd>{formatTime(visit.actualEnd)}</dd></div>
          </dl>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-ent-bg p-3 text-sm text-ent-ink">
            {visit.visitNotes?.trim() || 'No visit notes recorded.'}
          </p>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * The main Director KPI opens this screen in exceptions mode, not another homepage webpart.
 * Both modes use the same organization-scoped RLS permissions as existing Care Operations.
 */
export default function DirectorAttendancePanel({ organizationId, initialView = 'all', onOpenSchedule }: {
  organizationId: string;
  initialView?: AttendanceView;
  onOpenSchedule?: () => void;
}) {
  const [view, setView] = useState<AttendanceView>(initialView);
  const [visits, setVisits] = useState<OrgVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const requestSequence = useRef(0);

  useEffect(() => { setView(initialView); }, [initialView]);

  const refresh = useCallback(async (showLoading = false) => {
    const current = ++requestSequence.current;
    if (showLoading) setLoading(true);
    const currentTime = Date.now();
    try {
      // The old 150-row "worked visits" sample excludes scheduled late arrivals.
      // Use the same bounded, paginated window as the homepage exception counter.
      const result = view === 'exceptions'
        ? await getOrgVisitsWindow(
            organizationId,
            new Date(currentTime - 8 * 86_400_000).toISOString(),
            new Date(currentTime + 3 * 86_400_000).toISOString(),
          )
        : await getOrgVisitsResult(organizationId, 150);
      if (requestSequence.current !== current) return;
      if (result.error || !result.data) {
        setError(result.error ?? 'Visit records could not be verified.');
        setVisits([]);
      } else {
        setError(null);
        setVisits(result.data);
      }
      setNow(currentTime);
    } catch (cause) {
      if (requestSequence.current !== current) return;
      setError(cause instanceof Error ? cause.message : 'Attendance could not be verified.');
      setVisits([]);
    } finally {
      if (requestSequence.current === current) setLoading(false);
    }
  }, [organizationId, view]);

  useEffect(() => {
    setVisits([]);
    setLoading(true);
    void refresh();
    const update = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      requestSequence.current += 1;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [refresh]);

  const worked = visits.filter(v => v.actualStart || v.actualEnd);
  const active = worked.filter(v => v.actualStart && !v.actualEnd);
  const sorted = [...worked].sort((a, b) =>
    Date.parse(b.actualStart ?? b.actualEnd ?? '') - Date.parse(a.actualStart ?? a.actualEnd ?? ''));
  const exceptions = !error && view === 'exceptions'
    ? getVisitExceptions(visits, localZone(), now)
    : [];
  const shown = view === 'exceptions' ? exceptions.map(e => e.visit) : sorted;
  const byExceptionId = new Map(exceptions.map(e => [e.visit.id, e]));

  return (
    <section aria-label="Director caregiver attendance" className="rounded-2xl border border-ent-line bg-white p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-bold text-ent-ink">
            {view === 'exceptions' ? "Today's Visit Exceptions" : 'Live Caregiver Attendance & Visit Notes'}
          </h2>
          <p className="text-sm text-ent-muted">
            {view === 'exceptions'
              ? 'Missed visits · arrivals more than 15 minutes late · checkouts more than 30 minutes overdue · auto-updates every 30 seconds'
              : active.length + ' currently clocked in · ' + worked.length + ' visits with attendance · auto-updates every 30 seconds'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenSchedule && <button type="button" onClick={onOpenSchedule}
            className="rounded-lg border border-ent-line px-3 py-2 text-sm font-semibold text-ent-ink hover:bg-ent-bg">
            Open Employee Schedule
          </button>}
          <label htmlFor="hcn-attendance-view" className="text-sm font-semibold text-ent-ink">View</label>
          <select id="hcn-attendance-view" value={view} onChange={e => setView(e.target.value as AttendanceView)}
            className="rounded-lg border border-ent-line bg-white px-2 py-2 text-sm">
            <option value="all">Recorded attendance</option>
            <option value="exceptions">Today's visit exceptions</option>
          </select>
        </div>
      </div>
      {loading && <p role="status" className="text-sm text-ent-muted">Loading authorized visit records…</p>}
      {error && <p role="alert" className="text-sm text-ent-rust">
        Could not verify {view === 'exceptions' ? 'visit exceptions' : 'attendance'}: {error}. Automatic retry is enabled.
      </p>}
      {!loading && !error && shown.length === 0 &&
        <p className="text-sm text-ent-muted">
          {view === 'exceptions'
            ? 'No verified late arrivals, missed visits or overdue checkouts today.'
            : 'No recorded clock-ins or clock-outs among the most recent 150 visits.'}
        </p>}
      {!loading && !error && view === 'exceptions' && shown.length > 0 &&
        <p className="text-sm text-ent-ink"><strong>{shown.length}</strong> visits need review.
          Select a visit to see the assigned caregiver, patient, scheduled times, actual times and notes.
        </p>}
      {!error && <ul aria-label={view === 'exceptions' ? "Today's actionable visit exceptions" : 'Caregiver attendance records'}
        className="space-y-2">
        {shown.map(visit => <AttendanceRow key={visit.id} visit={visit} exception={byExceptionId.get(visit.id)} />)}
      </ul>}
    </section>
  );
}
