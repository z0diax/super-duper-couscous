import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';
import { SYSTEM_THEMES } from '../../src/theme/themeRegistry';
import { WEATHER_THEMES } from '../../src/theme/themeTypes';
import type { SystemThemeId, WeatherTheme } from '../../src/theme/themeTypes';
import { THEME_LOADER_CONTENT, WEATHER_LOADER_CONTENT, resolveLoaderContentPool, selectLoaderContent } from '../../src/theme/themeLoaderContent';

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
  const selected = await page.locator('.app-loader-content-text').textContent();
  try {
    await expect(loader).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
    expect(await loader.locator('.app-loader-document').first().evaluate(el => getComputedStyle(el).animationName)).toBe('app-loader-file');
    expect(await loader.locator('.app-loader-folder-front').evaluate(el => getComputedStyle(el).animationName)).toBe('app-loader-float');
  } finally {
    releaseSession();
  }
  await expect(page.getByRole('status', { name: 'Opening Records Management System...' })).toBeVisible();
  await expect(page.locator('.app-loader-content-text')).toHaveText(selected!);
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
    await expect(page.locator('.app-loader-content')).toHaveCount(0);
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

test('initial content survives session, database, and opening status changes', async ({ page }) => {
  const admin = await new Client(fixture.base).login();
  await page.context().addCookies(admin.cookie.split('; ').map(cookie => {
    const separator = cookie.indexOf('=');
    return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: fixture.base + '/' };
  }));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  let releaseAuth!: () => void;
  let releaseState!: () => void;
  const auth = new Promise<void>(resolve => { releaseAuth = resolve; });
  const state = new Promise<void>(resolve => { releaseState = resolve; });
  await page.route('**/api/auth.php', async route => { await auth; await route.continue(); });
  await page.route('**/api/state.php', async route => { await state; await route.continue(); });
  try {
    await page.goto(`${fixture.base}/`);
    await expect(page.locator('.app-loader-message')).toHaveText('Checking your login session...');
    const selected = await page.locator('.app-loader-content-text').textContent();
    releaseAuth();
    await expect(page.locator('.app-loader-message')).toHaveText('Connecting to the application database...');
    await expect(page.locator('.app-loader-content-text')).toHaveText(selected!);
    releaseState();
    await expect(page.locator('.app-loader-message')).toHaveText('Opening Records Management System...');
    await expect(page.locator('.app-loader-content-text')).toHaveText(selected!);
    await page.clock.runFor(5000);
    await expect(page.locator('.app-loader-screen')).toHaveClass(/app-loader-exiting/);
    await page.clock.runFor(360);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  } finally { releaseAuth(); releaseState(); }
});

test('content helpers cover every theme and weather state with deterministic selection', () => {
  for (const [theme, pool] of Object.entries(THEME_LOADER_CONTENT)) {
    expect(pool.length).toBeGreaterThanOrEqual(8);
    expect(pool.length).toBeLessThanOrEqual(12);
    expect(resolveLoaderContentPool(theme as SystemThemeId, null)).toBe(pool);
    pool.forEach((entry, index) => {
      expect(entry.text.length).toBeLessThanOrEqual(85);
      expect(selectLoaderContent(pool, () => (index + .5) / pool.length)).toBe(entry);
    });
  }
  for (const weather of WEATHER_THEMES) {
    const pool = resolveLoaderContentPool('weather-sync', weather);
    expect(pool).toBe(WEATHER_LOADER_CONTENT[weather]);
    expect(pool.length).toBeGreaterThanOrEqual(5);
    expect(pool.length).toBeLessThanOrEqual(8);
  }
  expect(WEATHER_LOADER_CONTENT.rainy).toBe(THEME_LOADER_CONTENT['rainy-season']);
  expect(WEATHER_LOADER_CONTENT.winter).toBe(THEME_LOADER_CONTENT.winter);
  expect(resolveLoaderContentPool('weather-sync', null)).toBe(THEME_LOADER_CONTENT.classic);
});

