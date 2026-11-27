import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrgVisit } from '../../src/services/organizationDirectorOpsService';
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
    expect(getMissingVisitNotes([completed, documented, visit('future', '2026-11-27T18:00:00Z', 'scheduled')], NOW).map(v => v.id)).toEqual(['missing']);
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

  it('preserves all original homepage sections and appends exactly the selected eight extensions', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/OrganizationDirectorDashboard.tsx'), 'utf8');
    const panel = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/DirectorCommandCenter.tsx'), 'utf8');
    const existing = ['Director Quick Actions', 'Care Team Inventory', 'Open Incidents', 'Needs Your Attention', 'Recent Staff Activity'];
    for (const heading of existing) expect(source).toContain(heading);
    expect(source.indexOf('Director Quick Actions')).toBeLessThan(source.indexOf('<DirectorCommandCenter'));
    expect(source.indexOf('Recent Staff Activity')).toBeLessThan(source.indexOf('<DirectorCommandCenter'));
    expect(source).toContain("label=\"Today's Coverage Exceptions\"");
    expect(source).not.toContain('label="Scheduled Visits"');
    for (const heading of [
      'Live Caregiver Status', "Today's Visit Exceptions", 'Coverage at Risk',
      'Director Action Queue', 'Clinical Coordination Follow-Ups',
      'Visit Documentation Review', 'Staff Readiness', 'Urgent Communications',
    ]) expect(panel).toContain(heading);
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
