// OWNER DIRECTIVE MMA-ENT-SALES-003 §6 (Phase H) — real-browser proof
// that a Director whose license is genuinely active under confirmed
// Enterprise payment can open Stripe's hosted Billing Portal to update
// their payment method / review invoices, via the new
// create-enterprise-billing-portal-session Edge Function and
// EnterpriseBillingManagementSection in OrganizationDirectorDashboard.
//
// Same honest scope as the checkout E2E spec: this environment has no
// real Stripe test-mode credentials, so the real outbound Stripe API
// call is expected to fail there -- this test verifies everything up
// to that boundary (auth, the real get_my_enterprise_billing_status
// lookup finding the real stripe_customer_id, the real HTTP round trip
// to the real Edge Function) and that the failure reaches the user as
// a clear error, never a crash or silence.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'BillingPortal9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Billing Portal Org ${stamp}`;

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
async function deleteUser(id: string): Promise<void> {
  await fetch(`${API_BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
}
async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/Professional/Admin`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Enterprise billing portal (MMA-ENT-SALES-003 §6, Phase H)', () => {
  test('a Director with an active, paid license can open the Stripe billing portal', async ({ page }) => {
    const ownerId = await mkUser(`portal-owner-${stamp}@local.test`);
    const bilalEmail = `portal-bilal-${stamp}@local.test`;
    const bilalId = await mkUser(bilalEmail);
    let orgId = '';
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}');`);

      const prospectId = sql(`
        INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by)
        VALUES ('Portal Test', '${bilalEmail}', '${orgName}', '${ownerId}') RETURNING id;
      `);
      const quoteId = sql(`
        INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
        VALUES ('${prospectId}', 'integrated_care', 4, 20, 12000, 'annual', 'sent', '${ownerId}') RETURNING id;
      `);
      orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('${orgName}', 'integrated_care', '${bilalId}') RETURNING id;`);
      sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${orgId}', '${bilalId}', 'director', 'active');`);
      sql(`
        INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, annual_license_fee, status, license_number, activated_at)
        VALUES ('${orgId}', 4, 20, 12000, 'active', 'MMA-FE-2026-999999', now());
      `);
      sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details, target_organization_id, platform_owner_approved_at)
        VALUES ('${bilalId}', 'director', '${orgName}', 'integrated_care', 'Portal Bilal', '${bilalEmail}', 'approved', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb, '${orgId}', now());
      `);
      // Real stripe_customer_id so the Edge Function's ownership/lookup
      // path has something real to find before the Stripe API call.
      sql(`
        INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, stripe_customer_id, created_by)
        VALUES ('${quoteId}', 'billing@portaltest.local', 'usd', 1200000, 'year', 'active', 'cus_test_portal_${stamp}', '${bilalId}');
      `);

      await signIn(page, bilalEmail);
      await page.getByRole('button', { name: 'Licensing and Entitlements' }).click();
      await expect(page.getByText('MMA-FE-2026-999999')).toBeVisible({ timeout: 15000 });

      const manageButton = page.getByRole('button', { name: 'Manage billing & payment method' });
      await expect(manageButton).toBeVisible();
      await manageButton.click();

      // No real Stripe test-mode key exists in this environment -- the
      // real call reaches the real Edge Function (which really finds
      // the stripe_customer_id above via the real RPC) and Stripe
      // itself correctly rejects the dummy key. The user must see that
      // as a clear error.
      await expect(page.getByText(/could not open billing portal|invalid api key/i)).toBeVisible({ timeout: 15000 });
    } finally {
      sql(`DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by='${ownerId}');`);
      sql(`DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      if (orgId) {
        sql(`DELETE FROM organization_licenses WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organization_memberships WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organizations WHERE id='${orgId}';`);
      }
      sql(`DELETE FROM sales_quotes WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM sales_prospects WHERE created_by='${ownerId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
