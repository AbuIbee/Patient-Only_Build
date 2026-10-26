// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase H5/I1 — real-browser proof
// of the full organization amendment workflow: Bilal (an active
// Director with a real, active, paid license) requests an expansion,
// the Platform Owner reviews and quotes it through the new
// AmendmentRequestsPanel, and Bilal's own dashboard then offers the
// real "Proceed to payment" control for that quote (migration 114 is
// what makes this specific payment path work -- without it, this
// exact click would fail with "You do not have an application
// referencing this quote").
//
// Same honest scope as every other Stripe-touching spec in this
// engagement: no real Stripe test-mode credentials exist here, so the
// final outbound Stripe API call is expected to fail and this test
// asserts that failure reaches the user as a clear error. Everything
// up to that boundary -- the full request/review/quote workflow, and
// the real HTTP round trip through the real Edge Function reaching
// the real (migration-114-patched) RPC -- is fully verified either
// way.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'AmendUi9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Amendment UI Org ${stamp}`;

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
async function signIn(page: Page, email: string, path = '/Professional/Admin') {
  await page.goto(`${BASE}${path}`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Organization amendment requests (MMA-ENT-SALES-006 Phase H5/I1)', () => {
  test('Director requests an expansion, Platform Owner quotes it, Director sees the real payment path', async ({ browser }) => {
    const ownerEmail = `amendui-owner-${stamp}@local.test`;
    const bilalEmail = `amendui-bilal-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    let orgId = '';
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}'); UPDATE profiles SET role='admin' WHERE id='${ownerId}';`);

      orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('${orgName}', 'integrated_care', '${bilalId}') RETURNING id;`);
      sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${orgId}', '${bilalId}', 'director', 'active');`);
      sql(`
        INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, annual_license_fee, status, license_number, activated_at)
        VALUES ('${orgId}', 4, 20, 12000, 'active', 'MMA-FE-2026-200001', now());
      `);

      // Bilal requests an expansion through the real UI.
      const bilalContext = await browser.newContext();
      const bilalPage = await bilalContext.newPage();
      await signIn(bilalPage, bilalEmail);
      await bilalPage.getByRole('button', { name: 'Licensing and Entitlements' }).click();
      await expect(bilalPage.getByText('MMA-FE-2026-200001')).toBeVisible({ timeout: 15000 });
      await bilalPage.getByRole('button', { name: 'Request a change' }).click();
      await bilalPage.getByLabel('What do you need?').selectOption('expansion');
      await bilalPage.getByLabel('Describe what you need (seats, capacity, timing, etc.)').fill('Need 8 seats and 40 patient capacity for our new branch.');
      await bilalPage.getByRole('button', { name: 'Submit request' }).click();
      await expect(bilalPage.getByText(/Expansion \(more seats\/capacity\) —/)).toBeVisible({ timeout: 10000 });
      await expect(bilalPage.getByText('pending', { exact: true })).toBeVisible(); // CSS uppercase is visual only; DOM text is lowercase
      await bilalContext.close();

      const requestId = sql(`SELECT id FROM organization_amendment_requests WHERE organization_id='${orgId}' AND status='pending';`);
      expect(requestId).toBeTruthy();

      // Platform Owner reviews and quotes it through the real UI.
      const ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage, ownerEmail, '/Professional/Owner');
      await expect(ownerPage.getByText(`${orgName} — Expansion`)).toBeVisible({ timeout: 15000 });
      await expect(ownerPage.getByText('Need 8 seats and 40 patient capacity')).toBeVisible();
      await ownerPage.getByRole('button', { name: 'Quote this request' }).click();
      await ownerPage.getByPlaceholder('Contact name').fill('Bilal Ahmed');
      await ownerPage.getByPlaceholder('Contact email').fill(bilalEmail);
      await ownerPage.getByPlaceholder('Total seats').fill('8');
      await ownerPage.getByPlaceholder('Patient capacity').fill('40');
      await ownerPage.getByPlaceholder('Annual fee ($)').fill('20000');
      await ownerPage.getByRole('button', { name: 'Send quote' }).click();
      await expect(ownerPage.getByText(`${orgName} — Expansion`)).toHaveCount(0, { timeout: 10000 }); // no longer pending
      await ownerContext.close();

      const quoteId = sql(`SELECT resulting_quote_id FROM organization_amendment_requests WHERE id='${requestId}';`);
      expect(quoteId).toBeTruthy();
      expect(sql(`SELECT proposed_licensed_seats, annual_license_fee FROM sales_quotes WHERE id='${quoteId}';`)).toBe('8|20000.00');
      // The license itself is still untouched -- nothing activates on a mere quote.
      expect(sql(`SELECT licensed_seats FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('4');

      // Bilal now sees the real payment path for this specific quote.
      const bilalContext2 = await browser.newContext();
      const page = await bilalContext2.newPage();
      await signIn(page, bilalEmail);
      await page.getByRole('button', { name: 'Licensing and Entitlements' }).click();
      await expect(page.getByText(/A quote is ready for your expansion/)).toBeVisible({ timeout: 15000 });
      await page.getByPlaceholder('billing@yourorganization.com').fill('billing@amendui.test');
      await page.getByRole('button', { name: 'Proceed to payment' }).click();
      // No real Stripe test-mode key exists in this environment -- the
      // real call reaches the real Edge Function and the real,
      // migration-114-patched RPC, then Stripe itself correctly
      // rejects the dummy key.
      await expect(page.getByText(/could not start checkout|invalid api key/i)).toBeVisible({ timeout: 15000 });

      // Confirms the click was not a no-op: a real billing account was
      // created server-side with the amendment quote's real terms.
      const account = sql(`SELECT billing_contact_email, unit_amount_cents FROM enterprise_billing_accounts WHERE quote_id='${quoteId}';`);
      expect(account).toBe('billing@amendui.test|2000000');

      await bilalContext2.close();
    } finally {
      sql(`DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT resulting_quote_id FROM organization_amendment_requests WHERE organization_id='${orgId}');`);
      sql(`DELETE FROM organization_amendment_requests WHERE organization_id='${orgId}';`);
      sql(`DELETE FROM sales_quotes WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM sales_prospects WHERE created_by='${ownerId}';`);
      if (orgId) {
        sql(`DELETE FROM organization_licenses WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organization_memberships WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organizations WHERE id='${orgId}';`);
      }
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
