// HCN Edge InPrivate P0 regression: browser storage APIs can be denied before
// the first React render. This self-contained test uses no real credentials,
// patient data or linked production database.
import { test, expect } from '@playwright/test';

const baseUrl = process.env.MMA_E2E_FRONTEND_BASE;

test('homepage mounts when Edge denies access to window.sessionStorage', async ({ page }) => {
  test.skip(!baseUrl, 'Requires an explicitly configured disposable frontend target');
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); },
    });
  });

  await page.goto(baseUrl!, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
  await expect.poll(async () => (await page.locator('#root').innerText()).trim().length, {
    timeout: 15000,
  }).toBeGreaterThan(40);
  expect(errors.filter(error => /sessionStorage|SecurityError/i.test(error))).toEqual([]);
});

test('professional sign-in route also mounts under denied sessionStorage', async ({ page }) => {
  test.skip(!baseUrl, 'Requires an explicitly configured disposable frontend target');
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); },
    });
  });

  await page.goto(new URL('/Professional', baseUrl!).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
  await expect.poll(async () => (await page.locator('#root').innerText()).trim().length, {
    timeout: 15000,
  }).toBeGreaterThan(40);
  expect(errors.filter(error => /sessionStorage|SecurityError/i.test(error))).toEqual([]);
});
