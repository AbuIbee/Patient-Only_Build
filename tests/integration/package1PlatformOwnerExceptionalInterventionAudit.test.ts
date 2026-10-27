// PACKAGE 1 (MMA-P1-FINAL) Priority 5, Section 4.2 -- "Exceptional
// intervention... must record Platform Owner identity, target
// organization, operation, timestamp, outcome, before/after state."
// Migration 147.
//
// Proves, against real RPC/RLS: a non-admin cannot call
// admin_set_organization_license_status() at all (unchanged behavior);
// an admin's call now writes a real account_management_audit row
// capturing actor, organization, and the exact before/after status
// values.
//
// MMA-P1-CODEX-002 P1-07 (migration 150): a justification is now a
// mandatory third argument, persisted as the audit row's `reason` --
// updated here to the new three-argument signature; a missing
// justification is additionally proven to be rejected.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Package1PlatOwnerFix9!';
const stamp = Date.now();
const ORG = 'f0147701-7701-4701-8701-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `p1plat-director-${stamp}@local.test`,
  admin: `p1plat-admin-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.admin}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','P1 PlatOwner Org ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',10,10,999,'proposed');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('PACKAGE 1 (migration 147) — Platform Owner exceptional intervention audit', () => {
  it('a Director cannot exceptionally change license status', async () => {
    const [status] = (await rpc('admin_set_organization_license_status', { p_org_id: ORG, p_status: 'active', p_justification: 'Director attempt' }, tok.director)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a missing justification is rejected even for a real admin', async () => {
    const [status] = (await rpc('admin_set_organization_license_status', { p_org_id: ORG, p_status: 'active', p_justification: '' }, tok.admin)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it("the Platform Owner's exceptional status change is fully audited with before/after state and justification", async () => {
    const [status] = await rpc('admin_set_organization_license_status', { p_org_id: ORG, p_status: 'active', p_justification: 'Confirmed payment received outside normal quote flow' }, tok.admin);
    expect(status).toBe(200);

    const auditRow = sql(`
      SELECT actor_user_id || '|' || organization_id || '|' || (previous_value->>'status') || '|' || (new_value->>'status') || '|' || reason
      FROM account_management_audit
      WHERE organization_id='${ORG}' AND action_type='platform_owner_exceptional_license_status_change'
      ORDER BY created_at DESC LIMIT 1;
    `);
    expect(auditRow).toBe(`${ids.admin}|${ORG}|proposed|active|Confirmed payment received outside normal quote flow`);
  });
});
