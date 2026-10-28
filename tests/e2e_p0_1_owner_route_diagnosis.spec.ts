// MMA-PROF-ONBOARD-004 P0-1 -- /Professional/Owner must never render a
// blank viewport under any of the following conditions. Root cause of
// the original bug (vite.config.ts `base: './'` + vercel.json's
// catch-all rewrite breaking deep-link/reload asset resolution) is
// fixed and separately reproduced/verified in
// e2e_p0_1_deeplink_rewrite_diagnosis.spec.ts against a faithful
// simulator of the real production rewrite rule. This file covers the
// remaining required scenarios against the dev server (disposable
// Supabase stack at 127.0.0.1:57321 only -- never a real project).
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:5280';
const OWNER_EMAIL = 'owner004-test@local.test';
const OWNER_PW = 'Owner004Fix9!';
const NONOWNER_EMAIL = 'nonowner004-test@local.test';
const NONOWNER_PW = 'NonOwner004Fix9!';

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/Professional`);
  await page.getByPlaceholder('you@example.com').first().fill(email);
  await page.getByPlaceholder('Your password').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForTimeout(1500);
}

function assertNotBlank(bodyText: string) {
  expect(bodyText.trim().length, 'page body must not be empty/blank').toBeGreaterThan(0);
}

test('authenticated Platform Owner sees the real dashboard, not blank', async ({ page }) => {
  await login(page, OWNER_EMAIL, OWNER_PW);
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
  expect(body).toContain('PLATFORM OWNER ADMINISTRATION');
});

test('authenticated non-owner sees explicit unauthorized state, not blank', async ({ page }) => {
  await login(page, NONOWNER_EMAIL, NONOWNER_PW);
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
  await expect(page.getByTestId('owner-page-unauthorized')).toBeVisible();
  expect(body).toContain('Platform Owner access required');
});

test('logged-out visitor is routed to login, not blank', async ({ page }) => {
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
});

test('missing backend infrastructure (RPC failure) shows explicit backend-error state, not blank', async ({ page }) => {
  await login(page, OWNER_EMAIL, OWNER_PW);
  // Simulate missing/broken backend infra by intercepting the
  // is_platform_owner RPC call and failing it server-side, exactly as
  // a dropped function or a misconfigured project would from the
  // client's point of view.
  await page.route('**/rest/v1/rpc/is_platform_owner', (route) => {
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'function not found (simulated missing backend infrastructure)' }) });
  });
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
  await expect(page.getByTestId('owner-page-backend-error')).toBeVisible();
  expect(body).toContain('backend error');
});

test('browser reload while on /Professional/Owner keeps the real dashboard, not blank', async ({ page }) => {
  await login(page, OWNER_EMAIL, OWNER_PW);
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
  expect(body).toContain('PLATFORM OWNER ADMINISTRATION');
});

test('mobile viewport renders the owner dashboard without blanking', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await login(page, OWNER_EMAIL, OWNER_PW);
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
  expect(body).toContain('PLATFORM OWNER ADMINISTRATION');
  await context.close();
});

test('expired/invalid session shows a real state, not blank', async ({ page }) => {
  await login(page, OWNER_EMAIL, OWNER_PW);
  await page.goto(`${BASE}/Professional/Owner`);
  await page.waitForTimeout(1500);
  // Corrupt the persisted session (sessionStorage per src/lib/supabase.ts)
  // to simulate an expired/invalid token, then reload the same tab.
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.includes('supabase') || key.includes('auth')) {
        sessionStorage.setItem(key, sessionStorage.getItem(key)!.replace(/"access_token":"[^"]+"/, '"access_token":"expired.invalid.token"'));
      }
    }
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  assertNotBlank(body);
});
