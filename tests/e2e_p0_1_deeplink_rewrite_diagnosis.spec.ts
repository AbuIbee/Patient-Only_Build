// MMA-PROF-ONBOARD-004 P0-1 diagnosis -- confirms the blank
// /Professional/Owner page is caused by vite.config.ts `base: './'`
// (relative asset paths) combined with vercel.json's catch-all SPA
// rewrite `/((?!assets/).*) -> /index.html`. On a direct deep-link
// navigation or browser reload at any non-root path, the browser
// resolves the HTML's relative "./assets/..." script/style src against
// the CURRENT url path, not "/" -- producing a request like
// "/Professional/assets/index-*.js" that the SAME catch-all rewrite
// rule also intercepts (it doesn't start with "assets/" at the root)
// and answers with index.html's own bytes/text-html mime type instead
// of JavaScript. Browsers refuse to execute a <script type="module">
// whose response MIME type isn't a JS type, so React never mounts --
// a real, permanent, un-recoverable-by-ErrorBoundary blank page in
// production, reproduced here against
// tests/../vercel_rewrite_sim_server.mjs which faithfully replicates
// vercel.json's own rewrite semantics against the real dist/ build.
import { test } from '@playwright/test';

const SIM_BASE = 'http://127.0.0.1:5299';

test('diagnose: deep-link /Professional/Owner under production rewrite semantics', async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const responses: string[] = [];
  page.on('console', (msg) => { consoleMessages.push(`[${msg.type()}] ${msg.text()}`); });
  page.on('pageerror', (err) => { pageErrors.push(err.stack || err.message); });
  page.on('response', (res) => { responses.push(`${res.status()} ${res.headers()['content-type'] || '?'} ${res.url()}`); });

  await page.goto(`${SIM_BASE}/Professional/Owner`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const bodyHtml = await page.locator('body').innerHTML();
  const rootDiv = await page.locator('#root').innerHTML().catch(() => '<<no #root found>>');

  console.log('=== DEEP-LINK REWRITE DIAGNOSIS ===');
  console.log('URL:', page.url());
  console.log('BODY innerHTML length:', bodyHtml.length);
  console.log('#root innerHTML (should be non-empty if React mounted):', JSON.stringify(rootDiv.slice(0, 300)));
  console.log('ALL RESPONSES:');
  responses.forEach((r) => console.log('  ' + r));
  console.log('CONSOLE MESSAGES:');
  consoleMessages.forEach((m) => console.log('  ' + m));
  console.log('PAGE ERRORS:', JSON.stringify(pageErrors, null, 2));
  console.log('=== END DIAGNOSIS ===');
});
