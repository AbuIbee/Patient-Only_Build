// ROUND 5 — Enterprise Caregiver Portal work-tools regression tests.
//
// Covers W01 (Visit Start/End), H11/W06/N08 (Shift Handoff), H12/W07/N09
// (Incident Reporting), W08 (Report Scope Concern), and H17/O06
// (Credentials & Training) — migration 068 plus
// src/services/enterpriseCaregiverWorkToolsService.ts.
//
// LIVE VERIFICATION (this round, local isolated Supabase stack — real
// Postgres, RLS, GoTrue, PostgREST, not simulated): a full disposable
// scenario (director, org-caregiver staff member, covered patient,
// active staff_patient_assignments link) exercised every RPC in
// migration 068 end to end via real HTTP against the deployed
// functions:
//   - schedule/start/end a caregiver visit; get_my_visits returned it.
//   - record a shift handoff; a non-assigned director's acknowledgment
//     attempt was REJECTED ("not an active assigned staff member");
//     the real assigned caregiver's own acknowledgment succeeded;
//     get_patient_shift_handoffs (director override path) returned it
//     with the correct acknowledged_count.
//   - file a high-severity incident report (confirmed
//     supervisor_notified_at was set); the reporting caregiver's own
//     attempt to resolve it was REJECTED ("Only an organization
//     director may resolve"); the director's resolution succeeded.
//   - report a scope concern as the caregiver.
//   - a caregiver's self-service credential-recording attempt was
//     REJECTED ("Only an organization director may record a staff
//     credential" — the gap this round's own code review found and
//     closed before this file existed); the director's recording
//     succeeded; get_my_credentials and get_org_staff_credentials both
//     returned it; a non-director's get_org_staff_credentials attempt
//     was REJECTED.
//   - cross-tenant isolation: an entirely unrelated account received
//     an empty result reading the patient's medications (migration
//     067's staff RLS fix) and was REJECTED filing an incident report
//     for a patient they have no assignment for.
// All test fixtures were deleted after the session; see this round's
// handoff report for the exact curl commands and raw HTTP responses.
//
// The tests below cover what client-layer regression testing can
// verify directly: the service functions call the correct RPC/table
// with the correct parameter names and shapes, and correctly map
// snake_case RPC results to the camelCase shapes the UI will consume.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() }, rpc: rpcMock, from: fromMock, functions: { invoke: vi.fn() } },
}));

import {
  scheduleCaregiverVisit, startCaregiverVisit, endCaregiverVisit, getMyVisits,
  recordShiftHandoff, acknowledgeShiftHandoff, getPatientShiftHandoffs,
  fileIncidentReport, resolveIncidentReport, getPatientIncidentReports,
  reportScopeConcern, getMyCredentials, recordStaffCredential, getOrgStaffCredentials,
} from '@/services/enterpriseCaregiverWorkToolsService';

beforeEach(() => { rpcMock.mockReset(); fromMock.mockReset(); });

const visitRow = {
  id: 'v1', organization_id: 'org1', patient_id: 'p1', caregiver_id: 'c1',
  scheduled_start: '2026-10-21T09:00:00Z', scheduled_end: '2026-10-21T10:00:00Z',
  actual_start: null, actual_end: null, status: 'scheduled', visit_notes: null,
  evv_required: false, evv_latitude: null, evv_longitude: null,
};

