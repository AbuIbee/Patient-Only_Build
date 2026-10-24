// CODEX F-13 (P1, release-blocking) — "Professional eligibility
// bypass remains." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 124.
//
// Reproduces the exact gap: invite_org_member() (the legacy,
// pre-credential-verification path) used to grant 'therapist'/
// 'medical_professional' with zero credential check, identical
// clinical authority to the verified application pipeline
// (director_approve_application(), gated by
// record_credential_verification() since migration 089).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'CodexF13Fix9!';
const stamp = Date.now();
const ORG = 'f0131313-1313-4f13-8f13-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `f13-director-${stamp}@local.test`,
  target: `f13-target-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');`);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  sql(`
    INSERT INTO organizations (id, name, package_type, created_by) VALUES ('${ORG}', 'F13 Eligibility Org ${stamp}', 'integrated_care', '${ids.director}');
    INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.director}', 'director', 'active');
    INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status, license_number, activated_at) VALUES ('${ORG}', 10, 20, 'active', 'MMA-FE-2026-990002', now());
  `);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM organization_memberships WHERE organization_id='${ORG}';
    DELETE FROM organization_licenses WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('CODEX F-13 FIX (migration 124) — professional eligibility bypass closed', () => {
  it('FIX: a director cannot invite someone directly as a therapist -- must go through the verified application pipeline', async () => {
    const [status, body] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.target, p_org_role: 'therapist' }, tok.director);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('independently verified credentials');
    expect(sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.target}';`)).toBe('0');
  });

  it('FIX: a director cannot invite someone directly as a medical professional either', async () => {
    const [status, body] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.target, p_org_role: 'medical_professional' }, tok.director);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('independently verified credentials');
  });

  it('regression guard: a director can still invite a caregiver or billing administrator directly, unaffected by this fix', async () => {
    const [caregiverStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.target, p_org_role: 'caregiver' }, tok.director);
    expect(caregiverStatus).toBe(200);
    sql(`DELETE FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.target}';`);

    const [billingStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.target, p_org_role: 'billing_admin' }, tok.director);
    expect(billingStatus).toBe(200);
    sql(`DELETE FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.target}';`);
  });
});
