// MMA-PROF-ONBOARD-004 P0-2 -- real-browser proof of the canonical
// self-service Director onboarding UI (ProfessionalRegisterPage.tsx ->
// SelfServiceApplicationFlow.tsx), driving the actual public tier
// selection, starter application, promotional code, and declarations
// steps through a real browser, ending at the server-verified
// agreements_pending outcome. Requires the local Docker Supabase stack
// and a dev server on 127.0.0.1:5280 (disposable stack only).
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:5280';
const API_BASE = 'http://127.0.0.1:57321';
const DB_CONTAINER = 'supabase_db_mma-ent-caregiver-master-003';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PW = 'BilalOnboard9!';

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

test.describe('Self-service Director onboarding (MMA-PROF-ONBOARD-004)', () => {
  test('Bilal selects Plus, applies WELCOME50, completes the starter application, and reaches agreements_pending', async ({ page }) => {
    const stamp = Date.now();
    const email = `ui-bilal-${stamp}@local.test`;
    await mkUser(email);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id=(SELECT id FROM auth.users WHERE email='${email}');`);
    sql(`INSERT INTO promo_coupon_catalog (code, discount_kind, created_by) SELECT 'WELCOME50', 'half_off_minus_fifty_cents', NULL WHERE NOT EXISTS (SELECT 1 FROM promo_coupon_catalog WHERE code='WELCOME50');`);

    // Established pattern (e2e_director_application_wizard.spec.ts etc.):
    // sign in through the real login form rather than driving this
    // page's own AccountStep, whose plain sibling label/input pairs (no
    // htmlFor/id) are a PRE-EXISTING accessibility gap this directive
    // did not touch -- out of scope to "fix" here.
    await page.goto(`${BASE}/Professional`);
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/Professional/Register`);
    await page.waitForTimeout(500);

    await page.getByText('Purchase a License / Become a Director').click();
    await page.waitForTimeout(500);

    // If AppContext's own async session-restore hasn't populated
    // state.currentUser yet (a pre-existing, documented timing
    // characteristic of this page), the brief "Your identity" capture
    // renders first; filling it flips the component straight to the
    // tier-selection step on its own next render.
    const legalNameField = page.getByLabel('Legal Name *');
    if (await legalNameField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await legalNameField.fill('Bilal Applicant');
      // Filling Legal Name alone can already flip the component straight
      // to SelfServiceApplicationFlow if contactEmail (sourced from
      // state.currentUser.email) was already populated -- only fill
      // Contact Email if that field is still actually present.
      const contactEmailField = page.getByLabel('Contact Email *');
      if (await contactEmailField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await contactEmailField.fill(email);
      }
    }

    await expect(page.getByText('Choose your license tier')).toBeVisible({ timeout: 10000 });
    await page.getByText('Plus').first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Starter application')).toBeVisible();
    await page.getByLabel('Legal business name *').fill(`Bilal Home Care LLC ${stamp}`);
    await page.getByLabel('Legal entity type *').fill('LLC');
    await page.getByLabel('Business classification *').fill('Home care agency');
    await page.getByLabel('Formation jurisdiction *').fill('Texas');
    await page.getByLabel('Business phone *').fill('512-555-0100');
    await page.getByLabel('Registered address *').fill('100 Main St, Austin, TX');
    await page.getByLabel('Mobile number *').fill('512-555-0101');
    await page.getByLabel('Title *').fill('Founder');
    await page.getByLabel('Your relationship to this business *').fill('Owner');
    await page.getByText('I am an authorized representative').click();
    await page.getByText('I have the authority to enter').click();
    await page.getByLabel('Billing contact name *').fill('Bilal Applicant');
    await page.getByLabel('Billing address *').fill('100 Main St, Austin, TX');
    await page.getByLabel('Billing email *').fill(email);
    await page.getByLabel('Initial expected active patients *').fill('35');
    await expect(page.getByText('Estimated monthly fee at this volume: $410.00')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to pricing' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Pricing and agreements')).toBeVisible();
    await page.getByPlaceholder('Promotional code (optional)').fill('WELCOME50');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('$299.00').first()).toBeVisible({ timeout: 10000 });

    await page.getByText('I confirm the information in this application is accurate').click();
    await page.getByText('I confirm I am authorized to sign').click();
    await page.getByText('I acknowledge the privacy practices').click();
    await page.getByLabel('Typed signature').fill('Bilal Applicant');
    await page.getByRole('button', { name: 'Submit application' }).click();

    await expect(page.getByText('Application verified — agreements next')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/not yet connected to a live provider/i)).toBeVisible();

    const status = sql(`SELECT status FROM professional_applications WHERE contact_email='${email}';`);
    expect(status).toBe('agreements_pending');
    const feeSnapshot = sql(`SELECT annual_license_fee_snapshot_cents FROM professional_applications WHERE contact_email='${email}';`);
    expect(feeSnapshot).toBe('29900');
    const entryMethod = sql(`SELECT entry_method FROM professional_applications WHERE contact_email='${email}';`);
    expect(entryMethod).toBe('public_website');

    const quoteId = sql(`SELECT (application_details->>'originatingQuoteId')::uuid FROM professional_applications WHERE contact_email='${email}';`);
    sql(`
      DELETE FROM enterprise_coupon_redemptions WHERE application_id IN (SELECT id FROM professional_applications WHERE contact_email='${email}');
      DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE contact_email='${email}');
      DELETE FROM professional_applications WHERE contact_email='${email}';
      DELETE FROM sales_quotes WHERE id = '${quoteId}';
    `);
  });
});
