// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 5 -- full document
// exchange acceptance for the External Healthcare Provider role,
// proven through the ACTUAL RENDERED UI (not backend-API-only), end
// to end: open the real link, complete the real SEC-001 verification
// challenge (a real code, delivered through the real Edge Function
// code path to a local mock Resend server -- see
// tests/e2e_support/mockResendServer.mjs, since Resend has no test
// sandbox a browser test could otherwise receive mail from), view the
// request, upload a real file, and submit a response.
//
// Requires: a disposable Supabase stack + `functions serve` configured
// with RESEND_API_URL pointing at the mock Resend server (see this
// repo's own HCN continuation work), the mock Resend server itself
// running, and a frontend dev server pointed at that same disposable
// stack (MMA_E2E_FRONTEND_BASE). Skips cleanly if these are not set --
// this is deliberately not part of the default `npx playwright test`
// run against production-shaped config.
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, login, rpc, sql } from './integration/_runtime';

const frontendBase = process.env.MMA_E2E_FRONTEND_BASE;
const mockResendBase = process.env.MMA_E2E_MOCK_RESEND_BASE || 'http://127.0.0.1:8999';
const ready = Boolean(frontendBase && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);

async function seedSentRequest(label: string) {
  const stamp = Date.now();
  const directorEmail = `e2e-ext-director-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(directorEmail, 'E2eExtProv9!');
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('E2E Ext Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('E2E','Patient','E2E Ext Patient ${label}','1 Ave','Facility') RETURNING id;`);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
  `);
  const directorTok = await login(directorEmail, 'E2eExtProv9!');
  const providerEmail = `e2e-ext-provider-${stamp}-${label}@example-clinic.test`;
  const [, provider] = (await rpc('hcn_upsert_healthcare_provider', {
    p_organization_id: orgId, p_provider_id: null, p_display_name: 'Dr. E2E External', p_professional_title: 'MD',
    p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
    p_fax_number: null, p_secure_contact_email: providerEmail, p_office_address: null, p_professional_identifier: null, p_credentials: null,
  }, directorTok)) as [number, { id: string }];
  const [, request] = (await rpc('hcn_create_clinical_request', {
    p_organization_id: orgId, p_patient_id: patientId, p_provider_id: provider.id, p_request_type: 'medical_documentation',
    p_title: `E2E External Provider Request ${label}`, p_description: null, p_requested_items: [], p_deadline_at: null, p_follow_up_owner_id: null,
  }, directorTok)) as [number, { id: string }];
  const [, sendRows] = (await rpc('hcn_send_clinical_request', { p_request_id: request.id, p_expires_in_days: 14 }, directorTok)) as [number, { raw_token: string }[]];

  return { directorId, orgId, patientId, providerEmail, requestId: request.id, rawToken: sendRows[0].raw_token, title: `E2E External Provider Request ${label}` };
}

async function cleanup(orgId: string, patientId: string, directorId: string) {
  sql(`
    DELETE FROM hcn_external_verification_codes WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}'));
    DELETE FROM hcn_external_verified_sessions WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}'));
    DELETE FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}');
    DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}');
    DELETE FROM hcn_clinical_request_documents WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id = '${orgId}');
    DELETE FROM hcn_document_grants WHERE document_id IN (SELECT id FROM hcn_clinical_documents WHERE organization_id = '${orgId}');
    DELETE FROM hcn_clinical_requests WHERE organization_id = '${orgId}';
    DELETE FROM hcn_clinical_documents WHERE organization_id = '${orgId}';
    DELETE FROM hcn_healthcare_providers WHERE organization_id = '${orgId}';
    DELETE FROM covered_patient_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_licenses WHERE organization_id = '${orgId}';
    DELETE FROM organizations WHERE id = '${orgId}';
    DELETE FROM patients WHERE id = '${patientId}';
  `);
  await authDeleteUser(directorId);
}

async function readCodeFromMockResend(email: string): Promise<string> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const res = await fetch(`${mockResendBase}/last-email?to=${encodeURIComponent(email)}`);
    const body = await res.json();
    if (body?.text) {
      const match = /verification code is: (\d{6})/.exec(body.text);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No verification code email arrived at the mock Resend server for ${email}`);
}

