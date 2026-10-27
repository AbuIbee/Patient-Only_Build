// MMA-P1-FINAL-CLOSURE — real browser smoke verification for Priorities
// 1-3 (APR Patient Office access, Organization Owner self-assignment UI,
// Director patient closure UI).
//
// NOT a self-contained CI test: depends on the disposable
// mma-ent-caregiver-master-003 stack running (API on 127.0.0.1:57321)
// and the Vite dev server on 127.0.0.1:5280 pointed at it via explicit
// env vars (confirmed this session, NOT via .env.local, which still
// points at the owner's real stack and must never be used for a browser
// session). Fixture created via the scratchpad closure_fixture.mjs
// script (director == owner of "Closure Smoke Org", one covered patient
// with one medication, one verified Authorized Patient Representative).
import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:5280';
const PW = 'ClosureSmoke9!';

test('Director self-assigns and revokes an Organization Owner capability through the real UI', async ({ page }) => {
  await page.goto(`${BASE}/Professional`);
  await page.getByPlaceholder('you@example.com').first().fill('closuresmoke-director@local.test');
  await page.getByPlaceholder('Your password').first().fill(PW);
  await page.getByRole('button', { name: /sign in/i }).first().click();

  await expect(page.getByText('Closure Smoke Org').first()).toBeVisible({ timeout: 15000 });
  await page.getByText('Organization Ownership').click();

  await expect(page.getByText(/explicitly self-assign operational capability/i)).toBeVisible({ timeout: 10000 });
  const medicalRow = page.locator('li', { hasText: 'Medical Professional' });
  await expect(medicalRow.getByText('Not currently self-assigned')).toBeVisible();
  await medicalRow.getByRole('button', { name: 'Self-assign' }).click();
  await expect(page.getByText('Medical Professional capability self-assigned.')).toBeVisible({ timeout: 10000 });
  await expect(medicalRow.getByRole('button', { name: 'Revoke' })).toBeVisible();

  await medicalRow.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Medical Professional capability revoked.')).toBeVisible({ timeout: 10000 });
  await expect(medicalRow.getByText('Not currently self-assigned')).toBeVisible();
});

test('Director closes patient coverage through the real UI, with mandatory reason/notes enforced', async ({ page }) => {
  await page.goto(`${BASE}/Professional`);
  await page.getByPlaceholder('you@example.com').first().fill('closuresmoke-director@local.test');
  await page.getByPlaceholder('Your password').first().fill(PW);
  await page.getByRole('button', { name: /sign in/i }).first().click();

  await expect(page.getByText('Closure Smoke Org').first()).toBeVisible({ timeout: 15000 });
  await page.getByText('Patient Management').click();
  await expect(page.getByText('Closure Smoke Patient')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Close coverage' }).click();
  // Continue with empty fields is rejected client-side (toast), dialog stays open.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('A closure reason and explanatory notes are both required.')).toBeVisible();

  await page.getByPlaceholder(/care no longer needed/i).fill('Family relocated');
  await page.getByPlaceholder(/describe the circumstances/i).fill('Confirmed by phone with the family on this date.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Confirm closure' }).click();

  await expect(page.getByText(/Coverage for Closure Smoke Patient has been closed\./)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Covered Patients (0)')).toBeVisible();
  await expect(page.getByText('Closed / Archived')).toBeVisible();
  await expect(page.getByText(/closed$|closed ·/).first()).toBeVisible();
});

test('a verified Authorized Patient Representative enters the real Patient Office and sees the patient\'s medication', async ({ page }) => {
  await page.goto(`${BASE}/Professional`);
  await page.getByPlaceholder('you@example.com').first().fill('closuresmoke-rep@local.test');
  await page.getByPlaceholder('Your password').first().fill(PW);
  await page.getByRole('button', { name: /sign in/i }).first().click();

  // Must NOT see the old denial state.
  await expect(page.getByText('Organization access required')).not.toBeVisible({ timeout: 10000 });
  await expect(page.getByText('My Medications')).toBeVisible({ timeout: 15000 });
  await page.getByText('My Medications').click();
  // The seeded fixture medication has no scheduled dose times, so it
  // never appears under the default "Today" tab (that tab is correctly
  // empty) — confirmed by "1 active" in the summary line. "All Meds"
  // lists every medication regardless of schedule.
  await expect(page.getByText(/1 active/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'All Meds' }).click();
  await expect(page.getByText('Donepezil')).toBeVisible({ timeout: 10000 });
});
