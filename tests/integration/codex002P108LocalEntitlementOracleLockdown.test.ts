// MMA-P1-CODEX-002 P1-08 -- local entitlement/coverage oracle lockdown.
// Migration 152. Proves: an authenticated user can no longer call
// patient_has_paid_entitlement(uuid)/is_patient_enterprise_covered(uuid)
// with an ARBITRARY patient id (the oracle is closed); the free-tier
// memory-creation restriction these functions backed still works
// correctly via the new self-scoped wrapper (migration 106's real
// feature is not broken by this fix).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, http, rpc, sql } from './_runtime';

const PW = 'Codex002P108Fix9!';
const stamp = Date.now();

const emails = {
  freeUser: `codex002p108-free-${stamp}@local.test`,
  otherPatient: `codex002p108-other-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');`);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM memories WHERE patient_id IN ('${Object.values(ids).join("','")}');`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-P1-CODEX-002 P1-08 (migration 152) — local entitlement oracle closed', () => {
  it('an authenticated user cannot call patient_has_paid_entitlement with an arbitrary patient id', async () => {
    const [status] = (await rpc('patient_has_paid_entitlement', { p_patient_id: ids.otherPatient }, tok.freeUser)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('an authenticated user cannot call is_patient_enterprise_covered with an arbitrary patient id', async () => {
    const [status] = (await rpc('is_patient_enterprise_covered', { p_patient_id: ids.otherPatient }, tok.freeUser)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('the free-tier memory restriction still correctly blocks an unentitled user via the new self-scoped wrapper', async () => {
    const [status] = await http('POST', '/rest/v1/memories', { patient_id: ids.freeUser, title: 'Test memory', description: 'x', created_by: ids.freeUser }, tok.freeUser);
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
