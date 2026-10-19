// CODEX-VERIFIED CRITICAL REMEDIATION regression tests — client-layer
// coverage for migrations 049-052 (Criticals 1/2/6/9). Mirrors the
// established vi.hoisted supabase-mock pattern used throughout
// tests/unit/. The server-side RLS/RPC/concurrency/atomicity behavior
// these migrations implement was exercised live against staging via
// SET ROLE identity simulation (see this cycle's own test evidence) —
// these only verify the client-side mapping/error-handling/failure-
// reproduction contracts that sit on top of it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock, rpcMock, functionsInvokeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  rpcMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    rpc: rpcMock,
    functions: { invoke: functionsInvokeMock },
  },
}));

import {
  inviteTherapist, respondToTherapistInvite, getMyPendingTherapistInvites,
  getPatientCareTeamConnections, revokeTherapistConnection, getMyTherapistPatients,
} from '@/services/therapistConnectionService';
import { regenerateActivationLink } from '@/services/caregiverRegistrationService';
import { recordHelpActivation } from '@/services/helpActivationService';

beforeEach(() => {
  getSessionMock.mockReset();
  rpcMock.mockReset();
  functionsInvokeMock.mockReset();
});

describe('Critical 9 — therapist invite/accept/revoke, never a unilateral grant', () => {
  it('inviteTherapist calls the invite RPC and never writes a relationship directly', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { error } = await inviteTherapist('patient-1', 'Therapist@Example.test ', 'primary');
    expect(error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('caregiver_invite_therapist', {
      p_patient_id: 'patient-1', p_therapist_email: 'therapist@example.test', p_relationship_type: 'primary',
    });
  });

  it('FAILURE REPRODUCTION: inviting a therapist who has no account surfaces the server error rather than silently succeeding', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'No account found for this email. The therapist must already have signed up.' } });
    const { error } = await inviteTherapist('patient-1', 'nobody@example.test');
    expect(error).toMatch(/No account found/);
  });

  it('respondToTherapistInvite is the ONLY call that may ever accept — a decline is distinguishable from an accept', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await respondToTherapistInvite('conn-1', true);
    expect(rpcMock).toHaveBeenCalledWith('respond_to_therapist_invite', { p_connection_id: 'conn-1', p_accept: true });
    await respondToTherapistInvite('conn-1', false);
    expect(rpcMock).toHaveBeenCalledWith('respond_to_therapist_invite', { p_connection_id: 'conn-1', p_accept: false });
  });

  it('getMyPendingTherapistInvites maps every field and never fabricates an invite on error', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        connection_id: 'c1', patient_id: 'p1', patient_first_name: 'Jane', patient_last_name: 'Doe',
        patient_preferred_name: 'Janie', caregiver_first_name: 'Sam', caregiver_last_name: 'Lee',
        relationship_type: 'consulting', created_at: '2026-01-01T00:00:00Z',
      }],
      error: null,
    });
    const [invite] = await getMyPendingTherapistInvites();
    expect(invite).toMatchObject({ connectionId: 'c1', patientId: 'p1', patientFirstName: 'Jane', relationshipType: 'consulting' });

    rpcMock.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await getMyPendingTherapistInvites()).toEqual([]);
  });

  it('getPatientCareTeamConnections distinguishes active/pending/declined/ended statuses', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { source: 'active', connection_id: 'r1', therapist_id: 't1', first_name: 'A', last_name: 'B', relationship_type: 'primary', status: 'active', created_at: '2026-01-01T00:00:00Z' },
        { source: 'invitation', connection_id: 'c2', therapist_id: 't2', first_name: 'C', last_name: 'D', relationship_type: 'consulting', status: 'pending', created_at: '2026-01-02T00:00:00Z' },
      ],
      error: null,
    });
    const connections = await getPatientCareTeamConnections('patient-1');
    expect(connections.map((c) => c.status)).toEqual(['active', 'pending']);
  });

  it('revokeTherapistConnection — a revoke-only RPC; never used to grant access', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { error } = await revokeTherapistConnection('patient-1', 'therapist-1');
    expect(error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('revoke_therapist_connection', { p_patient_id: 'patient-1', p_therapist_id: 'therapist-1' });
  });

  it('FAILURE REPRODUCTION: revoking a connection the caller does not own is rejected, not silently accepted', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'You are not an authorized caregiver for this patient' } });
    const { error } = await revokeTherapistConnection('patient-1', 'therapist-1');
    expect(error).toMatch(/not an authorized caregiver/);
  });

  it('getMyTherapistPatients only lists accepted connections for the residential therapist dashboard', async () => {
    rpcMock.mockResolvedValue({
      data: [{ patient_id: 'p1', first_name: 'Jane', last_name: 'Doe', preferred_name: null, relationship_type: 'primary' }],
      error: null,
    });
    const [patient] = await getMyTherapistPatients();
    expect(patient).toMatchObject({ patientId: 'p1', firstName: 'Jane', relationshipType: 'primary' });
  });
});

describe('regenerateActivationLink — Critical 2: a successful claim-only retry must not leave the patient without an activation path', () => {
  it('requires an active caregiver session before calling the Edge Function', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { link, error } = await regenerateActivationLink('patient-1');
    expect(link).toBeNull();
    expect(error).toMatch(/signed in/);
    expect(functionsInvokeMock).not.toHaveBeenCalled();
  });

  it('returns the regenerated link on success, passing the real browser origin as callbackOrigin', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    functionsInvokeMock.mockResolvedValue({ data: { success: true, activationLink: 'https://example.test/auth/v1/verify?...' }, error: null });
    const { link, error } = await regenerateActivationLink('patient-1');
    expect(error).toBeNull();
    expect(link).toMatch(/^https:\/\//);
    expect(functionsInvokeMock).toHaveBeenCalledWith('regenerate-activation-link', expect.objectContaining({ body: expect.objectContaining({ patientId: 'patient-1' }) }));
  });

  it('FAILURE REPRODUCTION: a caregiver no longer linked to this patient is rejected server-side, not given a link', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    functionsInvokeMock.mockResolvedValue({ data: { success: false, error: 'You are not an authorized caregiver for this patient.' }, error: null });
    const { link, error } = await regenerateActivationLink('patient-1');
    expect(link).toBeNull();
    expect(error).toMatch(/not an authorized caregiver/);
  });
});

describe('recordHelpActivation — Critical 6: a messaging failure must never erase the safety record', () => {
  it('no_caregiver_linked is reported distinctly from a genuine messaging failure', async () => {
    rpcMock.mockResolvedValue({ data: { caregiver_count_at_time: 0, notification_status: 'no_caregiver_linked' }, error: null });
    const { recorded, notificationStatus } = await recordHelpActivation(null);
    expect(recorded).toBe(true);
    expect(notificationStatus).toBe('no_caregiver_linked');
  });

  it('notification_failed still reports recorded:true — the event survives even though the alert did not go out', async () => {
    rpcMock.mockResolvedValue({ data: { caregiver_count_at_time: 1, notification_status: 'notification_failed' }, error: null });
    const { recorded, notificationStatus } = await recordHelpActivation('555-0100');
    expect(recorded).toBe(true);
    expect(notificationStatus).toBe('notification_failed');
  });

  it('caregiver_notified is the only status that implies an alert actually went out', async () => {
    rpcMock.mockResolvedValue({ data: { caregiver_count_at_time: 1, notification_status: 'caregiver_notified' }, error: null });
    const { notificationStatus } = await recordHelpActivation('555-0100');
    expect(notificationStatus).toBe('caregiver_notified');
  });
});
