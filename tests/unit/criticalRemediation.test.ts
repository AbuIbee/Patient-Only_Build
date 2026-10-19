// CRITICAL OWNER-REPORTED REMEDIATION regression tests — pure
// service-layer tests for Corrections A, C, D, F. Mirrors the
// established vi.hoisted supabase-mock pattern used throughout
// tests/unit/. Server-side RLS/RPC authorization logic for these same
// corrections was exercised live against staging (see this cycle's own
// test evidence) — these only verify the client-side mapping/error-
// handling/failure-reproduction contracts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUserMock, getSessionMock, fromMock, rpcMock, functionsInvokeMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getSessionMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock, getSession: getSessionMock },
    from: fromMock,
    rpc: rpcMock,
    functions: { invoke: functionsInvokeMock },
  },
}));

import { selfHealMissingProfile } from '@/services/profileService';
import {
  getPendingRegistrationDetail, updatePendingRegistration, deletePendingRegistrationSafely,
  getMyPendingRegistrations,
} from '@/services/caregiverRegistrationService';
import { recordHelpActivation, getHelpActivationHistory } from '@/services/helpActivationService';

beforeEach(() => {
  getUserMock.mockReset();
  getSessionMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockReset();
  functionsInvokeMock.mockReset();
});

describe('selfHealMissingProfile — Correction C: the profile-lifecycle repair path', () => {
  it('returns the healed profile row on success', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'u1', email: 'a@example.test', role: 'patient' }, error: null });
    const { profile, error } = await selfHealMissingProfile();
    expect(error).toBeNull();
    expect(profile?.id).toBe('u1');
    expect(rpcMock).toHaveBeenCalledWith('self_heal_my_profile');
  });

  it('FAILURE REPRODUCTION: surfaces a server rejection (e.g. no Auth account) as an error, never a fabricated profile', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'No Auth account found for this session' } });
    const { profile, error } = await selfHealMissingProfile();
    expect(profile).toBeNull();
    expect(error).toMatch(/No Auth account/);
  });
});

describe('getPendingRegistrationDetail / updatePendingRegistration — Correction A: Edit Registration', () => {
  it('maps every stored field and flags hasResumableAccount from the matching summary row', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_my_pending_registration_detail') {
        return Promise.resolve({
          data: {
            id: 'reg-1', patient_first_name: 'Jane', patient_last_name: 'Doe', patient_email: 'jane@example.test',
            patient_preferred_name: 'Janie', patient_date_of_birth: '1950-01-01', patient_diagnosis_date: null,
            patient_dementia_stage: 'early', patient_location: 'Austin', patient_address: '123 Main St',
            emergency_contact_name: 'Sam', emergency_contact_relationship: 'son', emergency_contact_phone: '555-1111',
            emergency_contact_email: null, relationship_type: 'primary',
          },
          error: null,
        });
      }
      if (name === 'get_my_pending_registrations') {
        return Promise.resolve({
          data: [{ registration_id: 'reg-1', claim_token: 't1', patient_first_name: 'Jane', patient_last_name: 'Doe', patient_email: 'jane@example.test', created_at: '2026-01-01T00:00:00Z', resumable_patient_id: 'p1' }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { detail, error } = await getPendingRegistrationDetail('reg-1');
    expect(error).toBeNull();
    expect(detail).toMatchObject({ registrationId: 'reg-1', firstName: 'Jane', email: 'jane@example.test', hasResumableAccount: true });
  });

  it('FAILURE REPRODUCTION: a non-owned or already-consumed registration surfaces an error, never a blank editable form', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'No editable registration found for this id' } });
    const { detail, error } = await getPendingRegistrationDetail('not-mine');
    expect(detail).toBeNull();
    expect(error).toMatch(/No editable registration/);
  });

  it('FAILURE REPRODUCTION: the server rejects an email change once an account already exists — this is the exact bug confirmed and fixed (orphaned identity risk)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'An account was already created for the original email on this registration. Delete this registration first (which also removes that unused account), then register again with the new email.' },
    });
    const { error } = await updatePendingRegistration('reg-1', {
      firstName: 'Jane', lastName: 'Doe', email: 'new-email@example.test',
    });
    expect(error).toMatch(/already created for the original email/);
  });

  it('sends every field through to the RPC with the correct parameter names', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'reg-1' }, error: null });
    await updatePendingRegistration('reg-1', {
      firstName: 'Jane', lastName: 'Doe', email: 'JANE@Example.TEST', preferredName: 'Janie', relationshipType: 'daughter',
    });
    expect(rpcMock).toHaveBeenCalledWith('caregiver_update_pending_registration', expect.objectContaining({
      p_registration_id: 'reg-1', p_first_name: 'Jane', p_last_name: 'Doe', p_email: 'jane@example.test',
      p_preferred_name: 'Janie', p_relationship_type: 'daughter',
    }));
  });
});

