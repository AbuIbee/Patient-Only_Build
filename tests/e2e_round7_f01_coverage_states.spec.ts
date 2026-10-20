// ROUND 7 — F01 live verification of the two CoverageBanner states that
// were only code-reviewed, never live-fixture-tested, in Round 6:
// "coverage ended" and "license not active". Uses a two-organization
// fixture where Org A's license was expired via the real
// admin_set_organization_license_status RPC (while its patient's
// covered_patient_memberships row remains 'active') and Org B's patient
// coverage was ended via the real end_patient_coverage RPC (while its
// license remains 'active') — so each state is produced by the actual
// backend transition a real owner/director action would cause, not a
// contrived direct write.
import { test, expect } from '@playwright/test';

test('F01: license-inactive coverage state renders its own distinct, honest banner text', async ({ page }) => {
  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('r7a-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('R7aOrgCareg1!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('R7 Org A')).toBeVisible({ timeout: 15000 });
  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /R7a FixturePatient/i }).first().click();

  await expect(page.getByText('Organization license is not currently active')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Full Support — Covered by Organization')).not.toBeVisible();
});

test('F01: coverage-ended state renders its own distinct, honest banner text', async ({ page }) => {
  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('r7b-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('R7bOrgCareg1!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('R7 Org B')).toBeVisible({ timeout: 15000 });
  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /R7b FixturePatient/i }).first().click();

  await expect(page.getByText('Organization coverage for this patient has ended')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Full Support — Covered by Organization')).not.toBeVisible();
});