const contentCases: { theme: SystemThemeId; weather: WeatherTheme | null }[] = [
  { theme: 'classic', weather: null },
  { theme: 'hallo-christmas', weather: null },
  { theme: 'womens-month', weather: null },
  { theme: 'chinese-new-year', weather: null },
  ...WEATHER_THEMES.map(weather => ({ theme: 'weather-sync' as const, weather })),
];

for (const { theme, weather } of contentCases) {
  test(`startup content uses ${theme}/${weather ?? 'seasonal'} and stays stable`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    // Stub startup requests: Weather Sync never uses live weather in these tests.
    await page.route('**/api/auth.php', route => route.fulfill({ json: { user: null } }));
    await page.route('**/api/settings.php*', route => route.fulfill({ json: { theme, effectiveWeatherTheme: weather, revision: 0 } }));
    await page.addInitScript(({ theme, weather }) => {
      localStorage.setItem('hrmdo-dts.theme-state.v1', JSON.stringify({ theme, effectiveWeatherTheme: weather, revision: 0 }));
      localStorage.setItem('hrmdo-dts.appearance.mode', 'light');
      const sample = Number(new URL(location.href).searchParams.get('loaderSample'));
      Math.random = () => sample;
    }, { theme, weather });
    const pool = resolveLoaderContentPool(theme, weather);
    for (const type of ['inspiration', 'trivia'] as const) {
      const index = pool.findIndex(entry => entry.type === type);
      if (index < 0) continue;
      await page.goto(`${fixture.base}/?loaderSample=${(index + .5) / pool.length}`);
      const content = page.locator('.app-loader-content');
      await expect(content).toHaveAttribute('data-content-type', type);
      await expect(content.locator('.app-loader-content-text')).toHaveText(pool[index].text);
      await expect(content.locator('.app-loader-content-label')).toHaveCount(type === 'trivia' ? 1 : 0);
      expect(await content.evaluate(el => !!el.closest('[aria-live], [role="status"]'))).toBe(false);
      await expect(page.locator('.app-loader-message')).toHaveText('Opening Records Management System...');
      expect(await content.evaluate(el => getComputedStyle(el).animationDelay)).toBe('0.6s');
      await page.clock.runFor(1000);
      await expect(content).toHaveCSS('opacity', '1');
      for (const appearance of ['light', 'dark']) {
        await page.evaluate(mode => window.dispatchEvent(new StorageEvent('storage', { key: 'hrmdo-dts.appearance.mode', newValue: mode })), appearance);
        await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(content).toBeVisible();
        const layout = await content.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const sample = document.createElement('span');
          sample.style.color = 'var(--app-text-muted)';
          el.appendChild(sample);
          const matchesMuted = style.color === getComputedStyle(sample).color;
          sample.remove();
          return { top: rect.top, bottom: rect.bottom, height: rect.height, lineHeight: parseFloat(style.lineHeight), width: document.documentElement.scrollWidth, matchesMuted };
        });
        expect(layout.width).toBeLessThanOrEqual(375);
        expect(layout.top).toBeGreaterThan(0);
        expect(layout.bottom).toBeLessThan(667);
        expect(layout.height).toBeLessThanOrEqual(layout.lineHeight * 2 + 1);
        expect(layout.matchesMuted).toBe(true);
        await expect(page.locator('.app-loader-title')).toBeVisible();
        await expect(page.locator('.app-loader-folder-front')).toBeVisible();
        await page.screenshot({ path: test.info().outputPath(`${type}-mobile-${appearance}.png`) });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(content).toHaveCSS('animation-name', 'none');
      await expect(content).toHaveCSS('opacity', '1');
      await page.evaluate(() => {
        const channel = new BroadcastChannel('hrmdo-theme');
        channel.postMessage({ theme: 'valentine', revision: 99999 });
        channel.close();
      });
      await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'valentine');
      await expect(content.locator('.app-loader-content-text')).toHaveText(pool[index].text);
      await page.clock.runFor(5000);
      await expect(content).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'System access' })).toBeVisible();
      await expect(content).toHaveCount(0);
      await page.evaluate(() => sessionStorage.removeItem('hrmdo.initial-loader-shown'));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    expect(errors).toEqual([]);
  });
}

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
