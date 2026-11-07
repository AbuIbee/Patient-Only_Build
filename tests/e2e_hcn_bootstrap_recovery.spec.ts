import { test, expect } from '@playwright/test';

// Run against a disposable Haneen frontend with fictional-only configuration.
// The bootstrap must never leave #root empty when Edge rejects storage access.
const baseUrl = process.env.MMA_E2E_FRONTEND_BASE;
test('denied non-configurable sessionStorage shows a recoverable diagnostic, never a white screen', async ({page}) => {
  test.skip(!baseUrl, 'Requires an explicitly configured disposable frontend');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: false,
      get() { throw new DOMException('Access denied for this document', 'SecurityError'); },
    });
  });
  await page.goto(baseUrl!, {waitUntil:'domcontentloaded'});
  await expect.poll(async () => (await page.locator('#root').innerText()).trim().length, {timeout:15000}).toBeGreaterThan(30);
  await expect(page.locator('#root')).toContainText(/Haneen|Sign in/i);
  // Either app handles the browser constraint, or safe bootstrap UI explains it.
  const bodyText = await page.locator('#root').innerText();
  expect(bodyText.includes('HCN-BOOT-001') || bodyText.includes('Haneen')).toBe(true);
});
