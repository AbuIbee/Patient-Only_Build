// Fictional applicants on the disposable CI stack. Auth confirmation is a
// fixture. The application, agreement handoff and signatures use the UI.
import { expect, test } from '@playwright/test';
import { authSignUp, sql } from './integration/_runtime';
import { requireE2eEnv } from './_e2eTargetValidation';

const frontend = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const password = 'HcnTierBrowser9!';
const tiers = [
  { name: 'Essential', slots: 0, patients: 12, monthly: '$250.00' },
  { name: 'Plus', slots: 1, patients: 35, monthly: '$410.00' },
  { name: 'Complete', slots: 3, patients: 160, monthly: '$1080.00' },
];

for (const tier of tiers) {
  test(`${tier.name} applicant reaches Director access after both agreements with deferred billing`, async ({ page }) => {
    test.setTimeout(90000);
    const stamp = Date.now();
    const email = `hcn-tier-${tier.name.toLowerCase()}-${stamp}@local.test`;
    const applicant = 'Synthetic Agency Applicant';
    const userId = await authSignUp(email, password);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${userId}';`);

    await page.goto(frontend + '/Professional');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('Your password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeHidden();

    await page.goto(frontend + '/Professional/Register');
    await page.getByText('Purchase a License / Become a Director', { exact: true }).click();
    const identityEmail = page.getByLabel('Contact Email *', { exact: true });
    const identityName = page.getByLabel('Legal Name *', { exact: true });
    await expect(identityName.or(page.getByRole('heading', { name: 'Choose your license tier' }))).toBeVisible();
    if (await identityName.isVisible()) {
      await identityEmail.fill(email);
      await identityName.fill(applicant);
    }
    await page.getByRole('button', { name: new RegExp('^' + tier.name + '\\b') }).click();

    const fields = [
      ['Legal business name', `Synthetic ${tier.name} Agency ${stamp}`],
      ['Legal entity type', 'LLC'],
      ['Business classification', 'Home care agency'],
      ['Formation jurisdiction', 'Texas'],
      ['Business phone', '512-555-0100'],
      ['Registered address', '100 Main St, Austin, TX'],
      ['Your full legal name', applicant],
      ['Mobile number', '512-555-0101'],
      ['Title', 'Founder'],
      ['Your relationship to this business', 'Owner'],
      ['Billing contact name', applicant],
      ['Billing address', '100 Main St, Austin, TX'],
      ['Billing email', email],
      ['Initial expected active patients', String(tier.patients)],
    ];
    for (const [label, value] of fields) {
      await page.getByLabel(label + ' *', { exact: true }).fill(value);
    }
    await page.getByLabel(/I am an authorized representative/).check();
    await page.getByLabel(/I have the authority to enter/).check();
    await expect(page.getByText('Estimated monthly fee at this volume: ' + tier.monthly, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to pricing' }).click();
    await expect(page.getByText('…', { exact: true })).toHaveCount(0);
    await page.getByPlaceholder('Promotional code (optional)').fill('WELCOME100');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('$0.00', { exact: true })).toBeVisible();

    await page.getByLabel(/I confirm the information in this application is accurate/).check();
    await page.getByLabel(/I confirm I am authorized to sign/).check();
    await page.getByLabel(/I acknowledge the privacy practices/).check();
    await page.getByLabel(/Typed signature/).fill(applicant);
    await page.getByRole('button', { name: 'Submit application' }).click();

    const application = `FROM professional_applications WHERE applicant_user_id='${userId}'`;
    const quote = `(SELECT (application_details->>'originatingQuoteId')::uuid ${application})`;
    await expect(page.getByRole('heading', { name: 'Application verified — agreements next' })).toBeVisible();
    expect(sql(`SELECT status, annual_license_fee_snapshot_cents ${application};`)).toBe('approved|0');
    await page.getByRole('link', { name: 'Continue to agreements' }).click();

    await page.locator('#baa-signatory-name').fill(applicant);
    await page.getByLabel(/I have read and agree to the complete Business Associate Agreement/).check();
    await page.getByLabel(/I consent to conduct this transaction/).check();
    await page.getByRole('button', { name: 'Sign Business Associate Agreement' }).click();
    await expect(page.getByRole('heading', { name: 'Business Associate Agreement — executed' })).toBeVisible();
    expect(sql(`SELECT status ${application};`)).toBe('approved');

    await page.locator('#saas-signatory-name').fill(applicant);
    await page.getByLabel(/I confirm that I am authorized to bind/).check();
    await page.getByLabel(/I consent to electronic execution and retention/).check();
    await page.getByRole('button', { name: 'I Agree and Electronically Sign' }).click();
    await expect.poll(() => sql(`SELECT status ${application};`)).toBe('active');
    await page.goto(frontend + '/Professional/Admin');
    await expect(page.getByRole('heading', { name: 'Director Dashboard' })).toBeVisible();

    const org = `(SELECT target_organization_id ${application})`;
    expect(sql(`SELECT status, specialist_slot_count FROM organization_licenses WHERE organization_id=${org};`))
      .toBe(`active|${tier.slots}`);
    expect(sql(`SELECT template_version FROM enterprise_contracts WHERE quote_id=${quote} AND contract_type='saas_license' AND status='executed';`))
      .toBe('HCN-SAAS-1.0');
    expect(sql(`SELECT provider_payment_confirmed FROM hcn_deferred_billing_activations WHERE application_id=(SELECT id ${application});`))
      .toBe('f');
    expect(sql(`SELECT count(*) FROM enterprise_billing_accounts WHERE quote_id=${quote};`)).toBe('0');
  });
}
