// OWNER DIRECTIVE MMA-ENT-SALES-002, PHASE B — the Founder/Director
// "dead end" fix. Before this change, ProfessionalOfficeResolver's
// zero-office fallback (AccessRequiredState) was a true dead end: no
// link to an application, and no awareness that get_my_organizations()
// only ever returns ACTIVE memberships (an 'invited' one is a separate
// RPC, get_my_pending_org_invites(), the resolver never called). Two
// distinct, owner-approved paths are verified live here, neither of
// which grants access by itself:
//   1. A prospective founding Director with NO invite and NO
//      application reaches "Organization access required" and can
//      complete the canonical self-service tier-selection/starter-
//      application flow (MMA-PROF-ONBOARD-004 -- superseding the old
//      two-field CreateOrgCard quick-create this test originally
//      drove), landing on the real agreements_pending status page
//      immediately after — never a dashboard.
//   2. A real invited staff member (organization_memberships
//      status='invited') reaches "You have a pending invitation"
//      instead, and Accept actually grants the office, reusing the
//      exact same respond_to_org_invite() RPC and banner component the
//      legacy /business tree already uses.
//
// Requires: the local Docker Supabase stack and a running dev server on
// 127.0.0.1:5180. Fully self-contained: each test seeds/tears down its
// own disposable, uniquely-timestamped synthetic account(s) — no shared
// fixture, no production/staging data touched.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { requireE2eEnv } from './_e2eTargetValidation';

const PW = 'AccessStates9!';
const BASE = requireE2eEnv('MMA_E2E_FRONTEND_BASE');
const API_BASE = requireE2eEnv('MMA_E2E_API_BASE');
const DB_CONTAINER = requireE2eEnv('MMA_E2E_DB_CONTAINER');
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();

function sql(statement: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, { input: statement }).toString().trim();
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
async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/Professional/Admin`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Professional access-required states (Phase B)', () => {
  test('a founding Director prospect with no invite/application can complete the canonical self-service flow, and lands on a real agreements_pending status, never a dashboard', async ({ page }) => {
    const email = `access-founder-${stamp}@local.test`;
    const orgName = `Access States Org ${stamp}`;
    const id = await mkUser(email);
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
      await signIn(page, email);
      await expect(page.getByRole('heading', { name: 'Organization access required' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Choose your license tier')).toBeVisible();

      await page.getByText('Essential').first().click();
      // This user signed in directly (no AccountStep), so the "Your full
      // legal name"/"Your email" fields have no pre-fill from
      // state.currentUser.firstName/lastName -- fill them explicitly.
      await page.getByLabel('Your full legal name *').fill('Access Founder');
      await page.getByLabel('Your email *').fill(email);
      await page.getByLabel('Legal business name *').fill(orgName);
      await page.getByLabel('Legal entity type *').fill('LLC');
      await page.getByLabel('Business classification *').fill('Home care agency');
      await page.getByLabel('Formation jurisdiction *').fill('Texas');
      await page.getByLabel('Business phone *').fill('512-555-0100');
      await page.getByLabel('Registered address *').fill('100 Main St, Austin, TX');
      await page.getByLabel('Mobile number *').fill('512-555-0101');
      await page.getByLabel('Title *').fill('Founder');
      await page.getByLabel('Your relationship to this business *').fill('Owner');
      await page.getByText('I am an authorized representative').click();
      await page.getByText('I have the authority to enter').click();
      await page.getByLabel('Billing contact name *').fill('Access Founder');
      await page.getByLabel('Billing address *').fill('100 Main St, Austin, TX');
      await page.getByLabel('Billing email *').fill(email);
      await page.getByLabel('Initial expected active patients *').fill('5');
      await page.getByRole('button', { name: 'Continue to pricing' }).click();

      await expect(page.getByText('Pricing and agreements')).toBeVisible();
      await page.getByText('I confirm the information in this application is accurate').click();
      await page.getByText('I confirm I am authorized to sign').click();
      await page.getByText('I acknowledge the privacy practices').click();
      await page.getByLabel('Typed signature').fill('Access Founder');
      await page.getByRole('button', { name: 'Submit application' }).click();

      // The resolver's own refresh() picks up the new agreements_pending
      // application and immediately swaps to the full ApplicationStatusPage
      // -- superseding SelfServiceApplicationFlow's own brief inline result
      // screen before it is ever the settled state, which is the correct,
      // intended behavior (same pattern CreateOrgCard originally had here).
      await expect(page.getByRole('heading', { name: 'Application verified — agreements and billing next' })).toBeVisible({ timeout: 15000 });
      // The application exists and is agreements_pending, not an active membership/org -- no dashboard chrome anywhere.
      const appStatus = sql(`SELECT status FROM public.professional_applications WHERE proposed_organization_name='${orgName}';`);
      expect(appStatus).toBe('agreements_pending');
      const entryMethod = sql(`SELECT entry_method FROM public.professional_applications WHERE proposed_organization_name='${orgName}';`);
      expect(entryMethod).toBe('public_website');
      expect(sql(`SELECT count(*) FROM public.organizations WHERE name='${orgName}';`)).toBe('0');
      await expect(page.getByText('Director Dashboard')).toHaveCount(0);
    } finally {
      const quoteId = sql(`SELECT (application_details->>'originatingQuoteId')::uuid FROM public.professional_applications WHERE proposed_organization_name='${orgName}';`);
      sql(`
        DELETE FROM public.professional_application_events WHERE application_id IN (SELECT id FROM public.professional_applications WHERE proposed_organization_name='${orgName}');
        DELETE FROM public.professional_applications WHERE proposed_organization_name='${orgName}';
        DELETE FROM public.sales_quotes WHERE id='${quoteId}';
      `);
      await deleteUser(id);
    }
  });

  test('an invited staff member sees their pending invitation (not the generic dead end) and Accept grants the real office', async ({ page }) => {
    const directorEmail = `access-director-${stamp}@local.test`;
    const inviteeEmail = `access-invitee-${stamp}@local.test`;
    const directorId = await mkUser(directorEmail);
    const inviteeId = await mkUser(inviteeEmail);
    const orgId = '77777777-8888-4888-8888-888888888888';
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${inviteeId}');
        DELETE FROM organizations WHERE id='${orgId}';
        BEGIN;
        INSERT INTO organizations(id,name,package_type,created_by) VALUES('${orgId}','Access States Invite Org ${stamp}','integrated_care','${directorId}');
        INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,999,'active');
        INSERT INTO organization_memberships(organization_id,user_id,org_role,status,invited_by) VALUES
          ('${orgId}','${directorId}','director','active','${directorId}'),
          ('${orgId}','${inviteeId}','caregiver','invited','${directorId}');
        COMMIT;
      `);

      await signIn(page, inviteeEmail);
      await expect(page.getByRole('heading', { name: 'You have a pending invitation' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(`Access States Invite Org ${stamp}`)).toBeVisible();
      // Not shown here -- an invited staff member should not be nudged toward creating a competing org.
      await expect(page.getByRole('heading', { name: 'Apply to Start Your Organization' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Accept' }).click();
      await expect(page.getByText('WORKSPACE', { exact: true })).toBeVisible({ timeout: 10000 });
      expect(sql(`SELECT status FROM public.organization_memberships WHERE organization_id='${orgId}' AND user_id='${inviteeId}';`)).toBe('active');
    } finally {
      sql(`DELETE FROM organizations WHERE id='${orgId}';`);
      await deleteUser(directorId);
      await deleteUser(inviteeId);
    }
  });
});
