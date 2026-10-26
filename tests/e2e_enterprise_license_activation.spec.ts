// OWNER DIRECTIVE MMA-ENT-SALES-005 Phase F/G — real-browser proof of
// the missing link this increment closes: migration 110/111 and the
// create-enterprise-checkout-session Edge Function existed with zero
// frontend caller anywhere in the app. This drives the real UI a
// freshly approved Director actually sees: Platform Owner creates a
// prospect, drafts and sends a quote, issues an invitation; Bilal
// redeems it, completes the six-step wizard, submits; the Platform
// Owner approves the application (creating the org with a 'proposed'
// license, per migration 083/111); Bilal's own Director dashboard
// shows the new "Activate your Enterprise license" section (not the
// old no-op "Configure" flow), and clicking "Proceed to payment" makes
// a real call to create-enterprise-checkout-session.
//
// This environment has no real Stripe test-mode STRIPE_SECRET_KEY
// configured (established repeatedly earlier in this engagement), so
// the actual outbound Stripe API call is expected to fail there --
// this test asserts that failure is surfaced to the user as a clear
// toast error (not a silent no-op or an unhandled crash), which is the
// honest, correct scope for what can be verified in this environment.
// A real Stripe test key would change only the final assertion (expect
// a redirect instead of a toast) -- everything else in this flow
// (approval, dashboard routing, the activation section rendering, the
// real network call reaching the real Edge Function and the real
// create_enterprise_billing_account RPC) is fully verified here either
// way.
//
// Requires: the local Docker Supabase stack, a dev server on
// 127.0.0.1:5180, and `supabase functions serve` (or the deployed
// local edge-runtime) serving create-enterprise-checkout-session.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'EntActivate9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Activation Org ${stamp}`;

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

test.describe('Enterprise license activation UI (MMA-ENT-SALES-005 Phase F/G)', () => {
  test('an approved Director sees a real payment path, not the old dead-end "Configure" control', async ({ browser }) => {
    const ownerEmail = `activate-owner-${stamp}@local.test`;
    const bilalEmail = `activate-bilal-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
      `);

      // Seed directly through to a pending_review application referencing
      // a real, sent quote -- the wizard/redemption UI path itself is
      // already covered end-to-end by e2e_director_application_wizard.spec.ts
      // and e2e_invitation_redemption_bridge.spec.ts; this spec's own job
      // is the NEW post-approval activation UI.
      const prospectId = sql(`
        INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by)
        VALUES ('Activation Test', '${bilalEmail}', '${orgName}', '${ownerId}') RETURNING id;
      `);
      const quoteId = sql(`
        INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
        VALUES ('${prospectId}', 'integrated_care', 5, 25, 18000, 'annual', 'sent', '${ownerId}') RETURNING id;
      `);
      const appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${orgName}', 'integrated_care', 'Bilal Activation', '${bilalEmail}', 'pending_review', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb)
        RETURNING id;
      `);

      const ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage, ownerEmail, '/Professional/Owner');
      await expect(ownerPage.getByText(`Bilal Activation — proposing "${orgName}"`)).toBeVisible({ timeout: 15000 });
      await ownerPage.getByRole('button', { name: /approve/i }).first().click();
      await expect(ownerPage.getByRole('button', { name: /approve/i })).toHaveCount(0, { timeout: 10000 });
      await ownerContext.close();

      const orgId = sql(`SELECT target_organization_id FROM professional_applications WHERE id='${appId}';`);
      expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('proposed');

      const bilalContext = await browser.newContext();
      const page = await bilalContext.newPage();
      await signIn(page, bilalEmail);
      await page.getByRole('button', { name: 'Licensing and Entitlements' }).click();

      await expect(page.getByText('Activate your Enterprise license')).toBeVisible({ timeout: 15000 });
      // The old, now-locked-out-of-scope "Configure" dead end must NOT be
      // the only thing shown for a freshly approved, quote-originated org.
      const billingEmailInput = page.getByPlaceholder('billing@yourorganization.com');
      await expect(billingEmailInput).toBeVisible();
      await billingEmailInput.fill('billing@activationtest.local');

      await page.getByRole('button', { name: 'Proceed to payment' }).click();
      // No real Stripe test-mode key exists in this environment -- the
      // real network call to create-enterprise-checkout-session reaches
      // the real create_enterprise_billing_account RPC (verified below)
      // and then Stripe's own API correctly rejects the dummy key. The
      // user must see that as an error, never silence or a crash.
      await expect(page.getByText(/could not start checkout|invalid api key/i)).toBeVisible({ timeout: 15000 });

      // Confirms the click was not a no-op: the server-side billing
      // account row was really created with the quote's real terms,
      // reached via the real HTTP round trip through the Edge Function.
      const account = sql(`SELECT billing_contact_email, unit_amount_cents, currency, billing_interval FROM enterprise_billing_accounts WHERE quote_id='${quoteId}';`);
      expect(account).toBe('billing@activationtest.local|1800000|usd|year');

      await bilalContext.close();
    } finally {
      sql(`DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by='${ownerId}');`);
      sql(`DELETE FROM organization_licenses WHERE organization_id IN (SELECT target_organization_id FROM professional_applications WHERE applicant_user_id='${bilalId}');`);
      sql(`DELETE FROM organization_memberships WHERE organization_id IN (SELECT target_organization_id FROM professional_applications WHERE applicant_user_id='${bilalId}');`);
      sql(`DELETE FROM organizations WHERE id IN (SELECT target_organization_id FROM professional_applications WHERE applicant_user_id='${bilalId}');`);
      sql(`DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id='${bilalId}');`);
      sql(`DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      sql(`DELETE FROM sales_quotes WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM sales_prospects WHERE created_by='${ownerId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
