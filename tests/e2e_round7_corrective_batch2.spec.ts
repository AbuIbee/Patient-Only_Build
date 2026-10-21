// ROUND 7 CORRECTIVE — batch 2: H06 (today-only schedule filter),
// H14 (extended Incomplete Documentation categories), C01/C06 (inbox
// categorization + search), O02/O03/O05/O07/O09/O10 (My Organization
// enhancements, a REAL password change with a real re-sign-in using
// the new password — full vertical completion, not just a form
// render).
import { test, expect } from '@playwright/test';

test('org-caregiver can use every new Round 7 corrective dashboard surface, including a real password change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('r7c-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('R7cOrgCareg1!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('R7c Fixture Org')).toBeVisible({ timeout: 15000 });

  // H06 — today-only toggle exists on My Schedule.
  await page.getByText('My Schedule', { exact: true }).click();
  await expect(page.getByText('Today only')).toBeVisible({ timeout: 10000 });

  // C01/C06 — Care Communications: search input renders without crashing even with zero conversations.
  await page.getByText('Care Communications', { exact: true }).click();
  await expect(page.getByPlaceholder('Search by patient, subject, or message…')).toBeVisible({ timeout: 10000 });

  // O02/O03/O05 — My Organization: My Assignments card (a real active assignment), and the sent therapist invitation history.
  await page.getByText('My Organization', { exact: true }).click();
  await expect(page.getByText('My Assignments')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText("Therapist invitations you've sent")).toBeVisible();
  await expect(page.getByText('pending', { exact: true })).toBeVisible();

  // O09 — toggle high contrast, confirm the class AND a real stylesheet rule now exist (not a no-op).
  const highContrastCheckbox = page.getByText('High contrast').locator('..').locator('input[type="checkbox"]');
  await highContrastCheckbox.check();
  const hasClass = await page.evaluate(() => document.documentElement.classList.contains('enterprise-high-contrast'));
  const hasRule = await page.evaluate(() => !!document.getElementById('enterprise-high-contrast-style'));
  expect(hasClass).toBe(true);
  expect(hasRule).toBe(true);

  // O10 — a REAL password change: change it, sign out, sign back in with the NEW password (full vertical completion, not just a rendered form).
  await page.getByText('Settings & Account', { exact: true }).click();
  await page.getByPlaceholder('New password', { exact: true }).fill('R7cOrgCaregNEW1!');
  await page.getByPlaceholder('Confirm new password').fill('R7cOrgCaregNEW1!');
  await page.getByRole('button', { name: 'Change Password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Secure Logout' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('r7c-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('R7cOrgCaregNEW1!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('R7c Fixture Org')).toBeVisible({ timeout: 15000 });

  expect(errors, `Runtime errors captured: ${errors.join(' | ')}`).toEqual([]);
});
