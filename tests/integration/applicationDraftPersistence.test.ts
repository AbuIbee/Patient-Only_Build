// OWNER DIRECTIVE MMA-ENT-SALES-003, Phase D foundation — migration 109:
// real draft persistence for the six-step application wizard
// (save_application_draft / get_my_application_draft /
// discard_application_draft / submit_professional_application's new
// p_draft_id path). Covers the save/resume/submit lifecycle and the
// server-side quote-tampering guard (D3: "the server must reject
// price/seat/package tampering"). get_my_application_draft() is
// SETOF-returning (an empty array means "no draft", never an all-null
// pseudo-row), so every call here is destructured as an array.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, validDirectorApplicationDetails } from './_runtime';

const PW = 'DraftPersist9!';
const stamp = Date.now();

const emails = {
  applicant: `adp-applicant-${stamp}@local.test`,
  applicant2: `adp-applicant2-${stamp}@local.test`,
  outsider: `adp-outsider-${stamp}@local.test`,
  owner: `adp-owner-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.applicant}','${ids.applicant2}','${ids.outsider}');
    DELETE FROM sales_quote_invitations WHERE created_by='${ids.owner}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-SALES-003 Phase D — application draft persistence (migration 109)', () => {
  it('a true partial draft can be saved with legal_name/contact_email still empty', async () => {
    const [status, rows] = (await rpc(
      'save_application_draft',
      {
        p_requested_office: 'director', p_proposed_organization_name: 'ADP Draft Org', p_proposed_package_type: 'integrated_care',
        p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
        p_professional_title: null, p_profession_category: null, p_application_details: {},
      },
      tok.applicant,
    )) as [number, { status: string; legal_name: string | null; contact_email: string | null }];
    expect(status).toBe(200);
    expect(rows.status).toBe('draft');
    expect(rows.legal_name).toBeNull();
    expect(rows.contact_email).toBeNull();
    expect(sql(`SELECT count(*) FROM professional_applications WHERE applicant_user_id='${ids.applicant}' AND status='draft';`)).toBe('1');
  });

  it('saving again updates the SAME draft row, not a second one, and get_my_application_draft reflects it', async () => {
    const [status, updated] = (await rpc(
      'save_application_draft',
      {
        p_requested_office: 'director', p_proposed_organization_name: 'ADP Draft Org', p_proposed_package_type: 'integrated_care',
        p_legal_name: 'Partial Name', p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
        p_professional_title: null, p_profession_category: null, p_application_details: { step: 2 },
      },
      tok.applicant,
    )) as [number, { legal_name: string }];
    expect(status).toBe(200);
    expect(updated.legal_name).toBe('Partial Name');
    expect(sql(`SELECT count(*) FROM professional_applications WHERE applicant_user_id='${ids.applicant}' AND status='draft';`)).toBe('1');

    const [getStatus, got] = (await rpc('get_my_application_draft', {}, tok.applicant)) as [number, Array<{ legal_name: string }>];
    expect(getStatus).toBe(200);
    expect(got).toHaveLength(1);
    expect(got[0].legal_name).toBe('Partial Name');
  });

  it('a draft from one account is invisible to another (empty array, not another account\'s row)', async () => {
    const [status, rows] = (await rpc('get_my_application_draft', {}, tok.outsider)) as [number, unknown[]];
    expect(status).toBe(200);
    expect(rows).toEqual([]);
  });

  it('cannot save a draft while an application is already under review', async () => {
    sql(`
      INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, application_details, status, platform_owner_approval_required)
      VALUES ('${ids.outsider}', 'director', 'Guard Row Org', 'integrated_care', 'Outsider Name', 'outsider@test.local', '{}', 'pending_review', true);
    `);
    const [status] = await rpc(
      'save_application_draft',
      {
        p_requested_office: 'director', p_proposed_organization_name: 'X', p_proposed_package_type: 'integrated_care',
        p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
        p_professional_title: null, p_profession_category: null, p_application_details: {},
      },
      tok.outsider,
    );
    expect(status).toBe(400);
    sql(`DELETE FROM professional_applications WHERE applicant_user_id='${ids.outsider}' AND status='pending_review';`);
  });

  it('submitting with a draft id requires completed fields, transitions the SAME row (no duplicate), and is idempotent against a retry', async () => {
    const [draftStatus, drafts] = (await rpc('get_my_application_draft', {}, tok.applicant)) as [number, Array<{ id: string }>];
    expect(draftStatus).toBe(200);
    const draftId = drafts[0].id;

    const fullDetails = validDirectorApplicationDetails({ fullLegalName: 'Partial Name', verifiedBusinessEmail: 'adp-final@local.test' });
    const [submitStatus, submitted] = (await rpc(
      'submit_professional_application',
      {
        p_requested_office: 'director', p_target_organization_id: null, p_proposed_organization_name: 'ADP Draft Org',
        p_proposed_package_type: 'integrated_care', p_legal_name: 'Partial Name', p_preferred_name: null,
        p_contact_email: 'adp-final@local.test', p_contact_phone: null, p_professional_title: null,
        p_profession_category: null, p_application_details: fullDetails, p_draft_id: draftId,
      },
      tok.applicant,
    )) as [number, { id: string; status: string }];
    expect(submitStatus).toBe(200);
    expect(submitted.id).toBe(draftId);
    expect(submitted.status).toBe('pending_review');
    expect(sql(`SELECT count(*) FROM professional_applications WHERE applicant_user_id='${ids.applicant}';`)).toBe('1');

    // A retry (e.g. a second browser tab) hits the existing "already
    // under review" guard -- it does not create a duplicate application.
    const [retryStatus] = await rpc(
      'submit_professional_application',
      {
        p_requested_office: 'director', p_target_organization_id: null, p_proposed_organization_name: 'ADP Draft Org',
        p_proposed_package_type: 'integrated_care', p_legal_name: 'Partial Name', p_preferred_name: null,
        p_contact_email: 'adp-final@local.test', p_contact_phone: null, p_professional_title: null,
        p_profession_category: null, p_application_details: fullDetails, p_draft_id: draftId,
      },
      tok.applicant,
    );
    expect(retryStatus).toBe(400);
    expect(sql(`SELECT count(*) FROM professional_applications WHERE applicant_user_id='${ids.applicant}';`)).toBe('1');
  });

  it('a draft id belonging to another user cannot be submitted (hijack attempt rejected, draft left untouched)', async () => {
    await rpc(
      'save_application_draft',
      {
        p_requested_office: 'director', p_proposed_organization_name: 'Outsider Draft Org', p_proposed_package_type: 'therapist',
        p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
        p_professional_title: null, p_profession_category: null, p_application_details: {},
      },
      tok.outsider,
    );
    const [outsiderDraftStatus, outsiderDrafts] = (await rpc('get_my_application_draft', {}, tok.outsider)) as [number, Array<{ id: string }>];
    expect(outsiderDraftStatus).toBe(200);
    const outsiderDraftId = outsiderDrafts[0].id;

    const [hijackStatus] = await rpc(
      'submit_professional_application',
      {
        p_requested_office: 'director', p_target_organization_id: null, p_proposed_organization_name: 'Hijacked',
        p_proposed_package_type: 'integrated_care', p_legal_name: 'Hijacker', p_preferred_name: null,
        p_contact_email: 'hijack@local.test', p_contact_phone: null, p_professional_title: null,
        p_profession_category: null, p_application_details: {}, p_draft_id: outsiderDraftId,
      },
      tok.owner,
    );
    expect(hijackStatus).toBe(400);
    expect(sql(`SELECT status FROM professional_applications WHERE id='${outsiderDraftId}';`)).toBe('draft');

    const [discardStatus, discarded] = (await rpc('discard_application_draft', { p_draft_id: outsiderDraftId }, tok.outsider)) as [number, boolean];
    expect(discardStatus).toBe(200);
    expect(discarded).toBe(true);
  });

  it('a quote-linked draft has its organization name and package re-derived server-side, rejecting client-tampered values', async () => {
    const [pStatus, prospect] = (await rpc(
      'platform_owner_create_prospect',
      { p_contact_name: 'Tamper Test', p_contact_email: emails.applicant2, p_contact_phone: null, p_prospective_organization_name: 'Real Quoted Org', p_notes: null },
      tok.owner,
    )) as [number, { id: string }];
    expect(pStatus).toBe(200);
    const [qStatus, quote] = (await rpc(
      'platform_owner_create_quote',
      {
        p_prospect_id: prospect.id, p_package_type: 'therapist', p_proposed_licensed_seats: 3,
        p_proposed_covered_patient_capacity: 15, p_annual_license_fee: null, p_billing_cadence: null,
        p_quote_term_months: null, p_discount_notes: null, p_valid_until: null,
      },
      tok.owner,
    )) as [number, { id: string }];
    expect(qStatus).toBe(200);
    await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);

    // Uses applicant2, a fresh account with no application history --
    // applicant (above) already has a real pending_review row by this
    // point, which would correctly (and irrelevantly to this test) block
    // a new draft.
    const [draftStatus, draft] = (await rpc(
      'save_application_draft',
      {
        // Attempted tamper: a DIFFERENT org name and package than the real quote.
        p_requested_office: 'director', p_proposed_organization_name: 'TAMPERED ORG NAME', p_proposed_package_type: 'integrated_care',
        p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
        p_professional_title: null, p_profession_category: null,
        p_application_details: { originatingQuoteId: quote.id },
      },
      tok.applicant2,
    )) as [number, { id: string; proposed_organization_name: string; proposed_package_type: string }];
    expect(draftStatus).toBe(200);
    expect(draft.proposed_organization_name).toBe('Real Quoted Org');
    expect(draft.proposed_package_type).toBe('therapist');

    const [discardStatus, discarded] = (await rpc('discard_application_draft', { p_draft_id: draft.id }, tok.applicant2)) as [number, boolean];
    expect(discardStatus).toBe(200);
    expect(discarded).toBe(true);
  });

  it('discard_application_draft removes the row and is idempotent (second call returns false)', async () => {
    const [draftStatus, draft] = (await rpc(
      'save_application_draft',
      {
        p_requested_office: 'director', p_proposed_organization_name: 'Yet Another Org', p_proposed_package_type: 'integrated_care',
        p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
        p_professional_title: null, p_profession_category: null, p_application_details: {},
      },
      tok.outsider,
    )) as [number, { id: string }];
    expect(draftStatus).toBe(200);

    const [firstStatus, firstResult] = (await rpc('discard_application_draft', { p_draft_id: draft.id }, tok.outsider)) as [number, boolean];
    expect(firstStatus).toBe(200);
    expect(firstResult).toBe(true);
    const [secondStatus, secondResult] = (await rpc('discard_application_draft', { p_draft_id: draft.id }, tok.outsider)) as [number, boolean];
    expect(secondStatus).toBe(200);
    expect(secondResult).toBe(false);
  });
});
