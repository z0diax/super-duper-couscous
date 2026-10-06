import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';
import { SYSTEM_THEMES } from '../../src/theme/themeRegistry';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18784); });
test.afterAll(async () => { await fixture?.stop(); });

test('sidebar motifs and controls follow every system theme, appearance, and effects preference', async ({ page }) => {
  const admin = await new Client(fixture.base).login();
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const aside = page.locator('aside.app-sidebar');
  const active = page.locator('#sidebar-link-dashboard');
  const register = page.locator('#btn-sidebar-register-doc');
  await expect(active).toBeVisible();

  for (const theme of Object.values(SYSTEM_THEMES).filter(theme => theme.enabled && theme.id !== 'weather-sync')) {
    const setting = await admin.request('settings.php', 'PUT', { theme: theme.id });
    await page.evaluate(value => {
      const channel = new BroadcastChannel('hrmdo-theme');
      channel.postMessage(value);
      channel.close();
    }, setting);
    await expect(page.locator('html')).toHaveAttribute('data-system-theme', theme.id);
    if (theme.effectId) await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', theme.effectId);
    if (theme.effectId) {
      await expect(page.locator('[data-nav-effect]')).toHaveAttribute('data-nav-effect', theme.effectId);
      if (theme.id !== 'valentine') await expect(page.locator('[data-nav-effect] svg')).toHaveCount(2);
    } else {
      await expect(page.locator('[data-nav-effect]')).toHaveCount(0);
      await expect(aside.locator('.sidebar-theme-decoration')).toHaveCount(0);
    }

    await expect.poll(() => page.evaluate(() => {
      const root = document.documentElement;
      const sample = document.createElement('div');
      sample.style.backgroundColor = 'var(--app-primary-hover)';
      document.body.appendChild(sample);
      const expectedActive = getComputedStyle(sample).backgroundColor;
      sample.style.backgroundColor = 'var(--app-primary)';
      const expectedPrimary = getComputedStyle(sample).backgroundColor;
      sample.remove();
      return {
        active: getComputedStyle(document.querySelector('#sidebar-link-dashboard')!).backgroundColor === expectedActive,
        primary: getComputedStyle(document.querySelector('#btn-sidebar-register-doc')!).backgroundColor === expectedPrimary,
        appearance: root.dataset.appearance,
      };
    })).toMatchObject({ active: true, primary: true });
  }

  await page.evaluate(() => {
    const channel = new BroadcastChannel('hrmdo-theme');
    channel.postMessage({ theme: 'weather-sync', effectiveWeatherTheme: 'rainy', revision: 999999, updatedAt: null, weatherUpdatedAt: null });
    channel.close();
  });
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'weather-rainy');
  await page.evaluate(() => {
    const channel = new BroadcastChannel('hrmdo-theme');
    channel.postMessage({ theme: 'weather-sync', effectiveWeatherTheme: 'cloudy', revision: 1000000, updatedAt: null, weatherUpdatedAt: null });
    channel.close();
  });
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'weather-cloudy');

  await page.locator('#btn-persona-switcher').click();
  await page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(aside.locator('.sidebar-theme-decoration')).toBeVisible();
  await page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'Off' }).click();
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveCount(0);
  await expect(active).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(register).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'On' }).click();
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'weather-cloudy');

  await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 500, y: 500 } });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(aside).toHaveClass(/-translate-x-full/);
  await page.locator('#btn-open-sidebar-menu').click();
  await expect(aside).toBeVisible();
  expect(await aside.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('#sidebar-link-registry').click();
  await expect(aside).toHaveClass(/-translate-x-full/);
});
