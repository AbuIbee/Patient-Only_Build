// OWNER CORRECTION — ENTERPRISE ROLES, ONBOARDING AND NAVIGATION.
// Point 9: "Test three distinct user states: Admin/Director,
// authorized Enterprise caregiver with no assigned patients, and
// authorized Enterprise caregiver with assigned patients." Behavior
// assertions throughout, not merely sidebar labels or a passing build.
//
// Requires a fixture matching the env vars below to exist on the
// target backend: a director and two caregivers sharing one
// organization (one with a real assigned patient, one without).
import { test, expect } from '@playwright/test';

const PW = process.env.OC_TEST_PASSWORD || 'OwnerCorrect9!';
const DIRECTOR_EMAIL = process.env.OC_DIRECTOR_EMAIL || 'oc-director@local.test';
const CAREGIVER_NO_PATIENT_EMAIL = process.env.OC_CAREGIVER_NOPATIENT_EMAIL || 'oc-caregiver-nopatient@local.test';
const CAREGIVER_WITH_PATIENT_EMAIL = process.env.OC_CAREGIVER_WITHPATIENT_EMAIL || 'oc-caregiver-withpatient@local.test';
const ORG_NAME = process.env.OC_ORG_NAME || 'OC Verify Org';
const PATIENT_NAME = process.env.OC_PATIENT_NAME || 'OC Patient';

async function signIn(page: import('@playwright/test').Page, email: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5180/business');
  await page.getByRole('button', { name: 'Caregiver Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
  return errors;
}

test('Admin/Director sees the organization management dashboard, unaffected by the caregiver-shell correction', async ({ page }) => {
  const errors = await signIn(page, DIRECTOR_EMAIL);
  await expect(page.getByText('Director Dashboard', { exact: true })).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test('Enterprise caregiver with no assigned patients sees the full approved dashboard with destination-specific empty states, not a generic onboarding panel', async ({ page }) => {
  const errors = await signIn(page, CAREGIVER_NO_PATIENT_EMAIL);
  await expect(page.getByText('Needs your attention', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(ORG_NAME, { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'My Patients', exact: true }).click();
  await expect(page.getByText('No patients are currently assigned to you', { exact: false })).toBeVisible();
  // OWNER CORRECTION point 5 — patient registration is distinct from
  // organization creation and stays available per the locked H15
  // requirement, even though organization creation does not.
  await expect(page.getByText('Register a new patient', { exact: false })).toBeVisible();

  expect(errors).toEqual([]);
});

test('Enterprise caregiver with assigned patients sees real authorized patient data throughout the same dashboard', async ({ page }) => {
  const errors = await signIn(page, CAREGIVER_WITH_PATIENT_EMAIL);
  await expect(page.getByText('Needs your attention', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Assigned patients', { exact: true }).locator('..')).toContainText('1');
  await expect(page.getByText(PATIENT_NAME, { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'My Patients', exact: true }).click();
  await expect(page.getByText(PATIENT_NAME, { exact: false }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
