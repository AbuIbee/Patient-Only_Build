// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 3/5 -- Coordination Plans
// (Feature 5, Advanced Multi-Provider Coordination) proven through the
// real rendered Director UI: create a plan, add a staff participant,
// post an update to the shared timeline, and close the plan.
import { test, expect } from '@playwright/test';
import { authSignUp, authDeleteUser, sql } from './integration/_runtime';

const frontendBase = process.env.MMA_E2E_FRONTEND_BASE;
const ready = Boolean(frontendBase && process.env.MMA_TEST_API_BASE && process.env.MMA_TEST_DB_CONTAINER);
const PW = 'E2eCoordPlan9!';

async function seedDirectorWithAssignedCaregiver(label: string) {
  const stamp = Date.now();
  const directorEmail = `e2e-coordplan-director-${stamp}-${label}@local.test`;
  const caregiverEmail = `e2e-coordplan-caregiver-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(directorEmail, PW);
  const caregiverId = await authSignUp(caregiverEmail, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${caregiverId}');`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('E2E CoordPlan Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('E2E','CoordPlan','E2E CoordPlan Patient ${label}','1 Ave','Facility') RETURNING id;`);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number) VALUES('${orgId}',10,10,399,'active','E2E-COORD-${stamp}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${caregiverId}','caregiver','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${caregiverId}','${patientId}','caregiver',true,'${directorId}');
  `);
  return { directorId, caregiverId, orgId, patientId, directorEmail, caregiverId_: caregiverId };
}

async function cleanup(orgId: string, patientId: string, userIds: string[]) {
  sql(`
    DELETE FROM hcn_coordination_instruction_acks WHERE task_id IN (SELECT id FROM hcn_coordination_tasks WHERE organization_id = '${orgId}');
    DELETE FROM hcn_coordination_task_events WHERE task_id IN (SELECT id FROM hcn_coordination_tasks WHERE organization_id = '${orgId}');
    DELETE FROM hcn_coordination_task_dependencies WHERE task_id IN (SELECT id FROM hcn_coordination_tasks WHERE organization_id = '${orgId}');
    DELETE FROM hcn_coordination_tasks WHERE organization_id = '${orgId}';
    DELETE FROM hcn_coordination_plan_updates WHERE plan_id IN (SELECT id FROM hcn_coordination_plans WHERE organization_id = '${orgId}');
    DELETE FROM hcn_coordination_plan_participants WHERE plan_id IN (SELECT id FROM hcn_coordination_plans WHERE organization_id = '${orgId}');
    DELETE FROM hcn_coordination_plans WHERE organization_id = '${orgId}';
    DELETE FROM staff_patient_assignments WHERE organization_id = '${orgId}';
    DELETE FROM covered_patient_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_memberships WHERE organization_id = '${orgId}';
    DELETE FROM organization_licenses WHERE organization_id = '${orgId}';
    DELETE FROM organizations WHERE id = '${orgId}';
    DELETE FROM patients WHERE id = '${patientId}';
  `);
  for (const id of userIds) await authDeleteUser(id);
}

test('a real signed-in Director creates a coordination plan, adds a participant, posts an update, and closes it', async ({ page }) => {
  test.skip(!ready, 'Requires an explicitly configured disposable stack + frontend target');
  const ctx = await seedDirectorWithAssignedCaregiver('ui');
  try {
    await page.goto(`${frontendBase}/Professional/Admin`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@example.com').fill(ctx.directorEmail);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();

    const directorNav = page.getByRole('navigation', { name: 'ADMIN OFFICE navigation' });
    await expect(directorNav.getByRole('button', { name: 'Clinical Coordination' })).toBeVisible({ timeout: 20000 });
    await directorNav.getByRole('button', { name: 'Clinical Coordination' }).click();
    await expect(page.getByRole('heading', { name: 'Coordination Plans' })).toBeVisible({ timeout: 20000 });

    // Select the patient in the Coordination Plans section specifically
    // (the Clinical Requests section has its own, separate patient select).
    await page.locator('select').filter({ hasText: 'Select patient…' }).last().selectOption({ index: 1 });

    await page.getByRole('button', { name: /^new plan$/i }).click();
    await page.getByPlaceholder(/Plan title/).fill('E2E Post-Surgery Recovery Coordination');
    await page.getByRole('button', { name: /^create plan$/i }).click();
    await expect(page.getByText('E2E Post-Surgery Recovery Coordination')).toBeVisible({ timeout: 15000 });
    await page.getByText('E2E Post-Surgery Recovery Coordination').click();

    await expect(page.getByText('care team & timeline')).toBeVisible({ timeout: 15000 });
    await page.getByRole('combobox', { name: 'Care-team staff member' }).selectOption(ctx.caregiverId);
    await page.getByPlaceholder(/Role on this plan/).fill('Primary Caregiver');
    await page.getByRole('button', { name: /^add staff$/i }).click();
    await expect(page.getByText('Primary Caregiver')).toBeVisible({ timeout: 15000 });

    // Real Director browser uses the server-validated staff picker and
    // writes the task through hcn_create_coordination_task RPC.
    await page.getByRole('button', { name: /^new task$/i }).click();
    await page.getByRole('textbox', { name: 'Coordination task title' }).fill('Synthetic Mobility Follow-up');
    await page.getByRole('combobox', { name: 'Task type' }).selectOption('general');
    await page.getByRole('combobox', { name: 'Assigned staff' }).selectOption(ctx.caregiverId);
    await page.getByRole('button', { name: /^create coordination task$/i }).click();
    await expect(page.getByText('Synthetic Mobility Follow-up')).toBeVisible({ timeout: 15000 });
    const taskCount = sql("SELECT count(*) FROM hcn_coordination_tasks WHERE organization_id='" + ctx.orgId + "';");
    expect(taskCount).toBe('1');


    await page.getByPlaceholder('Post an update to the shared timeline…').fill('Patient recovering well, mobility improving daily.');
    await page.getByRole('button', { name: /^post$/i }).click();
    await expect(page.getByText('Patient recovering well, mobility improving daily.')).toBeVisible({ timeout: 15000 });

    page.once('dialog', (dialog) => dialog.accept('Full recovery achieved.'));
    await page.getByRole('button', { name: /^close plan$/i }).click();
    await expect(page.getByText('completed', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^close plan$/i })).toHaveCount(0);

    const planId = sql(`SELECT id FROM hcn_coordination_plans WHERE organization_id='${ctx.orgId}';`);
    const status = sql(`SELECT status FROM hcn_coordination_plans WHERE id='${planId}';`);
    expect(status).toBe('completed');
    const updateCount = sql(`SELECT count(*) FROM hcn_coordination_plan_updates WHERE plan_id='${planId}';`);
    expect(updateCount).toBe('1');
  } finally {
    await cleanup(ctx.orgId, ctx.patientId, [ctx.directorId, ctx.caregiverId]);
  }
});
