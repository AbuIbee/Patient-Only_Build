// MMA-PROF-ONBOARD-004 P0-2 Phase 3 (migration 163): the one canonical
// self-service entry point -- public-website tier purchase and secure
// invitation redemption both converging into the same
// auto_verification_pending -> agreements_pending pipeline, atomic
// coupon redemption at submission time, duplicate-organization-name
// detection routing to exception review, and the Platform Owner's
// resolution of that exception. Requires the local Docker Supabase
// stack. Run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'SelfService9!';
const stamp = Date.now();
const emails = {
  owner: `selfsvc-owner-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

// Each real start_self_service_application() call needs its OWN
// applicant: that RPC's own "one application in progress at a time"
// guard (reused from submit_professional_application's established
// rule) correctly blocks a second submission from a user whose FIRST
// one already landed at agreements_pending/manual_review -- reusing
// one fixture user across multiple submission tests in this file would
// collide with that real, correct guard, not expose a bug in it.
const createdApplicantIds: string[] = [];
async function freshApplicant(): Promise<{ email: string; id: string; token: string }> {
  const email = `selfsvc-applicant-${stamp}-${createdApplicantIds.length}@local.test`;
  const id = await authSignUp(email, PW);
  createdApplicantIds.push(id);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
  const token = await login(email, PW);
  return { email, id, token };
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  const applicantIdList = createdApplicantIds.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM enterprise_coupon_redemptions WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN (${applicantIdList}));
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN (${applicantIdList}));
    DELETE FROM professional_applications WHERE applicant_user_id IN (${applicantIdList});
    DELETE FROM sales_quote_invitations WHERE created_by='${ids.owner}';
    DELETE FROM sales_quotes WHERE created_by IN ('${ids.owner}', ${applicantIdList});
    DELETE FROM sales_prospects WHERE created_by IN ('${ids.owner}', ${applicantIdList});
    DELETE FROM promo_coupon_catalog WHERE code = 'TESTCOUP-SELFSVC';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
  for (const id of createdApplicantIds) await authDeleteUser(id);
});

// Minimal self-service subset (step1, step2, step5, step6 only -- no
// step3/step4), matching exactly what
// validate_director_application_payload()'s self_service_minimal
// branch requires per migration 163.
function minimalDetails(opts: { fullLegalName: string; verifiedBusinessEmail: string; orgName: string }) {
  return {
    step1: {
      legalBusinessName: opts.orgName, legalForm: 'LLC', businessClassification: 'Home care agency',
      formationJurisdiction: 'Texas', registeredAddress: '100 Main St, Austin, TX', businessPhone: '512-555-0100',
      businessEmail: opts.verifiedBusinessEmail,
    },
    step2: {
      fullLegalName: opts.fullLegalName, verifiedBusinessEmail: opts.verifiedBusinessEmail, mobile: '512-555-0101',
      title: 'Founder', relationshipToEntity: 'Owner', authorizedSignatory: true, authorityAttestation: true,
    },
    step5: { billingContact: 'Billing Contact', billingAddress: '100 Main St, Austin, TX', billingEmail: opts.verifiedBusinessEmail },
    step6: { accuracyAttestation: true, authorizedSignatoryConfirmed: true, privacyAck: true, signatureName: opts.fullLegalName },
  };
}

describe('MMA-PROF-ONBOARD-004 self-service entry (migration 163)', () => {
  it('public-website entry with no coupon: creates its own quote at the exact catalog price and lands in agreements_pending', async () => {
    const bilal = await freshApplicant();
    const orgName = `Bilal Essential Org ${stamp}`;
    const [status, app] = (await rpc('start_self_service_application', {
      p_selected_tier_code: 'essential', p_initial_expected_active_patients: 10,
      p_legal_name: 'Bilal Applicant', p_contact_email: bilal.email,
      p_application_details: minimalDetails({ fullLegalName: 'Bilal Applicant', verifiedBusinessEmail: bilal.email, orgName }),
    }, bilal.token)) as [number, { id: string; status: string; entry_method: string; selected_tier_code: string; annual_license_fee_snapshot_cents: number; application_details: { originatingQuoteId: string } }];
    expect(status).toBe(200);
    expect(app.status).toBe('agreements_pending');
    expect(app.entry_method).toBe('public_website');
    expect(app.selected_tier_code).toBe('essential');
    expect(app.annual_license_fee_snapshot_cents).toBe(39900);

    const quoteId = app.application_details.originatingQuoteId;
    const quotePrice = sql(`SELECT annual_license_fee FROM sales_quotes WHERE id='${quoteId}';`);
    expect(quotePrice).toBe('399.00');
    const quotePackage = sql(`SELECT package_type FROM sales_quotes WHERE id='${quoteId}';`);
    expect(quotePackage).toBe('integrated_care');
  });

  it('public-website entry WITH a coupon: redeems atomically and snapshots the discounted price onto both the application and its auto-created quote', async () => {
    const bilal = await freshApplicant();
    sql(`INSERT INTO promo_coupon_catalog (code, discount_kind, created_by) VALUES ('TESTCOUP-SELFSVC', 'half_off_minus_fifty_cents', '${ids.owner}');`);
    const orgName = `Bilal Plus Coupon Org ${stamp}`;
    const [status, app] = (await rpc('start_self_service_application', {
      p_selected_tier_code: 'plus', p_initial_expected_active_patients: 35,
      p_legal_name: 'Bilal Applicant', p_contact_email: bilal.email,
      p_application_details: minimalDetails({ fullLegalName: 'Bilal Applicant', verifiedBusinessEmail: bilal.email, orgName }),
      p_coupon_code: 'TESTCOUP-SELFSVC',
    }, bilal.token)) as [number, { id: string; annual_license_fee_snapshot_cents: number; application_details: { originatingQuoteId: string } }];
    expect(status).toBe(200);
    expect(app.annual_license_fee_snapshot_cents).toBe(29900); // $299.00, the exact WELCOME50 Plus figure.

    const quoteId = app.application_details.originatingQuoteId;
    const quotePrice = sql(`SELECT annual_license_fee FROM sales_quotes WHERE id='${quoteId}';`);
    expect(quotePrice).toBe('299.00');
    const redemption = sql(`SELECT final_cents FROM enterprise_coupon_redemptions WHERE application_id='${app.id}';`);
    expect(redemption).toBe('29900');
  });

  it('rejects an application with a duplicate organization name into manual_review, not auto-approved or auto-rejected', async () => {
    const dupe = await freshApplicant();
    const orgName = `Duplicate Name Org ${stamp}`;
    sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('${orgName}', 'integrated_care', '${ids.owner}');`);

    // start_self_service_application() runs automated verification
    // synchronously as part of the same call (per the directive's own
    // "Perform required automated verification" framing) -- its
    // returned row already reflects the verification outcome.
    const [status, app] = (await rpc('start_self_service_application', {
      p_selected_tier_code: 'essential', p_initial_expected_active_patients: 5,
      p_legal_name: 'Dupe Applicant', p_contact_email: dupe.email,
      p_application_details: minimalDetails({ fullLegalName: 'Dupe Applicant', verifiedBusinessEmail: dupe.email, orgName }),
    }, dupe.token)) as [number, { id: string; status: string; exception_review_reason: string }];
    expect(status).toBe(200);
    expect(app.status).toBe('manual_review');
    expect(app.exception_review_reason).toMatch(/same or a very similar name/i);

    // Platform Owner confirms it as genuinely distinct -- proceeds.
    const [resolveStatus, resolved] = (await rpc('platform_owner_resolve_manual_review', { p_application_id: app.id, p_decision: 'confirmed_distinct', p_reason: 'Verified: unrelated business' }, tok.owner)) as [number, { status: string }];
    expect(resolveStatus).toBe(200);
    expect(resolved.status).toBe('agreements_pending');

    sql(`DELETE FROM organizations WHERE name='${orgName}' AND created_by='${ids.owner}';`);
  });

  it('a clean (non-duplicate) application passes automated verification straight through to agreements_pending', async () => {
    const clean = await freshApplicant();
    const orgName = `Clean Verification Org ${stamp}`;
    const [status, app] = (await rpc('start_self_service_application', {
      p_selected_tier_code: 'complete', p_initial_expected_active_patients: 200,
      p_legal_name: 'Clean Applicant', p_contact_email: clean.email,
      p_application_details: minimalDetails({ fullLegalName: 'Clean Applicant', verifiedBusinessEmail: clean.email, orgName }),
    }, clean.token)) as [number, { status: string; auto_verification_result: { decision: string } }];
    expect(status).toBe(200);
    expect(app.status).toBe('agreements_pending');
    expect(app.auto_verification_result.decision).toBe('verified');
  });

  it('invitation entry redeems the existing quote-invitation mechanism and carries its negotiated terms, with no tier_code', async () => {
    const invitee = await freshApplicant();
    const prospectId = sql(`INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by) VALUES ('Invitee Test', '${invitee.email}', 'Invitee Negotiated Org ${stamp}', '${ids.owner}') RETURNING id;`);
    const quoteId = sql(`INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by) VALUES ('${prospectId}', 'therapist', 8, 40, 1200, 'annual', 'sent', '${ids.owner}') RETURNING id;`);
    const [, inviteRows] = (await rpc('platform_owner_issue_quote_invitation', { p_quote_id: quoteId, p_recipient_email: invitee.email, p_expires_in_hours: 24 }, tok.owner)) as [number, { raw_token: string }[]];
    const invite = inviteRows[0];

    const [status, app] = (await rpc('start_self_service_application', {
      p_selected_tier_code: null, p_initial_expected_active_patients: null,
      p_legal_name: 'Invitee Applicant', p_contact_email: invitee.email,
      p_application_details: minimalDetails({ fullLegalName: 'Invitee Applicant', verifiedBusinessEmail: invitee.email, orgName: 'Invitee Negotiated Org ' + stamp }),
      p_invitation_token: invite.raw_token,
    }, invitee.token)) as [number, { entry_method: string; selected_tier_code: string | null; proposed_package_type: string; annual_license_fee_snapshot_cents: number }];
    expect(status).toBe(200);
    expect(app.entry_method).toBe('invitation');
    expect(app.selected_tier_code).toBeNull();
    expect(app.proposed_package_type).toBe('therapist');
    expect(app.annual_license_fee_snapshot_cents).toBe(120000); // $1200.00 negotiated, not a catalog price.
  });
});
