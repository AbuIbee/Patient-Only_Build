// F02 regression tests — covers only the new resumable-provisioning
// behaviors this remediation added (full createPatient happy-path coverage
// would need broader Supabase chain mocking than is in scope for this pass).
// Also covers the SEC-003 (CORRECTIVE-002) app-code change: patient
// creation + the initial caregiver link now go through one atomic
// create_patient_with_caregiver() RPC call instead of a direct table write.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock(...) is hoisted above all imports (ESM import bindings run before
// any top-level `const` in this file), so the mock state it closes over
// must itself be created via vi.hoisted() — a plain top-level `const` would
// still be in its TDZ when the factory first runs.
const { signUpMock, resetPasswordMock, fromMock, rpcMock, setResponses } = vi.hoisted(() => {
  const signUpMock = vi.fn();
  const resetPasswordMock = vi.fn().mockResolvedValue({ error: null });
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
  // A hand-rolled chainable Supabase query-builder mock — every method
  // returns the same object so `.select().eq().maybeSingle()` etc. chains
  // arbitrarily, and the object is also thenable so `await` on an unresolved
  // chain (no terminal method called) still works, matching the real client.
  interface MockChain {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: (res: (value: unknown) => unknown, rej: (reason: unknown) => unknown) => Promise<unknown>;
  }

  let responses: Record<string, unknown[]> = {};
  let counters: Record<string, number> = {};

  function chain(resolved: unknown): MockChain {
    const obj = {} as MockChain;
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
    obj.then = (res, rej) => Promise.resolve(resolved).then(res, rej);
    return obj;
  }

  const fromMock = vi.fn((table: string) => {
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const resolved = responses[table]?.[idx] ?? { data: null, error: null };
    return chain(resolved);
  });

  function setResponses(next: Record<string, unknown[]>) {
    responses = next;
    counters = {};
  }

  return { signUpMock, resetPasswordMock, fromMock, rpcMock, setResponses };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
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
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { id: 'unused' }, error: null });
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
    rpcMock.mockResolvedValue({ data: { id: existingId }, error: null });
    setResponses({
      profiles: [
        { data: { id: existingId, provisioning_status: 'profile_created' }, error: null }, // existing-profile lookup
        { error: null }, // profile upsert (resume)
        { error: null }, // provisioning_status -> complete
      ],
    });

    const patient = await createPatient(
      { email: 'partial@example.com', firstName: 'A', lastName: 'B' },
      'caregiver-1'
    );

    expect(signUpMock).not.toHaveBeenCalled();
    expect(patient).toBeTruthy();
    // SEC-003 (CORRECTIVE-002): patient creation + the caregiver link go
    // through the single trusted create_patient_with_caregiver() RPC, never
    // a direct table write, and never a separate "claim" of an id alone.
    expect(rpcMock).toHaveBeenCalledWith('create_patient_with_caregiver', expect.objectContaining({
      p_patient_id: existingId,
      p_relationship_type: 'primary',
    }));
  });

  it('calls auth.signUp only when no existing profile is found for the email', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null });
    rpcMock.mockResolvedValue({ data: { id: 'new-user-id' }, error: null });
    setResponses({
      profiles: [
        { data: null, error: null }, // no existing profile
        { data: [], error: null }, // assertUniqueProfileIdentity's own email-uniqueness check
        { error: null }, // profile upsert
        { error: null }, // provisioning_status -> complete
      ],
    });

    await createPatient({ email: 'brand-new@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1');

    expect(signUpMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('create_patient_with_caregiver', expect.objectContaining({
      p_patient_id: 'new-user-id',
      p_relationship_type: 'primary',
    }));
  });

  it('SEC-003 (CORRECTIVE-002): propagates a create_patient_with_caregiver RPC failure (e.g. the target id already belongs to someone else) as a visible error, never a silent success', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'contested-user-id' } }, error: null });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'A patient record already exists for this id and is not linked to the caller' },
    });
    setResponses({
      profiles: [
        { data: null, error: null },
        { data: [], error: null },
        { error: null },
      ],
    });

    await expect(
      createPatient({ email: 'contested@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1')
    ).rejects.toThrow(/not linked to the caller/i);
  });

  it('SEC-003 (CORRECTIVE-002): never attempts a direct caregiver_patients or patients insert — the only caregiver-link side effect is the RPC call', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'clean-user-id' } }, error: null });
    rpcMock.mockResolvedValue({ data: { id: 'clean-user-id' }, error: null });
    setResponses({
      profiles: [
        { data: null, error: null },
        { data: [], error: null },
        { error: null },
        { error: null },
      ],
    });

    await createPatient({ email: 'clean@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1');

    expect(fromMock).not.toHaveBeenCalledWith('caregiver_patients');
    expect(fromMock).not.toHaveBeenCalledWith('patients');
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('REPAIR A (FINALIZATION-003): propagates the server-side role-gate rejection visibly when the caller is not an admin/superadmin', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'caregiver-attempt-id' } }, error: null });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Only an administrator may create a new patient record on behalf of another account. Caregiver self-service enrollment has no verifiable trusted-authorization mechanism yet and is not permitted through this path." },
    });
    setResponses({
      profiles: [
        { data: null, error: null },
        { data: [], error: null },
        { error: null },
      ],
    });

    await expect(
      createPatient({ email: 'caregiver-attempt@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1')
    ).rejects.toThrow(/only an administrator may create/i);
  });

  it('REPAIR A (FINALIZATION-003): propagates the unclaimed-profile / already-complete-patient rejection visibly, never a silent success', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'already-complete-id' } }, error: null });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "No patient profile pending provisioning exists for id already-complete-id." },
    });
    setResponses({
      profiles: [
        { data: null, error: null },
        { data: [], error: null },
        { error: null },
      ],
    });

    await expect(
      createPatient({ email: 'already-complete@example.com', firstName: 'A', lastName: 'B' }, 'caregiver-1')
    ).rejects.toThrow(/no patient profile pending provisioning/i);
  });
});
