// ROUND 6 (continued) — H15 Registration & Patient Access. This is the
// first time a component from src/pages/caregiver/CaregiverPortal.tsx
// (the residential shell) is imported and rendered inside the
// Enterprise Caregiver Dashboard — real browser verification is used
// specifically because a cross-file reuse like this is exactly where a
// hidden runtime dependency (a context provider, a hook, a CSS class
// that doesn't exist in this shell) would only surface at render time,
// never at tsc or build time.
import { test, expect } from '@playwright/test';

test('org-caregiver with zero patients sees the one primary registration action and the form renders without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('h15-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('H15OrgCareg1!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('H15 Fixture Org')).toBeVisible({ timeout: 15000 });
  await page.getByText('My Patients', { exact: true }).click();

  await expect(page.getByText('No patients are currently assigned to you.')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Register a new patient' })).toBeVisible();
  await page.getByRole('button', { name: 'Register a new patient' }).click();

  // The real RegisterPatientForm (reused verbatim from the residential
  // shell) must render its actual fields, not crash.
  await expect(page.getByRole('heading', { name: 'Register a New Patient' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByPlaceholder('Jane')).toBeVisible();
  await expect(page.getByPlaceholder('patient@example.com')).toBeVisible();

  expect(errors, `Runtime errors captured: ${errors.join(' | ')}`).toEqual([]);
});
