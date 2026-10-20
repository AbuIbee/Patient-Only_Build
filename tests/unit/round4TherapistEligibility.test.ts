// ROUND 4 — THER-01 regression tests (Codex-reproduced P1).
//
// CONFIRMED DEFECT (prior round, migration 062): the therapist
// eligibility check was a denylist — it rejected only role = 'patient'.
// Codex demonstrated that an ORDINARY CAREGIVER-role account (not
// denied by that check) could accept a therapist invitation, obtain an
// active therapist relationship, and read/write professional notes.
// "A patient-role denylist is not professional verification."
//
// FIX (migration 064): a positive allowlist — role = 'therapist' — is
// now required at invite time, at acceptance time, and inside
// is_therapist_for_patient()'s residential-relationship branch.
// profiles.role = 'therapist' is settable ONLY via the pre-existing,
// admin-gated admin_set_role() RPC (migration 012); ordinary clients
// have zero direct write grant on profiles.role.
//
// LIVE VERIFICATION (this round, staging, disclosed SET ROLE identity
// simulation): a real caregiver-role synthetic account
// (d6cb8a9f-5b1c-4e30-9be6-36020cec44bf) was used, as the real owning
// caregiver of a real patient, to call caregiver_invite_therapist
// targeting that caregiver-role account's own email — and was REJECTED
// with "This account has not been verified as a therapist and is not
// eligible to be invited in that capacity" (P0001), where the prior
// code would have succeeded. The positive path (an account actually
// promoted to role='therapist' via admin_set_role() completing an
// invite/accept) was NOT exercised live this round — doing so would
// have required a privilege-escalation write (bootstrapping a synthetic
// account to role='admin') that this session's permission classifier
// declined, and the user chose to accept DATABASE VERIFIED level for
// the positive path via code review rather than approve that write.
// This limitation is also recorded in the round's handoff report.
//
// The tests below cover what source-level/client-level regression
// testing can verify directly: (1) the deployed migration's SQL
// actually contains the positive-allowlist check rather than a
// denylist, in all three enforcement points, and (2) the client-side
// therapist-connection service still never bypasses the RPCs or
// fabricates a relationship locally. The authoritative proof of the
// fix is the live P0001 rejection above and migration 064 as applied
// to staging (see the round's handoff report for exact commands).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = 'supabase/migrations/064_ther01_positive_eligibility.sql';

describe('THER-01 — migration 064 implements a positive allowlist, not a denylist', () => {
  const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf-8');

  it('caregiver_invite_therapist requires role = therapist (not merely role != patient)', () => {
    const fn = source.split('caregiver_invite_therapist')[1];
    expect(fn).toMatch(/v_therapist_role\s+IS\s+DISTINCT\s+FROM\s+'therapist'/);
    expect(fn).not.toMatch(/role\s*=\s*'patient'/);
  });

  it('respond_to_therapist_invite re-validates role = therapist at acceptance, independent of invite time', () => {
    const fn = source.split('respond_to_therapist_invite')[1];
    expect(fn).toMatch(/v_responder_role\s+IS\s+DISTINCT\s+FROM\s+'therapist'/);
  });

  it("is_therapist_for_patient's residential-relationship branch requires a current profiles.role = 'therapist' row, not merely relationship existence", () => {
    const fn = source.split('is_therapist_for_patient')[2];
    expect(fn).toMatch(/profiles\s+WHERE\s+id\s*=\s*auth\.uid\(\)\s+AND\s+role\s*=\s*'therapist'/);
  });

  it('the enterprise staff_patient_assignments eligibility branch is left independently governed (not folded into the profiles.role check)', () => {
    const fn = source.split('is_therapist_for_patient')[2];
    expect(fn).toMatch(/staff_patient_assignments/);
  });

  it('every mutating function in this migration remains SECURITY DEFINER with an explicit auth.uid() IS NULL guard (no anonymous execution)', () => {
    for (const name of ['caregiver_invite_therapist', 'respond_to_therapist_invite']) {
      const fn = source.split(name)[1];
      expect(fn).toMatch(/SECURITY DEFINER/);
      expect(fn).toMatch(/auth\.uid\(\)\s+IS\s+NULL/);
    }
  });
});

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() }, rpc: rpcMock, functions: { invoke: vi.fn() } },
}));

import { inviteTherapist, respondToTherapistInvite } from '@/services/therapistConnectionService';

describe('THER-01 — client layer never second-guesses or bypasses the server-side eligibility gate', () => {
  beforeEach(() => rpcMock.mockReset());

  it('surfaces the server-side ineligibility rejection verbatim rather than retrying or masking it', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'This account has not been verified as a therapist and is not eligible to be invited in that capacity' },
    });
    const { error } = await inviteTherapist('patient-1', 'caregiver-role-account@example.test');
    expect(error).toMatch(/not been verified as a therapist/);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('an accept response never writes a relationship client-side — it only relays the server RPC result', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'This account has not been verified as a therapist and is not eligible to accept this invitation' },
    });
    const { error } = await respondToTherapistInvite('conn-1', true);
    expect(error).toMatch(/not eligible to accept/);
    expect(rpcMock).toHaveBeenCalledWith('respond_to_therapist_invite', { p_connection_id: 'conn-1', p_accept: true });
  });
});
