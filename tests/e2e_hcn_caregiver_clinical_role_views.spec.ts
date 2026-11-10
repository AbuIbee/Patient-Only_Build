// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 2/5 -- Caregiver and
// Medical/Therapist ("clinical") role UI acceptance through real
// authenticated browser sessions: the Clinical Coordination panel
// renders for both, read-scoped for the Caregiver (no provider/request
// creation controls) and approval-scoped for the clinical role (no
// Director-only administrative controls either).
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, login, rpc, sql } from './integration/_runtime';

const frontendBase = process.env.MMA_E2E_FRONTEND_BASE;
const ready = Boolean(frontendBase && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);
const PW = 'E2eRoleViews9!';

async function seedOrgWithStaff(label: string) {
  const stamp = Date.now();
  const directorEmail = `e2e-roles-director-${stamp}-${label}@local.test`;
  const caregiverEmail = `e2e-roles-caregiver-${stamp}-${label}@local.test`;
  const medicalEmail = `e2e-roles-medical-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(directorEmail, PW);
  const caregiverId = await authSignUp(caregiverEmail, PW);
  const medicalId = await authSignUp(medicalEmail, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${caregiverId}','${medicalId}');`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('E2E Roles Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('E2E','Roles','E2E Roles Patient ${label}','1 Ave','Facility') RETURNING id;`);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number) VALUES('${orgId}',10,10,399,'active','E2E-LIC-${stamp}-${label}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${caregiverId}','caregiver','active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${medicalId}','medical_professional','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${caregiverId}','${patientId}','caregiver',true,'${directorId}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${medicalId}','${patientId}','medical_professional',true,'${directorId}');
  `);
  return { directorId, caregiverId, medicalId, orgId, patientId, directorEmail, caregiverEmail, medicalEmail };
}

async function cleanup(orgId: string, patientId: string, userIds: string[]) {
  sql(`
    DELETE FROM hcn_patient_provider_associations WHERE organization_id = '${orgId}';
    DELETE FROM hcn_healthcare_providers WHERE organization_id = '${orgId}';
    DELETE FROM staff_patient_assignments WHERE organization_id = '${orgId}';
    DELETE FROM covered_patient_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_licenses WHERE organization_id = '${orgId}';
    DELETE FROM organizations WHERE id = '${orgId}';
    DELETE FROM patients WHERE id = '${patientId}';
  `);
  for (const id of userIds) await authDeleteUser(id);
}

test('a signed-in Caregiver sees the read-only Clinical Coordination view, with no create/send controls', async ({ page }) => {
  test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
  const ctx = await seedOrgWithStaff('caregiver');
  try {
    const directorTok = await login(ctx.directorEmail, PW);
    await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: ctx.orgId, p_provider_id: null, p_display_name: 'Dr. E2E Roles', p_professional_title: 'MD',
      p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
      p_fax_number: null, p_secure_contact_email: `e2e-roles-provider-${Date.now()}@example-clinic.test`,
      p_office_address: null, p_professional_identifier: null, p_credentials: null,
    }, directorTok);

    await page.goto(`${frontendBase}/Professional`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@example.com').fill(ctx.caregiverEmail);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.getByText('My Care Team').click();
    await expect(page.getByText('Dr. E2E Roles')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /add provider/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^new request$/i })).toHaveCount(0);
  } finally {
    await cleanup(ctx.orgId, ctx.patientId, [ctx.directorId, ctx.caregiverId, ctx.medicalId]);
  }
});

test('a signed-in Medical Professional sees Clinical Reviews with the Clinical Coordination panel, scoped to approval (not administrative creation)', async ({ page }) => {
  test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
  const ctx = await seedOrgWithStaff('medical');
  try {
    await page.goto(`${frontendBase}/Professional`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@example.com').fill(ctx.medicalEmail);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.getByText('Clinical Reviews').click();
    await expect(page.getByRole('heading', { name: 'Clinical Coordination' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /add provider/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^new request$/i })).toHaveCount(0);
  } finally {
    await cleanup(ctx.orgId, ctx.patientId, [ctx.directorId, ctx.caregiverId, ctx.medicalId]);
  }
});
