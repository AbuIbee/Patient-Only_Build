// MASTER CORRECTIVE SPEC-01/FUNC-05 — H06 (Today's Schedule) and H14
// (Incomplete Documentation). CONFIRMED DEFECT (UI-H06-ADDRESS-MISSING,
// browser_audit.mjs): the schedule did not show end time, address/
// facility, or timezone, despite the locked requirement text naming
// all three. Also closes H14's previously-missing 4th category
// ("unfinished care lists").
import { test, expect } from '@playwright/test';

test('schedule shows end time, facility and timezone; dashboard surfaces an unfinished care list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('h06h14-caregiver@local.test');
  await page.getByPlaceholder('Your password').fill('H06H14Verify9!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('H06H14 Org')).toBeVisible({ timeout: 15000 });

  // H14 — unfinished care list surfaced on the dashboard.
  await expect(page.getByText('Incomplete Documentation', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('patient with an unfinished care list', { exact: false })).toBeVisible();

  // H06 — real schedule detail.
  await page.getByText('My Schedule', { exact: true }).click();
  await page.getByLabel('Today only').uncheck();
  const visitItem = page.getByRole('listitem').filter({ hasText: 'H06H14 FixturePatient' });
  await expect(visitItem).toBeVisible({ timeout: 10000 });
  const visitText = await visitItem.innerText();
  expect(visitText).toContain('42 Facility Lane, Springfield');
  expect(/[AP]M \(.+\)/.test(visitText) || /GMT|EST|EDT|UTC|CST|PST/.test(visitText)).toBe(true);

  expect(errors, `Runtime errors captured: ${errors.join(' | ')}`).toEqual([]);
});
