// OWNER DIRECTIVE MMA-ENT-SALES-004, PHASE D — real browser verification
// of the six-step Director application wizard (D1-D6), autosave and
// resume-after-reload (D7), on top of the already-tested backend
// (migration 109) and redemption bridge (migration 108). Drives every
// one of the six steps with real field input, reloads mid-flow to prove
// autosave genuinely persisted (not merely in-memory React state), and
// submits -- then verifies the server-side row directly: the locked
// commercial terms were never tampered with, and the JSONB step data
// landed correctly.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'WizardFlow9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Al-Noor Wizard Org ${stamp}`;

function sql(statement: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, { input: statement }).toString().trim();
}
async function mkUser(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data.id as string;
}
async function deleteUser(id: string): Promise<void> {
  await fetch(`${API_BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
}
async function login(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }),
  });
  return (await r.json()).access_token as string;
}
async function issueInvitationViaRpc(ownerToken: string, recipientEmail: string): Promise<string> {
  const r = await fetch(`${API_BASE}/rest/v1/rpc/platform_owner_create_prospect`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_contact_name: 'Bilal', p_contact_email: recipientEmail, p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null }),
  });
  const prospect = await r.json();
  const r2 = await fetch(`${API_BASE}/rest/v1/rpc/platform_owner_create_quote`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
      p_proposed_covered_patient_capacity: 20, p_annual_license_fee: null, p_billing_cadence: null,
      p_quote_term_months: null, p_discount_notes: null, p_valid_until: null,
    }),
  });
  const quote = await r2.json();
  await fetch(`${API_BASE}/rest/v1/rpc/platform_owner_send_quote`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_quote_id: quote.id }),
  });
  const r3 = await fetch(`${API_BASE}/rest/v1/rpc/platform_owner_issue_quote_invitation`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_quote_id: quote.id, p_recipient_email: recipientEmail, p_expires_in_hours: 168 }),
  });
  const issued = await r3.json();
  return issued[0].raw_token as string;
}
async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/Professional/Admin`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Director application wizard (MMA-ENT-SALES-004 Phase D)', () => {
  test('Bilal completes all six steps, autosave genuinely persists across a reload, and the submitted application is correctly locked and populated', async ({ browser }) => {
    const ownerEmail = `wizard-owner-${stamp}@local.test`;
    const bilalEmail = `wizard-bilal-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
      `);
      const ownerToken = await login(ownerEmail);
      const rawToken = await issueInvitationViaRpc(ownerToken, bilalEmail);

      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, bilalEmail);
      await page.getByText('Have an invitation code?').click();
      await page.getByPlaceholder('Paste your invitation code').fill(rawToken);
      await page.getByRole('button', { name: 'Accept' }).click();
      await expect(page.getByRole('heading', { name: 'Organization legal identity' })).toBeVisible({ timeout: 10000 });

      // Step 1
      await page.getByLabel('Registered legal business name', { exact: false }).fill('Al-Noor Family Care Services LLC');
      await page.getByLabel('Legal entity type', { exact: false }).fill('LLC');
      await page.getByLabel('Business classification', { exact: false }).fill('Home care agency');
      await page.getByLabel('Formation jurisdiction', { exact: false }).fill('Texas');
      await page.getByLabel('Registered address *', { exact: true }).fill('123 Main St, Austin, TX');
      await page.getByLabel('Business phone', { exact: false }).fill('555-0100');
      await page.getByLabel('Business email', { exact: false }).fill('contact@alnoor.test');
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 2
      await expect(page.getByRole('heading', { name: 'Founding Director' })).toBeVisible();
      await page.getByLabel('Full legal name', { exact: false }).fill('Bilal Ahmed');
      await page.getByLabel('Verified business email', { exact: false }).fill(bilalEmail);
      await page.getByLabel('Mobile number', { exact: false }).fill('555-0101');
      await page.getByLabel('Title', { exact: false }).fill('Founder');
      await page.getByLabel('Relationship to legal entity', { exact: false }).fill('Owner');
      await page.getByRole('checkbox', { name: 'I am an authorized representative', exact: false }).click();
      await page.getByRole('checkbox', { name: 'I attest I have authority', exact: false }).click();

      // Wait for the autosave indicator to settle before reloading, so
      // the reload genuinely tests persisted state, not a race.
      await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 });

      // Resume-after-reload (D7): reload mid-wizard, sign back in is
      // not needed (session persists), and all step 1/2 data must
      // still be there, landing back on whichever step was last saved.
      await page.reload();
      await expect(page.getByText('I am an authorized representative')).toBeVisible({ timeout: 10000 });
      await expect(page.getByLabel('Full legal name *', { exact: true })).toHaveValue('Bilal Ahmed');
      await page.getByRole('button', { name: '1. Legal Entity' }).click();
      await expect(page.getByLabel('Registered legal business name *', { exact: true })).toHaveValue('Al-Noor Family Care Services LLC');
      await page.getByRole('button', { name: '2. Director' }).click();

      await page.getByRole('button', { name: 'Next' }).click();

      // Step 3 -- locked terms visible, only buyer billing contact required.
      await expect(page.getByRole('heading', { name: 'Enterprise package' })).toBeVisible();
      await expect(page.getByText(orgName)).toBeVisible();
      await expect(page.getByText('Full Enterprise')).toBeVisible();
      await page.getByLabel('Buyer billing contact', { exact: false }).fill('Bilal Ahmed');
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 4
      await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
      await page.getByLabel('Services provided', { exact: false }).fill('In-home personal care');
      await page.getByLabel('Care setting', { exact: false }).fill('Residential');
      await page.getByLabel('Operating jurisdictions', { exact: false }).fill('Texas');
      await page.getByLabel(/process protected health information/i).selectOption('no');
      await page.getByLabel('HIPAA relationship', { exact: false }).selectOption('not_applicable');
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 5
      await expect(page.getByRole('heading', { name: 'Billing profile' })).toBeVisible();
      await page.getByLabel('Billing legal entity', { exact: false }).fill('Al-Noor Family Care Services LLC');
      await page.getByLabel('Billing contact', { exact: false }).fill('Bilal Ahmed');
      await page.getByLabel('Billing address', { exact: false }).fill('123 Main St, Austin, TX');
      await page.getByLabel('Billing email', { exact: false }).fill('billing@alnoor.test');
      await page.getByLabel('Billing cadence', { exact: false }).fill('annual');
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 6 -- the formal agreement is explicitly disclosed as pending, not faked.
      await expect(page.getByText('Formal agreement — pending')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Everything above is accurate', exact: false }).click();
      await page.getByRole('checkbox', { name: 'I confirm I am authorized to submit', exact: false }).click();
      await page.getByRole('checkbox', { name: 'I acknowledge the privacy practices', exact: false }).click();
      await page.getByLabel('Type your full name as your signature', { exact: false }).fill('Bilal Ahmed');
      await page.getByRole('button', { name: 'Submit application' }).click();

      await expect(page.getByRole('heading', { name: 'Your application is under review' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(orgName)).toBeVisible();

      const row = sql(`SELECT proposed_organization_name, proposed_package_type, legal_name, contact_email, status, application_details FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      expect(row).toContain(orgName);
      expect(row).toContain('integrated_care');
      expect(row).toContain('Bilal Ahmed');
      expect(row).toContain('pending_review');
      expect(row).toContain('Al-Noor Family Care Services LLC');
      expect(row).toContain('Home care agency');
      expect(row).toContain('billing@alnoor.test');
      await context.close();
    } finally {
      sql(`
        DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';
        DELETE FROM sales_quote_invitations WHERE created_by='${ownerId}';
        DELETE FROM sales_quotes WHERE created_by='${ownerId}';
        DELETE FROM sales_prospects WHERE created_by='${ownerId}';
      `);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
