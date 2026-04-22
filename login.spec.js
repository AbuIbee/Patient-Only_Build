const { test, expect } = require('@playwright/playTest');

test('login page loads', async ({ page }) => {
  await page.goto('https://www.mymemoriaally.com');
  await expect(page).toHaveTitle(/Memoria/i);
});

test('patient can log in', async ({ page }) => {
  await page.goto('https://www.mymemoriaally.com');
  
  // Fill in login form
  await page.fill('input[type="email"]', 'Ummie@mymemoriaally.com');
  await page.fill('input[type="password"]', 'Umm@mymemory');
  await page.keyboard.press('Enter');

  // Wait for dashboard to appear
  await expect(page.locator('text=Good Morning')).toBeVisible({ timeout: 10000 });
});