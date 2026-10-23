// OWNER DIRECTIVE MMA-ENT-SALES-003 §1 — the Phase C invitation-
// redemption bridge, verified as a real rendered browser flow (not
// schema/UI existence alone, per the owner's own instruction). Covers
// the Bilal-shaped path: owner issues a real invitation -> Bilal signs
// in, pastes the code, sees the accepted offer's locked terms, and
// starts his Director application -> lands on the pending-review
// status page, never a dashboard, with zero licensed access. Also
// verifies a wrong-recipient rejection renders a specific, accurate
// reason rather than a generic error.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const PW = 'RedeemBridge9!';
const BASE = 'http://127.0.0.1:5180';
const API_BASE = 'http://127.0.0.1:55321';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Al-Noor Family Care Services ${stamp}`;

function sql(statement: string): string {
  return execSync('docker exec -i supabase_db_repo psql -U postgres -d postgres -At -v ON_ERROR_STOP=1', { input: statement }).toString().trim();
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
  await page.goto(`${BASE}/Professional/Admin`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}
async function issueInvitationViaRpc(ownerToken: string, recipientEmail: string): Promise<string> {
  const r = await fetch(`${API_BASE}/rest/v1/rpc/platform_owner_create_prospect`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_contact_name: 'Bilal', p_contact_email: recipientEmail, p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null }),
  });
  const prospect = await r.json();
  const r2 = await fetch(`${API_BASE}/rest/v1/rpc/platform_owner_create_quote`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
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
async function login(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  return (await r.json()).access_token as string;
}

test.describe('Invitation redemption bridge (MMA-ENT-SALES-003 §1)', () => {
  test('Bilal accepts a genuine owner-issued invitation, sees the locked offer, and starts his Director application', async ({ browser }) => {
    const ownerEmail = `redeem-owner-${stamp}@local.test`;
    const bilalEmail = `redeem-bilal-${stamp}@local.test`;
    const outsiderEmail = `redeem-outsider-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    const outsiderId = await mkUser(outsiderEmail);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}','${outsiderId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
      `);
      const ownerToken = await login(ownerEmail);
      const rawToken = await issueInvitationViaRpc(ownerToken, bilalEmail);

      // An outsider holding the real token string (e.g. intercepted) is
      // told specifically that it isn't theirs -- not a generic error.
      // Separate browser context throughout: sessionStorage (per
      // CLAUDE.md's HIPAA-driven auth config) survives page.goto() within
      // the same context, so each account needs its own.
      const outsiderContext = await browser.newContext();
      const outsiderPage = await outsiderContext.newPage();
      await signIn(outsiderPage, outsiderEmail);
      await outsiderPage.getByText('Have an invitation code?').click();
      await outsiderPage.getByPlaceholder('Paste your invitation code').fill(rawToken);
      await outsiderPage.getByRole('button', { name: 'Accept' }).click();
      await expect(outsiderPage.getByText(/issued to a different email address/i)).toBeVisible({ timeout: 10000 });
      await expect(outsiderPage.getByText('Your accepted offer')).toHaveCount(0);
      await outsiderContext.close();

      // Bilal, the real recipient, redeems it.
      const bilalContext = await browser.newContext();
      const page = await bilalContext.newPage();
      await signIn(page, bilalEmail);
      await page.getByText('Have an invitation code?').click();
      await page.getByPlaceholder('Paste your invitation code').fill(rawToken);
      await page.getByRole('button', { name: 'Accept' }).click();

      await expect(page.getByText('Your accepted offer')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(orgName)).toBeVisible();
      await expect(page.getByText('Full Enterprise')).toBeVisible();
      await expect(page.getByText('4', { exact: true })).toBeVisible();
      await expect(page.getByText('20', { exact: true })).toBeVisible();
      // Locked terms: no editable field anywhere offers to change the org name or package.
      await expect(page.getByPlaceholder('Prospective organization name')).toHaveCount(0);

      await page.getByPlaceholder('Your full legal name').fill('Bilal Ahmed');
      await page.getByRole('button', { name: 'Start my Director application' }).click();

      await expect(page.getByRole('heading', { name: 'Your application is under review' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(orgName)).toBeVisible();
      await expect(page.getByText('Director Dashboard')).toHaveCount(0);

      const app = sql(`SELECT status, proposed_organization_name, proposed_package_type, application_details FROM public.professional_applications WHERE applicant_user_id='${bilalId}';`);
      expect(app).toContain('pending_review');
      expect(app).toContain(orgName);
      expect(app).toContain('integrated_care');
      await bilalContext.close();
    } finally {
      sql(`
        DELETE FROM public.professional_applications WHERE applicant_user_id='${bilalId}';
        DELETE FROM sales_quote_invitations WHERE created_by='${ownerId}';
        DELETE FROM sales_quotes WHERE created_by='${ownerId}';
        DELETE FROM sales_prospects WHERE created_by='${ownerId}';
      `);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
      await deleteUser(outsiderId);
    }
  });
});
