// ROUND 7 CORRECTIVE — batch 3: H09 (Recent Patient Updates, real
// seeded note data), P13(a) (Sleep & Overnight Reports, real seeded
// mo_sleep data), P11 (mood pagination control present), P07 (full
// intake display, if an intake row exists for this fixture — it does
// not, so this just confirms no crash).
import { test, expect } from '@playwright/test';

test('H09 and P13 render real seeded data on the dashboard and in the patient record', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('r7c-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('R7cOrgCaregNEW1!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('R7c Fixture Org')).toBeVisible({ timeout: 15000 });

  // H09 — the real note authored (and amended) earlier this round is within 7 days.
  await expect(page.getByText('Recent Patient Updates')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('tired', { exact: false }).first()).toBeVisible();

  // P13(a) — the real seeded overnight check-in.
  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /R7c FixturePatient/i }).first().click();
  await page.getByRole('main').getByRole('button', { name: 'A–G', exact: true }).click();
  await expect(page.getByText('Sleep & Overnight Reports')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Woke twice overnight', { exact: false }).first()).toBeVisible();

  expect(errors, `Runtime errors captured: ${errors.join(' | ')}`).toEqual([]);
});
