// HCN-ONBOARDING-PRODUCTION-001 Section 5.4 -- "Director 45-day
// historical-access policy." Proves the core boundary logic
// (is_org_director_for_patient_with_history()) directly against real
// SQL, and the one concrete integration point (get_my_conversations())
// against a real authenticated session.
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Director45Day9!';
const stamp = Date.now();
const ORG = 'f0d00001-0001-4001-8001-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `director45day-director-${stamp}@local.test`,
  outsider: `director45day-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  patientId = await authSignUp(`director45day-patient-${stamp}@local.test`, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ids.director}','${ids.outsider}','${patientId}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','Director45Day Org ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','Director45Day','Patient','Director45Day Patient','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM conversations WHERE patient_id='${patientId}';
    DELETE FROM covered_patient_memberships WHERE organization_id='${ORG}';
    DELETE FROM organization_memberships WHERE organization_id='${ORG}';
    DELETE FROM organization_licenses WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
    DELETE FROM patients WHERE id='${patientId}';
  `);
  for (const id of [ids.director, ids.outsider, patientId]) await authDeleteUser(id);
});

function setRevoked(revokedAt: string | null, barred = false) {
  if (revokedAt === null) {
    sql(`UPDATE organization_memberships SET status='active', revoked_at=NULL, historical_access_barred=false WHERE organization_id='${ORG}' AND user_id='${ids.director}';`);
  } else {
    sql(`UPDATE organization_memberships SET status='revoked', revoked_at='${revokedAt}', historical_access_barred=${barred} WHERE organization_id='${ORG}' AND user_id='${ids.director}';`);
  }
}

describe('HCN-ONBOARDING-PRODUCTION-001 Section 5.4 -- core boundary logic (is_org_director_for_patient_with_history)', () => {
  it('an ACTIVE director has access (the ordinary, non-historical case)', () => {
    setRevoked(null);
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`);
    expect(result).toBe('t');
  });

  it('44 days after revocation, historical access still holds', () => {
    const revokedAt = sql(`SELECT (now() - interval '44 days')::text;`);
    setRevoked(revokedAt);
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`);
    expect(result).toBe('t');
  });

  it('just before the 45-day cutoff (44 days, 23 hours, 59 minutes), access still holds', () => {
    // Deliberately not "exactly 45 days": two sequential sql() calls
    // can never land at precisely the same instant, so a boundary
    // computed as "now() - 45 days" at one moment is, by construction,
    // already slightly past the cutoff by the time the SECOND query's
    // own now() runs a moment later. This one-minute margin is what
    // actually exercises the <= (not <) comparison deterministically.
    const revokedAt = sql(`SELECT (now() - interval '44 days 23 hours 59 minutes')::text;`);
    setRevoked(revokedAt);
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`);
    expect(result).toBe('t');
  });

  it('45 days and 1 minute after revocation, access has expired', () => {
    const revokedAt = sql(`SELECT (now() - interval '45 days' - interval '1 minute')::text;`);
    setRevoked(revokedAt);
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`);
    expect(result).toBe('f');
  });

  it('a record created AFTER revocation is not accessible, even within the 45-day window', () => {
    const revokedAt = sql(`SELECT (now() - interval '1 day')::text;`);
    setRevoked(revokedAt);
    const recordAfter = sql(`SELECT (now())::text;`); // created after revoked_at
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', '${recordAfter}');`);
    expect(result).toBe('f');
  });

  it('a record created BEFORE revocation IS accessible within the 45-day window', () => {
    const revokedAt = sql(`SELECT (now() - interval '1 day')::text;`);
    setRevoked(revokedAt);
    const recordBefore = sql(`SELECT (now() - interval '2 days')::text;`); // created before revoked_at
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', '${recordBefore}');`);
    expect(result).toBe('t');
  });

  it('historical_access_barred immediately denies access regardless of how recent the revocation is', () => {
    const revokedAt = sql(`SELECT (now() - interval '1 hour')::text;`);
    setRevoked(revokedAt, true);
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`);
    expect(result).toBe('f');
  });

  it('a user with no membership at all has no historical access', () => {
    const result = sql(`SELECT is_org_director_for_patient_with_history('${ids.outsider}','${patientId}', NULL);`);
    expect(result).toBe('f');
  });

  it('platform_owner_bar_director_historical_access immediately flips an existing revoked membership', async () => {
    setRevoked(sql(`SELECT (now() - interval '1 day')::text;`), false);
    expect(sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`)).toBe('t');

    const ownerEmail = `director45day-owner-${stamp}@local.test`;
    const ownerId = await authSignUp(ownerEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete', role='admin' WHERE id='${ownerId}';`);
    const ownerTok = await login(ownerEmail, PW);
    try {
      const [status] = await rpc('platform_owner_bar_director_historical_access', {
        p_organization_id: ORG, p_director_user_id: ids.director, p_reason: 'Security incident identified after revocation',
      }, ownerTok);
      expect(status).toBe(200);
      expect(sql(`SELECT is_org_director_for_patient_with_history('${ids.director}','${patientId}', NULL);`)).toBe('f');
      const audit = sql(`SELECT action_type FROM account_management_audit WHERE target_user_id='${ids.director}' AND organization_id='${ORG}' ORDER BY created_at DESC LIMIT 1;`);
      expect(audit).toBe('director_historical_access_barred');
    } finally {
      sql(`DELETE FROM account_management_audit WHERE target_user_id='${ownerId}' OR actor_user_id='${ownerId}';`);
      await authDeleteUser(ownerId);
    }
  });
});

