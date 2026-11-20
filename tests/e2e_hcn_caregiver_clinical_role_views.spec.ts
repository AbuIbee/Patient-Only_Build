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
    DELETE FROM hcn_previsit_acknowledgments WHERE organization_id = '${orgId}';
    DELETE FROM caregiver_visits WHERE organization_id = '${orgId}';
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

    const header = page.locator('header').first();
    await expect(header.getByText(/E2E Roles Org/)).toBeVisible({ timeout: 20000 });
    await expect(header.getByRole('button', { name: 'Caregiver Helper' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Caregiver quick actions' }).getByRole('button')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: 'Current or next visit' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Enterprise navigation' }).getByRole('button')).toHaveCount(14);

    await header.getByRole('button', { name: 'Search assigned patients' }).click();
    const search = page.getByRole('dialog', { name: 'Search assigned patients' });
    await search.getByRole('searchbox').fill('Roles Patient');
    await expect(search.getByRole('button', { name: /E2E Roles Patient caregiver.*Open Patient Information/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    const menuToggle = header.getByRole('button', { name: 'Open navigation' });
    await menuToggle.click();
    await page.getByRole('dialog', { name: 'Caregiver navigation' }).getByRole('button', { name: 'My Schedule' }).click();
    await expect(page).toHaveURL(/\/Professional\/Caregiver\/schedule\?org=/i);
    await expect(page.getByRole('heading', { name: 'My Schedule', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });

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

test('a caregiver completes the selected visit inside the patient chart and the Director sees the log', async ({ page, browser }) => {
  test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
  test.setTimeout(120_000);
  const ctx = await seedOrgWithStaff('visit');
  const directorContext = await browser.newContext();
  directorContext.setDefaultTimeout(20_000);
  try {
    sql(`UPDATE profiles SET first_name='Maya', last_name='Rivera' WHERE id='${ctx.caregiverId}';`);
    const visitId = sql(`INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
      VALUES('${ctx.orgId}','${ctx.patientId}','${ctx.caregiverId}',now(),now()+interval '1 hour','scheduled') RETURNING id;`);
    const laterVisitId = sql(`INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
      VALUES('${ctx.orgId}','${ctx.patientId}','${ctx.caregiverId}',now()+interval '1 day',now()+interval '25 hours','scheduled') RETURNING id;`);

    await page.goto(`${frontendBase}/Professional`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@example.com').fill(ctx.caregiverEmail);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: "Open Today's Visits" }).click();
    await page.getByRole('button', { name: 'Open Visit', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/patients/${ctx.patientId}\\?.*visit=${visitId}$`));
    await expect(page.getByRole('heading', { name: 'E2E Roles Patient visit' })).toBeVisible();

    const visit = page.getByRole('region', { name: 'Patient visit' });
    await visit.getByRole('button', { name: 'Confirm Review & Check In' }).click();
    await expect(visit.getByText(/^Checked in:/)).toBeVisible();
    await page.reload();
    await expect(visit.getByText(/^Checked in:/)).toBeVisible();
    await visit.getByRole('button', { name: 'Check Out', exact: true }).click();
    const submit = visit.getByRole('button', { name: 'Submit & Check Out' });
    await expect(submit).toBeDisabled();
    await visit.getByLabel('Medication taken').selectOption('completed');
    await visit.getByLabel('Blood pressure checked').selectOption('not_applicable');
    await visit.getByLabel('Meal eaten').selectOption('not_completed');
    await expect(submit).toBeDisabled();
    await visit.getByLabel('Visit notes (required)').fill('Patient declined lunch. Follow up at the next visit.');
    await expect(submit).toBeDisabled();
    const departure = visit.getByLabel(/Actual departure date and time/);
    await expect(departure).toHaveValue('');
    const departureMs = Number(sql(`SELECT ceil(extract(epoch FROM actual_start) / 60)::bigint * 60_000
      FROM caregiver_visits WHERE id='${visitId}';`));
    const localDeparture = await page.evaluate(timestamp => {
      const instant = new Date(timestamp);
      return new Date(timestamp - instant.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    }, departureMs);
    await departure.fill(localDeparture);
    await expect.poll(() => Date.now(), { timeout: 65_000 }).toBeGreaterThan(departureMs);
    await submit.click();
    await expect(visit).toContainText('Checked out:');
    await expect(visit).toContainText('Meal eaten: Not done');
    expect(sql(`SELECT status FROM caregiver_visits WHERE id='${laterVisitId}';`)).toBe('scheduled');

    const director = await directorContext.newPage();
    await director.goto(`${frontendBase}/Professional/Admin`, { waitUntil: 'domcontentloaded' });
    await director.getByPlaceholder('you@example.com').fill(ctx.directorEmail);
    await director.getByPlaceholder('Your password').fill(PW);
    await director.getByRole('button', { name: /sign in/i }).click();
    await director.getByRole('button', { name: 'Care Operations', exact: true }).click();
    const attendance = director.getByRole('region', { name: 'Director caregiver attendance' });
    const row = attendance.getByRole('button', { name: /Maya Rivera — E2E Roles Patient visit.*View visit notes/ });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(ctx.caregiverEmail);
    await row.click();
    const notes = director.getByRole('dialog', { name: 'Visit notes' });
    await expect(notes).toContainText('Patient declined lunch');
    await expect(notes).toContainText('Blood pressure checked: Not applicable');
    await director.keyboard.press('Escape');
    await expect(notes).toBeHidden();
    await expect(row).toBeFocused();
  } finally {
    await directorContext.close().catch(() => {});
    await cleanup(ctx.orgId, ctx.patientId, [ctx.directorId, ctx.caregiverId, ctx.medicalId]);
  }
});
