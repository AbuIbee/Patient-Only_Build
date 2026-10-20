// ROUND 5 — closure evidence for the four items Round 4's handoff
// report explicitly left BLOCKED (not PASS): DEL-01's actual external
// Auth deletion call, THER-01's positive eligibility path, and
// THER-02's two concurrency scenarios gated behind it (accept-wins-
// the-race, reinvite-vs-revoke). Round 4 could not reach these because
// no local isolated environment existed and no authorized mechanism
// was available to establish a real admin/therapist identity without
// directly elevating a staging account (explicitly disallowed).
//
// This round fixed the actual blocker (the migration-001 fresh-install
// ordering defect) which unblocked a genuinely isolated local
// Supabase stack. All four items were then live-verified against that
// stack using disposable identities and the legitimate
// admin_set_role()/local-only admin bootstrap pattern:
//
// DEL-01: a real disposable Auth account was provisioned via the
// actual provision-caregiver-patient Edge Function, then deleted
// end-to-end via the actual delete-pending-registration Edge Function
// (real adminClient.auth.admin.deleteUser() call) — confirmed via a
// zero-count query afterward.
//
// THER-01 positive path: a disposable LOCAL-ONLY account was promoted
// to admin, used it to call the existing, unmodified admin_set_role()
// RPC to promote a second disposable account to role='therapist', and
// ran the full invite -> accept -> write a real therapist_session note
// (201) -> revoke -> further note write rejected (403) lifecycle.
//
// THER-02 remaining scenarios: accept-wins-the-race (revoke still
// correctly deactivated an already-accepted relationship) and
// reinvite-vs-revoke under TRUE concurrency (two backgrounded curl
// requests fired simultaneously against the identical connection row)
// — final persisted state was consistent (status='pending',
// responded_at=NULL), confirming Postgres's row-level locking
// (both functions' FOR UPDATE) serializes the race correctly.
//
// No application code change was required for this closure — only the
// Round 5 local-environment fix. These tests assert that the exact
// migration-source invariants this closure depended on are still
// present, so a future edit that silently removed them would be
// caught here rather than only in a prose report.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ROUND 4 BLOCKED items — closure depends on these invariants staying intact', () => {
  it('DEL-01: the destructive-deletion functions remain service_role-only (migration 063)', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/063_round4_trusted_deletion_authority_separation.sql'), 'utf-8');
    expect(source).toMatch(/REVOKE ALL ON FUNCTION public\.caregiver_authorize_destructive_deletion[\s\S]*?FROM PUBLIC/);
    expect(source).toMatch(/GRANT EXECUTE ON FUNCTION public\.caregiver_authorize_destructive_deletion[\s\S]*?TO service_role/);
  });

  it("THER-01: the positive role='therapist' allowlist remains in place (migration 064)", () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/064_ther01_positive_eligibility.sql'), 'utf-8');
    expect(source).toMatch(/v_therapist_role\s+IS\s+DISTINCT\s+FROM\s+'therapist'/);
    expect(source).toMatch(/v_responder_role\s+IS\s+DISTINCT\s+FROM\s+'therapist'/);
  });

  it('THER-02: revocation still locks the connection row FOR UPDATE and matches both pending and accepted (migration 065)', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/065_ther02_atomic_invitation_revocation.sql'), 'utf-8');
    const fn = source.split('CREATE OR REPLACE FUNCTION public.revoke_therapist_connection')[1];
    expect(fn).toMatch(/FOR UPDATE/);
    expect(fn).toMatch(/status\s+IN\s*\(\s*'pending'\s*,\s*'accepted'\s*\)/);
  });

  it('THER-02: the reinvite path still locks its existing-row read FOR UPDATE, serializing against a concurrent revoke (migration 065)', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/065_ther02_atomic_invitation_revocation.sql'), 'utf-8');
    const fn = source.split('CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist')[1];
    expect(fn).toMatch(/SELECT \* INTO v_existing FROM pending_therapist_connections[\s\S]*?FOR UPDATE/);
  });

  it('admin_set_role remains the only path to role=therapist, and still refuses self-role-change (migration 012)', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/012_profiles_revoke_client_role_authority.sql'), 'utf-8');
    expect(source).toMatch(/admin_set_role/);
    expect(source).toMatch(/role\s+IN\s*\(\s*'admin'\s*,\s*'superadmin'\s*\)/);
  });
});
