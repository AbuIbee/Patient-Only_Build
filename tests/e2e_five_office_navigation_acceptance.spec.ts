// MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave B — five-office
// functional completion. The Caregiver office already has a dedicated
// navigation-acceptance suite (e2e_enterprise_ui_navigation_acceptance.spec.ts,
// 14 destinations). This suite is the first fresh, dedicated browser
// verification of the other four offices' navigation through the real
// /Professional/<Office> routing this engagement built (Rounds 1-2):
// every destination in Admin/Director (13), Medical (12), Therapy (11),
// and Enterprise Patient (10) renders without a runtime error when
// clicked, reached through the actual centralized login + office
// resolver, not a direct component mount in isolation.
//
// Scope, honestly stated: this proves each destination RENDERS without
// crashing for a real, authorized, signed-in user of that office — it
// is NOT a claim that every individual feature within each destination
// has been functionally exercised end-to-end (that is the much larger,
// still-outstanding "59/60 navigation destinations functionally
// verified" requirement; this suite narrows the gap, it does not close
// it). See the closure register for what remains.
//
// Requires: the local Docker Supabase stack and a running dev server on
// 127.0.0.1:5180. Fully self-contained: seeds its own disposable
// director/medical/therapist/patient fixture (one shared org, one
// shared covered patient) in beforeAll via the Auth admin API + direct
// SQL, and tears it down in afterAll — no external pre-seeding step,
// no production/staging data touched.
//
// MUST run with a single worker (`npx playwright test
// tests/e2e_five_office_navigation_acceptance.spec.ts --workers=1`):
// this file's 4 describe blocks share one fixture keyed by a single
// hardcoded org id; Playwright's default fullyParallel mode can assign
// different describe blocks in this file to different worker
// processes, each running its own beforeAll/afterAll against the SAME
// org id concurrently — confirmed live to corrupt the fixture (all 4
// tests failed together) until pinned to one worker.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const PW = 'FiveOffice9!';
const BASE = 'http://127.0.0.1:5180';
const API_BASE = 'http://127.0.0.1:55321';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const ORG = 'ffffffff-5e5e-4e5e-8e5e-5e5e5e5e5e5e';

function sql(statement: string): string {
  return execSync('docker exec -i supabase_db_repo psql -U postgres -d postgres -At -v ON_ERROR_STOP=1', { input: statement }).toString().trim();
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

const emails = {
  director: `5off-director-${stamp}@local.test`,
  medical: `5off-medical-${stamp}@local.test`,
  therapist: `5off-therapist-${stamp}@local.test`,
  patient: `5off-patient-${stamp}@local.test`,
};
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await mkUser(email);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='therapist' WHERE id='${ids.therapist}';
    DELETE FROM organizations WHERE id='${ORG}';
    DELETE FROM patients WHERE id='${ids.patient}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','Five Office E2E Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.medical}','medical_professional','active'),
      ('${ORG}','${ids.therapist}','therapist','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${ids.patient}','FiveOffice','Patient','FiveOffice Patient','1 Office Ave','Office Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${ids.patient}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.medical}','${ids.patient}','medical_professional',true,'${ids.director}');
    INSERT INTO therapist_relationships(therapist_id,patient_id,caregiver_id,relationship_type,is_active) VALUES
      ('${ids.therapist}','${ids.patient}','${ids.medical}','primary',true);
    COMMIT;
  `);
}, 60000);

test.afterAll(async () => {
  sql(`DELETE FROM public.therapist_relationships WHERE patient_id='${ids.patient}'; DELETE FROM public.patients WHERE id='${ids.patient}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of Object.values(ids)) await deleteUser(id);
});

async function signIn(page: Page, email: string, officePath: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}${officePath}`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
  return errors;
}

const ADMIN_ITEMS = ['Director Dashboard', 'Organization Overview', 'Professional Applications & Approvals', 'Staff Management', 'Patient Management', 'Assignments and Coverage', 'Scheduling Oversight', 'Care Operations', 'Incidents and Escalations', 'Care Communications', 'Reports and Insights', 'Licensing and Entitlements', 'Organization Settings'];
const MEDICAL_ITEMS = ['Clinical Dashboard', 'My Patients', 'Clinical Schedule', 'Assessments', 'Diagnoses & Allergies', 'Medications & Orders', 'Care Plan Review', 'Clinical Documentation', 'Care Team Communication', 'Reports & Outcomes', 'My Credentials', 'Settings & Account'];
const THERAPY_ITEMS = ['Therapy Dashboard', 'My Therapy Patients', 'Session Schedule', 'Treatment Plans', 'Therapy Notes', 'Goals & Progress', 'Care Team Communication', 'Reports & Outcomes', 'My Credentials', 'Documents', 'Settings & Account'];
const PATIENT_ITEMS = ['My Dashboard', 'My Care Plan', 'My Appointments', 'My Health Information', 'My Medications', 'My Messages', 'My Care Team', 'My Documents', 'My Preferences', 'Settings & Account'];

test.describe('Wave B — Admin/Director office (13 destinations)', () => {
  test('every destination navigates without a runtime error', async ({ page }) => {
    const errors = await signIn(page, emails.director, '/Professional/Admin');
    await expect(page.getByText('Director Dashboard').first()).toBeVisible({ timeout: 15000 });
    for (const label of ADMIN_ITEMS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(150);
    }
    expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Wave B — Medical office (12 destinations)', () => {
  test('every destination navigates without a runtime error', async ({ page }) => {
    const errors = await signIn(page, emails.medical, '/Professional/Medical');
    await expect(page.getByText('Clinical Dashboard').first()).toBeVisible({ timeout: 15000 });
    for (const label of MEDICAL_ITEMS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(150);
    }
    expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Wave B — Therapy office (11 destinations)', () => {
  test('every destination navigates without a runtime error', async ({ page }) => {
    const errors = await signIn(page, emails.therapist, '/Professional/Therapy');
    await expect(page.getByText('Therapy Dashboard').first()).toBeVisible({ timeout: 15000 });
    for (const label of THERAPY_ITEMS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(150);
    }
    expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Wave B — Enterprise Patient office (10 destinations)', () => {
  test('every destination navigates without a runtime error', async ({ page }) => {
    const errors = await signIn(page, emails.patient, '/Professional/Patient');
    await expect(page.getByText('My Dashboard').first()).toBeVisible({ timeout: 15000 });
    for (const label of PATIENT_ITEMS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(150);
    }
    expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

// CODEX F-16 FIX — "Genuine direct Therapist journey remains broken."
// This fixture's own therapist has ONLY a therapist_relationships row
// for this patient (no staff_patient_assignments row -- confirmed
// above in beforeAll), the exact "direct (residential) connection"
// shape Codex named. Before this fix, EnterpriseStaffPatientView's
// access gate only ever checked staff_patient_assignments, so opening
// this patient's record here always rendered "You don't have access
// to this patient" regardless of the real, active, accepted
// relationship. The nav-only test above never caught this because it
// never actually opens a patient card.
test.describe('Wave B — direct (residential) Therapist connection record access', () => {
  test('a Therapist whose ONLY authorization is a direct therapist_relationships row (no org assignment) can actually open the patient record', async ({ page }) => {
    const errors = await signIn(page, emails.therapist, '/Professional/Therapy');
    await expect(page.getByText('Therapy Dashboard').first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'My Therapy Patients', exact: true }).click();
    await page.getByText('FiveOffice Patient', { exact: false }).first().click();
    await expect(page.getByText('You don’t have access to this patient')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText('FiveOffice Patient', { exact: false }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Medications', { exact: true })).toBeVisible({ timeout: 10000 });
    expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
