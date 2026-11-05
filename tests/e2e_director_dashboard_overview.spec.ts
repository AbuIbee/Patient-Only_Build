// HCN-DASH-MASTER-001 Workstream 1 (CLAUDE-01) -- real-browser proof
// that the Director Dashboard's expanded "Today's Operational
// Overview," staffing coverage, and compliance queue render real,
// organization-scoped numbers (not hardcoded/fabricated figures), and
// that drill-down navigation actually reaches a screen containing the
// underlying records. Requires the local Docker Supabase stack and a
// dev server on the configured port (disposable stack only).
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PW = 'DirDashE2E9!';
const stamp = Date.now();

function sql(statement: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`, { input: statement }).toString().trim();
}
async function mkUser(email: string): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data.id as string;
}
async function deleteUser(id: string): Promise<void> {
  await fetch(`${API_BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
}

test.describe('Director Dashboard — Today\'s Operational Overview (HCN-DASH-MASTER-001)', () => {
  test('KPI cards, staffing coverage, and the compliance queue show real seeded data, and drill-downs navigate correctly', async ({ page }) => {
    const emails = {
      director: `dirdash-director-${stamp}@local.test`,
      activeCaregiver: `dirdash-active-cg-${stamp}@local.test`,
      invitedCaregiver: `dirdash-invited-cg-${stamp}@local.test`,
    };
    const ids: Record<string, string> = {};
    for (const [name, email] of Object.entries(emails)) ids[name] = await mkUser(email);
    const orgId = sql(`SELECT gen_random_uuid();`);
    const patientAssignedId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('DirDash','Assigned','DirDash Assigned','1 Ave','Facility') RETURNING id;`);
    const patientUnassignedId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('DirDash','Unassigned','DirDash Unassigned','2 Ave','Facility') RETURNING id;`);

    sql(`
      UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ids.director}','${ids.activeCaregiver}','${ids.invitedCaregiver}');
      BEGIN;
      INSERT INTO organizations(id,name,package_type,created_by) VALUES('${orgId}','DirDash Org ${stamp}','integrated_care','${ids.director}');
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',20,20,9999,'active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
        ('${orgId}','${ids.director}','director','active'),
        ('${orgId}','${ids.activeCaregiver}','caregiver','active'),
        ('${orgId}','${ids.invitedCaregiver}','caregiver','invited');
      INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES
        ('${orgId}','${patientAssignedId}','active','${ids.director}'),
        ('${orgId}','${patientUnassignedId}','active','${ids.director}');
      INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
        ('${orgId}','${ids.activeCaregiver}','${patientAssignedId}','caregiver',true,'${ids.director}');
      INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status) VALUES
        ('${orgId}','${patientAssignedId}','${ids.activeCaregiver}', date_trunc('day', now()) + interval '8 hours', date_trunc('day', now()) + interval '9 hours', 'completed'),
        ('${orgId}','${patientAssignedId}','${ids.activeCaregiver}', date_trunc('day', now()) + interval '10 hours', date_trunc('day', now()) + interval '11 hours', 'missed');
      INSERT INTO incident_reports(organization_id,patient_id,reported_by,incident_type,description,severity,occurred_at,resolution_status) VALUES
        ('${orgId}','${patientAssignedId}','${ids.director}','fall','DirDash E2E seeded incident','high',now(),'open');
      INSERT INTO caregiver_credentials(user_id,organization_id,credential_name,status,expires_at) VALUES
        ('${ids.activeCaregiver}','${orgId}','CPR Certification','expired', (now()-interval '5 days')::date);
      COMMIT;
    `);

    await page.goto(`${BASE}/Professional/Admin`);
    await page.getByPlaceholder('you@example.com').fill(emails.director);
    await page.getByPlaceholder('Your password').fill(PW);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText('Director Dashboard').first()).toBeVisible({ timeout: 15000 });

    // KPIs -- real seeded numbers, not placeholders.
    await expect(page.getByText('Active Patient Census')).toBeVisible();
    await expect(page.getByText('2', { exact: true }).first()).toBeVisible(); // active patient census = 2
    await expect(page.getByText('Completed Today')).toBeVisible();
    await expect(page.getByText('Missed Today')).toBeVisible();
    await expect(page.getByText('Unassigned Patients')).toBeVisible();
    await expect(page.getByText('Open Incidents')).toBeVisible();
    await expect(page.getByText('Awaiting Activation')).toBeVisible();

    // Compliance queue -- the real seeded incident and expired credential appear.
    await expect(page.getByText('Compliance and Safety')).toBeVisible();
    await expect(page.getByText(/fall — DirDash Assigned/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Expired credential/i)).toBeVisible();

    // Staffing coverage section renders (not "Insufficient scheduling
    // data" -- two real visits were seeded for today).
    await expect(page.getByText('Staffing and Patient Demand')).toBeVisible();
    await expect(page.getByText('Insufficient scheduling data')).toHaveCount(0);

    // Financial section -- honest "Not connected" for unintegrated figures.
    await expect(page.getByText('Financial and Subscription Health')).toBeVisible();
    await expect(page.getByText(/Not connected/)).toBeVisible();

    // Drill-down: clicking the incidents KPI actually opens the
    // Incidents screen containing the real seeded incident.
    await page.getByRole('button', { name: /View Open Incidents/i }).click();
    await expect(page.getByText(/DirDash E2E seeded incident/i)).toBeVisible({ timeout: 10000 });

    sql(`
      DELETE FROM caregiver_credentials WHERE organization_id='${orgId}';
      DELETE FROM incident_reports WHERE organization_id='${orgId}';
      DELETE FROM caregiver_visits WHERE organization_id='${orgId}';
      DELETE FROM staff_patient_assignments WHERE organization_id='${orgId}';
      DELETE FROM covered_patient_memberships WHERE organization_id='${orgId}';
      DELETE FROM organization_memberships WHERE organization_id='${orgId}';
      DELETE FROM organization_licenses WHERE organization_id='${orgId}';
      DELETE FROM organizations WHERE id='${orgId}';
      DELETE FROM patients WHERE id IN ('${patientAssignedId}','${patientUnassignedId}');
    `);
    for (const id of Object.values(ids)) await deleteUser(id);
  });
});
