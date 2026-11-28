import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrgVisit } from '../../src/services/organizationDirectorOpsService';
import type { DashboardSources } from '../../src/services/hcnDirectorDashboardSources';
import { buildAttentionRows } from '../../src/pages/enterprise/DirectorCommandCenter';
import {
  dayKey, getVisitExceptions, getCoverageRisks, getMissingVisitNotes, getReadinessFindings,
} from '../../src/services/hcnDirectorDashboardInsights';

const NOW = Date.parse('2026-11-27T17:00:00Z');
const person = { userId: 'staff-a', orgRole: 'caregiver', status: 'active', firstName: 'Sample', lastName: 'Caregiver' };
const assignment = { user_id: 'staff-a', patient_id: 'patient-a', org_role: 'caregiver', is_active: true };
function visit(id: string, start: string, status: OrgVisit['status'], extra: Partial<OrgVisit> = {}): OrgVisit {
  return {
    id, patientId: 'patient-a', patientName: 'Fictional Patient', caregiverId: 'staff-a',
    caregiverName: 'Sample Caregiver', scheduledStart: start,
    scheduledEnd: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
    actualStart: null, actualEnd: null, visitNotes: null, status, ...extra,
  };
}

describe('HCN Director exception-first dashboard', () => {
  it('uses the explicitly selected office timezone, including cross-date boundaries', () => {
    expect(dayKey('2026-11-27T02:00:00Z', 'America/New_York')).toBe('2026-11-26');
    expect(dayKey('2026-11-27T02:00:00Z', 'UTC')).toBe('2026-11-27');
  });

  it('handles daylight saving day comparison in the office timezone', () => {
    expect(dayKey('2026-03-08T06:59:59Z', 'America/New_York')).toBe('2026-03-08');
    expect(dayKey('2026-03-08T07:00:00Z', 'America/New_York')).toBe('2026-03-08');
  });

  it('counts missed, late and overdue-checkout visits once per visit', () => {
    const rows = [
      visit('missed', '2026-11-27T12:00:00Z', 'missed'),
      visit('late', '2026-11-27T16:40:00Z', 'scheduled'),
      visit('overdue', '2026-11-27T14:00:00Z', 'in_progress', { actualStart: '2026-11-27T14:01:00Z' }),
      visit('cancelled', '2026-11-27T15:00:00Z', 'canceled'),
      visit('complete', '2026-11-27T15:00:00Z', 'completed', { actualStart: '2026-11-27T15:02:00Z', actualEnd: '2026-11-27T16:00:00Z' }),
      visit('tomorrow', '2026-11-28T15:00:00Z', 'scheduled'),
      visit('yesterday', '2026-11-26T16:00:00Z', 'scheduled'),
    ];
    expect(getVisitExceptions(rows, 'UTC', NOW).map(v => v.visit.id)).toEqual(['missed', 'late', 'overdue']);
  });

  it('uses strict 15-minute late-arrival and 30-minute checkout boundaries', () => {
    const exactlyLate = visit('late', '2026-11-27T16:45:00Z', 'scheduled');
    const exactlyCheckout = visit('checkout', '2026-11-27T15:30:00Z', 'in_progress', { actualStart: '2026-11-27T15:31:00Z', scheduledEnd: '2026-11-27T16:30:00Z' });
    expect(getVisitExceptions([exactlyLate, exactlyCheckout], 'UTC', NOW)).toHaveLength(0);
    expect(getVisitExceptions([exactlyLate, exactlyCheckout], 'UTC', NOW + 1000)).toHaveLength(2);
  });

  it('does not cap exception detection at 50 rows or include normal future workload', () => {
    const rows = Array.from({ length: 150 }, (_, i) =>
      visit(String(i), '2026-11-27T16:00:00Z', i < 75 ? 'scheduled' : 'completed'));
    expect(getVisitExceptions(rows, 'UTC', NOW)).toHaveLength(75);
  });

  it('counts only scheduled visits with provable coverage problems in the next 48 hours', () => {
    const future = visit('one', '2026-11-27T18:00:00Z', 'scheduled');
    const tooLate = visit('past', '2026-11-27T15:00:00Z', 'scheduled');
    const beyond = visit('outside', '2026-11-30T17:00:00Z', 'scheduled');
    expect(getCoverageRisks([future, tooLate, beyond], [person], [assignment], NOW)).toHaveLength(0);
    expect(getCoverageRisks([future], [{ ...person, status: 'invited' }], [assignment], NOW)).toHaveLength(1);
    expect(getCoverageRisks([future], [person], [], NOW)).toHaveLength(1);
  });

  it('identifies completed visits missing notes, not ordinary scheduled visits', () => {
    const completed = visit('missing', '2026-11-27T14:00:00Z', 'completed', { actualEnd: '2026-11-27T15:00:00Z' });
    const documented = visit('documented', '2026-11-27T14:00:00Z', 'completed', { actualEnd: '2026-11-27T15:00:00Z', visitNotes: 'Patient ate lunch.' });
    const brokenCheckout = visit('broken', '2026-11-27T13:00:00Z', 'completed', { actualEnd: null });
    expect(getMissingVisitNotes([completed, documented, brokenCheckout, visit('future', '2026-11-27T18:00:00Z', 'scheduled')], NOW).map(v => v.id)).toEqual(['missing', 'broken']);
  });

  it('flags pending staff, expiring credentials and near-start missing previsit acknowledgments', () => {
    const upcoming = visit('near', '2026-11-27T17:20:00Z', 'scheduled');
    const credential = { id: 'cred-1', user_id: 'staff-a', credential_name: 'CPR', expires_at: '2026-11-28T17:00:00Z', status: 'active' };
    const pending = { ...person, userId: 'staff-b', status: 'invited' };
    const findings = getReadinessFindings([person, pending], [credential], [upcoming], [], NOW);
    expect(findings.map(f => f.key)).toEqual(['invited:staff-b', 'credential:cred-1', 'previsit:near']);
    const acknowledged = [{ visit_id: 'near', caregiver_id: 'staff-a', acknowledged_at: '2026-11-27T16:55:00Z' }];
    expect(getReadinessFindings([person], [], [upcoming], acknowledged, NOW)).toHaveLength(0);
  });

  it('preserves the original homepage and consolidates attention items without duplicate panels', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/OrganizationDirectorDashboard.tsx'), 'utf8');
    const panel = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/DirectorCommandCenter.tsx'), 'utf8');
    const existing = ['Director Quick Actions', 'Care Team Inventory', 'Open Incidents', 'Needs Your Attention', 'Recent Staff Activity'];
    for (const heading of existing) expect(source).toContain(heading);
    expect(source.indexOf('Director Quick Actions')).toBeLessThan(source.indexOf('<DirectorCommandCenter'));
    expect(source.indexOf('Recent Staff Activity')).toBeLessThan(source.indexOf('<DirectorCommandCenter'));
    expect(source).toContain('<DirectorNeedsAttention command={command}');
    expect(source).toContain('id="hcn-needs-attention"');
    expect(source).toContain('label="Today\'s Coverage Exceptions"');
    expect(source).not.toContain('label="Scheduled Visits"');
    expect(panel).toContain('Live Caregiver Status');
    expect(panel).toContain('Next 48 Hours Coverage');
    expect(panel).toContain('Clinical coordination');
    expect(panel).toContain('Urgent communications');
    expect(panel).not.toContain('Director Operational Command Center');
    expect(panel).not.toContain('Office operational time zone');
    expect(panel).not.toContain('Select your office time zone');
    expect(panel).not.toContain('hcn-office-timezone');
    expect(panel).not.toContain('onClick={() => { void reload(); }}');
    expect(panel).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone');
    expect(panel).toContain('60_000');
    expect(panel).toContain("document.addEventListener('visibilitychange', onReturn)");
    expect(panel).toContain("window.addEventListener('focus', onReturn)");
  });

  it('merges all actionable feeds into one prioritized Needs Your Attention queue', () => {
    const safe = <T,>(data: T) => ({ data, error: null });
    const input = {
      visits: safe([
        visit('late', '2026-11-27T16:30:00Z', 'scheduled'),
        visit('future', '2026-11-27T18:00:00Z', 'scheduled'),
        visit('note', '2026-11-27T14:00:00Z', 'completed', { actualEnd: '2026-11-27T15:00:00Z' }),
      ]),
      activeVisits: safe([]),
      assignments: safe([]),
      credentials: safe([]),
      acknowledgments: safe([]),
      clinicalRequests: safe([
        { id: 'c1', patient_id: 'patient-a', title: 'Provider response', status: 'awaiting_response',
          deadline_at: '2026-11-27T18:00:00Z', updated_at: '', sent_at: null, closed_at: null, cancelled_at: null },
      ]),
      coordinationTasks: safe([]),
      escalations: safe([]),
      incidents: safe([
        { id: 'i1', patient_id: 'patient-a', incident_type: 'fall', severity: 'critical',
          occurred_at: '2026-11-27T15:00:00Z', resolution_status: 'open' },
      ]),
      urgentConversations: safe([
        { id: 'm1', conversation_id: 'conv1', created_at: '2026-11-27T16:50:00Z',
          sender_id: 'sender', subject: 'Help needed', read_at: null, acknowledged_at: null },
      ]),
      refreshedAt: NOW,
    } as DashboardSources;
    const items = buildAttentionRows(input, [], [], 'UTC', NOW);
    expect(new Set(items.map(i => i.category))).toEqual(new Set([
      'visits', 'coverage', 'documentation', 'clinical', 'incidents', 'messages',
    ]));
    expect(items[0].severity).toBe(0);
    expect(items).toHaveLength(6);
    expect(items.every(item => item.route && item.title)).toBe(true);
  });

  it('opens the Coverage Exceptions KPI in operational visit triage, not a second homepage webpart', () => {
    const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/OrganizationDirectorDashboard.tsx'), 'utf8');
    const attendance = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/DirectorAttendancePanel.tsx'), 'utf8');

    expect(dashboard).toContain('onClick={onOpenVisitExceptions}');
    expect(dashboard).toContain("setAttendanceView('exceptions')");
    expect(dashboard).toContain("setNav('operations')");
    expect(dashboard).toContain('initialView={attendanceView}');
    expect(dashboard).toContain("onOpenSchedule={() => navigate('scheduling')}");
    expect(dashboard).not.toContain("document.getElementById('hcn-needs-attention')?.scrollIntoView");

    expect(attendance).toContain("view === 'exceptions'");
    expect(attendance).toContain("getOrgVisitsWindow(");
    expect(attendance).toContain("getVisitExceptions(visits, localZone(), now)");
    expect(attendance).toContain('Open Employee Schedule');
    expect(attendance).toContain('No verified late arrivals, missed visits or overdue checkouts today.');
    expect(attendance).not.toContain("visits.filter(v => v.actualStart || v.actualEnd).filter");
  });

  it('reads real RLS-scoped organization visits and fails closed on data truncation', () => {
    const service = readFileSync(resolve(process.cwd(), 'src/services/hcnDirectorDashboardSources.ts'), 'utf8');
    expect(service).toContain('getOrgVisitsWindow(orgId, start, end)');
    expect(service).toContain(".eq('organization_id', orgId)");
    expect(service).toContain('More than 5,000 records');
    expect(service).toContain('getMyConversationsResult()');
    expect(service).toContain("filter(row => permitted.has(row.patientId))");
  });
});
