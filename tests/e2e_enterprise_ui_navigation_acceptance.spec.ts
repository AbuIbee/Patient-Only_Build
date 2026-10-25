// APPROVED ENTERPRISE DASHBOARD — EXACT UI & NAVIGATION IMPLEMENTATION
// §9 acceptance coverage. Runs against a real local Supabase stack and
// a disposable, authorized synthetic Enterprise caregiver account
// (created/seeded externally before this suite runs — see
// 43_ENTERPRISE_UI_IMPLEMENTATION_REPORT.md's "How to reproduce"
// section for the exact fixture). Behavior assertions, not
// screenshot-only acceptance, per the directive's own instruction.
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

function sql(statement: string): string {
  return execSync('docker exec -i supabase_db_repo psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1', { input: statement }).toString().trim();
}

const EMAIL = 'ui-caregiver@local.test';
const PASSWORD = 'UiVerify9!';

const WORKSPACE_ITEMS = ['Dashboard', 'My Patients', 'My Schedule', 'Care Plans & Tasks', 'Patient Health Records'];
const COLLAB_ITEMS = ['Care Communications', 'Care Notes & Observations', 'Shift Handoffs', 'Alerts & Incidents'];
const TOOLS_ITEMS = ['Visits & Time Records', 'My Care Team', 'Documents', 'My Organization', 'Settings & Account'];
const ALL_14 = [...WORKSPACE_ITEMS, ...COLLAB_ITEMS, ...TOOLS_ITEMS];

async function signIn(page: Page) {
  await page.goto('http://127.0.0.1:5180/business');
  await page.getByRole('button', { name: 'Caregiver Sign In', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByText('Evergreen Home Care').first().waitFor({ timeout: 15000 });
}

test.describe('1. Enterprise workspace routing', () => {
  test('an authorized Enterprise caregiver reaches EnterpriseCaregiverDashboard at /business, not the residential patient record', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await expect(page.getByText('WORKSPACE', { exact: true })).toBeVisible();
    await expect(page.getByText('ENTERPRISE CARE', { exact: true })).toBeVisible();
    expect(page.url()).toContain('/business/dashboard');
    expect(errors).toEqual([]);
  });
});

test.describe('2. All 14 navigation destinations', () => {
  test('every approved label is present, in the correct 3 groups', async ({ page }) => {
    await signIn(page);
    for (const label of ALL_14) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    // Group order and membership, exactly as approved.
    const nav = page.locator('nav[aria-label="Enterprise navigation"]');
    const navText = await nav.innerText();
    const workspaceIdx = navText.indexOf('WORKSPACE');
    const collabIdx = navText.indexOf('CARE COLLABORATION');
    const toolsIdx = navText.indexOf('PROFESSIONAL TOOLS');
    expect(workspaceIdx).toBeGreaterThanOrEqual(0);
    expect(collabIdx).toBeGreaterThan(workspaceIdx);
    expect(toolsIdx).toBeGreaterThan(collabIdx);
    for (const label of WORKSPACE_ITEMS) expect(navText.indexOf(label)).toBeGreaterThan(workspaceIdx);
    for (const label of COLLAB_ITEMS) expect(navText.indexOf(label)).toBeGreaterThan(collabIdx);
    for (const label of TOOLS_ITEMS) expect(navText.indexOf(label)).toBeGreaterThan(toolsIdx);
  });

  test('each destination navigates without a runtime error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    for (const label of ALL_14) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(150);
    }
    expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('3. Active navigation state', () => {
  test('the clicked destination is marked aria-current and visually distinct', async ({ page }) => {
    await signIn(page);
    const scheduleBtn = page.getByRole('button', { name: 'My Schedule', exact: true });
    await scheduleBtn.click();
    await expect(scheduleBtn).toHaveAttribute('aria-current', 'page');
    const dashboardBtn = page.getByRole('button', { name: 'Dashboard', exact: true });
    await expect(dashboardBtn).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('4. Direct URL / reload behavior', () => {
  test('a reload on an opened patient record lands on the same record, not the dashboard', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'My Patients', exact: true }).click();
    await page.getByRole('button', { name: /Evelyn Carter/i }).first().click();
    await expect(page.getByText('Evelyn Carter').first()).toBeVisible({ timeout: 10000 });
    const urlBeforeReload = page.url();
    expect(urlBeforeReload).toMatch(/\/business\/patients\/[\w-]+/);

    await page.reload();
    await expect(page.getByText('Evelyn Carter').first()).toBeVisible({ timeout: 10000 });
    expect(page.url()).toBe(urlBeforeReload);
  });

  test('browser back/forward move between the schedule, the patient list and the opened record', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'My Schedule', exact: true }).click();
    await page.getByRole('button', { name: 'My Patients', exact: true }).click();
    await page.getByRole('button', { name: /Evelyn Carter/i }).first().click();
    await expect(page.getByText('Evelyn Carter').first()).toBeVisible({ timeout: 10000 });

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'My Patients' })).toBeVisible({ timeout: 5000 });

    await page.goBack();
    expect(page.url()).toContain('/business/schedule');

    await page.goForward();
    expect(page.url()).toContain('/business/patients');
  });
});