describe('deletePendingRegistrationSafely — Correction A: orphan-safe Delete Registration', () => {
  it('FAILURE REPRODUCTION (the confirmed bug this replaces): without this safe path, deleting a registration whose Auth account was already created would permanently strand that account — this wrapper routes through the Edge Function instead of the bare cancel RPC', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    functionsInvokeMock.mockResolvedValue({ data: { success: true, removedUnusedAccount: true }, error: null });
    const { removedUnusedAccount, error } = await deletePendingRegistrationSafely('reg-1');
    expect(error).toBeNull();
    expect(removedUnusedAccount).toBe(true);
    expect(functionsInvokeMock).toHaveBeenCalledWith('delete-pending-registration', { body: { registrationId: 'reg-1' } });
  });

  it('reports no unused account removed when none existed (the common, non-resumable case)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    functionsInvokeMock.mockResolvedValue({ data: { success: true, removedUnusedAccount: false }, error: null });
    const { removedUnusedAccount } = await deletePendingRegistrationSafely('reg-2');
    expect(removedUnusedAccount).toBe(false);
  });

  it('requires an active session before attempting the Edge Function call', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { error } = await deletePendingRegistrationSafely('reg-1');
    expect(error).toMatch(/signed in/);
    expect(functionsInvokeMock).not.toHaveBeenCalled();
  });
});

describe('getMyPendingRegistrations — unchanged regression check', () => {
  it('still maps resumablePatientId correctly (Correction A adds Edit/safe-Delete alongside this, never replacing it)', async () => {
    rpcMock.mockResolvedValue({
      data: [{ registration_id: 'r1', claim_token: 't1', patient_first_name: 'Sam', patient_last_name: 'Lee', patient_email: 'sam@example.test', created_at: '2026-01-01T00:00:00Z', resumable_patient_id: 'patient-9' }],
      error: null,
    });
    const [result] = await getMyPendingRegistrations();
    expect(result.resumablePatientId).toBe('patient-9');
  });
});

describe('recordHelpActivation — Correction F: never claims delivery', () => {
  it('reports recorded:true with the caregiver count on success', async () => {
    rpcMock.mockResolvedValue({ data: { caregiver_count_at_time: 2 }, error: null });
    const { recorded, caregiverCount, error } = await recordHelpActivation('555-0100');
    expect(recorded).toBe(true);
    expect(caregiverCount).toBe(2);
    expect(error).toBeNull();
  });

  it('FAILURE REPRODUCTION: an RPC error (e.g. offline) reports recorded:false — callers must never show a success state for an unsent record', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'network error' } });
    const { recorded, error } = await recordHelpActivation('555-0100');
    expect(recorded).toBe(false);
    expect(error).toBeTruthy();
  });

  it('a thrown/rejected call (genuinely offline) is caught and reported as not recorded, never thrown to the caller', async () => {
    rpcMock.mockRejectedValue(new Error('Failed to fetch'));
    const { recorded, error } = await recordHelpActivation(null);
    expect(recorded).toBe(false);
    expect(error).toMatch(/offline/);
  });
});

describe('getHelpActivationHistory — Correction E/F: caregiver-visible safety history', () => {
  it('maps acknowledgedBy and never fabricates a non-empty array when nothing was acknowledged', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'h1', created_at: '2026-01-01T00:00:00Z', phone_dialed: '555-0100', caregiver_count_at_time: 1, conversation_id: 'c1', acknowledged_count: 0, acknowledged_by: null, notification_status: 'caregiver_notified' }],
      error: null,
    });
    const { entries, error } = await getHelpActivationHistory('patient-1');
    expect(error).toBeNull();
    const [entry] = entries;
    expect(entry.acknowledgedCount).toBe(0);
    expect(entry.acknowledgedBy).toEqual([]);
  });

  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 6/7: the exact regression
  // this round's signature change exists to close — a failed query must
  // never read identically to "no HELP activations recorded."
  it('FAILURE REPRODUCTION: a failed query reports an error and an empty array, never a fabricated empty-but-successful history', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection timeout' } });
    const { entries, error } = await getHelpActivationHistory('patient-1');
    expect(entries).toEqual([]);
    expect(error).toMatch(/connection timeout/);
  });
});
