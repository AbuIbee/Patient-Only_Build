// P1 OWNER-VISIBLE DASHBOARD DELIVERY — CONFIRMED DEFECT: the approved
// Enterprise visual shell previously depended on possessing an active
// Enterprise organization membership merely to render its non-sensitive
// navigation and layout. A caregiver reaching /business with no
// organization membership was silently dropped into the residential
// CaregiverPortal instead of the approved Business workspace design.
// Root cause: EnterpriseDashboardRouter's generic fallback branch
// (shared with every other authenticated route, not just /business)
// rendered CaregiverPortal whenever hasCaregiverOrgRole was false, with
// no way to distinguish "the user explicitly entered the Business
// workspace" from "the user is simply a caregiver-role account
// elsewhere in the app." Fixed by a businessWorkspace prop threaded
// from App.tsx's /business branch only, and EnterpriseCaregiverDashboard
// itself now renders its own honest "No Enterprise organization
// connected" state inside the full approved shell instead of blocking
// entirely. Presentation access (the shell, navigation) is now
// distinct from protected-data authorization (real organization/patient
// data), per this directive's own required product behavior.
import { test, expect } from '@playwright/test';

const ALL_14 = [
  'Dashboard', 'My Patients', 'My Schedule', 'Care Plans & Tasks', 'Patient Health Records',
  'Care Communications', 'Care Notes & Observations', 'Shift Handoffs', 'Alerts & Incidents',
  'Visits & Time Records', 'My Care Team', 'Documents', 'My Organization', 'Settings & Account',
];

// Requires a real, disposable, no-organization caregiver account named
// EMAIL/PASSWORD below to exist on the target backend before running.
const EMAIL = process.env.NOORG_TEST_EMAIL || 'noorg-caregiver@local.test';
const PASSWORD = process.env.NOORG_TEST_PASSWORD || 'NoOrgVerify9!';

test('a caregiver with no Enterprise organization still sees the approved shell, not the residential view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5180/business');
  await page.getByRole('button', { name: 'Caregiver Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('No Enterprise organization connected', { exact: true })).toBeVisible({ timeout: 15000 });

  // The full approved shell renders regardless -- not the residential CaregiverPortal.
  await expect(page.getByText('WORKSPACE', { exact: true })).toBeVisible();
  await expect(page.getByText('CARE COLLABORATION', { exact: true })).toBeVisible();
  await expect(page.getByText('PROFESSIONAL TOOLS', { exact: true })).toBeVisible();
  for (const label of ALL_14) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByText('No organization connected', { exact: false }).first()).toBeVisible();

  // No fabricated organization/patient data anywhere.
  await expect(page.getByText('Needs your attention', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Assigned patients', { exact: true })).toHaveCount(0);

  // A legitimate onboarding action is present (not a dead end).
  await expect(page.getByRole('button', { name: 'Create Organization', exact: true })).toBeVisible();

  // Every other destination shows the same honest state, not a crash
  // or a false-success render -- navigation itself still fully works.
  for (const label of ['My Schedule', 'Care Communications', 'My Organization', 'Settings & Account']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText('No Enterprise organization connected', { exact: true })).toBeVisible();
    expect(page.url()).toContain('/business/');
  }

  expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
});
