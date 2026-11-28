import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock3, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import DirectorAssistanceActions from './DirectorAssistanceActions';
import type { ScheduleFocus } from './DirectorScheduleCalendar';
import { getUpcomingScheduleConflicts, getUnscheduledCareRequirements, getUnacknowledgedHandoffReceipts } from '@/services/hcnDirectorDashboardInsights';
import type { OrgCoveredPatient, OrgMembershipRow } from '@/services/organizationService';
import { type DashboardSources, loadDirectorDashboardSources } from '@/services/hcnDirectorDashboardSources';
import {
  getCoverageRisks, getMissingVisitNotes, getReadinessFindings, getVisitExceptions,
  type StaffIdentity,
} from '@/services/hcnDirectorDashboardInsights';

export type DirectorCommandRoute =
  'operations' | 'scheduling' | 'staff' | 'clinical' | 'incidents' |
  'communications' | 'applications' | 'assignments' | 'patients';
export type AttentionCategory =
  'all' | 'assistance' | 'visits' | 'coverage' | 'conflicts' | 'handoffs' | 'incidents' | 'clinical' | 'documentation' | 'staff' | 'messages';

type Person = OrgMembershipRow & { firstName: string; lastName: string; email: string };
export type AttentionRow = {
  id: string; category: Exclude<AttentionCategory, 'all'>;
  title: string; detail: string; route: DirectorCommandRoute;
  severity: 0 | 1 | 2 | 3; occurredAt: number;
  recordId?: string; relatedVisitId?: string; patientId?: string;
  startsAt?: string; endsAt?: string;
};

const CLOSED_REQUESTS = new Set(['draft', 'closed', 'cancelled', 'canceled', 'completed', 'fulfilled']);
const CLOSED_TASKS = new Set(['completed', 'cancelled', 'canceled', 'approved', 'closed']);
const CATEGORIES: { key: AttentionCategory; label: string }[] = [
  { key: 'all', label: 'All issues' },
  { key: 'assistance', label: 'Caregiver needs help' },
  { key: 'conflicts', label: 'Overlapping schedules' },
  { key: 'handoffs', label: 'Handoff acknowledgment' },
  { key: 'visits', label: 'Visit exceptions' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'clinical', label: 'Clinical coordination' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'staff', label: 'Staff readiness' },
  { key: 'messages', label: 'Urgent communications' },
];

function deviceTimeZone(): string {
  try {
    const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (value) {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return value;
    }
  } catch { /* Use UTC only when the device timezone cannot be determined. */ }
  return 'UTC';
}

function formatTime(value: string | null): string {
  if (!value) return 'Time unavailable';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : 'Time unavailable';
}

