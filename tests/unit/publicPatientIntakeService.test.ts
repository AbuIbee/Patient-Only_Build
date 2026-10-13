// F09 regression tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock(...) is hoisted above all imports (ESM import bindings run before
// any top-level `const` in this file), so the mock state it closes over
// must be created via vi.hoisted() — a plain `const` here would still be
// in its TDZ when the factory first runs.
const { insertMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return { insertMock, fromMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import { createPublicPatientIntake } from '@/services/publicPatientIntakeService';
import type { PatientIntakeFormData } from '@/types/patientIntake';

const minimalForm = {
  patientFirstName: 'Jane',
  patientLastName: 'Doe',
} as unknown as PatientIntakeFormData;

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
});

describe('createPublicPatientIntake', () => {
  // insertMock resolves directly to {error} (what a bare `.insert(payload)`
  // awaits to) rather than exposing a chainable `.select()` — if the source
  // regressed to `.insert(payload).select('id').single()`, this test would
  // throw a TypeError (no `.select` on a Promise) instead of passing, which
  // is the point: it proves the code never asks for a representation back.
  it('returns the client-generated id as the receipt on success, without reading anything back', async () => {
    insertMock.mockResolvedValue({ error: null });
    const { intakeId, error } = await createPublicPatientIntake(minimalForm, 'fixed-id-2');
    expect(error).toBeNull();
    expect(intakeId).toBe('fixed-id-2');
  });

  it('generates its own id when no idempotencyKey is given', async () => {
    insertMock.mockResolvedValue({ error: null });
    const { intakeId } = await createPublicPatientIntake(minimalForm);
    expect(intakeId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('treats a duplicate-key (resubmission with the same idempotencyKey) as success, not an error', async () => {
    insertMock.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "patient_intake_pkey"' },
    });
    const { intakeId, error } = await createPublicPatientIntake(minimalForm, 'retry-id');
    expect(error).toBeNull();
    expect(intakeId).toBe('retry-id');
  });

  it('surfaces a specific message when RLS rejects the insert', async () => {
    insertMock.mockResolvedValue({
      error: { code: '42501', message: 'new row violates row-level security policy for table "patient_intake"' },
    });
    const { intakeId, error } = await createPublicPatientIntake(minimalForm, 'rls-id');
    expect(intakeId).toBe('');
    expect(error?.message).toMatch(/public INSERT policy/i);
  });

  it('surfaces a generic failure for any other error', async () => {
    insertMock.mockResolvedValue({ error: { code: '500', message: 'network error' } });
    const { intakeId, error } = await createPublicPatientIntake(minimalForm, 'other-id');
    expect(intakeId).toBe('');
    expect(error?.message).toBe('network error');
  });
});
