// HCN organization license and office authentication remediation,
// 2026-10-31. P0-02: "Enforce the organization's current license
// status on every protected office RPC... Inactive licenses block
// all licensed office access." P0-05: the truthful counterpart --
// get_my_license_blocked_memberships() must identify WHY, distinctly
// from "never had an office at all."
//
// CONFIRMED DEFECT this closes (migration 20261031020000):
// get_my_organizations() previously only checked
// organization_memberships.status = 'active' and never joined
// organization_licenses at all -- a Director/staff member whose own
// membership was still active but whose org's license had expired,
// been suspended, or been canceled still received a full office via
// get_my_organizations(), exactly as migration 142 had already found
// and fixed for PATIENT data access but never for office/dashboard
// access itself.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'HcnLicenseGate9!';
const stamp = Date.now();
const ORG_ACTIVE = 'f0303101-0001-4001-8001-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_EXPIRED = 'f0303102-0002-4002-8002-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_SUSPENDED = 'f0303103-0003-4003-8003-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_CANCELED = 'f0303104-0004-4004-8004-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_REVOKED_MEMBER = 'f0303105-0005-4005-8005-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `hcnlicensegate-director-${stamp}@local.test`,
  staffExpired: `hcnlicensegate-staffexpired-${stamp}@local.test`,
  staffSuspended: `hcnlicensegate-staffsuspended-${stamp}@local.test`,
  staffCanceled: `hcnlicensegate-staffcanceled-${stamp}@local.test`,
  revokedStaff: `hcnlicensegate-revoked-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
    WHERE id IN ('${ids.director}','${ids.staffExpired}','${ids.staffSuspended}','${ids.staffCanceled}','${ids.revokedStaff}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_ACTIVE}','HCN License Gate Active Org ${stamp}','integrated_care','${ids.director}'),
      ('${ORG_EXPIRED}','HCN License Gate Expired Org ${stamp}','integrated_care','${ids.staffExpired}'),
      ('${ORG_SUSPENDED}','HCN License Gate Suspended Org ${stamp}','integrated_care','${ids.staffSuspended}'),
      ('${ORG_CANCELED}','HCN License Gate Canceled Org ${stamp}','integrated_care','${ids.staffCanceled}'),
      ('${ORG_REVOKED_MEMBER}','HCN License Gate Revoked Member Org ${stamp}','integrated_care','${ids.revokedStaff}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_ACTIVE}',10,10,999,'active'),
      ('${ORG_EXPIRED}',10,10,999,'expired'),
      ('${ORG_SUSPENDED}',10,10,999,'suspended'),
      ('${ORG_CANCELED}',10,10,999,'canceled'),
      ('${ORG_REVOKED_MEMBER}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_ACTIVE}','${ids.director}','director','active'),
      ('${ORG_EXPIRED}','${ids.staffExpired}','caregiver','active'),
      ('${ORG_SUSPENDED}','${ids.staffSuspended}','caregiver','active'),
      ('${ORG_CANCELED}','${ids.staffCanceled}','caregiver','active'),
      ('${ORG_REVOKED_MEMBER}','${ids.revokedStaff}','caregiver','revoked');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM organization_memberships WHERE organization_id IN ('${ORG_ACTIVE}','${ORG_EXPIRED}','${ORG_SUSPENDED}','${ORG_CANCELED}','${ORG_REVOKED_MEMBER}');
    DELETE FROM organization_licenses WHERE organization_id IN ('${ORG_ACTIVE}','${ORG_EXPIRED}','${ORG_SUSPENDED}','${ORG_CANCELED}','${ORG_REVOKED_MEMBER}');
    DELETE FROM organizations WHERE id IN ('${ORG_ACTIVE}','${ORG_EXPIRED}','${ORG_SUSPENDED}','${ORG_CANCELED}','${ORG_REVOKED_MEMBER}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('HCN P0-02/P0-05: get_my_organizations() enforces organization_licenses.status, with a truthful counterpart for the blocked case', () => {
  it('an active membership in an org with an ACTIVE license is returned by get_my_organizations()', async () => {
    const [status, body] = (await rpc('get_my_organizations', {}, tok.director)) as [number, { organization_id: string }[]];
    expect(status).toBe(200);
    expect(body.some((o) => o.organization_id === ORG_ACTIVE)).toBe(true);
  });

  it('an active membership in an org with an EXPIRED license is excluded from get_my_organizations() but reported by get_my_license_blocked_memberships()', async () => {
    const [status, body] = (await rpc('get_my_organizations', {}, tok.staffExpired)) as [number, { organization_id: string }[]];
    expect(status).toBe(200);
    expect(body.some((o) => o.organization_id === ORG_EXPIRED)).toBe(false);

    const [blockedStatus, blockedBody] = (await rpc('get_my_license_blocked_memberships', {}, tok.staffExpired)) as [number, { organization_id: string; license_status: string; org_role: string }[]];
    expect(blockedStatus).toBe(200);
    const row = blockedBody.find((o) => o.organization_id === ORG_EXPIRED);
    expect(row).toBeDefined();
    expect(row!.license_status).toBe('expired');
    expect(row!.org_role).toBe('caregiver');
  });

  it('an active membership in an org with a SUSPENDED license is excluded from get_my_organizations() but reported by get_my_license_blocked_memberships()', async () => {
    const [status, body] = (await rpc('get_my_organizations', {}, tok.staffSuspended)) as [number, { organization_id: string }[]];
    expect(status).toBe(200);
    expect(body.some((o) => o.organization_id === ORG_SUSPENDED)).toBe(false);

    const [, blockedBody] = (await rpc('get_my_license_blocked_memberships', {}, tok.staffSuspended)) as [number, { organization_id: string; license_status: string }[]];
    expect(blockedBody.find((o) => o.organization_id === ORG_SUSPENDED)?.license_status).toBe('suspended');
  });

  it('an active membership in an org with a CANCELED license is excluded from get_my_organizations() but reported by get_my_license_blocked_memberships()', async () => {
    const [status, body] = (await rpc('get_my_organizations', {}, tok.staffCanceled)) as [number, { organization_id: string }[]];
    expect(status).toBe(200);
    expect(body.some((o) => o.organization_id === ORG_CANCELED)).toBe(false);

    const [, blockedBody] = (await rpc('get_my_license_blocked_memberships', {}, tok.staffCanceled)) as [number, { organization_id: string; license_status: string }[]];
    expect(blockedBody.find((o) => o.organization_id === ORG_CANCELED)?.license_status).toBe('canceled');
  });

  it('a REVOKED membership in an org with an active license is excluded from both -- membership status is still the first gate', async () => {
    const [status, body] = (await rpc('get_my_organizations', {}, tok.revokedStaff)) as [number, { organization_id: string }[]];
    expect(status).toBe(200);
    expect(body.some((o) => o.organization_id === ORG_REVOKED_MEMBER)).toBe(false);

    const [, blockedBody] = (await rpc('get_my_license_blocked_memberships', {}, tok.revokedStaff)) as [number, { organization_id: string }[]];
    expect(blockedBody.some((o) => o.organization_id === ORG_REVOKED_MEMBER)).toBe(false);
  });

  it('get_my_license_blocked_memberships() never leaks another organization\'s blocked license to an unrelated caller', async () => {
    const [, blockedBody] = (await rpc('get_my_license_blocked_memberships', {}, tok.director)) as [number, { organization_id: string }[]];
    expect(blockedBody.some((o) => [ORG_EXPIRED, ORG_SUSPENDED, ORG_CANCELED].includes(o.organization_id))).toBe(false);
  });

  it('an anon (unauthenticated) caller is denied at the database privilege layer for both functions, matching the existing EXHAUSTIVE GUARD invariant (migration 085: no function may grant anon EXECUTE)', async () => {
    const [status, body] = (await rpc('get_my_organizations', {}, ANON)) as [number, { code?: string }];
    expect(status).toBe(401);
    expect(body.code).toBe('42501');

    const [blockedStatus, blockedBody] = (await rpc('get_my_license_blocked_memberships', {}, ANON)) as [number, { code?: string }];
    expect(blockedStatus).toBe(401);
    expect(blockedBody.code).toBe('42501');
  });
});
