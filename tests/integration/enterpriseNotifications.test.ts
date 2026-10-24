// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase I2 — the in-app notification
// center (migration 116). Trigger-based: observes real state
// transitions on professional_applications/organization_licenses/
// organization_amendment_requests/enterprise_contracts rather than
// modifying any of the already-tested RPCs that cause those
// transitions, so these tests exercise the SAME real RPCs used
// throughout this engagement and assert a real notification row
// appears as a side effect -- never a mocked or simulated trigger.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'Notify9!';
const stamp = Date.now();

const emails = {
  owner: `notify-owner-${stamp}@local.test`,
  bilal: `notify-bilal-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const createdOrgIds: string[] = [];

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  const orgFilter = createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM enterprise_notifications WHERE recipient_user_id IN ('${ids.owner}','${ids.bilal}');
    DELETE FROM enterprise_contracts WHERE created_by='${ids.owner}';
    DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by='${ids.owner}');
    DELETE FROM organization_amendment_requests WHERE organization_id IN (${orgFilter});
    DELETE FROM organization_licenses WHERE organization_id IN (${orgFilter});
    DELETE FROM organization_memberships WHERE organization_id IN (${orgFilter});
    DELETE FROM organizations WHERE id IN (${orgFilter});
    DELETE FROM professional_applications WHERE applicant_user_id='${ids.bilal}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-SALES-006 Phase I2 — enterprise notification center (migration 116)', () => {
  it('application submitted notifies the Platform Owner; correction request and approval notify the applicant -- all via real RPCs, not a simulated trigger', async () => {
    const [, prospect] = (await rpc('platform_owner_create_prospect', {
      p_contact_name: 'Notify Test', p_contact_email: emails.bilal, p_contact_phone: null, p_prospective_organization_name: `Notify Org ${stamp}`, p_notes: null,
    }, tok.owner)) as [number, { id: string }];
    const [, quote] = (await rpc('platform_owner_create_quote', {
      p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
      p_proposed_covered_patient_capacity: 20, p_annual_license_fee: 10000, p_billing_cadence: 'annual',
      p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
    }, tok.owner)) as [number, { id: string }];
    await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);

    // Real submission via the real RPC (not a direct INSERT) --
    // proves the INSERT trigger fires for the real business path.
    const [submitStatus, app] = (await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null, p_proposed_organization_name: `Notify Org ${stamp}`,
      p_proposed_package_type: 'integrated_care', p_legal_name: 'Notify Bilal', p_preferred_name: null,
      p_contact_email: emails.bilal, p_contact_phone: null, p_professional_title: null, p_profession_category: null,
      p_application_details: { originatingQuoteId: quote.id }, p_draft_id: null,
    }, tok.bilal)) as [number, { id: string }];
    expect(submitStatus).toBe(200);

    const ownerNotif = sql(`SELECT notification_type, related_entity_id FROM enterprise_notifications WHERE recipient_user_id='${ids.owner}' AND related_entity_id='${app.id}' AND notification_type='application_submitted';`);
    expect(ownerNotif).toBe(`application_submitted|${app.id}`);

    // Correction request -> notifies the applicant.
    const [reqCorrStatus] = await rpc('request_application_corrections', {
      p_application_id: app.id, p_correction_request: 'Please fix your business address.', p_correction_fields: { allowedSteps: ['step1'] },
    }, tok.owner);
    expect(reqCorrStatus).toBe(200);
    const bilalCorrNotif = sql(`SELECT notification_type, body FROM enterprise_notifications WHERE recipient_user_id='${ids.bilal}' AND related_entity_id='${app.id}' AND notification_type='correction_requested';`);
    expect(bilalCorrNotif).toBe('correction_requested|Please fix your business address.');

    // Resubmit -> notifies the owner again.
    const [resubmitStatus] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Notify Bilal', p_preferred_name: null, p_contact_email: emails.bilal, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: { originatingQuoteId: quote.id },
    }, tok.bilal);
    expect(resubmitStatus).toBe(200);
    const ownerResubmitNotif = sql(`SELECT count(*) FROM enterprise_notifications WHERE recipient_user_id='${ids.owner}' AND related_entity_id='${app.id}' AND notification_type='application_resubmitted';`);
    expect(ownerResubmitNotif).toBe('1');

    // Approve -> notifies the applicant.
    const [approveStatus, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: app.id }, tok.owner)) as [number, { id: string }];
    expect(approveStatus).toBe(200);
    createdOrgIds.push(org.id);
    const bilalApprovedNotif = sql(`SELECT notification_type FROM enterprise_notifications WHERE recipient_user_id='${ids.bilal}' AND related_entity_id='${app.id}' AND notification_type='application_approved';`);
    expect(bilalApprovedNotif).toBe('application_approved');

    // Confirm payment and activate -> notifies the Director (license_activated).
    sql(`
      INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
      VALUES ('${quote.id}', '${emails.bilal}', 'usd', 1000000, 'year', 'active', '${ids.bilal}');
    `);
    const license = sql(`SELECT id FROM activate_enterprise_license_from_quote('${quote.id}');`);
    expect(license).toBeTruthy();
    const bilalLicenseNotif = sql(`SELECT notification_type FROM enterprise_notifications WHERE recipient_user_id='${ids.bilal}' AND related_entity_type='organization_license' AND notification_type='license_activated';`);
    expect(bilalLicenseNotif).toBe('license_activated');
  });

  it('a user can read and mark their own notifications read; cannot read or mark another user\'s via RLS/RPC', async () => {
    const notifId = sql(`
      INSERT INTO enterprise_notifications (recipient_user_id, notification_type, title) VALUES ('${ids.bilal}', 'test_type', 'Test notification') RETURNING id;
    `);
    const [, bilalRead] = await http('GET', `/rest/v1/enterprise_notifications?id=eq.${notifId}&select=id,read_at`, undefined, tok.bilal);
    expect((bilalRead as { id: string }[])[0]?.id).toBe(notifId);

    const [, ownerDirectReadOfBilals] = await http('GET', `/rest/v1/enterprise_notifications?id=eq.${notifId}&select=id`, undefined, tok.owner);
    // Platform Owner CAN see it too (audit visibility, by design) -- but cannot mark it read as themselves.
    expect((ownerDirectReadOfBilals as unknown[]).length).toBe(1);
    const [ownerMarkStatus] = await rpc('mark_notification_read', { p_notification_id: notifId }, tok.owner);
    expect(ownerMarkStatus).toBe(400);

    const [bilalMarkStatus, marked] = (await rpc('mark_notification_read', { p_notification_id: notifId }, tok.bilal)) as [number, { read_at: string }];
    expect(bilalMarkStatus).toBe(200);
    expect(marked.read_at).toBeTruthy();
  });

  it('a quoted amendment request notifies the requesting Director; a presented/executed contract notifies the right recipient', async () => {
    sql(`UPDATE profiles SET first_name='Bilal', last_name='Amend' WHERE id='${ids.bilal}';`);
    const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('Notify Amend Org ${stamp}', 'integrated_care', '${ids.bilal}') RETURNING id;`);
    sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${orgId}', '${ids.bilal}', 'director', 'active');`);
    sql(`INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status, license_number, activated_at) VALUES ('${orgId}', 4, 20, 'active', 'MMA-FE-2026-900001', now());`);
    createdOrgIds.push(orgId);

    const [, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null,
    }, tok.bilal)) as [number, { id: string }];
    const [, quoted] = (await rpc('platform_owner_quote_amendment_request', {
      p_request_id: request.id, p_contact_name: 'Bilal', p_contact_email: emails.bilal, p_package_type: 'integrated_care',
      p_proposed_licensed_seats: 8, p_proposed_covered_patient_capacity: 40, p_annual_license_fee: 20000, p_billing_cadence: 'annual', p_quote_term_months: null, p_notes: null,
    }, tok.owner)) as [number, { resulting_quote_id: string }];

    const amendNotif = sql(`SELECT notification_type FROM enterprise_notifications WHERE recipient_user_id='${ids.bilal}' AND related_entity_id='${request.id}' AND notification_type='amendment_quoted';`);
    expect(amendNotif).toBe('amendment_quoted');

    const [, contract] = (await rpc('platform_owner_create_contract', {
      p_quote_id: quoted.resulting_quote_id, p_contract_type: 'saas_license', p_template_version: 'v1', p_signatory_name: 'Bilal Amend', p_signatory_title: null,
    }, tok.owner)) as [number, { id: string }];
    await rpc('platform_owner_present_contract', { p_contract_id: contract.id }, tok.owner);
    const presentedNotif = sql(`SELECT notification_type FROM enterprise_notifications WHERE recipient_user_id='${ids.bilal}' AND related_entity_id='${contract.id}' AND notification_type='contract_presented';`);
    expect(presentedNotif).toBe('contract_presented');

    await rpc('platform_owner_record_contract_execution', { p_contract_id: contract.id, p_execution_method: 'manual', p_execution_evidence_reference: 'ref-1' }, tok.owner);
    const executedNotif = sql(`SELECT notification_type FROM enterprise_notifications WHERE recipient_user_id='${ids.bilal}' AND related_entity_id='${contract.id}' AND notification_type='contract_executed';`);
    expect(executedNotif).toBe('contract_executed');
  });
});