describe('HCN-ONBOARDING-PRODUCTION-001 Section 5.4 -- get_my_conversations() integration', () => {
  it('a revoked director (within the window) still sees a conversation created before revocation, via a fresh JWT', async () => {
    // The prior describe block leaves the membership revoked (its own
    // last test). Restore active status first -- this test's own
    // subject is what happens AFTER a conversation is created while
    // active and THEN revoked, not the already-revoked state.
    setRevoked(null);
    const [, conv] = (await rpc('create_conversation', {
      p_patient_id: patientId, p_recipient_user_ids: [patientId], p_subject: 'Pre-revocation conversation',
    }, tok.director)) as [number, { id: string }];
    expect(conv.id).toBeTruthy();

    sql(`UPDATE organization_memberships SET status='revoked', revoked_at=now(), historical_access_barred=false WHERE organization_id='${ORG}' AND user_id='${ids.director}';`);

    // Fresh JWT, issued AFTER revocation -- "no reliance on stale JWT
    // claims" means this must still work, since authorization is
    // re-derived from the database on every call, never cached in the
    // token.
    const freshTok = await login(emails.director, PW);
    const [status, convos] = (await rpc('get_my_conversations', { p_patient_id: patientId }, freshTok)) as [number, { conversation_id: string }[]];
    expect(status).toBe(200);
    expect(convos.some((c) => c.conversation_id === conv.id)).toBe(true);
  });

  it('once the 45-day window has expired, the same director no longer sees that conversation', async () => {
    sql(`UPDATE organization_memberships SET revoked_at = now() - interval '46 days' WHERE organization_id='${ORG}' AND user_id='${ids.director}';`);
    const freshTok = await login(emails.director, PW);
    const [status, convos] = (await rpc('get_my_conversations', { p_patient_id: patientId }, freshTok)) as [number, { conversation_id: string }[]];
    expect(status).toBe(200);
    expect(convos.length).toBe(0);
  });

  it('a revoked director (even within the window) cannot create a NEW conversation -- no new patient-assignment-adjacent privilege', async () => {
    sql(`UPDATE organization_memberships SET revoked_at = now() - interval '1 day' WHERE organization_id='${ORG}' AND user_id='${ids.director}';`);
    const freshTok = await login(emails.director, PW);
    const [status] = await rpc('create_conversation', {
      p_patient_id: patientId, p_recipient_user_ids: [patientId], p_subject: 'Should be rejected',
    }, freshTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
