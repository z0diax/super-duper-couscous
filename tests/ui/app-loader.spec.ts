import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18782); });
test.afterAll(async () => { await fixture?.stop(); });

test('session check uses the animated loader in light desktop appearance', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.addInitScript(() => localStorage.setItem('hrmdo-dts.appearance.mode', 'light'));
  let releaseSession!: () => void;
  const heldSession = new Promise<void>(resolve => { releaseSession = resolve; });
  await page.route('**/api/auth.php', async route => {
    if (route.request().method() === 'GET') await heldSession;
    await route.continue();
  });
  await page.goto(`${fixture.base}/`);
  const loader = page.getByRole('status', { name: 'Checking your login session...' });
  try {
    await expect(loader).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
    expect(await loader.locator('.app-loader-document').first().evaluate(el => getComputedStyle(el).animationName)).toBe('app-loader-file');
    expect(await loader.locator('.app-loader-folder-front').evaluate(el => getComputedStyle(el).animationName)).toBe('app-loader-float');
  } finally {
    releaseSession();
  }
  await expect(page.getByRole('status', { name: 'Opening Records Management System...' })).toBeVisible();
  await page.clock.runFor(4999);
  await expect(page.getByRole('heading', { name: 'System access' })).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.getByRole('heading', { name: 'System access' })).toBeVisible();
  await expect(loader).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'System access' })).toBeVisible({ timeout: 2000 });
  await expect(page.locator('.app-loader')).toHaveCount(0);
});

test('startup loader follows database readiness and respects theme and reduced motion', async ({ page }) => {
  const admin = await new Client(fixture.base).login();
  await admin.request('settings.php', 'PUT', { theme: 'government' });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('hrmdo-dts.appearance.mode', 'dark');
    localStorage.setItem('hrmdo-dts.theme-state.v1', JSON.stringify({ theme: 'government', revision: 0 }));
  });
  let releaseState!: () => void;
  const heldState = new Promise<void>(resolve => { releaseState = resolve; });
  await page.route('**/api/state.php', async route => {
    if (route.request().method() === 'GET') await heldState;
    await route.continue();
  });
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const loader = page.getByRole('status', { name: 'Connecting to the application database...' });
  try {
    await expect(loader).toBeVisible();
    await expect(loader.getByRole('heading', { name: 'Records Management System' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'government');
    expect(await loader.locator('.app-loader-folder-front').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await loader.locator('.app-loader-route span').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    releaseState();
  }
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(loader).toHaveCount(0);
});

test('database failure shows the existing error and reconnect action', async ({ page }) => {
  await page.route('**/api/state.php', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Database temporarily unavailable.' }) });
    } else await route.continue();
  });
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Database connection required' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();
  await expect(page.locator('.app-loader')).toHaveCount(0);
});
