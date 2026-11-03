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
      await expect(page.getByText('Haneen SaaS License Agreement — not yet available')).toBeVisible();

      // Starts already expanded (there is no existing contract yet) --
      // the full text is visible without needing to click anything.
      await expect(page.getByText('My Memoria Ally Business Associate Agreement')).toBeVisible();
      await expect(page.getByText(/Salahuddeen Enterprises LLC \("Business Associate"\)/)).toBeVisible();

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
});
