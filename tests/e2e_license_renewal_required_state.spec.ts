// HCN organization license and office authentication remediation,
// 2026-10-31. P0-05 real-browser proof: a Director or staff member
// whose membership is active but whose organization's license has
// lapsed must land on the new, truthful "Renew license" state
// (ProfessionalOfficeResolver.tsx's LicenseRenewalRequiredState) --
// never the generic "Organization access required" dead end, and
// never a stale "approved — agreements pending" status page. Proven
// live via get_my_organizations()/get_my_license_blocked_memberships()
// (migrations 20261031020000/20261031030000), not just a code read.
//
// Requires: the local Docker Supabase stack and a running dev server
// (disposable stack only). Fully self-contained: seeds/tears down its
// own disposable, uniquely-timestamped org + users.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'LicenseRenewal9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();

function sql(statement: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`, { input: statement }).toString().trim();
}
async function mkUser(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data.id as string;
}
async function deleteUser(id: string): Promise<void> {
  await fetch(`${API_BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
}
async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/Professional/Admin`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('P0-05 — license renewal required state (real browser)', () => {
  test('a Director whose org license has EXPIRED sees the truthful "Renew license" state, never a dashboard', async ({ page }) => {
    const email = `license-renewal-director-${stamp}@local.test`;
    const orgId = '66666666-1111-4111-8111-111111111111';
    const id = await mkUser(email);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';
        DELETE FROM organizations WHERE id='${orgId}';
        BEGIN;
        INSERT INTO organizations(id,name,package_type,created_by) VALUES('${orgId}','License Renewal E2E Org ${stamp}','integrated_care','${id}');
        INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,999,'expired');
        INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${id}','director','active');
        COMMIT;
      `);

      await signIn(page, email);
      await expect(page.getByRole('heading', { name: 'Renew license' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/License Renewal E2E Org .* has expired/)).toBeVisible();
      await expect(page.getByText('Director Dashboard')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Organization access required' })).toHaveCount(0);

      // P0-04/P0-05: the Director can actually REQUEST renewal from
      // this exact screen (AmendmentRequestSection, reused verbatim
      // from OrganizationDirectorDashboard.tsx) -- not just read a
      // truthful message with no path forward.
      await expect(page.getByText('Expansion, Renewal & Cancellation')).toBeVisible();
      await page.getByRole('button', { name: 'Request a change' }).click();
      await page.getByLabel('What do you need?').selectOption('renewal');
      await page.getByLabel(/Describe what you need/).fill('Please renew our license for another term.');
      await page.getByRole('button', { name: 'Submit request' }).click();
      await expect(page.getByText('Request submitted to the Platform Owner.')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Renewal — /)).toBeVisible();
      await expect(page.getByText('pending', { exact: true })).toBeVisible();
    } finally {
      sql(`
        DELETE FROM organization_amendment_requests WHERE organization_id='${orgId}';
        DELETE FROM organization_memberships WHERE organization_id='${orgId}';
        DELETE FROM organization_licenses WHERE organization_id='${orgId}';
        DELETE FROM organizations WHERE id='${orgId}';
      `);
      await deleteUser(id);
    }
  });

  test('a caregiver whose org license has been SUSPENDED sees the truthful staff-facing "Renew license" state', async ({ page }) => {
    const directorEmail = `license-renewal-director2-${stamp}@local.test`;
    const staffEmail = `license-renewal-staff-${stamp}@local.test`;
    const orgId = '66666666-2222-4222-8222-222222222222';
    const directorId = await mkUser(directorEmail);
    const staffId = await mkUser(staffEmail);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${staffId}');
        DELETE FROM organizations WHERE id='${orgId}';
        BEGIN;
        INSERT INTO organizations(id,name,package_type,created_by) VALUES('${orgId}','License Renewal Staff E2E Org ${stamp}','integrated_care','${directorId}');
        INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,999,'suspended');
        INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
          ('${orgId}','${directorId}','director','active'),
          ('${orgId}','${staffId}','caregiver','active');
        COMMIT;
      `);

      await signIn(page, staffEmail);
      await expect(page.getByRole('heading', { name: 'Renew license' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/License Renewal Staff E2E Org .* has been suspended/)).toBeVisible();
      await expect(page.getByText("Your organization's Director has been notified to renew.")).toBeVisible();
    } finally {
      sql(`
        DELETE FROM organization_memberships WHERE organization_id='${orgId}';
        DELETE FROM organization_licenses WHERE organization_id='${orgId}';
        DELETE FROM organizations WHERE id='${orgId}';
      `);
      await deleteUser(directorId);
      await deleteUser(staffId);
    }
  });
});
