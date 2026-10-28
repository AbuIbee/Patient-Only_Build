// MMA-PROF-ONBOARD-004 -- real-browser proof of the Platform Owner's
// new license-tier/coupon administration panels and the manual_review
// exception-resolution action, all added to PlatformOwnerAdminPage.tsx.
// Requires the local Docker Supabase stack and a dev server on
// 127.0.0.1:5280 (disposable stack only).
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:5280';
const API_BASE = 'http://127.0.0.1:57321';
const DB_CONTAINER = 'supabase_db_mma-ent-caregiver-master-003';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PW = 'OwnerAdmin9!';

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

test.describe('Platform Owner tier/coupon administration and exception review (MMA-PROF-ONBOARD-004)', () => {
  test('Owner edits a tier price, unpublishes/republishes it, creates and pauses a coupon, and resolves a manual_review application', async ({ page }) => {
    const stamp = Date.now();
    const ownerEmail = `owner-admin-${stamp}@local.test`;
    const applicantEmail = `owner-admin-applicant-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const applicantId = await mkUser(applicantEmail);
    const orgName = `Owner Admin Dupe Org ${stamp}`;
    try {
      sql(`
        UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${applicantId}');
        UPDATE profiles SET role='admin' WHERE id='${ownerId}';
        INSERT INTO organizations (name, package_type, created_by) VALUES ('${orgName}', 'integrated_care', '${ownerId}');
      `);
      // A manual_review application the Owner must resolve, created
      // directly to isolate THIS test from start_self_service_application's
      // own already-covered behavior.
      const appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, exception_review_reason, entry_method, application_details)
        VALUES ('${applicantId}', 'director', '${orgName}', 'integrated_care', 'Admin Test Applicant', '${applicantEmail}', 'manual_review', true, 'A business with the same or a very similar name already exists in this system.', 'public_website', '{}'::jsonb)
        RETURNING id;
      `);

      await page.goto(`${BASE}/Professional`);
      await page.getByPlaceholder('you@example.com').fill(ownerEmail);
      await page.getByPlaceholder('Your password').fill(PW);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForTimeout(1500);
      await page.goto(`${BASE}/Professional/Owner`);
      await expect(page.getByText('PLATFORM OWNER ADMINISTRATION')).toBeVisible({ timeout: 15000 });

      // --- Tier pricing: edit Essential's price, verify persisted. ---
      await expect(page.getByText('License Tiers & Pricing')).toBeVisible();
      const essentialRow = page.getByTestId('tier-row-essential');
      const priceInput = essentialRow.locator('input').nth(1);
      await priceInput.fill('450.00');
      await essentialRow.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Essential updated.')).toBeVisible({ timeout: 10000 });
      const persistedCents = sql(`SELECT annual_fee_cents FROM license_tier_catalog WHERE tier_code='essential';`);
      expect(persistedCents).toBe('45000');
      // Restore for other tests' sake.
      await priceInput.fill('399.00');
      await essentialRow.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Essential updated.')).toBeVisible({ timeout: 10000 });

      // --- Unpublish/republish ---
      await essentialRow.getByRole('button', { name: 'Unpublish' }).click();
      await expect(page.getByText('Essential unpublished.')).toBeVisible({ timeout: 10000 });
      expect(sql(`SELECT is_published FROM license_tier_catalog WHERE tier_code='essential';`)).toBe('f');
      await essentialRow.getByRole('button', { name: 'Publish' }).click();
      await expect(page.getByText('Essential published.')).toBeVisible({ timeout: 10000 });
      expect(sql(`SELECT is_published FROM license_tier_catalog WHERE tier_code='essential';`)).toBe('t');

      // --- Coupon creation + pause ---
      await page.getByRole('button', { name: 'New code' }).click();
      await page.getByPlaceholder('CODE').fill(`ADMINTEST${stamp}`);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByText(`ADMINTEST${stamp} created.`)).toBeVisible({ timeout: 10000 });
      const couponRow = page.getByTestId(`coupon-row-ADMINTEST${stamp}`);
      await couponRow.getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByText(`ADMINTEST${stamp} set to paused.`)).toBeVisible({ timeout: 10000 });
      expect(sql(`SELECT status FROM promo_coupon_catalog WHERE code='ADMINTEST${stamp}';`)).toBe('paused');

      // --- Manual review resolution ---
      await expect(page.getByText(`Admin Test Applicant — proposing "${orgName}"`)).toBeVisible();
      await expect(page.getByText('A business with the same or a very similar name already exists')).toBeVisible();
      const appRow = page.locator('li', { hasText: 'Admin Test Applicant' });
      await appRow.getByRole('button', { name: 'Confirm distinct — proceed to agreements' }).click();
      await expect(page.getByText('Confirmed distinct — application proceeds to agreements.')).toBeVisible({ timeout: 10000 });
      expect(sql(`SELECT status FROM professional_applications WHERE id='${appId}';`)).toBe('agreements_pending');

      sql(`DELETE FROM promo_coupon_catalog WHERE code='ADMINTEST${stamp}';`);
    } finally {
      sql(`
        DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id='${applicantId}');
        DELETE FROM professional_applications WHERE applicant_user_id='${applicantId}';
        DELETE FROM organizations WHERE name='${orgName}';
      `);
      await fetch(`${API_BASE}/auth/v1/admin/users/${ownerId}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
      await fetch(`${API_BASE}/auth/v1/admin/users/${applicantId}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    }
  });
});
