import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getOrgVisitsResult, type OrgVisit } from '@/services/organizationDirectorOpsService';

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function AttendanceRow({ visit }: { visit: OrgVisit }) {
  const status = visit.status === 'in_progress' ? 'Working now' : visit.status.replaceAll('_', ' ');
  return (
    <li>
      <Dialog>
        <DialogTrigger className="group relative block w-full space-y-1 rounded-xl border border-ent-line bg-ent-bg p-3 pr-10 text-left hover:bg-ent-pale">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ent-ink">{visit.caregiverName} — {visit.patientName}</span>
            <span className="text-xs capitalize text-ent-muted">{status}</span>
          </span>
          <span className="block text-xs text-ent-muted">
            Scheduled: {formatTime(visit.scheduledStart)} – {formatTime(visit.scheduledEnd)}
          </span>
          <span className="block text-sm text-ent-text">
            Clock in: {formatTime(visit.actualStart)} · Clock out: {formatTime(visit.actualEnd)}
          </span>
          <span className="block text-sm font-semibold text-ent-forest group-hover:underline">View visit notes</span>
          <ChevronRight size={17} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-ent-forest" />
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>Visit notes</DialogTitle>
          <DialogDescription>{visit.caregiverName} — {visit.patientName}</DialogDescription>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
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

export default function DirectorAttendancePanel({ organizationId }: { organizationId: string }) {
  const [visits,setVisits] = useState<OrgVisit[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const result = await getOrgVisitsResult(organizationId, 150);
    if (result.error) setError(result.error);
    else { setError(null); setVisits(result.data ?? []); }
    setLoading(false);
  },[organizationId]);
  useEffect(()=>{
    void refresh();
    const timer = window.setInterval(()=>{void refresh();},30000);
    return ()=>window.clearInterval(timer);
  },[refresh]);

  const worked = visits.filter(v=>v.actualStart||v.actualEnd);
  const active = worked.filter(v=>v.actualStart&&!v.actualEnd);
  const sorted = [...worked].sort((a,b)=>
    Date.parse(b.actualStart ?? b.actualEnd ?? '')-Date.parse(a.actualStart ?? a.actualEnd ?? ''));

  return (
    <section aria-label="Director caregiver attendance" className="rounded-2xl border border-ent-line bg-white p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="font-bold text-ent-ink">Live Caregiver Attendance &amp; Visit Notes</h2>
          <p className="text-sm text-ent-muted">{active.length} currently clocked in · {worked.length} visits with attendance · refreshes every 30 seconds</p>
        </div>
        <button type="button" className="rounded-lg border border-ent-line px-3 py-1 text-sm" onClick={()=>{void refresh();}}>Refresh</button>
      </div>
      {loading && <p role="status" className="text-sm text-ent-muted">Loading authorized attendance…</p>}
      {error && <p role="alert" className="text-sm text-ent-rust">Could not confirm attendance: {error}</p>}
      {!loading && !error && sorted.length===0 && <p className="text-sm text-ent-muted">No recorded clock-ins or clock-outs among the most recent 150 visits.</p>}
      <ul aria-label="Caregiver attendance records" className="space-y-2">
        {sorted.map(visit => <AttendanceRow key={visit.id} visit={visit} />)}
      </ul>
    </section>
  );
}
