// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 2/5 -- Director-side
// Clinical Coordination UI acceptance through a REAL authenticated
// browser session (not an API-only check): real sign-in via the
// actual /Professional login form, real click into the new "Clinical
// Coordination" nav item, real provider creation and clinical request
// creation through the actual rendered form controls.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { authSignUp, authDeleteUser, sql, BASE, SERVICE } from './integration/_runtime';

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
  // Direct `DELETE FROM storage.objects` is blocked by Supabase Storage's
  // own protective trigger even for the postgres superuser (confirmed
  // live elsewhere in this codebase -- see supabase/migrations/101_r28_...
  // and tests/integration/credentialDocumentPurge.test.ts). Fetch the
  // storage_path values from their owning metadata rows BEFORE that row
  // is deleted below, then remove the underlying objects through the
  // Storage API itself, the same established pattern used there.
  const pathList = sql(
    `SELECT string_agg(storage_path, '|') FROM hcn_clinical_documents WHERE organization_id = '${orgId}';`,
  );
  sql(`
    DELETE FROM hcn_patient_provider_associations WHERE organization_id = '${orgId}';
    DELETE FROM hcn_clinical_request_documents WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}');
    DELETE FROM hcn_document_grants WHERE document_id IN (SELECT id FROM hcn_clinical_documents WHERE organization_id = '${orgId}');
    DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}');
    DELETE FROM hcn_clinical_requests WHERE organization_id = '${orgId}';
    DELETE FROM hcn_clinical_documents WHERE organization_id = '${orgId}';
    DELETE FROM hcn_healthcare_providers WHERE organization_id = '${orgId}';
    DELETE FROM covered_patient_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_licenses WHERE organization_id = '${orgId}';
    DELETE FROM organizations WHERE id = '${orgId}';
    DELETE FROM patients WHERE id = '${patientId}';
  `);
  if (pathList) {
    await createClient(BASE, SERVICE).storage.from('hcn-clinical-documents').remove(pathList.split('|'));
  }
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

    // Create a clinical request through the real form. The Clinical
    // Requests section's own patient/provider selects appear earlier
    // in the DOM than the (separate) Coordination Plans section's own
    // patient select -- .first() disambiguates deliberately rather
    // than relying on an incidental count.
    await page.getByRole('button', { name: /^new request$/i }).click();
    await page.locator('select').filter({ hasText: 'Select patient…' }).first().selectOption({ index: 1 });
    await page.locator('select').filter({ hasText: 'Select provider…' }).first().selectOption({ index: 1 });
    await page.getByPlaceholder('Title').fill('E2E Director-Created Request');
    await page.getByRole('button', { name: /create as draft/i }).click();

    await expect(page.getByText('E2E Director-Created Request')).toBeVisible({ timeout: 15000 });
    const requestCount = sql(`SELECT count(*) FROM hcn_clinical_requests WHERE organization_id='${ctx.orgId}';`);
    expect(requestCount).toBe('1');

    // Workstream C — actual browser upload, request attachment and
    // Director administrative review on a disposable fictional patient.
    await page.getByText('E2E Director-Created Request', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /documents & history/i })).toBeVisible();
    const uploadInput=page.locator('section[aria-label="Clinical Coordination"] input[type="file"]');
    await uploadInput.setInputFiles({
      name:'synthetic-discharge.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
    });
    await page.getByRole('button',{name:/^upload$/i}).click();
    await expect(page.getByText(/synthetic-discharge\.pdf/i).first()).toBeVisible({timeout:20000});
    const linked=sql("SELECT count(*) FROM hcn_clinical_request_documents rd JOIN hcn_clinical_documents d ON d.id=rd.document_id WHERE rd.request_id='" + 
      sql("SELECT id FROM hcn_clinical_requests WHERE organization_id='" + ctx.orgId + "' LIMIT 1;") + "' AND rd.direction='uploaded_by_care_team';");
    expect(linked).toBe('1');

    await page.getByRole('button',{name:/^accept$/i}).click();
    await expect(page.getByText(/accepted/i).last()).toBeVisible({timeout:15000});
    const accepted=sql("SELECT review_status FROM hcn_clinical_documents WHERE patient_id='" + ctx.patientId + "' ORDER BY created_at DESC LIMIT 1;");
    expect(accepted).toBe('accepted');

  } finally {
    await cleanup(ctx.orgId, ctx.patientId, ctx.directorId);
  }
});
