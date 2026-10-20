// ROUND 5 — real browser E2E verification for the dedicated Enterprise
// Caregiver Dashboard (EnterpriseCaregiverDashboard.tsx), wired in via
// EnterpriseDashboardRouter.
//
// NOT a self-contained CI test: it depends on (1) a local Supabase
// stack running (`supabase start`) with migrations through 069
// applied, (2) the Vite dev server running against that LOCAL stack
// specifically (a `.env.local` overriding VITE_SUPABASE_URL/ANON_KEY
// to the local stack's values — never staging/production — on
// 127.0.0.1:5180), and (3) a disposable fixture scenario matching the
// hardcoded identities below: a director + organization
// ("E2E Smoke Test Org") + one org-caregiver
// (local-e2e-caregiver@local.test) with an active staff_patient_assignments
// link to one covered patient ("E2E Smoke Patient"). The exact curl
// commands to build this fixture, and to tear it down afterward, are
// recorded in this round's handoff report. This file documents a real,
// executed, passing browser run — it is not re-runnable standalone
// without first recreating that local environment and fixture state.
import { test, expect } from '@playwright/test';

test('org-caregiver signs in and lands on the dedicated Enterprise Caregiver Dashboard', async ({ page }) => {
  await page.goto('http://127.0.0.1:5180/');
  // Reach the login form: header "Sign In" button navigates to the
  // auth page, which then shows a Create-account/Sign-In tab chooser.
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill('local-e2e-caregiver@local.test');
  await page.getByPlaceholder('Your password').fill('L0calE2eCareg1ver!');
  await page.getByRole('button', { name: /sign in/i }).click();

  // The dedicated shell's sidebar should render with the real
  // organization name and the full 14-item nav — not the residential
  // CaregiverPortal.
  await expect(page.getByText('E2E Smoke Test Org')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('My Care Team')).toBeVisible();
  await expect(page.getByText('Shift Handoffs')).toBeVisible();
  await expect(page.getByText('Alerts & Incidents')).toBeVisible();

  // Dashboard view should show the real assigned patient count.
  await expect(page.getByText('Assigned Patients', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E Smoke Patient')).toBeVisible();

  // Click into My Care Team — the org's director always appears
  // (reachable for escalation, per get_my_care_team's design), and
  // also as the Supervisor Contact.
  await page.getByText('My Care Team').click();
  await expect(page.getByText('Supervisor Contact')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('E2E Director').first()).toBeVisible();

  // Click into the patient record.
  await page.getByText('My Patients').click();
  await page.getByText('E2E Smoke Patient').click();
  await expect(page.getByText(/don't have access/i)).not.toBeVisible();
});
