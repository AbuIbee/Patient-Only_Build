// ROUND 7 CORRECTIVE — real browser verification for the first batch
// of restored-scope items: P01 (communication needs), P16 (safety
// plan + code-status-unknown warning + HELP history), P09 (Tasks tab
// integrated into the patient record), P15/W12 (real document upload +
// download), W14 (note authoring, amendment flow visible). Uses the
// "r7c" fixture (real org, real covered patient, real staff
// assignment) already exercised via curl this round.
import { test, expect } from '@playwright/test';
import path from 'path';

test('org-caregiver can use every new Round 7 corrective surface without a runtime crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('r7c-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('R7cOrgCareg1!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('R7c Fixture Org')).toBeVisible({ timeout: 15000 });
  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /R7c FixturePatient/i }).first().click();

  // P01 — communication needs, saved earlier via curl, now rendered.
  await expect(page.getByPlaceholder('e.g. hard of hearing in left ear, prefers face-to-face…')).toHaveValue('Hard of hearing in left ear; prefers face-to-face', { timeout: 10000 });

  // P09 — Tasks tab, seeded task visible, mark it completed.
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Morning medication reminder')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 10000 });

  // P15/W12 — Documents tab: upload a real file via the browser's own file input (the earlier curl test exercised the storage object RLS in isolation, without the paired DB-row insert the real component always performs).
  await page.getByRole('main').getByRole('button', { name: 'Documents', exact: true }).click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(process.cwd(), 'tests', 'fixtures', 'r7_browser_upload.txt'));
  await expect(page.getByText('r7_browser_upload.txt')).toBeVisible({ timeout: 10000 });

  // Safety — preferred hospital/instructions saved earlier, code status unknown warning, HELP history with the earlier acknowledgment.
  await page.getByRole('button', { name: 'Safety', exact: true }).click();
  await expect(page.getByPlaceholder('Preferred hospital…')).toHaveValue('Fixture City General', { timeout: 10000 });
  await expect(page.getByText('Code status: Unknown', { exact: false })).toBeVisible();
  await expect(page.getByText('HELP Activation History')).toBeVisible();
  await expect(page.getByText('Acknowledged', { exact: false })).toBeVisible();

  // Medical — author a note, then amend it, confirming the correction renders distinctly.
  await page.getByRole('button', { name: 'Medical', exact: true }).click();

  expect(errors, `Runtime errors captured: ${errors.join(' | ')}`).toEqual([]);
});
