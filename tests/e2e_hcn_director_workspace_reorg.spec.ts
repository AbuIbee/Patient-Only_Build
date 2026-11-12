// HCN-DIRECTOR-NAV-20261112: real browser acceptance for the Director
// workspace information architecture. Disposable Supabase + fictional users only.
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, sql } from './integration/_runtime';

const FRONTEND = process.env.MMA_E2E_FRONTEND_BASE;
const READY = Boolean(FRONTEND && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);
const PASSWORD = 'E2eDirNav9!';

async function seed() {
  const stamp = Date.now();
  const email = `e2e-dir-nav-${stamp}@local.test`;
  const caregiverEmail = `e2e-caregiver-nav-${stamp}@local.test`;
  const directorId = await authSignUp(email, PASSWORD);
  const caregiverId = await authSignUp(caregiverEmail, PASSWORD);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${caregiverId}');`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('E2E Director Navigation ${stamp}','integrated_care','${directorId}') RETURNING id;`);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('E2E','NavPatient','E2E Navigation Patient','1 Fictional Lane','Facility') RETURNING id;`);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number)
      VALUES('${orgId}',10,10,399,'active','E2E-DIR-NAV-${stamp}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status)
      VALUES('${orgId}','${directorId}','director','active'), ('${orgId}','${caregiverId}','caregiver','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by)
      VALUES('${orgId}','${patientId}','active','${directorId}');
  `);
  return { email, directorId, caregiverId, orgId, patientId };
}

async function cleanup(ctx: Awaited<ReturnType<typeof seed>>) {
  sql(`
    DELETE FROM staff_patient_assignments WHERE organization_id='${ctx.orgId}';
    DELETE FROM covered_patient_memberships WHERE organization_id='${ctx.orgId}';
    DELETE FROM organization_memberships WHERE organization_id='${ctx.orgId}';
    DELETE FROM organization_licenses WHERE organization_id='${ctx.orgId}';
    DELETE FROM organizations WHERE id='${ctx.orgId}';
    DELETE FROM patients WHERE id='${ctx.patientId}';
  `);
  await authDeleteUser(ctx.caregiverId);
  await authDeleteUser(ctx.directorId);
}

test('Director sidebar grouping, patient/staff order, consolidated settings and legacy links', async ({ page }) => {
  test.skip(!READY, 'Requires explicitly configured disposable Supabase and frontend');
  const ctx = await seed();
  try {
    await page.goto(`${FRONTEND}/Professional`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@example.com').fill(ctx.email);
    await page.getByPlaceholder('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    const nav = page.getByRole('navigation', { name: 'ADMIN OFFICE navigation' });
    await expect(nav.getByRole('button', { name: 'Director Dashboard' })).toBeVisible({ timeout: 20000 });
    expect((await nav.locator('button').allTextContents()).map(t => t.trim())).toEqual([
      'Director Dashboard', 'Staff Management', 'Patient Management', 'Employee Schedule',
      'Assignments and Coverage', 'Care Operations', 'Incidents and Escalations',
      'Care Communications', 'Clinical Coordination', 'Professional Applications & Approvals',
      'Reports and Insights', 'Organization Settings',
    ]);
    await expect(nav.getByRole('button', { name: 'Organization Overview' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Licensing and Entitlements' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Organization Ownership' })).toHaveCount(0);

    await nav.getByRole('button', { name: 'Patient Management' }).click();
    await expect(page).toHaveURL(/\/Professional\/Admin\/patients$/i);
    await expect(page.getByRole('heading', { name: 'Covered Patients (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create Patient Account' })).toBeVisible();
    const patientHeadings = await page.locator('main h2').allTextContents();
    expect(patientHeadings.findIndex(t => t.includes('Covered Patients'))).toBeLessThan(
      patientHeadings.findIndex(t => t.includes('Create Patient Account')),
    );

    await nav.getByRole('button', { name: 'Staff Management' }).click();
    await expect(page.getByRole('heading', { name: 'Staff Inventory (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Staff-to-Patient Assignments' })).toBeVisible();
    const staffHeadings = await page.locator('main h2').allTextContents();
    expect(staffHeadings.findIndex(t => t.includes('Staff Inventory'))).toBeLessThan(
      staffHeadings.findIndex(t => t.includes('Staff-to-Patient Assignments')),
    );
    // Moving the panel must not break the existing authorized write path.
    await page.locator('select').filter({ hasText: 'Select staff member…' }).selectOption(ctx.caregiverId);
    await page.locator('select').filter({ hasText: 'Select covered patient…' }).selectOption(ctx.patientId);
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(page.getByText('E2E Navigation Patient')).toBeVisible();
    expect(sql(`SELECT count(*) FROM staff_patient_assignments WHERE organization_id='${ctx.orgId}' AND user_id='${ctx.caregiverId}' AND patient_id='${ctx.patientId}' AND is_active=true;`)).toBe('1');

    await nav.getByRole('button', { name: 'Employee Schedule' }).click();
    await expect(page).toHaveURL(/\/Professional\/Admin\/scheduling$/i);

    await nav.getByRole('button', { name: 'Organization Settings' }).click();
    await expect(page).toHaveURL(/\/Professional\/Admin\/settings$/i);
    for (const label of ['Organization Overview', 'Licensing & Entitlements', 'Organization Settings', 'Organization Ownership']) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Organization Settings' }).click();
    await page.getByRole('button', { name: /Open Billing & Add-Ons/i }).click();
    await expect(page.getByRole('tab', { name: 'Licensing & Entitlements' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Organization Ownership' }).click();
    await expect(page.getByText(/available only to this organization's Owner/i)).toBeVisible();

    await page.goto(`${FRONTEND}/Professional/Admin/licensing`);
    await expect(page.getByRole('tab', { name: 'Licensing & Entitlements' })).toHaveAttribute('aria-selected', 'true');
    await expect(nav.getByRole('button', { name: 'Organization Settings' })).toHaveAttribute('aria-current', 'page');

    await page.goto(`${FRONTEND}/Professional/Admin/overview`);
    await expect(page.getByRole('tab', { name: 'Organization Overview' })).toHaveAttribute('aria-selected', 'true');
    await page.goto(`${FRONTEND}/Professional/Admin/ownership`);
    await expect(page.getByRole('tab', { name: 'Organization Ownership' })).toHaveAttribute('aria-selected', 'true');

    // Shared shell's mobile drawer must reflect the same regrouped navigation.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('button', { name: 'Employee Schedule' })).toBeVisible();
    await page.getByRole('button', { name: 'Employee Schedule' }).click();
    await expect(page).toHaveURL(/\/Professional\/Admin\/scheduling$/i);
  } finally {
    await cleanup(ctx);
  }
});
