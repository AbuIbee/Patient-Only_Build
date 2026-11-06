import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));

import {
  loadHealthcareContacts, saveHealthcareContact, type HealthcareContactInput,
} from './healthcareContactsService';

const form: HealthcareContactInput = {
  name: ' Dr. Example ', role: 'Primary physician', phone: '555-0100',
  email: '', alternatePhone: '', practiceName: '', address: '',
  preferredContactMethod: '', notes: '', isPreferredHospital: false,
};

const dbRow = {
  id: 'provider-1', patient_id: 'patient-1', provider_name: 'Dr. Example',
  provider_role: 'Primary physician', phone: '555-0100', email: null,
  alternate_phone: null, practice_name: null, address: null,
  preferred_contact_method: null, notes: null, is_preferred_hospital: false,
  verification_status: 'unverified', is_active: true, version: 3,
  updated_at: '2026-11-06T12:00:00Z',
};

describe('HCN shared healthcare contacts', () => {
  beforeEach(() => { mock.rpc.mockReset(); mock.from.mockReset(); });

  it('reads only the specified patient directory and maps unverified provenance', async () => {
    const order = vi.fn().mockResolvedValue({ data: [dbRow], error: null });
    const secondEq = vi.fn().mockReturnValue({ order });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const select = vi.fn().mockReturnValue({ eq: firstEq });
    mock.from.mockReturnValue({ select });

    const result = await loadHealthcareContacts('patient-1');

    expect(mock.from).toHaveBeenCalledWith('patient_care_providers');
    expect(firstEq).toHaveBeenCalledWith('patient_id', 'patient-1');
    expect(secondEq).toHaveBeenCalledWith('is_active', true);
    expect(result).toMatchObject({
      error: null, data: [{ id: 'provider-1', version: 3, verificationStatus: 'unverified' }],
    });
  });

  it('fails closed instead of displaying a blank directory on RLS denial', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    mock.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order }),
        }),
      }),
    });
    const result = await loadHealthcareContacts('patient-1');
    expect(result.data).toBeNull();
    expect(result.error).toBe('permission denied');
  });

  it('uses the scoped RPC with the original contact version to reject stale writes', async () => {
    mock.rpc.mockResolvedValue({ data: dbRow, error: null });
    const result = await saveHealthcareContact('patient-1', form, { id: 'provider-1', version: 3 });
    expect(result).toMatchObject({ error: null, data: { id: 'provider-1', version: 3 } });
    expect(mock.rpc).toHaveBeenCalledWith('hcn_save_patient_contact', expect.objectContaining({
      p_patient_id: 'patient-1',
      p_provider_id: 'provider-1',
      p_expected_version: 3,
      p_provider_name: 'Dr. Example',
      p_is_preferred_hospital: false,
    }));
  });

  it('never reports success for an authorization failure', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'Not authorized for this patient' } });
    const result = await saveHealthcareContact('patient-1', form);
    expect(result.data).toBeNull();
    expect(result.error).toContain('Not authorized');
  });

  it('does not invoke the backend for an empty patient, contact name or role', async () => {
    expect((await saveHealthcareContact('', form)).error).toBeTruthy();
    expect((await saveHealthcareContact('patient-1', { ...form, name: ' ' })).error).toBeTruthy();
    expect((await saveHealthcareContact('patient-1', { ...form, role: ' ' })).error).toBeTruthy();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('returns a recoverable load failure when the network promise rejects', async () => {
    mock.from.mockImplementation(() => { throw new TypeError('Failed to fetch'); });
    const result = await loadHealthcareContacts('patient-1');
    expect(result.data).toBeNull();
    expect(result.error).toContain('connection');
  });

  it('does not claim a save failed or succeeded when its network response was lost', async () => {
    mock.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await saveHealthcareContact('patient-1', form);
    expect(result.data).toBeNull();
    expect(result.error).toContain('could not be confirmed');
    expect(result.error).toContain('Refresh');
  });

  it('rejects a save response belonging to another patient or contact', async () => {
    mock.rpc.mockResolvedValue({ data: { ...dbRow, patient_id: 'patient-2' }, error: null });
    expect((await saveHealthcareContact('patient-1', form)).data).toBeNull();
    mock.rpc.mockResolvedValue({ data: { ...dbRow, id: 'provider-2' }, error: null });
    expect((await saveHealthcareContact('patient-1', form, { id: 'provider-1', version: 3 })).data).toBeNull();
  });

  it('rejects a directory response containing another patient record', async () => {
    mock.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({
      order: async () => ({ data: [{ ...dbRow, patient_id: 'patient-2' }], error: null }),
    }) }) }) });
    const result = await loadHealthcareContacts('patient-1');
    expect(result.data).toBeNull();
    expect(result.error).toContain('selected patient');
  });

});
