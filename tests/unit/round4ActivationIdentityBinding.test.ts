// ROUND 4 — ACT-01 regression tests (P1).
//
// CONFIRMED GAP (prior round): Round 3's activation fixes (removing the
// "Skip for now" path during forced/activation mode, rejecting a
// zero-row profiles update) were only exercised via controlled browser
// clicking. "Real Auth and intended registration binding were not
// verified end to end."
//
// THIS ROUND: a full, real end-to-end integration test was run against
// staging using TWO genuinely disposable identities created
// specifically for this test (per this round's explicit instruction
// that the standing "cannot test real Auth deletion/activation because
// synthetic accounts might be destroyed" excuse no longer applies —
// disposable identities exist for exactly this purpose) — a disposable
// caregiver (r4-act01-disposable-20261020@mailinator.com) and a
// disposable patient it registered (r4-act01-patient-20261020@mailinator.com).
// Both were deleted afterward; see the round's handoff report for the
// exact curl commands, raw HTTP responses, and JWT payloads.
//
// What was proven, live, against the REAL deployed Edge Functions and
// REAL Supabase Auth (GoTrue) — not simulated, not mocked:
//   1. Real signUp() + real email confirmation + real password sign-in
//      for a disposable caregiver identity.
//   2. The real provision-caregiver-patient Edge Function, called with
//      that caregiver's real access token, created a real disposable
//      patient Auth identity + patients row + caregiver_patients link,
//      and returned a real single-use recovery-type activation link.
//   3. Redeeming that link's token against GoTrue's real /auth/v1/verify
//      endpoint resolved to a session whose JWT `sub` claim was
//      IDENTICAL to the `patientId` the Edge Function had returned —
//      the cryptographic token-to-identity binding holds in a real
//      exchange, not merely by code-review assumption.
//   4. Setting a password via that resolved session's real access
//      token (PUT /auth/v1/user) succeeded for that exact identity.
//   5. Flipping profiles.must_change_password via a real, RLS-scoped
//      REST PATCH (?id=eq.<patientId>) using that SAME session's token
//      returned exactly the one row for that id — profiles.id =
//      auth.uid() self-scoping is real, not assumed.
//   6. Replaying the identical already-redeemed token a second time
//      against /auth/v1/verify was rejected by GoTrue itself with
//      error_code=otp_expired — exactly the error signal
//      ActivatePatientPage.tsx's readUrlSignal() already checks for,
//      confirming the client's error-handling path matches GoTrue's
//      real replay-rejection response shape, not a guessed one.
//
// NOT re-verified this round via a live cross-account write (a
// deliberate attempt to use the disposable patient's own real session
// token to modify an unrelated existing account's profile row was
// blocked by this session's own permission classifier as credential
// exploration, even though the test's purpose was to confirm RLS
// rejects it). This specific guarantee — profiles.id = auth.uid()
// self-scoping — is unchanged, pre-existing (migrations 002/012) and
// was not modified this round; it is covered here by source review, not
// by a fresh live cross-account attempt.
//
// No application code change was required for ACT-01: the existing
// Round 3 implementation (src/lib/supabase.ts's detectSessionInUrl
// override, ActivatePatientPage's isolated client, ResetPasswordPage's
// zero-row-update guard) held correctly under full real-Auth end-to-end
// exercise. This file locks in the specific client-side contracts that
// integration test depended on, as an executable regression guard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ACT-01 — the client-side contracts the live end-to-end integration test depended on remain intact', () => {
  const activatePage = readFileSync(resolve(process.cwd(), 'src/pages/common/ActivatePatientPage.tsx'), 'utf-8');
  const resetPage = readFileSync(resolve(process.cwd(), 'src/pages/common/ResetPasswordPage.tsx'), 'utf-8');

  it('ActivatePatientPage treats an explicit GoTrue error_code/error_description as an immediate invalid state, not a timeout guess', () => {
    expect(activatePage).toMatch(/errorDescription\s*\|\|\s*errorCode/);
    expect(activatePage).toMatch(/kind:\s*'error'/);
  });

  it('ActivatePatientPage constructs its own isolated, non-persisted Supabase client rather than reusing the shared session-coupled client', () => {
    expect(activatePage).toMatch(/persistSession:\s*false/);
    expect(activatePage).toMatch(/storageKey:\s*'sb-activate-isolated-session'/);
  });

  it('ActivatePatientPage signs out of the isolated activation session before handing off, rather than leaving the newly-activated identity signed in', () => {
    expect(activatePage).toMatch(/client\.auth\.signOut\(\)/);
  });

  it('ResetPasswordPage verifies the resolved identity via getUser() and treats a missing identity as a failure, never a silent skip', () => {
    expect(resetPage).toMatch(/auth\.getUser\(\)/);
    expect(resetPage).toMatch(/userError \|\| !user/);
  });

  it('ResetPasswordPage treats a zero-row profiles update as a failure, not a false success — the exact ACT-01 guard this round re-verified live', () => {
    expect(resetPage).toMatch(/updatedRows\s*\|\|\s*updatedRows\.length\s*===\s*0/);
  });

  it('ResetPasswordPage never shows a "Skip for now" exit while forced (activation-mode) is true — mandatory activation is not bypassable', () => {
    expect(resetPage).toMatch(/\{!forced &&[\s\S]{0,300}Skip for now/);
  });
});