test.describe('HCN external provider access -- full rendered UI acceptance', () => {
  test('a real external provider can verify, view, upload, and submit through the actual page', async ({ page }) => {
    test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target (MMA_E2E_FRONTEND_BASE, MMA_TEST_API_BASE, MMA_TEST_DB_CONTAINER)');
    const ctx = await seedSentRequest('desktop');
    try {
      await page.goto(`${frontendBase}/external-request?rt=${encodeURIComponent(ctx.rawToken)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Verify your identity')).toBeVisible({ timeout: 15000 });

      await page.getByRole('button', { name: /send me a verification code/i }).click();
      await expect(page.getByText('Enter your verification code')).toBeVisible({ timeout: 15000 });

      const code = await readCodeFromMockResend(ctx.providerEmail);
      await page.getByLabel('Verification code').fill(code);
      await page.getByRole('button', { name: /^verify code$/i }).click();

      await expect(page.getByText(ctx.title)).toBeVisible({ timeout: 15000 });

      // Real file upload through the real rendered file input.
      const fileInput = page.locator('#file');
      await fileInput.setInputFiles({ name: 'chart-update.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n' + 'A'.repeat(200) + '\n%%EOF') });
      await page.getByRole('button', { name: /^upload$/i }).click();
      await expect(page.getByText(/uploaded\.$/i)).toBeVisible({ timeout: 15000 });

      await page.getByPlaceholder("Optional note for the care team...").fill('Chart update attached. Please review.');
      await page.getByRole('button', { name: /submit response/i }).click();
      await expect(page.getByText('Thank you')).toBeVisible({ timeout: 15000 });

      const status = sql(`SELECT status FROM hcn_clinical_requests WHERE id='${ctx.requestId}';`);
      expect(status).toBe('pending_review');
    } finally {
      await cleanup(ctx.orgId, ctx.patientId, ctx.directorId);
    }
  });

  test('a wrong code is rejected by the real rendered UI, and possessing only the link proves nothing', async ({ page }) => {
    test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
    const ctx = await seedSentRequest('wrongcode');
    try {
      await page.goto(`${frontendBase}/external-request?rt=${encodeURIComponent(ctx.rawToken)}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /send me a verification code/i }).click();
      await expect(page.getByText('Enter your verification code')).toBeVisible({ timeout: 15000 });

      await page.getByLabel('Verification code').fill('000000');
      await page.getByRole('button', { name: /^verify code$/i }).click();
      await expect(page.getByText(/not correct/i)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(ctx.title)).not.toBeVisible();
    } finally {
      await cleanup(ctx.orgId, ctx.patientId, ctx.directorId);
    }
  });

  test('the external page works on a mobile viewport', async ({ browser }) => {
    test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
    const ctx = await seedSentRequest('mobile');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await page.goto(`${frontendBase}/external-request?rt=${encodeURIComponent(ctx.rawToken)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Verify your identity')).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: /send me a verification code/i }).click();
      await expect(page.getByText('Enter your verification code')).toBeVisible({ timeout: 15000 });

      const code = await readCodeFromMockResend(ctx.providerEmail);
      await page.getByLabel('Verification code').fill(code);
      await page.getByRole('button', { name: /^verify code$/i }).click();
      await expect(page.getByText(ctx.title)).toBeVisible({ timeout: 15000 });

      // No horizontal scroll at phone width (artifact/responsive discipline
      // applies equally to a real production page).
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(400);
    } finally {
      await context.close();
      await cleanup(ctx.orgId, ctx.patientId, ctx.directorId);
    }
  });
});
