// OWNER DIRECTIVE MMA-ENT-SALES-002, PHASE C (increment 2) — real browser
// verification of the Platform Owner console's Sales Pipeline panel
// (PlatformOwnerAdminPage.tsx's SalesPipelinePanel), on top of migration
// 107's already-tested backend (tests/integration/salesProspectsQuotesInvitations.test.ts).
// Per the owner's own instruction not to report a capability complete on
// schema/UI existence alone, this exercises the real rendered flow: a
// non-owner is correctly refused the console; the owner creates a
// prospect, drafts and sends a quote, issues an invitation, sees the raw
// token exactly once, and revokes it.
//
// Requires: the local Docker Supabase stack and a running dev server on
// 127.0.0.1:5180. Fully self-contained: seeds/tears down its own
// disposable, uniquely-timestamped synthetic accounts.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'SalesUi9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `SalesUI Org ${stamp}`;

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
async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/Professional/Owner`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Platform Owner console — Sales Pipeline panel (Phase C increment 2)', () => {
  test('a non-owner is refused the console; the owner can run prospect -> quote -> invitation end to end', async ({ page, browser }) => {
    const ownerEmail = `spq-ui-owner-${stamp}@local.test`;
    const caregiverEmail = `spq-ui-caregiver-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const caregiverId = await mkUser(caregiverEmail);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${caregiverId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
      `);

      // Non-owner is refused, in its own disposable browser context so
      // its session can never bleed into the owner's (sessionStorage,
      // per CLAUDE.md's HIPAA-driven auth config, is not cleared by
      // clearCookies() and is scoped per browser context, not per page).
      const outsiderContext = await browser.newContext();
      const outsiderPage = await outsiderContext.newPage();
      await signIn(outsiderPage, caregiverEmail);
      await expect(outsiderPage.getByRole('heading', { name: 'Platform Owner access required' })).toBeVisible({ timeout: 15000 });
      await expect(outsiderPage.getByRole('heading', { name: 'Enterprise Sales Pipeline' })).toHaveCount(0);
      await outsiderContext.close();

      // The real owner reaches the console.
      await signIn(page, ownerEmail);
      await expect(page.getByRole('heading', { name: 'Enterprise Sales Pipeline' })).toBeVisible({ timeout: 15000 });

      // Create a prospect.
      await page.getByRole('button', { name: 'New prospect' }).click();
      await page.getByPlaceholder('Contact name').fill('Bilal');
      await page.getByPlaceholder('Contact email').fill(`bilal-${stamp}@example.test`);
      await page.getByPlaceholder('Prospective organization name').fill(orgName);
      await page.getByRole('button', { name: 'Create prospect' }).click();
      await expect(page.getByText(orgName)).toBeVisible({ timeout: 10000 });

      // Expand it and create a quote.
      await page.getByText(orgName).click();
      await page.getByRole('button', { name: 'New quote' }).click();
      await page.getByPlaceholder('Seats').fill('2');
      await page.getByPlaceholder('Covered patients').fill('10');
      await page.getByRole('button', { name: 'Create quote (draft)' }).click();
      await expect(page.getByText('draft', { exact: true })).toBeVisible({ timeout: 10000 });

      // Send it.
      await page.getByRole('button', { name: 'Send quote' }).click();
      await expect(page.getByText('sent', { exact: true })).toBeVisible({ timeout: 10000 });

      // Issue an invitation and see the raw token exactly once.
      const recipientEmail = `spq-ui-recipient-${stamp}@local.test`;
      await page.getByPlaceholder('recipient@example.com').fill(recipientEmail);
      await page.getByRole('button', { name: 'Issue invitation' }).click();
      await expect(page.getByText('Shown once')).toBeVisible({ timeout: 10000 });
      const tokenText = await page.locator('code').first().textContent();
      expect(tokenText).toMatch(/^[0-9a-f]{64}$/);
      await expect(page.getByText(recipientEmail)).toBeVisible();
      await expect(page.getByText('pending', { exact: true })).toBeVisible();

      // Revoke it.
      await page.getByRole('button', { name: 'Revoke' }).last().click();
      await expect(page.getByText('revoked', { exact: true })).toBeVisible({ timeout: 10000 });

      // Server-side truth matches what the UI showed throughout.
      expect(sql(`SELECT status FROM sales_quote_invitations WHERE recipient_email='${recipientEmail}';`)).toBe('revoked');
      expect(sql(`SELECT status FROM sales_quotes WHERE prospect_id=(SELECT id FROM sales_prospects WHERE prospective_organization_name='${orgName}');`)).toBe('sent');
    } finally {
      sql(`
        DELETE FROM sales_quote_invitations WHERE created_by='${ownerId}';
        DELETE FROM sales_quotes WHERE created_by='${ownerId}';
        DELETE FROM sales_prospects WHERE created_by='${ownerId}';
      `);
      await deleteUser(ownerId);
      await deleteUser(caregiverId);
    }
  });
});