describe('W01 — caregiver visit lifecycle', () => {
  it('scheduleCaregiverVisit calls the RPC with correct params and maps the result', async () => {
    rpcMock.mockResolvedValue({ data: visitRow, error: null });
    const { visit, error } = await scheduleCaregiverVisit('org1', 'p1', '2026-10-21T09:00:00Z', '2026-10-21T10:00:00Z');
    expect(error).toBeNull();
    expect(visit).toMatchObject({ id: 'v1', organizationId: 'org1', patientId: 'p1', caregiverId: 'c1', status: 'scheduled' });
    expect(rpcMock).toHaveBeenCalledWith('schedule_caregiver_visit', {
      p_org_id: 'org1', p_patient_id: 'p1', p_scheduled_start: '2026-10-21T09:00:00Z', p_scheduled_end: '2026-10-21T10:00:00Z',
    });
  });

  it('startCaregiverVisit passes optional EVV coordinates through, omitting them (undefined) when not supplied', async () => {
    // ROUND 6 CORRECTION: the RPC's generated Args type is
    // `p_latitude?: number` (optional/undefined), not `number | null`
    // — passing an explicit `null` here was itself a type error this
    // round's real `npm run typecheck` (tsc -p tsconfig.app.json, the
    // project's actual script) caught, which a prior round's `npx tsc
    // --noEmit` with no -p flag had been silently skipping entirely
    // (that invocation compiles zero files against this repo's
    // project-references root tsconfig.json). `undefined` is dropped
    // by JSON.stringify before the request is sent, which is
    // functionally identical to the RPC's own `DEFAULT NULL` — no
    // behavior change, only a type correctness fix.
    rpcMock.mockResolvedValue({ data: { ...visitRow, status: 'in_progress' }, error: null });
    await startCaregiverVisit('v1', 40.7, -74.0);
    expect(rpcMock).toHaveBeenCalledWith('start_caregiver_visit', { p_visit_id: 'v1', p_latitude: 40.7, p_longitude: -74.0 });
    await startCaregiverVisit('v1');
    expect(rpcMock).toHaveBeenCalledWith('start_caregiver_visit', { p_visit_id: 'v1', p_latitude: undefined, p_longitude: undefined });
  });

  it('endCaregiverVisit surfaces a server rejection rather than fabricating a completed visit', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'This visit is not currently in progress' } });
    const { visit, error } = await endCaregiverVisit('v1', 'notes');
    expect(visit).toBeNull();
    expect(error).toMatch(/not currently in progress/);
  });

  it('getMyVisits maps every row and never fabricates a visit on error', async () => {
    rpcMock.mockResolvedValue({ data: [visitRow], error: null });
    const visits = await getMyVisits('p1');
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ id: 'v1', status: 'scheduled' });

    rpcMock.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await getMyVisits()).toEqual([]);
  });
});

describe('H11/W06/N08 — shift handoffs', () => {
  it('recordShiftHandoff relays the server rejection for a non-assigned staff member', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'You are not an active assigned staff member for this patient' } });
    const { error } = await recordShiftHandoff('org1', 'p1', 'summary');
    expect(error).toMatch(/not an active assigned staff member/);
  });

  it('acknowledgeShiftHandoff calls the RPC with the handoff id only', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'a1' }, error: null });
    await acknowledgeShiftHandoff('h1');
    expect(rpcMock).toHaveBeenCalledWith('acknowledge_shift_handoff', { p_handoff_id: 'h1' });
  });

  it('getPatientShiftHandoffs maps acknowledged_count to a number and author name fields', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'h1', author_id: 'c1', author_first_name: 'Jane', author_last_name: 'Doe', summary: 's', pending_tasks: null, concerns: null, created_at: '2026-01-01', acknowledged_count: '1' }],
      error: null,
    });
    const [handoff] = await getPatientShiftHandoffs('org1', 'p1');
    expect(handoff).toMatchObject({ id: 'h1', authorFirstName: 'Jane', authorLastName: 'Doe', acknowledgedCount: 1 });
  });
});

