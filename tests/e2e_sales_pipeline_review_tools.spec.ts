// OWNER DIRECTIVE MMA-ENT-SALES-003 §3 (Phase E) — real-browser proof
// of the Platform Owner review tools added on top of the existing
// DirectorApplicationsPanel: application search/filter, a "duplicate
// organization" warning, linked quote history, the full submitted
// six-step snapshot, and the audit-history trail (migration 083's
// professional_application_events, which already existed server-side
// and had getApplicationEvents() in professionalApplicationService.ts
// but was never called from any UI until this increment).
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const PW = 'ReviewTools9!';
const BASE = 'http://127.0.0.1:5180';
const API_BASE = 'http://127.0.0.1:55321';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const existingOrgName = `Review Tools Existing Org ${stamp}`;
const dupeApplicantOrgName = `Review Tools Existing Org ${stamp} North Branch`; // deliberately overlapping substring

function sql(statement: string): string {
  return execSync('docker exec -i supabase_db_repo psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1', { input: statement }).toString().trim();
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
async function signIn(page: Page, email: string, path = '/Professional/Owner') {
  await page.goto(`${BASE}${path}`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Platform Owner review tools (MMA-ENT-SALES-003 §3, Phase E)', () => {
  test('search/filter, duplicate-org warning, quote history, full snapshot, and audit history all render from real data', async ({ page }) => {
    const ownerEmail = `review-owner-${stamp}@local.test`;
    const bilalEmail = `review-bilal-${stamp}@local.test`;
    const otherDirectorEmail = `review-other-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    const otherDirectorId = await mkUser(otherDirectorEmail);
    let existingOrgId = '';
    let appId = '';
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}','${otherDirectorId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
      `);

      // A pre-existing organization with an overlapping name, so the
      // new application below should trigger the duplicate-org warning.
      existingOrgId = sql(`
        INSERT INTO organizations (name, package_type, created_by) VALUES ('${existingOrgName}', 'integrated_care', '${otherDirectorId}') RETURNING id;
      `);

      const prospectId = sql(`
        INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by)
        VALUES ('Review Tools Test', '${bilalEmail}', '${dupeApplicantOrgName}', '${ownerId}') RETURNING id;
      `);
      const quoteId = sql(`
        INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
        VALUES ('${prospectId}', 'integrated_care', 7, 35, 21000, 'annual', 'sent', '${ownerId}') RETURNING id;
      `);
      appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${dupeApplicantOrgName}', 'integrated_care', 'Review Tools Bilal', '${bilalEmail}', 'pending_review', true,
          jsonb_build_object('originatingQuoteId', '${quoteId}', 'step1', jsonb_build_object('legalBusinessName', 'Review Tools Legal LLC', 'formationJurisdiction', 'Texas'), 'step2', jsonb_build_object('fullLegalName', 'Review Tools Bilal', 'title', 'Founder')))
        RETURNING id;
      `);
      // A real audit event (migration 083's own event type), so the
      // "audit history" section has something real to show beyond the
      // creation moment itself.
      sql(`
        INSERT INTO professional_application_events (application_id, event_type, actor_role, notes)
        VALUES ('${appId}', 'submitted', 'applicant', 'Initial submission via six-step wizard');
      `);

      await signIn(page, ownerEmail);
      await expect(page.getByText('Review Tools Bilal')).toBeVisible({ timeout: 15000 });

      // Search/filter: a non-matching search hides it, a matching one shows it.
      const searchBox = page.getByPlaceholder('Search by legal name, organization, or email…');
      await searchBox.fill('something that matches nothing at all');
      await expect(page.getByText('Review Tools Bilal')).toHaveCount(0, { timeout: 5000 });
      await searchBox.fill('review-bilal');
      await expect(page.getByText('Review Tools Bilal')).toBeVisible({ timeout: 5000 });

      await page.getByRole('button', { name: 'View details & history' }).click();

      // Duplicate-organization warning (the pre-seeded overlapping-name org).
      await expect(page.getByText('Possible duplicate organization')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(`• ${existingOrgName}`)).toBeVisible();

      // Linked quote history.
      await expect(page.getByText(/Full Enterprise, 7 seats, \$21000\.00\/annual/)).toBeVisible();

      // Full submitted six-step snapshot (generic field readout).
      await expect(page.getByText('Legal Entity', { exact: true })).toBeVisible();
      await expect(page.getByText('Review Tools Legal LLC')).toBeVisible();
      await expect(page.getByText('Director', { exact: true })).toBeVisible();

      // Audit history (getApplicationEvents -- real DB row, not a mock).
      await expect(page.getByText(/Initial submission via six-step wizard/)).toBeVisible();

      // Collapsing hides the details again.
      await page.getByRole('button', { name: 'Hide details & history' }).click();
      await expect(page.getByText('Possible duplicate organization')).toHaveCount(0);
    } finally {
      sql(`DELETE FROM professional_application_events WHERE application_id='${appId}';`);
      sql(`DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      sql(`DELETE FROM sales_quotes WHERE created_by='${ownerId}';`);
      sql(`DELETE FROM sales_prospects WHERE created_by='${ownerId}';`);
      if (existingOrgId) sql(`DELETE FROM organizations WHERE id='${existingOrgId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
      await deleteUser(otherDirectorId);
    }
  });
});
