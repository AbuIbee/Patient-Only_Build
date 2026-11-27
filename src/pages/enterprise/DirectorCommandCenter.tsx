import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, ChevronRight, ClipboardCheck, Clock3, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { OrgVisit } from '@/services/organizationDirectorOpsService';
import type { OrgCoveredPatient, OrgMembershipRow } from '@/services/organizationService';
import {
  type DashboardSources, loadDirectorDashboardSources,
} from '@/services/hcnDirectorDashboardSources';
import {
  dayKey, getCoverageRisks, getMissingVisitNotes, getReadinessFindings, getVisitExceptions,
  type StaffIdentity,
} from '@/services/hcnDirectorDashboardInsights';

export type DirectorCommandRoute =
  'operations' | 'scheduling' | 'staff' | 'clinical' | 'incidents' |
  'communications' | 'applications' | 'assignments' | 'patients';

const ZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];
const PERMITTED_ZONES = new Set(ZONES.map(z => z.value));
const CLOSED_REQUESTS = new Set(['draft', 'closed', 'cancelled', 'canceled', 'completed', 'fulfilled']);
const CLOSED_TASKS = new Set(['completed', 'cancelled', 'canceled', 'approved', 'closed']);
const CARD = 'rounded-xl border border-ent-line bg-ent-panel p-4 sm:p-5 space-y-3';
type Person = OrgMembershipRow & { firstName: string; lastName: string; email: string };
type Row = { id: string; title: string; detail: string; route: DirectorCommandRoute; urgent?: boolean; date?: number };
function textDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Time not recorded';
}
function describePerson(person: Person | undefined): string {
  return person ? ((person.firstName + ' ' + person.lastName).trim() || 'Caregiver name unavailable')
    : 'Caregiver no longer in active roster';
}
function Panel({ title, count, loading, error, empty, rows, onNavigate, id, countSuffix = 'requiring attention' }: {
  title: string; count: number | null; loading: boolean; error: string | null;
  empty: string; rows: Row[]; onNavigate: (route: DirectorCommandRoute) => void; id?: string; countSuffix?: string;
}) {
  return (
    <section id={id} className={CARD} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-ent-ink">{title}</h3>
        <span className="text-xs font-semibold text-ent-muted">
          {loading ? 'Loading…' : error ? 'Unavailable' : count === null ? 'Not configured' : count + ' ' + countSuffix}
        </span>
      </div>
      {error ? <p role="alert" className="text-sm text-ent-rust">Unable to verify: {error}</p>
        : loading ? <p role="status" className="text-sm text-ent-muted">Checking current organization data…</p>
        : count === null ? <p className="text-sm text-ent-muted">{empty}</p>
        : rows.length === 0 ? <p className="text-sm text-ent-muted">{empty}</p>
        : <ul className="space-y-2">
          {rows.slice(0, 5).map(row => (
            <li key={row.id}>
              <button type="button" onClick={() => onNavigate(row.route)}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-ent-line bg-ent-bg p-3 text-left hover:border-ent-bronze focus-visible:outline-2 focus-visible:outline-ent-bronze"
                aria-label={row.title + '. ' + row.detail + '. Open ' + row.route}>
                <span className="min-w-0 space-y-1">
                  <span className={'block text-sm font-semibold ' + (row.urgent ? 'text-ent-rust' : 'text-ent-ink')}>
                    {row.title}
                  </span>
                  <span className="block text-xs text-ent-muted">{row.detail}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ent-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
          {rows.length > 5 && <li className="text-xs text-ent-muted">Showing 5 of {rows.length}; open the linked office for the full record.</li>}
        </ul>}
    </section>
  );
}

export function useDirectorCommandCenter(
  orgId: string, patientIds: readonly string[], members: readonly Person[],
) {
  const [snapshot, setSnapshot] = useState<DashboardSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [topError, setTopError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [timeZoneSource, setTimeZoneSource] = useState<'organization' | 'device' | null>(null);
  const [now, setNow] = useState(Date.now());
  const patientKey = patientIds.join('|');

  useEffect(() => {
    let canceled = false;
    setSnapshot(null);
    setTimeZone(null);
    setTimeZoneSource(null);
    void (async () => {
      const { data, error } = await supabase.from('organization_licenses')
        .select('monthly_billing_timezone').eq('organization_id', orgId).maybeSingle();
      if (canceled) return;
      if (!error && data?.monthly_billing_timezone) {
        const zone = data.monthly_billing_timezone;
        try { dayKey(Date.now(), zone); setTimeZone(zone); setTimeZoneSource('organization'); return; }
        catch { /* Invalid organization timezone requires explicit selection below. */ }
      }
      // An explicit local choice is never represented as authoritative server configuration.
      let saved: string | null = null;
      try { saved = window.localStorage.getItem('hcn-director-office-time-zone:' + orgId); }
      catch { /* Private browser mode can disable local storage. */ }
      if (saved && PERMITTED_ZONES.has(saved)) { setTimeZone(saved); setTimeZoneSource('device'); }
    })();
    return () => { canceled = true; };
  }, [orgId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setTopError(null);
    try {
      const result = await loadDirectorDashboardSources(orgId, patientKey ? patientKey.split('|') : []);
      setSnapshot(result);
      setNow(Date.now());
    } catch (e) {
      setTopError(e instanceof Error ? e.message : 'Dashboard refresh failed');
    } finally {
      setLoading(false);
    }
  }, [orgId, patientKey]);

  useEffect(() => {
    let active = true;
    const refresh = async () => { if (active) await reload(); };
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [reload]);

  const staff = useMemo<StaffIdentity[]>(() => members.map(person => ({
    userId: person.userId, orgRole: person.orgRole, status: person.status,
    firstName: person.firstName, lastName: person.lastName,
  })), [members]);

  const visitExceptions = useMemo(() => {
    if (!snapshot?.visits.data || !timeZone) return null;
    try { return getVisitExceptions(snapshot.visits.data, timeZone, now); }
    catch { return null; }
  }, [snapshot, timeZone, now]);

  const setOfficeTimeZone = (zone: string) => {
    if (!PERMITTED_ZONES.has(zone)) return;
    try { window.localStorage.setItem('hcn-director-office-time-zone:' + orgId, zone); }
    catch { /* Keep explicit choice for this mounted view even without storage. */ }
    setTimeZone(zone);
    setTimeZoneSource('device');
  };

  return { snapshot, loading, topError, timeZone, timeZoneSource, now, staff,
    visitExceptions, reload, setOfficeTimeZone };
}

type CommandState = ReturnType<typeof useDirectorCommandCenter>;

export default function DirectorCommandCenter({ orgId, members, patients, command, onNavigate }: {
  orgId: string; members: Person[]; patients: OrgCoveredPatient[];
  command: CommandState; onNavigate: (route: DirectorCommandRoute) => void;
}) {
  const { snapshot, loading, topError, timeZone, timeZoneSource, now, staff, visitExceptions, reload, setOfficeTimeZone } = command;
  const memberById = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);
  const patientById = useMemo(() => new Map(patients.map(p =>
    [p.patientId, p.preferredName || (p.firstName + ' ' + p.lastName)])), [patients]);
  const visitError = snapshot?.visits.error ?? (topError || null);
  const activeError = snapshot?.activeVisits.error ?? topError;
  const coverageError = visitError || snapshot?.assignments.error || null;
  const readinessError = visitError || snapshot?.credentials.error || snapshot?.acknowledgments.error || null;
  const docsError = visitError;
  const clinicalError = snapshot?.clinicalRequests.error || snapshot?.coordinationTasks.error || null;
  const urgentError = snapshot?.urgentConversations.error || snapshot?.escalations.error || null;

  const visits = snapshot?.visits.data ?? [];
  const liveRows: Row[] = (snapshot?.activeVisits.data ?? []).map(v => ({
    id: 'live:' + v.id, title: describePerson(memberById.get(v.caregiver_id)),
    detail: (patientById.get(v.patient_id) || 'Authorized patient') + ' · Checked in ' + textDate(v.actual_start),
    route: 'operations',
    urgent: v.scheduled_end !== null && Date.parse(v.scheduled_end) + 30 * 60_000 < now,
  }));
  const exceptionRows: Row[] = (visitExceptions ?? []).map(x => ({
    id: 'exception:' + x.visit.id, title: x.reasons.join(' / '),
    detail: x.visit.caregiverName + ' · ' + x.visit.patientName + ' · ' + textDate(x.visit.scheduledStart),
    route: 'operations', urgent: x.level === 'urgent',
  }));

  const coverage = snapshot?.visits.data && snapshot?.assignments.data
    ? getCoverageRisks(visits, staff, snapshot.assignments.data, now) : null;
  const coverageRows: Row[] = (coverage ?? []).map(x => ({
    id: 'coverage:' + x.visit.id, title: x.reason,
    detail: x.visit.caregiverName + ' · ' + x.visit.patientName + ' · ' + textDate(x.visit.scheduledStart),
    route: 'scheduling', urgent: true,
  }));

  const outstandingRequests = (snapshot?.clinicalRequests.data ?? []).filter(r =>
    !CLOSED_REQUESTS.has(r.status.toLowerCase()) && !r.closed_at && !r.cancelled_at);
  const openTasks = (snapshot?.coordinationTasks.data ?? []).filter(t =>
    !CLOSED_TASKS.has(t.status.toLowerCase()));
  const clinicalRows: Row[] = [
    ...outstandingRequests.map(r => ({
      id: 'request:' + r.id, title: r.title,
      detail: 'External request · ' + r.status.replaceAll('_', ' ') +
        (r.deadline_at ? ' · Due ' + textDate(r.deadline_at) : ' · No deadline set'),
      route: 'clinical' as const, urgent: !!r.deadline_at && Date.parse(r.deadline_at) < now,
      date: r.deadline_at ? Date.parse(r.deadline_at) : Number.POSITIVE_INFINITY,
    })),
    ...openTasks.filter(t => t.due_at && Date.parse(t.due_at) < now + 48 * 60 * 60_000).map(t => ({
      id: 'coord-task:' + t.id, title: t.title,
      detail: 'Coordination task · Due ' + textDate(t.due_at),
      route: 'clinical' as const, urgent: !!t.due_at && Date.parse(t.due_at) < now,
      date: t.due_at ? Date.parse(t.due_at) : Number.POSITIVE_INFINITY,
    })),
  ].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));

  const missingNotes = snapshot?.visits.data ? getMissingVisitNotes(visits, now) : null;
  const documentationRows: Row[] = (missingNotes ?? []).map(v => ({
    id: 'notes:' + v.id, title: 'Visit notes not recorded',
    detail: v.caregiverName + ' · ' + v.patientName + ' · Completed ' + textDate(v.actualEnd),
    route: 'operations',
  }));

  const readiness = snapshot?.visits.data && snapshot?.credentials.data && snapshot?.acknowledgments.data
    ? getReadinessFindings(staff, snapshot.credentials.data, visits, snapshot.acknowledgments.data, now) : null;
  const readinessRows: Row[] = (readiness ?? []).map(f => ({
    id: f.key, title: f.detail, detail: f.key.startsWith('credential:') ? 'Review staff credentials'
      : f.key.startsWith('previsit:') ? 'Verify pre-visit review' : 'Review staff activation',
    route: f.key.startsWith('previsit:') ? 'scheduling' : 'staff', urgent: f.level === 'urgent',
  }));

  const openEscalations = (snapshot?.escalations.data ?? []).filter(e => e.status !== 'resolved');
  const urgentRows: Row[] = [
    ...(snapshot?.urgentConversations.data ?? []).map(m => ({
      id: 'urgent:' + m.id, title: 'Unacknowledged urgent message',
      detail: m.subject + ' · Received ' + textDate(m.created_at),
      route: 'communications' as const, urgent: true,
      date: Date.parse(m.created_at),
    })),
    ...openEscalations.filter(e => e.urgency === 'urgent' || e.urgency === 'priority').map(e => ({
      id: 'escalation:' + e.id, title: e.urgency === 'urgent' ? 'Urgent care escalation' : 'Priority care escalation',
      detail: (patientById.get(e.patient_id) || 'Patient') + ' · ' + e.status.replaceAll('_', ' ') +
        ' · ' + textDate(e.created_at),
      route: 'incidents' as const, urgent: true,
      date: Date.parse(e.created_at),
    })),
  ].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  const incidentRows: Row[] = (snapshot?.incidents.data ?? [])
    .filter(i => i.resolution_status !== 'resolved')
    .map(i => ({
      id: 'incident:' + i.id, title: i.incident_type.replaceAll('_', ' ') + ' incident',
      detail: (patientById.get(i.patient_id) || 'Patient') + ' · ' + i.severity + ' · ' + textDate(i.occurred_at),
      route: 'incidents', urgent: i.severity === 'critical' || i.severity === 'high',
      date: Date.parse(i.occurred_at),
    }));
  const actionRows: Row[] = [
    ...urgentRows,
    ...incidentRows,
    ...exceptionRows,
    ...coverageRows,
    ...clinicalRows.filter(row => row.urgent),
    ...documentationRows,
    ...readinessRows.filter(row => row.urgent),
  ].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const actionError = urgentError || snapshot?.incidents.error || visitError || coverageError || clinicalError || readinessError;

  return (
    <section className="space-y-4 pt-3" aria-label="Director operational command center" data-organization-id={orgId}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ent-line bg-ent-panel p-4">
        <div>
          <h2 className="text-lg font-bold text-ent-ink">Director Operational Command Center</h2>
          <p className="text-sm text-ent-muted">Additional operational tools beneath your existing dashboard · updates every 60 seconds when this tab is active</p>
          <p className="text-xs text-ent-muted">Last verified refresh: {snapshot ? new Date(snapshot.refreshedAt).toLocaleTimeString() : 'Not yet loaded'}</p>
        </div>
        <button type="button" onClick={() => { void reload(); }} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-ent-line px-3 py-2 text-sm font-semibold text-ent-ink disabled:opacity-60">
          <RefreshCw size={15} aria-hidden="true" /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {topError && <p role="alert" className="rounded-xl border border-ent-rust p-3 text-sm text-ent-rust">Dashboard refresh failed: {topError}</p>}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ent-line bg-ent-panel p-3">
        <Clock3 size={18} className="text-ent-muted" aria-hidden="true" />
        <label htmlFor="hcn-office-timezone" className="text-sm font-semibold text-ent-ink">Office operational time zone</label>
        <select id="hcn-office-timezone" className="rounded-lg border border-ent-line bg-white px-2 py-2 text-sm"
          value={timeZone ?? ''} disabled={timeZoneSource === 'organization'} onChange={e => setOfficeTimeZone(e.target.value)}>
          <option value="">Select your office time zone</option>
          {timeZone && !PERMITTED_ZONES.has(timeZone) && <option value={timeZone}>{timeZone} (organization configured)</option>}
          {ZONES.map(zone => <option key={zone.value} value={zone.value}>{zone.label} ({zone.value})</option>)}
        </select>
        <span className="text-xs text-ent-muted">
          {timeZoneSource === 'organization' ? 'Loaded from organization license settings'
            : timeZoneSource === 'device' ? 'Selected on this device, not saved for other staff'
              : 'Choose once to enable accurate today-based exception counts'}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Live Caregiver Status" count={snapshot?.activeVisits.data
            ? new Set(snapshot.activeVisits.data.map(v => v.caregiver_id)).size : null}
          countSuffix="currently checked in" loading={loading && !snapshot} error={activeError} empty="No caregivers are currently checked in."
          rows={liveRows} onNavigate={onNavigate} />
        <Panel id="hcn-today-visit-exceptions" title="Today's Visit Exceptions"
          count={timeZone && !visitError && visitExceptions ? visitExceptions.length : null}
          loading={loading && !snapshot} error={visitError}
          empty={timeZone ? 'No late check-ins, missed visits, or overdue checkouts for today.'
            : 'Select the office time zone above before showing a count.'}
          rows={timeZone ? exceptionRows : []} onNavigate={onNavigate} />
        <Panel title="Coverage at Risk — Next 48 Hours" count={coverage ? coverage.length : null}
          loading={loading && !snapshot} error={coverageError}
          empty="No scheduled visits have a detected inactive caregiver or missing active patient assignment. Unscheduled care demand is not represented by visit records."
          rows={coverageRows} onNavigate={onNavigate} />
        <Panel title="Director Action Queue" count={!actionError && snapshot ? actionRows.length : null}
          loading={loading && !snapshot} error={actionError}
          empty="No verified urgent exceptions or outstanding items in the monitored sources."
          rows={actionRows} onNavigate={onNavigate} />
        <Panel title="Clinical Coordination Follow-Ups" count={clinicalError ? null : clinicalRows.length}
          loading={loading && !snapshot} error={clinicalError}
          empty="No outstanding external requests or near-due coordination tasks."
          rows={clinicalRows} onNavigate={onNavigate} />
        <Panel title="Visit Documentation Review (Past 7 Days)"
          count={missingNotes ? missingNotes.length : null} loading={loading && !snapshot}
          error={docsError} empty="No completed visits are missing their required note field in the last seven days."
          rows={documentationRows} onNavigate={onNavigate} />
        <Panel title="Staff Readiness & Credentials" count={readiness ? readiness.length : null}
          loading={loading && !snapshot} error={readinessError}
          empty="No pending staff activations, due/expired credentials, or missing recorded acknowledgments for upcoming 30-minute visits."
          rows={readinessRows} onNavigate={onNavigate} />
        <Panel title="Urgent Communications & Help Escalations"
          count={urgentError ? null : urgentRows.length}
          loading={loading && !snapshot} error={urgentError}
          empty="No unacknowledged urgent conversation messages accessible to you or unresolved priority/urgent care escalations."
          rows={urgentRows} onNavigate={onNavigate} />
      </div>
      <p className="text-xs text-ent-muted">
        Values are limited to your authorized organization. Message alerts include only conversations in which you are a participant.
        Coverage risks are based on scheduled visits and verified staff assignments, not on unscheduled care requirements.
        Clinical approvals remain restricted to appropriately authorized clinical specialists.
      </p>
    </section>
  );
}
