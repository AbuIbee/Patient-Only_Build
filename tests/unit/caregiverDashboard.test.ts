// CAREGIVER DASHBOARD-FIRST NAVIGATION regression tests. Pure service-layer
// tests against caregiverRegistrationService.ts's new dashboard functions —
// no React rendering, no real network. Mirrors the established vi.hoisted
// supabase-mock pattern used throughout tests/unit/.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUserMock, fromMock, rpcMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  },
}));

import {
  getMyLinkedPatients,
  setPatientDisplayLabel,
  verifyCaregiverPatientLink,
  getMyPendingRegistrations,
} from '@/services/caregiverRegistrationService';

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe('getMyLinkedPatients — item 2/4: labels, stable reference', () => {
  it('maps each linked patient with its display_label and a short, stable, non-sensitive reference derived from the UUID', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'caregiver-1' } } });
    fromMock.mockImplementation((table: string) => {
      if (table === 'caregiver_patients') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ patient_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', is_primary: true, display_label: 'Mom' }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'patients') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', first_name: 'Jane', last_name: 'Doe', preferred_name: 'Janie' }],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getMyLinkedPatients();
    expect(result).toEqual([{
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      firstName: 'Jane',
      lastName: 'Doe',
      preferredName: 'Janie',
      isPrimary: true,
      displayLabel: 'Mom',
      shortReference: 'EEEEEEEE',
    }]);
  });

  it('a patient with no custom label gets displayLabel: null — never fabricated', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'caregiver-1' } } });
    fromMock.mockImplementation((table: string) => {
      if (table === 'caregiver_patients') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ patient_id: 'p1', is_primary: false, display_label: null }], error: null }) }) };
      }
      return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'p1', first_name: 'A', last_name: 'B', preferred_name: null }], error: null }) }) };
    });
    const [result] = await getMyLinkedPatients();
    expect(result.displayLabel).toBeNull();
  });

  it('returns an empty list (not an error) when the caregiver has no linked patients — the dashboard empty state', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'caregiver-1' } } });
    fromMock.mockImplementation(() => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }));
    expect(await getMyLinkedPatients()).toEqual([]);
  });

  it('returns an empty list when not signed in, never attempting a query', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await getMyLinkedPatients()).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('setPatientDisplayLabel — item 4: scoped write, never touches patient identity', () => {
  it('trims whitespace and sends the trimmed label', async () => {
    const updateMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    fromMock.mockReturnValue({ update: updateMock });
    const { error } = await setPatientDisplayLabel('patient-1', '  Mom  ');
    expect(error).toBeNull();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ display_label: 'Mom' }));
  });

  it('an empty/whitespace-only label clears the custom label (null), not an empty string', async () => {
    const updateMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    fromMock.mockReturnValue({ update: updateMock });
    await setPatientDisplayLabel('patient-1', '   ');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ display_label: null }));
  });

  it('surfaces an RLS/column-privilege rejection as an error string, not a silent success', async () => {
    const updateMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: { message: 'permission denied for table caregiver_patients' } }) }));
    fromMock.mockReturnValue({ update: updateMock });
    const { error } = await setPatientDisplayLabel('unrelated-patient', 'Hijacked');
    expect(error).toMatch(/permission denied/);
  });
});

describe('verifyCaregiverPatientLink — item 3/6: the server-verified gate before any patient-scoped render', () => {
  it('returns true only when the relationship row is actually found', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { patient_id: 'p1' }, error: null }) }) }) });
    expect(await verifyCaregiverPatientLink('p1')).toBe(true);
  });

  it('returns false (fails closed) when no row is found — RLS silently filtered it, not an error', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) });
    expect(await verifyCaregiverPatientLink('unrelated-patient')).toBe(false);
  });

  it('returns false (fails closed) on a query error too — never optimistic on failure', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'network error' } }) }) }) });
    expect(await verifyCaregiverPatientLink('p1')).toBe(false);
  });
});

describe('getMyPendingRegistrations — item 5: incomplete-registration visibility', () => {
  it('maps a resumable registration (Auth account created) with its patient id present', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        registration_id: 'r1', claim_token: 't1', patient_first_name: 'Sam', patient_last_name: 'Lee',
        patient_email: 'sam@example.com', created_at: '2026-01-01T00:00:00Z', resumable_patient_id: 'patient-9',
      }],
      error: null,
    });
    const [result] = await getMyPendingRegistrations();
    expect(result).toEqual({
      registrationId: 'r1', claimToken: 't1', firstName: 'Sam', lastName: 'Lee',
      email: 'sam@example.com', createdAt: '2026-01-01T00:00:00Z', resumablePatientId: 'patient-9',
    });
  });

  it('a registration whose Auth account was never created maps resumablePatientId to null — no false "resume" action', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        registration_id: 'r2', claim_token: 't2', patient_first_name: 'Lee', patient_last_name: 'Kim',
        patient_email: 'lee@example.com', created_at: '2026-01-02T00:00:00Z', resumable_patient_id: null,
      }],
      error: null,
    });
    const [result] = await getMyPendingRegistrations();
    expect(result.resumablePatientId).toBeNull();
  });

  it('returns an empty list on an RPC error rather than throwing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await getMyPendingRegistrations()).toEqual([]);
  });
});
