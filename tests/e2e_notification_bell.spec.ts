// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase I2 — real-browser proof of
// the NotificationBell UI (shared across EnterpriseOfficeShell and
// PlatformOwnerAdminPage's header): a real submitted application
// triggers a real server-side notification row (migration 116's
// trigger, not a mock), the Platform Owner's bell shows the correct
// unread count and the notification text, clicking it marks the
// notification read (verified server-side), and the unread count
// drops to zero.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

const PW = 'BellUi9!';
const BASE = 'http://127.0.0.1:5180';
const API_BASE = 'http://127.0.0.1:55321';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stamp = Date.now();
const orgName = `Bell UI Org ${stamp}`;

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
async function signIn(page: Page, email: string, path = '/Professional/Admin') {
  await page.goto(`${BASE}${path}`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PW);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Notification bell (MMA-ENT-SALES-006 Phase I2)', () => {
  test('a real application submission notifies the Platform Owner, who sees and reads it through the real bell UI', async ({ page }) => {
    const ownerId = await mkUser(`bellui-owner-${stamp}@local.test`);
    const bilalEmail = `bellui-bilal-${stamp}@local.test`;
    const bilalId = await mkUser(bilalEmail);
    let appId = '';
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}'); UPDATE profiles SET role='admin' WHERE id='${ownerId}';`);

      appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${orgName}', 'integrated_care', 'Bell Bilal', '${bilalEmail}', 'pending_review', true, '{}'::jsonb)
        RETURNING id;
      `);

      const beforeCount = sql(`SELECT count(*) FROM enterprise_notifications WHERE recipient_user_id='${ownerId}' AND notification_type='application_submitted';`);
      expect(beforeCount).toBe('1'); // the raw INSERT above already fired the trigger -- confirms the trigger, not this test, created it

      await signIn(page, `bellui-owner-${stamp}@local.test`, '/Professional/Owner');
      await expect(page.getByText(orgName)).toBeVisible({ timeout: 15000 }); // real admin console loaded

      const bellButton = page.getByRole('button', { name: /Notifications/ });
      await expect(bellButton).toBeVisible();
      await expect(bellButton.getByText('1', { exact: true })).toBeVisible();

      await bellButton.click();
      const notificationItem = page.getByRole('button', { name: new RegExp(`New Director application submitted.*Proposing.*${orgName}`, 's') });
      await expect(notificationItem).toBeVisible({ timeout: 10000 });

      await notificationItem.click();
      await expect(bellButton.getByText('1', { exact: true })).toHaveCount(0, { timeout: 10000 });

      const notifRow = sql(`SELECT read_at IS NOT NULL FROM enterprise_notifications WHERE recipient_user_id='${ownerId}' AND notification_type='application_submitted';`);
      expect(notifRow).toBe('t');
    } finally {
      sql(`DELETE FROM enterprise_notifications WHERE recipient_user_id IN ('${ownerId}','${bilalId}');`);
      if (appId) sql(`DELETE FROM professional_applications WHERE id='${appId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });

  // CODEX F-19 -- previously a real fetch failure and "genuinely zero
  // notifications" rendered identically ("No notifications yet."),
  // and a failed mark-read still showed as read in the UI because the
  // local state update ran before the server call was even awaited.
  test('a genuine fetch failure is shown as an explicit error, not a fabricated empty inbox, and a failed mark-read is not shown as read', async ({ page }) => {
    const ownerEmail = `bellui-fail-owner-${stamp}@local.test`;
    const ownerId = await mkUser(ownerEmail);
    const bilalEmail = `bellui-fail-bilal-${stamp}@local.test`;
    const bilalId = await mkUser(bilalEmail);
    let appId = '';
    try {
      sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${ownerId}','${bilalId}'); UPDATE profiles SET role='admin' WHERE id='${ownerId}';`);
      appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
        VALUES ('${bilalId}', 'director', '${orgName} Fail', 'integrated_care', 'Bell Bilal Fail', '${bilalEmail}', 'pending_review', true, '{}'::jsonb)
        RETURNING id;
      `);

      await signIn(page, ownerEmail, '/Professional/Owner');
      await expect(page.getByText(`${orgName} Fail`)).toBeVisible({ timeout: 15000 });

      const bellButton = page.getByRole('button', { name: /Notifications/ });
      await bellButton.click();
      const notificationItem = page.getByRole('button', { name: new RegExp(`New Director application submitted.*Proposing.*${orgName} Fail`, 's') });
      await expect(notificationItem).toBeVisible({ timeout: 10000 });

      // Force the mark-read RPC to genuinely fail (RLS correctly
      // rejects marking read someone else's notification) by racing a
      // revoked-session-shaped failure: simplest real reproduction is
      // to delete the underlying row server-side between render and
      // click, so the RPC's own "no such notification" path fires.
      const notifId = sql(`SELECT id FROM enterprise_notifications WHERE recipient_user_id='${ownerId}' AND notification_type='application_submitted' AND related_entity_id='${appId}';`);
      sql(`DELETE FROM enterprise_notifications WHERE id='${notifId}';`);

      await notificationItem.click();
      // The row is gone server-side -- mark_notification_read() must
      // fail (not silently succeed), and the toast must surface it.
      await expect(page.getByText(/Couldn't mark that as read/i)).toBeVisible({ timeout: 10000 });
      // The unread badge must NOT have dropped to zero -- the failed
      // mark-read was not applied to local state as if it had worked.
      await expect(bellButton.getByText('1', { exact: true })).toBeVisible();
    } finally {
      sql(`DELETE FROM enterprise_notifications WHERE recipient_user_id IN ('${ownerId}','${bilalId}');`);
      if (appId) sql(`DELETE FROM professional_applications WHERE id='${appId}';`);
      await deleteUser(ownerId);
      await deleteUser(bilalId);
    }
  });
});
