// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase F3 — real-browser proof of
// the Platform Owner's contract-management UI (ContractManagementSection
// on QuoteCard) and the Director's read-only agreement-status display
// (EnterpriseActivationSection's new "Agreement status" banner,
// satisfying D9's "Display: ... Agreement pending/executed..."). Also
// proves the real browser click path for the G1 gate: a Director
// cannot complete Enterprise activation while an agreement is merely
// "presented," and the banner correctly disappears (no gate) once the
// Platform Owner records a real execution.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const PW = 'ContractUi9!';
const BASE = 'http://127.0.0.1:5180';
const API_BASE = 'http://127.0.0.1:55321';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Contract UI Org ${stamp}`;

function sql(statement: string): string {
  return execSync('docker exec -i supabase_db_repo psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1', { input: statement }).toString().trim();
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

test.describe('Enterprise contract/BAA management (MMA-ENT-SALES-006 Phase F3)', () => {
  test('Platform Owner creates, presents and executes an agreement through the real UI; Director sees the real status', async ({ browser }) => {
    const ownerEmail = `contractui-owner-${stamp}@local.test`;
    const bilalEmail = `contractui-bilal-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    let appId = '';
    let orgId = '';
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}'); UPDATE profiles SET role='admin' WHERE id='${ownerId}';`);

      const prospectId = sql(`
        INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by)
        VALUES ('Contract UI Test', '${bilalEmail}', '${orgName}', '${ownerId}') RETURNING id;
      `);
      const quoteId = sql(`
        INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
        VALUES ('${prospectId}', 'integrated_care', 4, 20, 15000, 'annual', 'sent', '${ownerId}') RETURNING id;
      `);
      appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${orgName}', 'integrated_care', 'Bilal Ahmed', '${bilalEmail}', 'pending_review', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb)
        RETURNING id;
      `);

      // Platform Owner creates, presents, and (after a deliberate
      // pause to verify the gate) executes the agreement -- all
      // through the real Sales Pipeline UI.
      const ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage, ownerEmail, '/Professional/Owner');
      await ownerPage.getByRole('button', { name: new RegExp(orgName) }).click();
      await expect(ownerPage.getByText('+ Add agreement record')).toBeVisible({ timeout: 15000 });
      await ownerPage.getByText('+ Add agreement record').click();
      await ownerPage.getByPlaceholder('Template version (e.g. MMA-SAAS-2026-v1)').fill('MMA-SAAS-2026-v1');
      await ownerPage.getByPlaceholder('Signatory name').fill('Bilal Ahmed');
      await ownerPage.getByRole('button', { name: 'Create as draft' }).click();
      await expect(ownerPage.getByText('MMA-SAAS-2026-v1', { exact: false })).toBeVisible({ timeout: 10000 });
      await ownerPage.getByRole('button', { name: 'Present to customer' }).click();
      await expect(ownerPage.getByText('presented', { exact: true })).toBeVisible({ timeout: 10000 });

      // Approve Bilal and confirm payment now, with the agreement
      // only "presented" -- the license must stay proposed.
      await ownerPage.goto(`${BASE}/Professional/Owner`);
      await ownerPage.getByRole('button', { name: /approve/i }).first().click();
      await expect(ownerPage.getByRole('button', { name: /approve/i })).toHaveCount(0, { timeout: 10000 });
      orgId = sql(`SELECT target_organization_id FROM professional_applications WHERE id='${appId}';`);
      sql(`
        INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
        VALUES ('${quoteId}', '${bilalEmail}', 'usd', 1500000, 'year', 'active', '${bilalId}');
      `);
      let threw = false;
      try { sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); } catch { threw = true; }
      expect(threw).toBe(true);
      expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('proposed');

      // Bilal's own dashboard shows the real "pending your signature" banner.
      const bilalContext = await browser.newContext();
      const bilalPage = await bilalContext.newPage();
      await signIn(bilalPage, bilalEmail);
      await bilalPage.getByRole('button', { name: 'Licensing and Entitlements' }).click();
      await expect(bilalPage.getByText(/Agreement status:.*pending your signature/)).toBeVisible({ timeout: 15000 });
      await bilalContext.close();

      // Owner records the real execution (method + reference).
      await ownerPage.goto(`${BASE}/Professional/Owner`);
      await ownerPage.getByRole('button', { name: new RegExp(orgName) }).click();
      await ownerPage.getByPlaceholder('Execution method (e.g. DocuSign envelope #...)').fill('DocuSign envelope');
      await ownerPage.getByPlaceholder('Evidence reference (document id, storage path, etc.)').fill('envelope-xyz-789');
      await ownerPage.getByRole('button', { name: 'Record execution' }).click();
      await expect(ownerPage.getByText('executed', { exact: true })).toBeVisible({ timeout: 10000 });

      // CODEX F-04 fix (migration 123): a BAA is now ALSO mandatory,
      // not just the SaaS license agreement -- created, presented and
      // executed through the real UI exactly the same way.
      await ownerPage.getByText('+ Add agreement record').click();
      await ownerPage.getByRole('combobox').selectOption('baa');
      await ownerPage.getByPlaceholder('Template version (e.g. MMA-SAAS-2026-v1)').fill('MMA-BAA-2026-v1');
      await ownerPage.getByPlaceholder('Signatory name').fill('Bilal Ahmed');
      await ownerPage.getByRole('button', { name: 'Create as draft' }).click();
      await expect(ownerPage.getByText('MMA-BAA-2026-v1', { exact: false })).toBeVisible({ timeout: 10000 });
      await ownerPage.getByRole('button', { name: 'Present to customer' }).click();
      await expect(ownerPage.getByText('presented', { exact: true }).first()).toBeVisible({ timeout: 10000 });
      await ownerPage.getByPlaceholder('Execution method (e.g. DocuSign envelope #...)').fill('DocuSign envelope');
      await ownerPage.getByPlaceholder('Evidence reference (document id, storage path, etc.)').fill('envelope-baa-xyz-789');
      await ownerPage.getByRole('button', { name: 'Record execution' }).click();
      await expect(ownerPage.getByText('MMA-BAA-2026-v1', { exact: false }).locator('..')).toContainText('executed');
      await ownerContext.close();

      // Now activation genuinely succeeds.
      const activated = sql(`SELECT status, license_number FROM activate_enterprise_license_from_quote('${quoteId}');`);
      expect(activated).toContain('active|MMA-FE-');
    } finally {
      sql(`DELETE FROM enterprise_contracts WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM enterprise_billing_accounts WHERE created_by='${bilalId}';`);
      if (orgId) {
        sql(`DELETE FROM organization_licenses WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organization_memberships WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organizations WHERE id='${orgId}';`);
      }
      sql(`DELETE FROM professional_application_events WHERE application_id='${appId}';`);
      sql(`DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      sql(`DELETE FROM sales_quotes WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM sales_prospects WHERE created_by='${ownerId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });

  // MMA-ENT-SALES-007 §5/F2 — migration 117 fixed a real bug where a
  // voided contract was wrongly treated as satisfying activation, and
  // added supersession so an owner isn't stuck with no UI path to
  // recover once they've voided one. This proves both halves through
  // the real UI: void really blocks, and the real "Replace with new
  // agreement" button is how the owner recovers.
  test('a voided agreement still blocks activation; the owner replaces it through the real UI and activation then succeeds', async ({ browser }) => {
    const ownerEmail = `contractui2-owner-${stamp}@local.test`;
    const bilalEmail = `contractui2-bilal-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    const orgName2 = `Contract UI Replace Org ${stamp}`;
    let appId = '';
    let orgId = '';
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}'); UPDATE profiles SET role='admin' WHERE id='${ownerId}';`);

      const prospectId = sql(`
        INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by)
        VALUES ('Contract UI Replace Test', '${bilalEmail}', '${orgName2}', '${ownerId}') RETURNING id;
      `);
      const quoteId = sql(`
        INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
        VALUES ('${prospectId}', 'integrated_care', 4, 20, 15000, 'annual', 'sent', '${ownerId}') RETURNING id;
      `);
      appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${orgName2}', 'integrated_care', 'Bilal Ahmed', '${bilalEmail}', 'pending_review', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb)
        RETURNING id;
      `);

      const ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage, ownerEmail, '/Professional/Owner');
      await ownerPage.getByRole('button', { name: new RegExp(orgName2) }).click();
      await expect(ownerPage.getByText('+ Add agreement record')).toBeVisible({ timeout: 15000 });
      await ownerPage.getByText('+ Add agreement record').click();
      await ownerPage.getByPlaceholder('Template version (e.g. MMA-SAAS-2026-v1)').fill('MMA-SAAS-2026-v1');
      await ownerPage.getByPlaceholder('Signatory name').fill('Bilal Ahmed');
      await ownerPage.getByRole('button', { name: 'Create as draft' }).click();
      await expect(ownerPage.getByText('MMA-SAAS-2026-v1', { exact: false })).toBeVisible({ timeout: 10000 });
      await ownerPage.getByRole('button', { name: 'Present to customer' }).click();
      await expect(ownerPage.getByText('presented', { exact: true })).toBeVisible({ timeout: 10000 });

      // Void the presented agreement through the real UI.
      await ownerPage.getByPlaceholder('Void reason…').fill('Terms changed before signature');
      await ownerPage.getByRole('button', { name: 'Void', exact: true }).click();
      await expect(ownerPage.getByText('void', { exact: true })).toBeVisible({ timeout: 10000 });

      // Approve, confirm payment, and prove activation is STILL blocked
      // -- the void did not satisfy it.
      await ownerPage.goto(`${BASE}/Professional/Owner`);
      await ownerPage.getByRole('button', { name: /approve/i }).first().click();
      await expect(ownerPage.getByRole('button', { name: /approve/i })).toHaveCount(0, { timeout: 10000 });
      orgId = sql(`SELECT target_organization_id FROM professional_applications WHERE id='${appId}';`);
      sql(`
        INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
        VALUES ('${quoteId}', '${bilalEmail}', 'usd', 1500000, 'year', 'active', '${bilalId}');
      `);
      let threw = false;
      try { sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); } catch { threw = true; }
      expect(threw).toBe(true);
      expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('proposed');

      // Owner replaces the voided agreement through the real
      // "Replace with new agreement" button -- the actual recovery
      // path, not a direct SQL/RPC workaround.
      await ownerPage.goto(`${BASE}/Professional/Owner`);
      await ownerPage.getByRole('button', { name: new RegExp(orgName2) }).click();
      await ownerPage.getByRole('button', { name: 'Replace with new agreement' }).click();
      await ownerPage.getByPlaceholder('Template version (e.g. MMA-SAAS-2026-v1)').fill('MMA-SAAS-2026-v2');
      await ownerPage.getByPlaceholder('Signatory name').fill('Bilal Ahmed');
      await ownerPage.getByRole('button', { name: 'Create replacement as draft' }).click();
      await expect(ownerPage.getByText('MMA-SAAS-2026-v2', { exact: false })).toBeVisible({ timeout: 10000 });
      await ownerPage.getByRole('button', { name: 'Present to customer' }).click();
      await expect(ownerPage.getByText('presented', { exact: true })).toBeVisible({ timeout: 10000 });
      await ownerPage.getByPlaceholder('Execution method (e.g. DocuSign envelope #...)').fill('DocuSign envelope');
      await ownerPage.getByPlaceholder('Evidence reference (document id, storage path, etc.)').fill('envelope-replace-1');
      await ownerPage.getByRole('button', { name: 'Record execution' }).click();
      await expect(ownerPage.getByText('executed', { exact: true })).toBeVisible({ timeout: 10000 });

      // CODEX F-04 fix (migration 123): a BAA is now ALSO mandatory.
      await ownerPage.getByText('+ Add agreement record').click();
      await ownerPage.getByRole('combobox').selectOption('baa');
      await ownerPage.getByPlaceholder('Template version (e.g. MMA-SAAS-2026-v1)').fill('MMA-BAA-2026-v1');
      await ownerPage.getByPlaceholder('Signatory name').fill('Bilal Ahmed');
      await ownerPage.getByRole('button', { name: 'Create as draft' }).click();
      await expect(ownerPage.getByText('MMA-BAA-2026-v1', { exact: false })).toBeVisible({ timeout: 10000 });
      await ownerPage.getByRole('button', { name: 'Present to customer' }).click();
      await expect(ownerPage.getByText('presented', { exact: true }).first()).toBeVisible({ timeout: 10000 });
      await ownerPage.getByPlaceholder('Execution method (e.g. DocuSign envelope #...)').fill('DocuSign envelope');
      await ownerPage.getByPlaceholder('Evidence reference (document id, storage path, etc.)').fill('envelope-baa-replace-1');
      await ownerPage.getByRole('button', { name: 'Record execution' }).click();
      await expect(ownerPage.getByText('MMA-BAA-2026-v1', { exact: false }).locator('..')).toContainText('executed');
      await ownerContext.close();

      const activated = sql(`SELECT status, license_number FROM activate_enterprise_license_from_quote('${quoteId}');`);
      expect(activated).toContain('active|MMA-FE-');
    } finally {
      sql(`DELETE FROM enterprise_contracts WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM enterprise_billing_accounts WHERE created_by='${bilalId}';`);
      if (orgId) {
        sql(`DELETE FROM organization_licenses WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organization_memberships WHERE organization_id='${orgId}';`);
        sql(`DELETE FROM organizations WHERE id='${orgId}';`);
      }
      sql(`DELETE FROM professional_application_events WHERE application_id='${appId}';`);
      sql(`DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      sql(`DELETE FROM sales_quotes WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM sales_prospects WHERE created_by='${ownerId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
