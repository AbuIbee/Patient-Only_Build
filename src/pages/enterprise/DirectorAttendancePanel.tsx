import { useCallback, useEffect, useState } from 'react';
import { getOrgVisitsResult, type OrgVisit } from '@/services/organizationDirectorOpsService';

/** This is attendance/visit-note visibility, NOT shift handoffs.
 * Backend RLS already restricts visit reads to the authorized Director.
 */
export function DirectorRecentAttendance({ visits }: { visits: OrgVisit[] }) {
  const recorded = visits.filter(v => v.actualStart || v.actualEnd)
    .sort((a,b) => Date.parse(b.actualStart ?? b.actualEnd ?? '') - Date.parse(a.actualStart ?? a.actualEnd ?? ''))
    .slice(0,5);
  return (
    <section aria-label="Recent caregiver attendance" className="space-y-2">
      <h3 className="font-semibold text-ent-ink">Recent caregiver attendance</h3>
      {recorded.length === 0 ? <p className="text-sm text-ent-muted">No caregiver clock-ins recorded among these visits.</p> : (
        <ul className="space-y-2">
          {recorded.map(v=>(
            <li key={v.id} className="rounded-lg border border-ent-line bg-ent-bg p-2 text-sm">
              <p className="font-semibold">{v.caregiverName} — {v.patientName}</p>
              <p className="text-xs text-ent-muted">In: {v.actualStart ? new Date(v.actualStart).toLocaleString() : 'Not recorded'}
                {' · '} Out: {v.actualEnd ? new Date(v.actualEnd).toLocaleString() : 'Not recorded'}</p>
              {v.visitNotes && <p className="text-xs line-clamp-2">Notes: {v.visitNotes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
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
        {sorted.map(v=>(
          <li key={v.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sm text-ent-ink">{v.caregiverName} — {v.patientName}</span>
              <span className="text-xs text-ent-muted">{v.actualStart&&!v.actualEnd?'Working now':v.status.replace(/_/g,' ')}</span>
            </div>
            <p className="text-xs text-ent-muted">Scheduled: {v.scheduledStart?new Date(v.scheduledStart).toLocaleString():'Not recorded'}
              {' – '}{v.scheduledEnd?new Date(v.scheduledEnd).toLocaleString():'Not recorded'}</p>
            <p className="text-sm text-ent-text">Clock in: {v.actualStart?new Date(v.actualStart).toLocaleString():'Not recorded'}
              {' · '} Clock out: {v.actualEnd?new Date(v.actualEnd).toLocaleString():'Not recorded'}</p>
            <p className="text-sm text-ent-ink whitespace-pre-wrap break-words">Visit notes: {v.visitNotes?.trim()||'No visit notes recorded.'}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
