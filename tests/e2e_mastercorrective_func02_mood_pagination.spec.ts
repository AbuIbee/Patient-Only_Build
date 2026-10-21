// MASTER CORRECTIVE FUNC-02 — CONFIRMED DEFECT (UI-P11-MOOD-HISTORY-UNREACHABLE,
// browser_audit.mjs): an ordinary org-caregiver clicking My Patients →
// a patient → the "Medical" tab (the actual route an Enterprise
// caregiver uses) found no mood history and zero "Load more" buttons,
// despite 15 seeded mood entries existing. Root cause: the pagination
// UI built in Round 7 Corrective lived inside EnterpriseStaffPatientView's
// own default render branch, which is dead code whenever a caller
// supplies `onReady` — and EnterpriseCaregiverDashboard always does,
// rendering EnterprisePatientRecordTabs instead. Fixed by moving the
// mood history + "Load more" control into EnterprisePatientRecordTabs's
// MedicalTab — the actually-reachable component.
import { test, expect } from '@playwright/test';

test('an ordinary org-caregiver can reach and page through real mood history from the Medical tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('func02-caregiver@local.test');
  await page.getByPlaceholder('Your password').fill('Func02Verify9!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('Func02 Org')).toBeVisible({ timeout: 15000 });

  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /Func02 FixturePatient/i }).first().click();
  await page.getByRole('main').getByRole('button', { name: 'Medical', exact: true }).click();

  const moodCard = page.getByText('Mood History', { exact: true }).locator('../..');
  await expect(moodCard).toBeVisible({ timeout: 10000 });
  // First page: 10 of the 15 seeded entries.
  await expect(moodCard.locator('li')).toHaveCount(10);

  const loadMore = moodCard.getByRole('button', { name: 'Load more', exact: true });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(moodCard.locator('li')).toHaveCount(15, { timeout: 10000 });
  await expect(moodCard.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);

  expect(errors, `Runtime errors captured: ${errors.join(' | ')}`).toEqual([]);
});
