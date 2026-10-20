// ROUND 6 — real browser E2E verification for the tabbed Enterprise
// Patient Health Record (EnterprisePatientRecordTabs.tsx), covering
// P01-P22.
//
// Requires the same local-stack setup as tests/e2e_enterprise_smoke.spec.ts
// (.env.local pointed at the local Supabase stack, dev server on
// 127.0.0.1:5180) plus a fixture matching this round's handoff report:
// director + org-caregiver (local-rx-orgcareg@local.test) + covered
// patient ("Rx FixturePatient") with a real diagnosis, allergy, care
// plan, and vitals entry already recorded via the real RPCs.
import { test, expect } from '@playwright/test';

test('org-caregiver opens a patient record and sees real tabbed clinical data', async ({ page }) => {
  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('local-rx-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('L0calRxOrgCareg!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('Rx Fixture Org')).toBeVisible({ timeout: 15000 });
  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /Rx FixturePatient/i }).click();

  // Overview tab (default) — real care plan and preference data.
  await expect(page.getByText('Maintain independence in daily activities')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Likes oatmeal for breakfast')).toBeVisible();

  // Medical tab — real diagnosis and vitals.
  await page.getByRole('button', { name: 'Medical', exact: true }).click();
  await expect(page.getByText('Vascular dementia')).toBeVisible();
  await expect(page.getByText(/BP 118\/76/)).toBeVisible();

  // Safety tab — real allergy.
  await page.getByRole('button', { name: 'Safety', exact: true }).click();
  await expect(page.getByText('Latex')).toBeVisible();

  // Timeline tab — should render without crashing and show at least
  // one aggregated event from the real data recorded above.
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(/Diagnosis recorded/)).toBeVisible({ timeout: 10000 });
});
