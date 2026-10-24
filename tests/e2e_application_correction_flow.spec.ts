// OWNER DIRECTIVE MMA-ENT-SALES-005, PHASE D8 — the field-specific
// correction/resubmission workflow, verified as a real browser flow.
// Platform Owner flags specific steps of a submitted application;
// Bilal sees exactly which steps reopened and the stated rationale,
// edits only those, and resubmits -- everything outside the flagged
// steps stays exactly as originally submitted (enforced client-side via
// disabled <fieldset>s here, and unaffected server-side regardless,
// since resubmit_application() updates the same row in place).
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const PW = 'CorrectFlow9!';
const BASE = 'http://127.0.0.1:5180';
const API_BASE = 'http://127.0.0.1:55321';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Correction Flow Org ${stamp}`;

function sql(statement: string): string {
  // -q (quiet) in addition to the usual -At: this file uses INSERT ...
  // RETURNING and captures the result directly, which otherwise gets a
  // trailing "INSERT 0 1" command-status line interleaved into the
  // captured value when run via stdin instead of -c.
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
async function signIn(page: Page, email: string, path = '/Professional/Admin') {
  await page.goto(`${BASE}${path}`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Application correction/resubmission flow (MMA-ENT-SALES-005 D8)', () => {
  test('Platform Owner flags specific steps, Bilal edits only those, and resubmission preserves everything else', async ({ browser }) => {
    const ownerEmail = `correct-owner-${stamp}@local.test`;
    const bilalEmail = `correct-bilal-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalId = await mkUser(bilalEmail);
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
      `);

      // Seed a pending_review director application directly (equivalent
      // to a completed wizard submission -- the wizard's own submission
      // path is already covered by e2e_director_application_wizard.spec.ts).
      const appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${orgName}', 'integrated_care', 'Bilal Ahmed', '${bilalEmail}', 'pending_review', true,
          '{"currentStep":6,"originatingQuoteId":"00000000-0000-0000-0000-000000000099","quoteSnapshot":{"quoteId":"00000000-0000-0000-0000-000000000099","prospectiveOrganizationName":"${orgName}","packageType":"integrated_care","proposedLicensedSeats":4,"proposedCoveredPatientCapacity":20},"step1":{"legalBusinessName":"Original Legal Name LLC","legalForm":"LLC","businessClassification":"Home care","formationJurisdiction":"Texas","registeredAddress":"1 First St","operatingSameAsRegistered":true,"businessEmail":"orig@alnoor.test","businessPhone":"555-0001","numLocations":"1","seatsAdmin":"1","seatsCaregiver":"0","seatsTherapist":"0","seatsMedical":"0"},"step2":{"fullLegalName":"Bilal Ahmed","verifiedBusinessEmail":"${bilalEmail}","mobile":"555-0002","title":"Founder","relationshipToEntity":"Owner","authorizedSignatory":true,"authorityAttestation":true},"step4":{"services":"In-home care","careSetting":"Residential","jurisdictions":"Texas","phiIntendedUse":"no","hipaaDeclaration":"not_applicable"},"step5":{"billingLegalEntity":"Original Legal Name LLC","billingContact":"Bilal Ahmed","billingAddress":"1 First St","billingEmail":"billing@alnoor.test","currency":"USD","cadence":"annual"},"step6":{"accuracyAttestation":true,"authorizedSignatoryConfirmed":true,"privacyAck":true,"signatureName":"Bilal Ahmed"}}'::jsonb)
        RETURNING id;
      `);

      const context = await browser.newContext();
      const ownerPage = await context.newPage();
      await signIn(ownerPage, ownerEmail, '/Professional/Owner');
      await expect(ownerPage.getByText(orgName)).toBeVisible({ timeout: 15000 });
      await ownerPage.getByRole('button', { name: 'Request corrections' }).click();
      await ownerPage.getByText('Legal Entity', { exact: true }).click();
      await ownerPage.getByPlaceholder(/Describe exactly what needs to change/).fill('Please confirm your registered legal business name exactly as it appears on your formation documents.');
      await ownerPage.getByRole('button', { name: 'Send correction request' }).click();
      await expect(ownerPage.getByText('Legal Entity')).toHaveCount(0, { timeout: 10000 }); // panel re-renders, app no longer "pending"
      expect(sql(`SELECT status, correction_requested_fields FROM professional_applications WHERE id='${appId}';`)).toContain('info_required');
      await context.close();

      const bilalContext = await browser.newContext();
      const page = await bilalContext.newPage();
      await signIn(page, bilalEmail);

      await expect(page.getByText('Platform Owner requested corrections')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/confirm your registered legal business name/)).toBeVisible();
      await expect(page.getByText(/Only Legal Entity can be edited/)).toBeVisible();

      // The flagged step's field is editable.
      await page.getByRole('button', { name: '1. Legal Entity' }).click();
      const legalNameInput = page.getByLabel('Registered legal business name *', { exact: true });
      await expect(legalNameInput).toBeEditable();
      await legalNameInput.fill('Al-Noor Family Care Services LLC');

      // A step that was NOT flagged is locked (disabled), with its
      // original value intact, not editable.
      await page.getByRole('button', { name: '2. Director' }).click();
      const directorNameInput = page.getByLabel('Full legal name *', { exact: true });
      await expect(directorNameInput).toHaveValue('Bilal Ahmed');
      await expect(directorNameInput).toBeDisabled();

      await page.getByRole('button', { name: '6. Review' }).click();
      await page.getByRole('button', { name: 'Resubmit for review' }).click();

      await expect(page.getByRole('heading', { name: 'Your application is under review' })).toBeVisible({ timeout: 10000 });

      const row = sql(`SELECT status, application_details FROM professional_applications WHERE id='${appId}';`);
      // The real state machine is pending_review -> info_required ->
      // resubmitted (not back to pending_review) -- ApplicationStatusPage
      // correctly shows "under review" for both.
      expect(row).toContain('resubmitted');
      expect(row).toContain('Al-Noor Family Care Services LLC');
      // Untouched step2 data survived the resubmission unchanged.
      expect(row).toContain('"mobile": "555-0002"');
      await bilalContext.close();
    } finally {
      sql(`DELETE FROM professional_applications WHERE applicant_user_id='${bilalId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