describe('H12/W07/N09 — incident reports', () => {
  const incidentRow = {
    id: 'i1', patient_id: 'p1', reported_by: 'c1', incident_type: 'fall', description: 'd', severity: 'high',
    occurred_at: '2026-01-01', resolution_status: 'open', resolution_notes: null, supervisor_notified_at: '2026-01-01',
  };

  it('fileIncidentReport maps every field including the supervisor-notification timestamp', async () => {
    rpcMock.mockResolvedValue({ data: incidentRow, error: null });
    const { report } = await fileIncidentReport('org1', 'p1', 'fall', 'd', 'high');
    expect(report).toMatchObject({ id: 'i1', severity: 'high', supervisorNotifiedAt: '2026-01-01' });
  });

  // MMA-ENT-CAREGIVER-MASTER-003 D08 (P1): occurredAt is optional and
  // must be sent as null (not simply omitted) when the caller leaves it
  // blank, so the server-side COALESCE(p_occurred_at, now()) default
  // behaves exactly as it did before this parameter existed.
  it('fileIncidentReport sends p_occurred_at: null when no time is given, and the real value when one is', async () => {
    rpcMock.mockResolvedValue({ data: incidentRow, error: null });
    await fileIncidentReport('org1', 'p1', 'fall', 'd', 'high');
    expect(rpcMock).toHaveBeenCalledWith('file_incident_report', expect.objectContaining({ p_occurred_at: null }));

    await fileIncidentReport('org1', 'p1', 'fall', 'd', 'high', '2026-01-01T10:00:00.000Z');
    expect(rpcMock).toHaveBeenCalledWith('file_incident_report', expect.objectContaining({ p_occurred_at: '2026-01-01T10:00:00.000Z' }));
  });

  it('resolveIncidentReport relays a director-only rejection verbatim', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Only an organization director may resolve an incident report' } });
    const { report, error } = await resolveIncidentReport('i1', 'resolved');
    expect(report).toBeNull();
    expect(error).toMatch(/Only an organization director/);
  });

  it('getPatientIncidentReports queries the base table ordered by occurred_at descending', async () => {
    const order = vi.fn().mockResolvedValue({ data: [incidentRow], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });
    const reports = await getPatientIncidentReports('p1');
    expect(fromMock).toHaveBeenCalledWith('incident_reports');
    expect(eq).toHaveBeenCalledWith('patient_id', 'p1');
    expect(order).toHaveBeenCalledWith('occurred_at', { ascending: false });
    expect(reports).toHaveLength(1);
  });
});

describe('W08 — report scope concern', () => {
  it('reportScopeConcern calls the RPC with the exact description text', async () => {
    rpcMock.mockResolvedValue({ data: { id: 's1' }, error: null });
    await reportScopeConcern('org1', 'p1', 'Asked to adjust medication dosage');
    expect(rpcMock).toHaveBeenCalledWith('report_scope_concern', { p_org_id: 'org1', p_patient_id: 'p1', p_description: 'Asked to adjust medication dosage' });
  });
});

describe('H17/O06 — credentials and training', () => {
  it('getMyCredentials maps status and dates for the caller only (no org id param — server scopes to auth.uid())', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'cr1', user_id: 'c1', credential_name: 'CPR', issued_at: '2026-01-01', expires_at: '2027-01-01', status: 'active' }], error: null });
    const creds = await getMyCredentials();
    expect(rpcMock).toHaveBeenCalledWith('get_my_credentials');
    expect(creds[0]).toMatchObject({ credentialName: 'CPR', status: 'active' });
  });

  it('recordStaffCredential relays a self-service rejection — a caregiver cannot grant themselves a credential', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Only an organization director may record a staff credential' } });
    const { error } = await recordStaffCredential('org1', 'c1', 'CPR');
    expect(error).toMatch(/Only an organization director/);
  });

  it('getOrgStaffCredentials maps first/last name fields distinctly from getMyCredentials', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'cr1', user_id: 'c1', first_name: 'Jane', last_name: 'Doe', credential_name: 'CPR', issued_at: null, expires_at: null, status: 'active' }], error: null });
    const [cred] = await getOrgStaffCredentials('org1');
    expect(cred).toMatchObject({ firstName: 'Jane', lastName: 'Doe', credentialName: 'CPR' });
  });
});
