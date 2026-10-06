import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';
import { SYSTEM_THEMES } from '../../src/theme/themeRegistry';
import { WEATHER_THEMES } from '../../src/theme/themeTypes';

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
  await expect(page.locator('.app-loader-screen')).toHaveClass(/app-loader-exiting/);
  await expect(page.getByRole('heading', { name: 'System access' })).toHaveCount(0);
  await page.clock.runFor(360);
  await expect(page.getByRole('heading', { name: 'System access' })).toBeVisible();
  await expect(page.locator('.app-startup-reveal')).toHaveCount(1);
  await page.clock.runFor(320);
  await expect(page.locator('.app-startup-reveal')).toHaveCount(0);
  await expect(loader).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'System access' })).toBeVisible({ timeout: 2000 });
  await expect(page.locator('.app-loader')).toHaveCount(0);
});

test('startup loader follows database readiness and respects theme and reduced motion', async ({ page }) => {
  const admin = await new Client(fixture.base).login();
  await admin.request('settings.php', 'PUT', { theme: 'womens-month' });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('hrmdo-dts.appearance.mode', 'dark');
    localStorage.setItem('hrmdo-dts.theme-state.v1', JSON.stringify({ theme: 'womens-month', revision: 0 }));
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
    await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'womens-month');
    expect(await loader.locator('.app-loader-route span').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(124, 58, 237)');
    await expect(page.locator('[data-loader-effect]')).toHaveAttribute('data-loader-effect', 'womens-month');
    await expect(page.locator('.app-loader-theme-motif').first()).toBeVisible();
    expect(await page.locator('.app-loader-theme-particle').evaluateAll(elements => elements.every(el => getComputedStyle(el).animationName === 'none'))).toBe(true);
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
  await expect(page.getByRole('heading', { name: 'Database connection required' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();
  await expect(page.locator('.app-loader')).toHaveCount(0);
});


test('loader decorations follow all themes and weather states without crowding primary content', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.addInitScript(() => {
    localStorage.setItem('hrmdo-dts.appearance.mode', 'light');
    localStorage.setItem('hrmdo-dts.theme-state.v1', JSON.stringify({ theme: 'classic', revision: 0 }));
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth.php', async route => {
    if (route.request().method() === 'GET') await held;
    await route.continue();
  });
  let revision = 1000;
  const switchTheme = async (theme: string, effectiveWeatherTheme: string | null = null) => {
    await page.evaluate(value => {
      const channel = new BroadcastChannel('hrmdo-theme');
      channel.postMessage(value);
      channel.close();
    }, { theme, effectiveWeatherTheme, revision: ++revision });
    await expect(page.locator('html')).toHaveAttribute('data-system-theme', theme);
  };
  const decoration = page.locator('[data-loader-effect]');
  const loader = page.locator('.app-loader');
  try {
    await page.goto(`${fixture.base}/`);
    await expect(loader).toBeVisible();
    await expect(decoration).toHaveCount(0);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 667 : 1000 });
      for (const appearance of ['light', 'dark']) {
        await page.evaluate(mode => {
          localStorage.setItem('hrmdo-dts.appearance.mode', mode);
          window.dispatchEvent(new StorageEvent('storage', { key: 'hrmdo-dts.appearance.mode', newValue: mode }));
        }, appearance);
        await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
        for (const theme of Object.values(SYSTEM_THEMES)) {
          await switchTheme(theme.id);
          if (theme.effectId) {
            await expect(decoration).toHaveAttribute('data-loader-effect', theme.effectId);
            await expect(decoration.locator('.app-loader-theme-motif svg').first()).toBeVisible();
            const bounds = await decoration.boundingBox();
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
            const count = await page.locator('.app-loader-theme-particle:visible').count();
            expect(count).toBeGreaterThanOrEqual(2);
            expect(count).toBeLessThanOrEqual(width === 375 ? 6 : 10);
            // Motifs must sit outside the folder, route, and all loading text.
            expect(await page.evaluate(() => {
              const primary = document.querySelector('.app-loader')!.getBoundingClientRect();
              return [...document.querySelectorAll('.app-loader-theme-motif, .app-loader-theme-particle')].filter(el => getComputedStyle(el).display !== 'none').every(el => {
                const r = el.getBoundingClientRect();
                return r.right <= primary.left || r.left >= primary.right || r.bottom <= primary.top || r.top >= primary.bottom;
              });
            })).toBe(true);
          } else await expect(decoration).toHaveCount(0);
          if (theme.id === 'womens-month') await expect(loader.locator('.app-loader-route span')).toHaveCSS('background-color', 'rgb(124, 58, 237)');
          await expect(loader.getByRole('heading', { name: 'Records Management System' })).toBeVisible();
          await expect(loader.locator('.app-loader-folder-front')).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
        for (const weather of WEATHER_THEMES) {
          await switchTheme('weather-sync', weather);
          await expect(decoration).toHaveAttribute('data-loader-effect', `weather-${weather}`);
          await expect(decoration.locator('.app-loader-theme-motif svg').first()).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
      }
    }
    await switchTheme('womens-month');
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hrmdo-dts.appearance.effects-enabled', newValue: 'false' })));
    await expect(decoration).toHaveCount(0);
    await expect(loader.locator('.app-loader-route span')).toHaveCSS('background-color', 'rgb(124, 58, 237)');
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hrmdo-dts.appearance.effects-enabled', newValue: 'true' })));
    await expect(decoration).toHaveAttribute('data-loader-effect', 'womens-month');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const theme of Object.values(SYSTEM_THEMES).filter(theme => theme.effectId)) {
      await switchTheme(theme.id);
      await expect(decoration).toHaveAttribute('data-loader-effect', theme.effectId!);
      await expect(decoration.locator('.app-loader-theme-motif').first()).toBeVisible();
      await expect(page.locator('.app-loader-theme-particle:visible')).toHaveCount(0);
      expect(await page.locator('.app-loader-theme-particle').evaluateAll(elements => elements.every(el => getComputedStyle(el).animationName === 'none'))).toBe(true);
    }
    for (const weather of WEATHER_THEMES) {
      await switchTheme('weather-sync', weather);
      await expect(decoration).toHaveAttribute('data-loader-effect', `weather-${weather}`);
      await expect(decoration.locator('.app-loader-theme-motif svg').first()).toBeVisible();
      await expect(page.locator('.app-loader-theme-particle:visible')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally { release(); }
});
