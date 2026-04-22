import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('https://mymemoriaally.com/');
  await expect(page).toHaveTitle(/Memoria/i);
});

test('patient can log in', async ({ page }) => {
  await page.goto('https://mymemoriaally.com/');

  // Click Sign In twice - first opens sign in page, second reveals the form
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // Fill in credentials
  await page.getByRole('textbox', { name: 'you@example.com' }).waitFor({ timeout: 10000 });
  await page.getByRole('textbox', { name: 'you@example.com' }).fill('Ummie@mymemoriaally.com');
  await page.getByRole('textbox', { name: 'Your password' }).fill('Umm@mymemory');
  await page.getByRole('textbox', { name: 'Your password' }).press('Enter');

  // Confirm dashboard loaded
  await expect(page.getByRole('button', { name: '😊 How I Feel' })).toBeVisible({ timeout: 15000 });
});

test('all nav tabs are accessible', async ({ page }) => {
  await page.goto('https://mymemoriaally.com/');

  // Click Sign In twice
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // Fill in credentials
  await page.getByRole('textbox', { name: 'you@example.com' }).waitFor({ timeout: 10000 });
  await page.getByRole('textbox', { name: 'you@example.com' }).fill('Ummie@mymemoriaally.com');
  await page.getByRole('textbox', { name: 'Your password' }).fill('Umm@mymemory');
  await page.getByRole('textbox', { name: 'Your password' }).press('Enter');
  await expect(page.getByRole('button', { name: '😊 How I Feel' })).toBeVisible({ timeout: 15000 });

  // Test every nav tab
  await page.getByRole('button', { name: '👨‍👩‍👧 Family' }).click();
  await page.getByRole('button', { name: '😊 How I Feel' }).click();
  await page.getByRole('button', { name: '🔔 Reminders' }).click();
  await page.getByRole('button', { name: '💊 Medications' }).click();
  await page.getByRole('button', { name: '📅 My Day' }).click();
  await page.getByRole('button', { name: '🎬 Videos & Media' }).click();
  await page.getByRole('button', { name: '🎮 Memory Games' }).click();
  await page.getByRole('button', { name: '••• More' }).click();
  await page.getByRole('button', { name: '📋 Care Partners' }).click();
  await page.getByRole('button', { name: '••• More' }).click();
  await page.getByRole('button', { name: '📝 Patient Intake Form' }).click();
  await page.getByRole('button', { name: '••• More' }).click();
  await page.getByRole('button', { name: '🚨 Emergency Contact' }).click();
  await page.getByRole('button', { name: '••• More' }).click();
  await page.getByRole('button', { name: '📄 Papers' }).click();

  await expect(page.getByRole('button', { name: '••• More' })).toBeVisible();
});