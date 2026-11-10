// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 2/5 -- Director-side
// Clinical Coordination UI acceptance through a REAL authenticated
// browser session (not an API-only check): real sign-in via the
// actual /Professional login form, real click into the new "Clinical
// Coordination" nav item, real provider creation and clinical request
// creation through the actual rendered form controls.
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, sql } from './integration/_runtime';

const frontendBase = process.env.MMA_E2E_FRONTEND_BASE;
const ready = Boolean(frontendBase && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);
const PW = 'E2eDirClinical9!';

async function seedDirectorWithPatient(label: string) {
  const stamp = Date.now();
  const email = `e2e-dirclin-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('E2E DirClin Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('E2E','DirClin','E2E DirClin Patient ${label}','1 Ave','Facility') RETURNING id;`);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
  `);
  return { directorId, orgId, patientId, email };
}

async function cleanup(orgId: string, patientId: string, directorId: string) {
  sql(`
    DELETE FROM hcn_patient_provider_associations WHERE organization_id = '${orgId}';
    DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}');
    DELETE FROM hcn_clinical_requests WHERE organization_id = '${orgId}';
    DELETE FROM hcn_healthcare_providers WHERE organization_id = '${orgId}';
    DELETE FROM covered_patient_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_licenses WHERE organization_id = '${orgId}';
    DELETE FROM organizations WHERE id = '${orgId}';
    DELETE FROM patients WHERE id = '${patientId}';
  `);
  await authDeleteUser(directorId);
}

test('a real signed-in Director can open Clinical Coordination, add a provider, and create a request', async ({ page }) => {
  test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
  const ctx = await seedDirectorWithPatient('nav');
  try {
    await page.goto(`${frontendBase}/Professional`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@example.com').fill(ctx.email);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Clinical Coordination')).toBeVisible({ timeout: 20000 });
    await page.getByText('Clinical Coordination').click();

    await expect(page.getByRole('heading', { name: 'Clinical Coordination' })).toBeVisible({ timeout: 15000 });

    // Add a provider through the real form.
    await page.getByRole('button', { name: /add provider/i }).click();
    await page.getByPlaceholder('Provider or practice name').fill('Dr. E2E Director Flow');
    await page.getByPlaceholder('Secure contact email (used for external access, optional)').fill(`e2e-dirclin-provider-${Date.now()}@example-clinic.test`);
    await page.getByRole('button', { name: /^save provider$/i }).click();
    await expect(page.getByText('Dr. E2E Director Flow')).toBeVisible({ timeout: 15000 });

    // Create a clinical request through the real form.
    await page.getByRole('button', { name: /^new request$/i }).click();
    await page.locator('select').filter({ hasText: 'Select patient…' }).selectOption({ index: 1 });
    await page.locator('select').filter({ hasText: 'Select provider…' }).selectOption({ index: 1 });
    await page.getByPlaceholder('Title').fill('E2E Director-Created Request');
    await page.getByRole('button', { name: /create as draft/i }).click();

    await expect(page.getByText('E2E Director-Created Request')).toBeVisible({ timeout: 15000 });
    const requestCount = sql(`SELECT count(*) FROM hcn_clinical_requests WHERE organization_id='${ctx.orgId}';`);
    expect(requestCount).toBe('1');
  } finally {
    await cleanup(ctx.orgId, ctx.patientId, ctx.directorId);
  }
});
