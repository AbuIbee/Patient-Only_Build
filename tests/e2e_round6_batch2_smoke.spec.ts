// ROUND 6 (continued) — real browser smoke test for every new UI
// surface added in this round's second batch: the CoverageBanner
// (F01), the Quick Observation Entry + Patient Intake summary + Sleep
// & Overnight card in the tabbed patient record, the Care Team
// Invitation form (W10), and the Organization view's new Invitations/
// My Activity/Notifications/Accessibility cards (O05/O07/O08/O09).
// Playwright is used here specifically because tsc/build cannot catch
// a runtime ReferenceError or a crash in a conditionally-rendered
// branch — exactly the category of bug this round already found once
// in this same dashboard file.
import { test, expect } from '@playwright/test';

test('org-caregiver can open every new Round 6 surface without a runtime crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('e2e-orgcareg@local.test');
  await page.getByPlaceholder('Your password').fill('E2eOrgCareg1!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByText('E2e Fixture Org')).toBeVisible({ timeout: 15000 });

  // Dashboard — H09/H10/H14/H18 widgets must render without crashing.
  await expect(page.getByText('Connection & Synchronization')).toBeVisible({ timeout: 10000 });

  // My Patients -> patient record -> every tab.
  await page.getByText('My Patients', { exact: true }).click();
  await page.getByRole('button', { name: /E2e Patient/i }).click();

  // F01 — coverage banner on the Overview tab.
  await expect(page.getByText('Full Support — Covered by Organization')).toBeVisible({ timeout: 10000 });
  // W03 — Quick Observation Entry form present.
  await expect(page.getByText('Quick Observation Entry')).toBeVisible();
  // P07 — intake summary card (no intake row exists for this fixture,
  // so the card renders nothing — that's the correct behavior, not a
  // crash; just confirm the page is still alive).
  await expect(page.getByText('Maintain independence in daily activities')).toBeVisible();

  await page.getByRole('button', { name: 'Medical', exact: true }).click();
  await expect(page.getByText('Medical Providers')).toBeVisible();
  await expect(page.getByText('Dr. Jane Rivera')).toBeVisible();

  await page.getByRole('button', { name: 'A–G', exact: true }).click();
  await expect(page.getByText('Sleep & Overnight Reports')).toBeVisible();

  await page.getByRole('button', { name: 'Care Plan', exact: true }).click();
  await expect(page.getByText('Patient Instructions')).toBeVisible();
  await expect(page.getByPlaceholder('Flag an ambiguity or request clarification…')).toBeVisible();

  await page.getByRole('button', { name: 'Safety', exact: true }).click();
  await expect(page.getByText('Latex')).toBeVisible();

  await page.getByRole('button', { name: 'Back', exact: true }).click();

  // My Care Team — W10 invite form.
  await page.getByText('My Care Team', { exact: true }).click();
  await expect(page.getByText('Invite a verified therapist for a patient')).toBeVisible({ timeout: 10000 });

  // My Organization — O05/O07/O08/O09 cards.
  await page.getByText('My Organization', { exact: true }).click();
  await expect(page.getByText('Invitations', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('My Activity', { exact: true })).toBeVisible();
  await expect(page.getByText('Notifications', { exact: true })).toBeVisible();
  await expect(page.getByText('Accessibility', { exact: true })).toBeVisible();

  // Care Notes & Observations — W14 documentation history.
  await page.getByText('Care Notes & Observations', { exact: true }).click();
  await expect(page.getByText('My Documentation History')).toBeVisible({ timeout: 10000 });

  expect(errors, `Runtime errors captured during navigation: ${errors.join(' | ')}`).toEqual([]);
});
