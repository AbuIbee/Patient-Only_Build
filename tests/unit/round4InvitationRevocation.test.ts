// ROUND 4 — THER-02 regression tests (Codex-reproduced P1).
//
// CONFIRMED DEFECT (migration 059): revoke_therapist_connection() only
// marked pending_therapist_connections 'revoked' WHEN status =
// 'accepted'. A row still at status = 'pending' for the same
// (patient_id, therapist_id) pair survived untouched. Because that
// column pair is UNIQUE (migration 051), the surviving pending row
// remained acceptable via respond_to_therapist_invite() AFTER the
// revocation had already committed, recreating an active relationship
// and completely undoing the revoke.
//
// FIX (migration 065): revoke_therapist_connection() locks the
// connection row FOR UPDATE and revokes it whenever its status is
// 'pending' OR 'accepted' — a revoke always ends all actionable
// authority, not merely an already-accepted one. caregiver_invite_therapist()'s
// reinvite path also takes an explicit FOR UPDATE lock on the same
// row, so a reinvite and a revoke racing the identical row serialize
// through Postgres's native row-lock mechanism rather than two
// independent, unlocked read-then-write statements.
//
// LIVE VERIFICATION (this round, staging, disclosed SET ROLE identity
// simulation): a real pending invitation fixture
// (00000000-...-000000000002) was revoked by its real owning
// caregiver while still 'pending' — confirmed to transition to
// 'revoked' (the exact fix; the prior code would have left it
// 'pending'). The named therapist's subsequent accept attempt on that
// same connection id was then REJECTED with "This invitation has
// already been responded to" — confirming the surviving-pending-then-
// accept attack this round's directive described is closed.
//
// NOT LIVE-VERIFIED THIS ROUND, AND WHY: the reverse ordering (an
// eligible therapist's accept committing before a racing revoke) and
// the reinvite-vs-revoke scenario both require an account that
// actually holds profiles.role = 'therapist' to reach the code past
// Commit C's (THER-01) eligibility gate. Zero such accounts exist on
// staging, and — per this round's explicit instruction — no account
// was elevated to admin/therapist outside the legitimate
// admin_set_role() mechanism to manufacture one. These two scenarios
// are therefore classified BLOCKED (same root cause as THER-01's
// positive-path gap) and are covered here only by migration-source
// review: revoke_therapist_connection's UPDATE WHERE status IN
// ('pending','accepted') structurally applies regardless of which
// operation's row lock is acquired first, and
// caregiver_invite_therapist's reinvite SELECT now carries the same
// FOR UPDATE lock revoke_therapist_connection takes. This is recorded
// as an open item for Codex in the round's handoff report, not
// claimed as a live pass.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = 'supabase/migrations/065_ther02_atomic_invitation_revocation.sql';

describe('THER-02 — migration 065 makes revocation atomic across pending and accepted', () => {
  const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf-8');

  it('revoke_therapist_connection locks the connection row FOR UPDATE before deciding whether to revoke it', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.revoke_therapist_connection')[1];
    expect(fn).toMatch(/FOR UPDATE/);
  });

  it("revoke_therapist_connection revokes BOTH 'pending' and 'accepted' rows, not only 'accepted'", () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.revoke_therapist_connection')[1];
    expect(fn).toMatch(/status\s+IN\s*\(\s*'pending'\s*,\s*'accepted'\s*\)/);
    expect(fn).not.toMatch(/status\s*=\s*'accepted'/);
  });

  it('revoke_therapist_connection still deactivates any existing active therapist_relationships row unconditionally', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.revoke_therapist_connection')[1];
    expect(fn).toMatch(/UPDATE therapist_relationships SET is_active = false/);
  });

  it('caregiver_invite_therapist locks its existing-connection read FOR UPDATE before deciding to reinvite', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist')[1];
    expect(fn).toMatch(/SELECT \* INTO v_existing FROM pending_therapist_connections[\s\S]*?FOR UPDATE/);
  });

  it('caregiver_invite_therapist still enforces the THER-01 positive eligibility gate ahead of the reinvite logic', () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist')[1];
    expect(fn).toMatch(/v_therapist_role\s+IS\s+DISTINCT\s+FROM\s+'therapist'/);
  });
});