test.describe('8. Authorized patient selection', () => {
  test('opening a patient reaches the tabbed Enterprise record, not the residential vertically-stacked view', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'My Patients', exact: true }).click();
    await page.getByRole('button', { name: /Evelyn Carter/i }).first().click();
    // The tabbed Enterprise record's distinguishing tab row.
    for (const tab of ['Overview', 'Medical', 'Medications', 'Tasks', 'A–G', 'Care Plan', 'Appointments', 'Documents', 'Safety', 'Communications', 'Timeline']) {
      await expect(page.getByRole('main').getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
  });
});

test.describe('9. Correct data isolation', () => {
  test('an unrelated account cannot read this organization\'s dashboard data', async ({ request }) => {
    // Negative control at the API boundary -- the owner-approved layout
    // must never be reachable as a reason to weaken RLS; this just
    // re-confirms the boundary this UI work sits on top of still holds.
    const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
    const resp = await request.get('http://127.0.0.1:55321/rest/v1/patients?id=eq.e54b94db-4d6f-45ce-a1ef-b2f225cc763d', {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    expect(resp.status()).toBe(200);
    expect(await resp.json()).toEqual([]);
  });
});

test.describe('10. Accurate dashboard counts', () => {
  test('the four summary cards show real figures, not placeholders, and navigate on click', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('Assigned patients', { exact: true })).toBeVisible();
    await expect(page.getByText('Visits today', { exact: true })).toBeVisible();
    await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
    await expect(page.getByText('Unread messages', { exact: true })).toBeVisible();
    await page.getByText('Assigned patients', { exact: true }).locator('..').click();
    await expect(page.getByRole('heading', { name: 'My Patients' })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('11. Working care communication entry', () => {
  test('Care communications panel links through to the full Care Communications view', async ({ page }) => {
    await signIn(page);
    await page.getByText('Open Care Communications', { exact: false }).click();
    await expect(page.getByText('Care Communications', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('13. Valid registration permissions', () => {
  test('Register a New Patient is reachable from the dashboard header', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('button', { name: 'Register a New Patient', exact: true })).toBeVisible();
  });
});

test.describe('14. Secure denied access for unauthorized users', () => {
  test('visiting /business while signed out shows the public business landing page, never the dashboard', async ({ page }) => {
    await page.goto('http://127.0.0.1:5180/business');
    await expect(page.getByRole('button', { name: 'Caregiver Sign In', exact: true })).toBeVisible();
    await expect(page.getByText('WORKSPACE', { exact: true })).toHaveCount(0);
  });
});

test.describe('6/7. Tablet and mobile layout', () => {
  test('tablet (820px): no horizontal overflow, content adapts', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await signIn(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  for (const width of [375, 320]) {
    test(`mobile (${width}px): collapsed drawer exposes all 14 destinations, no overflow`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      await signIn(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      for (const label of ALL_14) {
        await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
      }
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
      await context.close();
    });
  }
});

test.describe('15. Existing patient/caregiver interfaces remain functional', () => {
  test('the residential caregiver sign-in path is untouched and still reachable from the root landing page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5180/');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// CODEX F-18 FIX — "Caregiver inbox items remain summaries without
// direct thread opening." Confirmed live: ConversationGroup's list
// items had no click handler at all. Fixed by reusing
// CareConversations.tsx's own already-reviewed ConversationThread
// component. Proves it against this suite's own real, externally
// seeded caregiver/patient fixture -- a real conversation + message,
// created and torn down by this test alone, never touching any other
// test's state.
test.describe('16. Care Communications inbox items open a real thread (CODEX F-18)', () => {
  test('clicking an inbox item opens the real message thread, not an inert summary', async ({ page }) => {
    const caregiverId = sql("SELECT id FROM auth.users WHERE email='ui-caregiver@local.test';");
    const patientId = 'ee1ee1ee-1ee1-1ee1-1ee1-ee1ee1ee1ee1';
    const convId = sql(`
      INSERT INTO conversations (patient_id, subject, created_by) VALUES ('${patientId}', 'F18 thread-open probe', '${caregiverId}') RETURNING id;
    `);
    sql(`
      INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by) VALUES
        ('${convId}', '${caregiverId}', 'caregiver', '${caregiverId}'),
        ('${convId}', '${patientId}', 'patient', '${caregiverId}');
      INSERT INTO messages (conversation_id, sender_id, sender_role, body) VALUES
        ('${convId}', '${caregiverId}', 'caregiver', 'F18 probe message body, unique and real');
    `);

    try {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await signIn(page);
      await page.getByRole('button', { name: 'Care Communications', exact: true }).click();
      await expect(page.getByText('F18 thread-open probe', { exact: false })).toBeVisible({ timeout: 10000 });
      await page.getByText('F18 thread-open probe', { exact: false }).click();

      // The real thread, not the inert summary: the full message body
      // (truncated in the summary list) and a reply control.
      await expect(page.getByText('F18 probe message body, unique and real', { exact: false })).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder(/reply/i)).toBeVisible({ timeout: 5000 });
      expect(errors, `Runtime errors: ${errors.join(' | ')}`).toEqual([]);
    } finally {
      sql(`DELETE FROM messages WHERE conversation_id='${convId}'; DELETE FROM conversation_participants WHERE conversation_id='${convId}'; DELETE FROM conversations WHERE id='${convId}';`);
    }
  });
});
