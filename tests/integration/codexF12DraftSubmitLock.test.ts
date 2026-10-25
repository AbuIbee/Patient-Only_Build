// CODEX F-12 (P1, release-blocking) — "Draft/redemption/concurrency
// integrity gaps." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 128.
//
// Two genuinely concurrent submit_professional_application() calls
// against the SAME draft (a real double-click/two-tab race, not a
// simulated one) must result in exactly one 'submitted' audit event
// and exactly one successful response -- never two.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, validDirectorApplicationDetails } from './_runtime';

const PW = 'CodexF12Fix9!';
const stamp = Date.now();

const emails = { applicant: `f12-applicant-${stamp}@local.test` };
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  ids.applicant = await authSignUp(emails.applicant, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${ids.applicant}';`);
  tok.applicant = await login(emails.applicant, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id='${ids.applicant}');
    DELETE FROM professional_applications WHERE applicant_user_id='${ids.applicant}';
  `);
  await authDeleteUser(ids.applicant);
});

describe('CODEX F-12 FIX (migration 128) — concurrent submission of the same draft is serialized, not racy', () => {
  it('FIX: two genuinely concurrent submit calls against the same draft produce exactly one success and exactly one audit event', async () => {
    await rpc('save_application_draft', {
      p_requested_office: 'director', p_proposed_organization_name: `F12 Race Org ${stamp}`, p_proposed_package_type: 'integrated_care',
      p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: {},
    }, tok.applicant);
    const [, draftRows] = (await rpc('get_my_application_draft', {}, tok.applicant)) as [number, { id: string }[]];
    const draftId = draftRows[0]!.id;

    const submitOnce = () => rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: `F12 Race Org ${stamp}`, p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Race Applicant', p_preferred_name: null, p_contact_email: emails.applicant, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: validDirectorApplicationDetails({ fullLegalName: 'Race Applicant', verifiedBusinessEmail: emails.applicant }), p_draft_id: draftId,
    }, tok.applicant);

    const [resultA, resultB] = await Promise.all([submitOnce(), submitOnce()]);
    const statuses = [resultA[0], resultB[0]].sort();
    // Exactly one succeeds (200); the other is correctly rejected
    // because the row is no longer a draft by the time its own
    // (lock-serialized) SELECT runs.
    expect(statuses).toEqual([200, 400]);

    const liveAppId = sql(`SELECT id FROM professional_applications WHERE applicant_user_id='${ids.applicant}' AND status='pending_review';`);
    expect(liveAppId).toBeTruthy();
    const submittedEventCount = sql(`SELECT count(*) FROM professional_application_events WHERE application_id='${liveAppId}' AND event_type='submitted';`);
    expect(submittedEventCount).toBe('1');
  });
});
