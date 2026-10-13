// F02 regression tests — covers only the new resumable-provisioning
// behaviors this remediation added (full createPatient happy-path coverage
// would need broader Supabase chain mocking than is in scope for this pass).
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock(...) is hoisted above all imports (ESM import bindings run before
// any top-level `const` in this file), so the mock state it closes over
// must itself be created via vi.hoisted() — a plain top-level `const` would
// still be in its TDZ when the factory first runs.
const { signUpMock, resetPasswordMock, fromMock, setResponses } = vi.hoisted(() => {
  const signUpMock = vi.fn();
  const resetPasswordMock = vi.fn().mockResolvedValue({ error: null });
  let responses: Record<string, any[]> = {};
  let counters: Record<string, number> = {};

  function chain(resolved: any) {
    const obj: any = {};
    const self = () => obj;
    obj.select = vi.fn(self);
    obj.eq = vi.fn(self);
    obj.neq = vi.fn(self);
    obj.limit = vi.fn(self);
    obj.order = vi.fn(self);
    obj.insert = vi.fn(self);
    obj.update = vi.fn(self);
    obj.upsert = vi.fn(self);
    obj.maybeSingle = vi.fn(() => Promise.resolve(resolved));
    obj.single = vi.fn(() => Promise.resolve(resolved));
    obj.then = (res: any, rej: any) => Promise.resolve(resolved).then(res, rej);
    return obj;
  }

  const fromMock = vi.fn((table: string) => {
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const resolved = responses[table]?.[idx] ?? { data: null, error: null };
    return chain(resolved);
  });

  function setResponses(next: Record<string, any[]>) {
    responses = next;
    counters = {};
  }

  return { signUpMock, resetPasswordMock, fromMock, setResponses };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    auth: {
      signUp: signUpMock,
      resetPasswordForEmail: resetPasswordMock,
    },
  },
}));

import { createPatient } from '@/services/patientService';

beforeEach(() => {
  signUpMock.mockReset();
  resetPasswordMock.mockClear();
  resetPasswordMock.mockResolvedValue({ error: null });
});

describe('createPatient — F02 resumable provisioning', () => {
  it('rejects re-provisioning an email whose signup already completed, without calling auth.signUp', async () => {
    setResponses({
      profiles: [{ data: { id: 'existing-id', provisioning_status: 'complete' }, error: null }],
    });

    await expect(
      createPatient({ email: 'done@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1')
    ).rejects.toThrow(/already registered/i);

    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('resumes a partially-provisioned signup using the existing profile id instead of calling auth.signUp again', async () => {
    const existingId = 'partial-user-id';
    setResponses({
      profiles: [
        { data: { id: existingId, provisioning_status: 'profile_created' }, error: null }, // existing-profile lookup
        { error: null }, // profile upsert (resume)
        { error: null }, // provisioning_status -> patient_created
        { error: null }, // provisioning_status -> complete
      ],
      patients: [
        { data: null, error: null }, // no existing patients row yet
        { data: { id: existingId }, error: null }, // insert().select().single()
      ],
      caregiver_patients: [{ error: null }],
    });

    const patient = await createPatient(
      { email: 'partial@example.com', firstName: 'A', lastName: 'B' },
      'caregiver-1'
    );

    expect(signUpMock).not.toHaveBeenCalled();
    expect(patient).toBeTruthy();
  });

  it('calls auth.signUp only when no existing profile is found for the email', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null });
    setResponses({
      profiles: [
        { data: null, error: null }, // no existing profile
        { data: [], error: null }, // assertUniqueProfileIdentity's own email-uniqueness check
        { error: null }, // profile upsert
        { error: null }, // provisioning_status -> patient_created
        { error: null }, // provisioning_status -> complete
      ],
      patients: [
        { data: null, error: null },
        { data: { id: 'new-user-id' }, error: null },
      ],
      caregiver_patients: [{ error: null }],
    });

    await createPatient({ email: 'brand-new@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1');

    expect(signUpMock).toHaveBeenCalledTimes(1);
  });
});