function staffName(person: Person | undefined): string {
  return person ? (person.firstName + ' ' + person.lastName).trim() || 'Staff name unavailable'
    : 'Caregiver not in current staff roster';
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared deterministic data helper/hook, no mutable component state exported.
export function buildAttentionRows(
  snapshot: DashboardSources, members: readonly Person[],
  patients: readonly OrgCoveredPatient[], timeZone: string, now: number,
): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const staff: StaffIdentity[] = members.map(p => ({
    userId: p.userId, orgRole: p.orgRole, status: p.status,
    firstName: p.firstName, lastName: p.lastName,
  }));
  const patientNames = new Map(patients.map(p => [
    p.patientId, p.preferredName || (p.firstName + ' ' + p.lastName).trim(),
  ]));
  const visits = snapshot.visits.data;

  if (visits) {
    for (const item of getVisitExceptions(visits, timeZone, now)) {
      rows.push({
        id: 'visit:' + item.visit.id, category: 'visits', recordId: item.visit.id,
        patientId: item.visit.patientId, startsAt: item.visit.scheduledStart ?? undefined,
        endsAt: item.visit.scheduledEnd ?? undefined,
        title: item.reasons.join(' / '),
        detail: item.visit.caregiverName + ' · ' + item.visit.patientName + ' · ' + formatTime(item.visit.scheduledStart),
        route: 'operations', severity: item.level === 'urgent' ? 0 : 1,
        occurredAt: Date.parse(item.visit.scheduledStart ?? '') || now,
      });
    }
    for (const visit of getMissingVisitNotes(visits, now)) {
      rows.push({
        id: 'documentation:' + visit.id, category: 'documentation',
        title: 'Completed visit missing notes',
        detail: visit.caregiverName + ' · ' + visit.patientName + ' · ' + formatTime(visit.actualEnd ?? visit.scheduledEnd),
        route: 'operations', severity: 2,
        occurredAt: Date.parse(visit.actualEnd ?? visit.scheduledEnd ?? '') || now,
      });
    }
  }
  if (visits && snapshot.assignments.data) {
    for (const risk of getCoverageRisks(visits, staff, snapshot.assignments.data, now)) {
      rows.push({
        id: 'coverage:' + risk.visit.id, category: 'coverage', recordId: risk.visit.id,
        patientId: risk.visit.patientId, startsAt: risk.visit.scheduledStart ?? undefined,
        endsAt: risk.visit.scheduledEnd ?? undefined,
        title: risk.reason,
        detail: risk.visit.caregiverName + ' · ' + risk.visit.patientName + ' · ' + formatTime(risk.visit.scheduledStart),
        route: 'scheduling', severity: 1,
        occurredAt: Date.parse(risk.visit.scheduledStart ?? '') || now,
      });
    }
  }
  if (snapshot.incidents.data) {
    for (const report of snapshot.incidents.data.filter(r => r.resolution_status !== 'resolved')) {
      rows.push({
        id: 'incident:' + report.id, category: 'incidents',
        title: report.incident_type.replaceAll('_', ' ') + ' incident',
        detail: (patientNames.get(report.patient_id) || 'Patient') + ' · ' + report.severity +
          ' · ' + formatTime(report.occurred_at),
        route: 'incidents', severity: report.severity === 'critical' ? 0 : report.severity === 'high' ? 1 : 2,
        occurredAt: Date.parse(report.occurred_at) || now,
      });
    }
  }
  if (snapshot.escalations.data) {
    for (const escalation of snapshot.escalations.data.filter(r => r.status !== 'resolved')) {
      rows.push({
        id: 'escalation:' + escalation.id, category: 'incidents',
        title: escalation.urgency === 'urgent' ? 'Urgent care escalation' : 'Care escalation requiring follow-up',
        detail: (patientNames.get(escalation.patient_id) || 'Patient') + ' · ' +
          escalation.status.replaceAll('_', ' ') + ' · ' + formatTime(escalation.created_at),
        route: 'incidents', severity: escalation.urgency === 'urgent' ? 0 : escalation.urgency === 'priority' ? 1 : 2,
        occurredAt: Date.parse(escalation.created_at) || now,
      });
    }
  }
  if (snapshot.clinicalRequests.data) {
    for (const request of snapshot.clinicalRequests.data) {
      if (CLOSED_REQUESTS.has(request.status.toLowerCase()) || request.closed_at || request.cancelled_at) continue;
      const due = request.deadline_at ? Date.parse(request.deadline_at) : NaN;
      // Outstanding work without an approaching deadline stays on the Clinical Coordination page.
      if (!Number.isFinite(due) || due > now + 48 * 60 * 60_000) continue;
      rows.push({
        id: 'request:' + request.id, category: 'clinical', title: 'External provider response due: ' + request.title,
        detail: request.status.replaceAll('_', ' ') + ' · Due ' + formatTime(request.deadline_at),
        route: 'clinical', severity: due < now ? 1 : 2, occurredAt: due,
      });
    }
  }
  if (snapshot.coordinationTasks.data) {
    for (const task of snapshot.coordinationTasks.data) {
      const due = task.due_at ? Date.parse(task.due_at) : NaN;
      if (CLOSED_TASKS.has(task.status.toLowerCase()) || !Number.isFinite(due) ||
          due > now + 48 * 60 * 60_000) continue;
      rows.push({
        id: 'coordination:' + task.id, category: 'clinical',
        title: 'Coordination task due: ' + task.title,
        detail: 'Due ' + formatTime(task.due_at),
        route: 'clinical', severity: due < now ? 1 : 2, occurredAt: due,
      });
    }
  }
  if (visits && snapshot.credentials.data && snapshot.acknowledgments.data) {
    for (const item of getReadinessFindings(staff, snapshot.credentials.data, visits, snapshot.acknowledgments.data, now)) {
      rows.push({
        id: item.key, category: 'staff', title: item.detail,
        detail: item.key.startsWith('previsit:') ? 'Open Employee Schedule' : 'Open Staff Management',
        route: item.key.startsWith('previsit:') ? 'scheduling' : 'staff',
        severity: item.level === 'urgent' ? 1 : 3, occurredAt: now,
      });
    }
  }
  if (snapshot.urgentConversations.data) {
    for (const message of snapshot.urgentConversations.data) {
      rows.push({
        id: 'message:' + message.id, category: 'messages',
        title: 'Urgent message awaiting acknowledgment',
        detail: message.subject + ' · Received ' + formatTime(message.created_at),
        route: 'communications', severity: 0, occurredAt: Date.parse(message.created_at) || now,
      });
    }
  }
  // P0 assistance alerts always rank above ordinary visit issues.
  const safety = snapshot.safety;
  if (safety?.assistance.data) {
    for (const alert of safety.assistance.data) {
      if (alert.status === 'resolved') continue;
      rows.push({
        id: 'assistance:' + alert.id, category: 'assistance', recordId: alert.id,
        patientId: alert.patient_id, title: 'Caregiver assistance request',
        detail: 'Director action needed · ' + formatTime(alert.created_at),
        route: 'communications', severity: 0, occurredAt: Date.parse(alert.created_at) || now,
      });
    }
  }
  if (safety?.requiredCare.data && visits && snapshot.assignments.data) {
    for (const item of getUnscheduledCareRequirements(
      safety.requiredCare.data, visits, staff, snapshot.assignments.data, now)) {
      rows.push({
        id: 'requirement:' + item.slot.id, category: 'coverage',
        recordId: item.slot.id, patientId: item.slot.patient_id,
        startsAt: item.slot.starts_at, endsAt: item.slot.ends_at,
        title: 'Required care has no complete, valid scheduled visit',
        detail: (patientNames.get(item.slot.patient_id) || 'Patient') + ' · ' +
          formatTime(item.slot.starts_at) + ' – ' + formatTime(item.slot.ends_at),
        route: 'scheduling', severity: 0, occurredAt: Date.parse(item.slot.starts_at),
      });
    }
  }
  if (visits) {
    for (const pair of getUpcomingScheduleConflicts(visits, now)) {
      rows.push({
        id: 'conflict:' + pair.first.id + ':' + pair.second.id, category: 'conflicts',
        recordId: pair.first.id, relatedVisitId: pair.second.id,
        patientId: pair.first.patientId, startsAt: pair.first.scheduledStart ?? undefined,
        endsAt: pair.first.scheduledEnd ?? undefined,
        title: 'Caregiver has overlapping visits',
        detail: pair.first.caregiverName + ' · ' + pair.first.patientName + ' / ' +
          pair.second.patientName + ' · Conflict ' + formatTime(new Date(pair.overlapStart).toISOString()),
        route: 'scheduling', severity: 1, occurredAt: pair.overlapStart,
      });
    }
  }
  if (safety?.handoffReceipts.data && visits) {
    const byMemberId = new Map(members.map(member => [member.userId, member]));
    for (const item of getUnacknowledgedHandoffReceipts(safety.handoffReceipts.data, visits, now)) {
      const receipt = item.receipt;
      const outgoing = staffName(byMemberId.get(receipt.outgoing_caregiver_id));
      const incoming = staffName(byMemberId.get(receipt.incoming_caregiver_id));
      rows.push({
        id: 'handoff:' + receipt.id, category: 'handoffs', recordId: receipt.id,
        patientId: receipt.patient_id, startsAt: receipt.acknowledge_by,
        title: item.secondsUntilDue <= 0 ? 'Shift handoff acknowledgment overdue' : 'Handoff acknowledgment due soon',
        detail: (patientNames.get(receipt.patient_id) || 'Patient') +
          ' · Outgoing: ' + outgoing + ' · Incoming: ' + incoming +
          ' · Due ' + formatTime(receipt.acknowledge_by),
        route: 'operations', severity: item.secondsUntilDue <= 0 ? 1 : 2,
        occurredAt: Date.parse(receipt.acknowledge_by),
      });
    }
  }
  return rows.sort((a, b) =>
    (a.category === 'assistance' ? -1 : a.severity) - (b.category === 'assistance' ? -1 : b.severity) ||
    b.occurredAt - a.occurredAt || a.id.localeCompare(b.id));
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared deterministic data helper/hook, no mutable component state exported.
export function useDirectorCommandCenter(orgId: string, patientIds: readonly string[]) {
  const patientKey = patientIds.join('|');
  const [received, setReceived] = useState<{ orgId: string; snapshot: DashboardSources } | null>(null);
  const [loading, setLoading] = useState(true);
  const [topError, setTopError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const [now, setNow] = useState(Date.now);
  const [filter, setAttentionFilter] = useState<AttentionCategory>('all');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshAfterAction = () => setRefreshNonce(n => n + 1);
  useEffect(() => { setAttentionFilter('all'); }, [orgId]);
  const snapshot = received?.orgId === orgId ? received.snapshot : null;

  useEffect(() => {
    let active = true;
    let running = false;
    const refresh = async () => {
      if (!active || running) return;
      running = true;
      setLoading(true);
      try {
        const data = await loadDirectorDashboardSources(orgId, patientKey ? patientKey.split('|') : []);
        if (!active) return;
        setReceived({ orgId, snapshot: data });
        setTopError(null);
        setNow(Date.now());
        setTimeZone(deviceTimeZone());
      } catch (error) {
        if (active) setTopError(error instanceof Error ? error.message : 'Dashboard data could not be loaded');
      } finally {
        running = false;
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    void refresh();
    // Fetch while visible. On focus or return from another tab, refresh immediately.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    const onReturn = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [orgId, patientKey, refreshNonce]);

  const visitExceptions = useMemo(
    () => snapshot?.visits.data ? getVisitExceptions(snapshot.visits.data, timeZone, now) : null,
    [snapshot, timeZone, now],
  );

  return { snapshot, loading, topError, timeZone, now, visitExceptions,
    attentionFilter: filter, setAttentionFilter, refreshAfterAction };
}

export type DirectorCommandState = ReturnType<typeof useDirectorCommandCenter>;

const ERROR_SOURCES: { label: string; key: keyof Omit<DashboardSources, 'refreshedAt' | 'safety'> }[] = [
  { label: 'visits', key: 'visits' },
  { label: 'current check-ins', key: 'activeVisits' },
  { label: 'assignments', key: 'assignments' },
  { label: 'staff credentials', key: 'credentials' },
  { label: 'visit acknowledgments', key: 'acknowledgments' },
  { label: 'clinical requests', key: 'clinicalRequests' },
  { label: 'coordination tasks', key: 'coordinationTasks' },
  { label: 'escalations', key: 'escalations' },
  { label: 'incidents', key: 'incidents' },
  { label: 'messages', key: 'urgentConversations' },
];

function sourceErrors(snapshot: DashboardSources | null): string[] {
  if (!snapshot) return [];
  const standard = ERROR_SOURCES.filter(item => Boolean(snapshot[item.key].error)).map(item => item.label);
  const safety = snapshot.safety;
  if (!safety) return [...standard,'new safety alerts are unavailable'];
  return [
    ...standard,
    ...(safety.assistance.error ? ['caregiver assistance'] : []),
    ...(safety.requiredCare.error ? ['required care coverage'] : []),
    ...(safety.handoffReceipts.error ? ['incoming handoff acknowledgments'] : []),
  ];
}

export function DirectorNeedsAttention({ command, members, patients, onNavigate, onOpenVisitExceptions }: {
  command: DirectorCommandState; members: Person[]; patients: OrgCoveredPatient[];
  onNavigate: (route: DirectorCommandRoute) => void;
  onOpenVisitExceptions: () => void;
}) {
  const { snapshot, topError, timeZone, now, loading, attentionFilter, setAttentionFilter } = command;
  const [visibleCount, setVisibleCount] = useState(7);
  useEffect(() => { setVisibleCount(7); }, [attentionFilter]);
  const attentionRows = useMemo(
    () => snapshot ? buildAttentionRows(snapshot, members, patients, timeZone, now) : [],
    [snapshot, members, patients, timeZone, now],
  );
  const shown = attentionRows.filter(row => attentionFilter === 'all' || row.category === attentionFilter);
  const errors = sourceErrors(snapshot);
  return (
    <div className="space-y-3" aria-label="Prioritized Director attention items">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="hcn-attention-filter" className="text-xs font-semibold text-ent-muted">Show</label>
        <select id="hcn-attention-filter" value={attentionFilter}
          onChange={event => setAttentionFilter(event.target.value as AttentionCategory)}
          className="rounded-lg border border-ent-line bg-white px-2 py-2 text-sm text-ent-ink">
          {CATEGORIES.map(c => <option value={c.key} key={c.key}>{c.label}</option>)}
        </select>
        <span className="text-xs text-ent-muted">{topError || errors.length ? 'Partial results' : snapshot ? attentionRows.length + ' requiring attention' : 'Loading…'}</span>
      </div>
      {topError && <p role="alert" className="text-sm text-ent-rust">Automatic update failed: {topError}. Last verified information may be outdated.</p>}
      {errors.length > 0 && <p role="alert" className="text-sm text-ent-rust">
        Unable to verify {errors.join(', ')}. The list below may be incomplete.
      </p>}
      {!snapshot && loading ? <p role="status" className="text-sm text-ent-muted">Checking visits, staffing, clinical follow-ups and messages…</p>
        : !snapshot ? <p role="alert" className="text-sm text-ent-rust">Attention items are temporarily unavailable.</p>
        : shown.length === 0 ? <p className="text-sm text-ent-text">
          {errors.length || topError ? 'No additional verified items in this category; some sources remain unavailable.'
            : attentionFilter === 'all' ? 'No unresolved items require Director intervention right now.'
              : 'No outstanding items in this category.'}
        </p>
        : <ul className="hcn-office-activity-list">
          {shown.slice(0, visibleCount).map(row => <li key={row.id}>
            <button type="button" onClick={() => row.category === 'visits' ? onOpenVisitExceptions() : onNavigate(row.route)}
              className="flex min-w-0 w-full items-start gap-3 text-left rounded-lg hover:bg-ent-bg focus-visible:outline-2 focus-visible:outline-ent-bronze"
              aria-label={row.title + '. ' + row.detail + '. Open ' + row.route}>
              <span className="hcn-office-row-icon hcn-office-row-incident"><ChevronRight size={16} aria-hidden="true"/></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ent-ink">{row.title}</span>
                <span className="block text-xs text-ent-muted">{row.detail}</span>
              </span>
              <span className="hcn-office-status">{row.severity <= 1 ? 'Priority' : 'Follow-up'}</span>
            </button>
          </li>)}
          {shown.length > visibleCount && <li>
            <button type="button" onClick={() => setVisibleCount(count => count + 20)}
              className="text-sm font-semibold text-ent-ink hover:underline">
              Show more ({shown.length - visibleCount} remaining)
            </button>
          </li>}
        </ul>}
    </div>
  );
}

/** Only the two views that are NOT merely another list of attention items remain below the existing webparts. */
export default function DirectorCommandCenter({ members, patients, command, onNavigate }: {
  members: Person[]; patients: OrgCoveredPatient[];
  command: DirectorCommandState; onNavigate: (route: DirectorCommandRoute) => void;
}) {
  const { snapshot, loading, topError, now } = command;
  const byStaff = new Map(members.map(p => [p.userId, p]));
  const byPatient = new Map(patients.map(p => [
    p.patientId, p.preferredName || (p.firstName + ' ' + p.lastName).trim(),
  ]));
  const roster: StaffIdentity[] = members.map(p => ({
    userId: p.userId, orgRole: p.orgRole, status: p.status,
    firstName: p.firstName, lastName: p.lastName,
  }));
  const visits = snapshot?.visits.data ?? [];
  const assigned = snapshot?.assignments.data;
  const risks = assigned && snapshot?.visits.data ? getCoverageRisks(visits, roster, assigned, now) : null;
  const upcoming = snapshot?.visits.data?.filter(v => v.status === 'scheduled' && v.scheduledStart &&
    Date.parse(v.scheduledStart) >= now && Date.parse(v.scheduledStart) <= now + 48 * 60 * 60_000) ?? [];
  const live = snapshot?.activeVisits.data ?? [];
  const checkedIn = new Set(live.map(v => v.caregiver_id)).size;
  const liveError = topError || snapshot?.activeVisits.error;
  const coverageError = topError || snapshot?.visits.error || snapshot?.assignments.error;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Live staffing and upcoming coverage">
      <section className="rounded-xl border border-ent-line bg-ent-panel p-4 sm:p-5 space-y-3" aria-label="Live Caregiver Status">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-ent-ink">Live Caregiver Status</h3>
          <Users className="w-5 h-5 text-ent-muted" aria-hidden="true"/>
        </div>
        {liveError ? <p role="alert" className="text-sm text-ent-rust">Unable to verify current check-ins. Automatic retry is enabled.</p>
          : !snapshot && loading ? <p className="text-sm text-ent-muted">Loading current check-ins…</p>
          : <><p className="text-sm text-ent-muted"><strong className="text-ent-ink text-lg">{checkedIn}</strong> caregivers currently checked in</p>
              {live.length === 0 ? <p className="text-sm text-ent-muted">No active caregiver visits.</p>
                : <ul className="space-y-2">
                  {live.slice(0, 5).map(v => <li key={v.id}>
                    <button type="button" onClick={() => onNavigate('operations')}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-ent-line px-3 py-2 text-left hover:bg-ent-bg">
                      <span className="min-w-0">
                        <span className="block font-semibold text-sm text-ent-ink">{staffName(byStaff.get(v.caregiver_id))}</span>
                        <span className="block text-xs text-ent-muted">{byPatient.get(v.patient_id) || 'Patient'} · Since {formatTime(v.actual_start)}</span>
                      </span>
                      <ChevronRight size={15} className="shrink-0" aria-hidden="true"/>
                    </button>
                  </li>)}
                  {live.length > 5 && <li className="text-xs text-ent-muted">{live.length - 5} additional active visits — open Care Operations.</li>}
                </ul>}
              </>
        }
      </section>
      <section className="rounded-xl border border-ent-line bg-ent-panel p-4 sm:p-5 space-y-3" aria-label="Next 48 Hours Coverage">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-ent-ink">Next 48 Hours Coverage</h3>
          <Clock3 className="w-5 h-5 text-ent-muted" aria-hidden="true"/>
        </div>
        {coverageError ? <p role="alert" className="text-sm text-ent-rust">Unable to verify scheduled coverage. Automatic retry is enabled.</p>
          : !snapshot && loading ? <p className="text-sm text-ent-muted">Checking upcoming visits…</p>
          : <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <div><p className="text-lg font-bold text-ent-ink">{upcoming.length}</p><p className="text-xs text-ent-muted">Scheduled visits</p></div>
                <div><p className={'text-lg font-bold ' + (risks?.length ? 'text-ent-rust' : 'text-ent-ink')}>{risks?.length ?? '—'}</p>
                  <p className="text-xs text-ent-muted">Assignment risks</p></div>
              </div>
              <p className="text-xs text-ent-muted">Risk detection covers existing scheduled visits and active staff assignments. It cannot identify care never entered into the schedule.</p>
              <button type="button" onClick={() => onNavigate('scheduling')}
                className="text-sm font-semibold text-ent-ink hover:underline">
                Open Employee Schedule <ChevronRight size={15} className="inline" aria-hidden="true"/>
              </button>
            </div>}
      </section>
    </div>
  );
}
