// HCN-ONBOARDING-PRODUCTION-001 Sections 1-2 -- real-browser proof that
// the production dead end ("Agreement signing is not yet available in
// this workspace") is closed. Drives a real approved self-service
// application to the actual ApplicationStatusPage, signs the real
// Business Associate Agreement text through the real UI, and confirms
// the Haneen SaaS License Agreement renders its honest BLOCKED state
// rather than a fake signing form. Requires the local Docker Supabase
// stack and a dev server on the configured port (disposable stack only).
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PW = 'AgreementE2E9!';
const stamp = Date.now();

function sql(statement: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`, { input: statement }).toString().trim();
}
async function mkUser(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data.id as string;
}

test.describe('Real-browser agreement execution (HCN-ONBOARDING-PRODUCTION-001)', () => {
  test('a signed-in applicant with an approved application can sign the real BAA text and sees the SaaS License Agreement as honestly blocked', async ({ page }) => {
    const email = `agreement-e2e-${stamp}@local.test`;
    const orgName = `Agreement E2E Org ${stamp}`;
    const id = await mkUser(email);
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
      await page.goto(`${BASE}/Professional`);
      await page.getByPlaceholder('you@example.com').fill(email);
      await page.getByPlaceholder('Your password').fill(PW);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForTimeout(1200);

      // Seed the application + quote directly -- the full multi-step
      // submission ceremony reaching 'approved' is already covered by
      // e2e_self_service_onboarding_ui.spec.ts; this test's subject is
      // the agreement-signing UI itself, once that state is reached.
      const prospectId = sql(`INSERT INTO sales_prospects(contact_name,contact_email,prospective_organization_name,status,created_by) VALUES('Agreement E2E','${email}','${orgName}','quoted','${id}') RETURNING id;`);
      const quoteId = sql(`INSERT INTO sales_quotes(prospect_id,package_type,proposed_licensed_seats,proposed_covered_patient_capacity,annual_license_fee,billing_cadence,status,created_by) VALUES('${prospectId}','integrated_care',10,10,399,'annual','sent','${id}') RETURNING id;`);
      const appIdSql = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, entry_method, selected_tier_code, application_details)
        VALUES ('${id}', 'director', '${orgName}', 'integrated_care', 'Agreement E2E Applicant', '${email}', 'approved', false, 'public_website', 'essential', jsonb_build_object('originatingQuoteId', '${quoteId}'))
        RETURNING id;
      `);

      await page.goto(`${BASE}/Professional`);
      await page.waitForTimeout(1200);

      await expect(page.getByRole('heading', { name: 'Application approved — agreements pending' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Business Associate Agreement — requires your signature')).toBeVisible();
      await expect(page.getByText('Haneen SaaS License Agreement — review and sign')).toBeVisible();

      // Starts already expanded (there is no existing contract yet) --
      // the full text is visible without needing to click anything.
      await expect(page.getByText('My Memoria Ally Business Associate Agreement')).toBeVisible();
      await expect(page.getByText(/Salahuddeen Enterprises LLC \("Business Associate"\)/)).toBeVisible();

      // HCN-SAAS-1.0: the complete, real agreement text is shown for
      // review, but signing stays disabled with a precise
      // configuration message -- never a fake, clickable "sign"
      // button, and never silently absent.
      await expect(page.getByText('Agreement Version HCN-SAAS-1.0')).toBeVisible();
      await expect(page.getByText(/Haneen Care Network's lawful contracting entity has not yet been legally confirmed/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Signing temporarily disabled' })).toBeDisabled();

      await page.locator('#baa-signatory-name').fill('Agreement E2E Applicant');
      await page.locator('#baa-signatory-title').fill('Founder');
      await page.getByText('I have read and agree to the complete Business Associate Agreement').click();
      await page.getByText('I consent to conduct this transaction and sign this agreement electronically').click();
      await page.getByRole('button', { name: 'Sign Business Associate Agreement' }).click();

      await expect(page.getByText('Business Associate Agreement — executed')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Signed by Agreement E2E Applicant, Founder')).toBeVisible();

      const executed = sql(`SELECT status, signatory_name, template_version FROM enterprise_contracts WHERE quote_id='${quoteId}' AND contract_type='baa';`);
      expect(executed).toBe('executed|Agreement E2E Applicant|HCN-BAA-2026-04-19');

      // The application does NOT advance past 'approved' -- the SaaS
      // License Agreement is still blocked, correctly and honestly.
      const appStatusAfter = sql(`SELECT status FROM professional_applications WHERE id='${appIdSql}';`);
      expect(appStatusAfter).toBe('approved');

      sql(`
        DELETE FROM enterprise_contracts WHERE quote_id='${quoteId}';
        DELETE FROM professional_application_events WHERE application_id='${appIdSql}';
        DELETE FROM professional_applications WHERE id='${appIdSql}';
        DELETE FROM sales_quotes WHERE id='${quoteId}';
        DELETE FROM sales_prospects WHERE id='${prospectId}';
      `);
    } finally {
      await fetch(`${API_BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    }
  });

  // P0 override (2026-11-03): explicit acceptance scenarios named in
  // the follow-up directive -- refresh, logout/login (a FRESH session,
  // never a cached/stale one), browser back/forward, and resuming a
  // PRE-EXISTING application (one that was already sitting at
  // 'approved' before this fix ever shipped, modeled by seeding it with
  // no special marker distinguishing it from a brand-new one -- exactly
  // what a real already-stuck production application looks like) --
  // never requiring re-registration or a duplicate organization.
  test('a pre-existing approved application survives refresh, logout/login, and browser back/forward without ever regressing to the dead-end screen or requiring re-registration', async ({ page }) => {
    const email = `agreement-e2e-resume-${stamp}@local.test`;
    const orgName = `Agreement E2E Resume Org ${stamp}`;
    const id = await mkUser(email);
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);

      // Pre-existing application: created directly, identical in every
      // column to one that was already stuck before this fix shipped --
      // no "already signed" flag, no special-cased recovery path.
      const prospectId = sql(`INSERT INTO sales_prospects(contact_name,contact_email,prospective_organization_name,status,created_by) VALUES('Resume E2E','${email}','${orgName}','quoted','${id}') RETURNING id;`);
      const quoteId = sql(`INSERT INTO sales_quotes(prospect_id,package_type,proposed_licensed_seats,proposed_covered_patient_capacity,annual_license_fee,billing_cadence,status,created_by) VALUES('${prospectId}','integrated_care',10,10,399,'annual','sent','${id}') RETURNING id;`);
      const appIdSql = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, entry_method, selected_tier_code, application_details)
        VALUES ('${id}', 'director', '${orgName}', 'integrated_care', 'Resume E2E Applicant', '${email}', 'approved', false, 'public_website', 'essential', jsonb_build_object('originatingQuoteId', '${quoteId}'))
        RETURNING id;
      `);
      const orgCountBefore = sql(`SELECT count(*) FROM organizations WHERE name='${orgName}';`);
      expect(orgCountBefore).toBe('0'); // confirms: no org exists yet -- nothing to duplicate

      // Sign in (not a fresh registration) and reach the SAME existing application directly.
      await page.goto(`${BASE}/Professional`);
      await page.getByPlaceholder('you@example.com').fill(email);
      await page.getByPlaceholder('Your password').fill(PW);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page.getByRole('heading', { name: 'Application approved — agreements pending' })).toBeVisible({ timeout: 15000 });

      await page.locator('#baa-signatory-name').fill('Resume E2E Applicant');
      await page.getByText('I have read and agree to the complete Business Associate Agreement').click();
      await page.getByText('I consent to conduct this transaction and sign this agreement electronically').click();
      await page.getByRole('button', { name: 'Sign Business Associate Agreement' }).click();
      await expect(page.getByText('Business Associate Agreement — executed')).toBeVisible({ timeout: 10000 });

      // 1. Refresh preserves the signed state (never re-prompts, never dead-ends).
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Application approved — agreements pending' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Business Associate Agreement — executed')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Agreement signing is not yet available in this workspace')).toHaveCount(0);

      // 2. Logout, then a genuinely fresh login (a new session, never a cached token) -- still resumes correctly.
      await page.getByRole('button', { name: 'Logout' }).click();
      await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder('you@example.com').fill(email);
      await page.getByPlaceholder('Your password').fill(PW);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page.getByRole('heading', { name: 'Application approved — agreements pending' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Business Associate Agreement — executed')).toBeVisible({ timeout: 10000 });

      // 3. Direct navigation to /Professional (not through any link) resolves correctly.
      await page.goto(`${BASE}/Professional`);
      await expect(page.getByRole('heading', { name: 'Application approved — agreements pending' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Business Associate Agreement — executed')).toBeVisible({ timeout: 10000 });

      // 4. Browser back/forward cannot bypass or regress the resolved state.
      await page.goto(`${BASE}/Professional/Admin`); // a route this account is not authorized for yet
      await page.waitForTimeout(500);
      await page.goBack();
      await expect(page.getByText('Business Associate Agreement — executed')).toBeVisible({ timeout: 10000 });
      await page.goForward();
      await page.waitForTimeout(500);
      await expect(page.getByText('Director Dashboard')).toHaveCount(0); // never granted merely by navigating there

      // Confirms the whole journey never created a duplicate organization or a second application.
      expect(sql(`SELECT count(*) FROM organizations WHERE name='${orgName}';`)).toBe('0');
      expect(sql(`SELECT count(*) FROM professional_applications WHERE contact_email='${email}';`)).toBe('1');

      sql(`
        DELETE FROM enterprise_contracts WHERE quote_id='${quoteId}';
        DELETE FROM professional_application_events WHERE application_id='${appIdSql}';
        DELETE FROM professional_applications WHERE id='${appIdSql}';
        DELETE FROM sales_quotes WHERE id='${quoteId}';
        DELETE FROM sales_prospects WHERE id='${prospectId}';
      `);
    } finally {
      await fetch(`${API_BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    }
  });
});
