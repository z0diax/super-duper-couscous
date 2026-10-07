import { test, expect } from '@playwright/test';
import { SYSTEM_THEMES } from '../../src/theme/themeRegistry';
import type { SystemThemeId } from '../../src/theme/themeTypes';
import { startFixture, testPassword, Client } from '../support.mjs';

let fixture: any;
test.beforeAll(async () => { fixture = await startFixture(18779); });
test.afterAll(async () => { await fixture?.stop(); });

test('sidebar brand follows the theme, effects setting, reduced motion, and mobile layout', async ({ page }) => {
  const admin = await new Client(fixture.base).login();
  await admin.request('settings.php', 'PUT', { theme: 'breast-cancer-awareness' });
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const brand = page.locator('aside [role="group"][aria-label="HRMDO Records Management System"]');
  const header = page.locator('aside > div').first();
  await expect(brand).toContainText('Records Management System');
  const normalGap = await brand.locator('p').evaluateAll(lines =>
    lines[2].getBoundingClientRect().top - lines[1].getBoundingClientRect().bottom,
  );
  expect(normalGap).toBeLessThanOrEqual(4);
  const topInset = await brand.locator('p').first().evaluate(element =>
    element.getBoundingClientRect().top - element.closest('aside')!.firstElementChild!.getBoundingClientRect().top,
  );
  expect(topInset).toBeGreaterThanOrEqual(8);
  const height = await header.evaluate(element => element.getBoundingClientRect().height);
  await expect(brand).toContainText('Together, let us raise awareness and inspire hope.', { timeout: 20000 });
  expect(await header.evaluate(element => element.getBoundingClientRect().height)).toBe(height);

  // The provider receives the same revisioned broadcast used by another open tab.
  const switchTheme = async (theme: string) => {
    const setting = await admin.request('settings.php', 'PUT', { theme });
    await page.evaluate(value => {
      const channel = new BroadcastChannel('hrmdo-theme');
      channel.postMessage(value);
      channel.close();
    }, setting);
  };
  await switchTheme('classic');
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'classic');
  await expect(brand).toContainText('Records Management System');
  await expect(brand).not.toContainText('Together, let us raise awareness and inspire hope.');
  await expect(brand.locator('.brand-type-cursor')).toHaveCount(0);
  await switchTheme('breast-cancer-awareness');
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'breast-cancer-awareness');
  await expect(brand).toContainText('Records Management System');

  await page.locator('#btn-persona-switcher').click();
  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'Off' }).click();
  await expect(brand).toContainText('Records Management System');
  await expect(brand).not.toContainText('Together, let us raise awareness and inspire hope.');
  await expect(brand.locator('.brand-type-cursor')).toHaveCount(0);

  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'On' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(brand).toContainText('Records Management System');
  await expect(brand.locator('.brand-type-cursor')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('aside')).toHaveClass(/-translate-x-full/);
  await page.locator('#btn-open-sidebar-menu').click();
  await expect(brand).toBeVisible();
  await expect(brand).toContainText('Records Management System');
  expect(await header.evaluate(element => element.getBoundingClientRect().height)).toBe(height);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(brand).toContainText('Together, let us raise awareness and inspire hope.', { timeout: 20000 });
  await expect(brand).toContainText('Supporting every fighter, survivor, and family touched by breast cancer.', { timeout: 10000 });
  const titleFits = await brand.locator('p').nth(1).evaluate(element => element.scrollHeight <= element.clientHeight + 2);
  expect(titleFits).toBe(true);
  expect(await page.locator('aside').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});


const greetings = [
  { id: 'valentine', title: 'Happy Valentine\u2019s Day!', subtitle: 'Wishing you a day filled with kindness, appreciation, and love.' },
  { id: 'womens-month', title: 'Happy National Women\u2019s Month!', subtitle: 'Celebrating the strength, achievements, and contributions of every woman.' },
  { id: 'breast-cancer-awareness', title: 'Together, let us raise awareness and inspire hope.', subtitle: 'Supporting every fighter, survivor, and family touched by breast cancer.' },
  { id: 'amihan-bloom', title: 'Wishing you a fresh and wonderful day!', subtitle: 'May this season bring renewed energy and brighter days ahead.' },
  { id: 'winter', title: 'Warm wishes this season!', subtitle: 'May your days be filled with warmth, peace, and happiness.' },
  { id: 'chinese-new-year', title: 'Happy Chinese New Year!', subtitle: 'May the new year bring prosperity, happiness, and good fortune.' },
  { id: 'festive', title: 'Warm wishes for a joyful festive season!', subtitle: 'May this season bring happiness, gratitude, and togetherness.' },
  { id: 'rainy-season', title: 'Stay safe this rainy season!', subtitle: 'Take care, stay prepared, and look out for one another.' },
] as const;

test('registry uses the required seasonal copy and retains themes without messages', () => {
  for (const { id, title, subtitle } of greetings) expect(SYSTEM_THEMES[id].brandMessage).toEqual({ title, subtitle });
  for (const id of ['classic', 'government', 'weather-sync'] as const) expect(SYSTEM_THEMES[id].brandMessage).toBeUndefined();
});

for (const width of [1440, 390]) {
  test('every seasonal greeting fits and restores normal branding at width ' + width, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const admin = await new Client(fixture.base).login();
    await admin.request('settings.php', 'PUT', { theme: 'classic' });
    await page.context().addCookies(admin.cookie.split('; ').map(cookie => {
      const separator = cookie.indexOf('=');
      return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: fixture.base + '/' };
    }));
    await page.goto(fixture.base + '/');
    await expect(page.locator('.app-loader-message')).toHaveText('Opening Records Management System...');
    await page.clock.runFor(5000);
    await expect(page.locator('.app-loader-screen')).toHaveClass(/app-loader-exiting/);
    await page.clock.runFor(360);
    await expect(page.locator('aside')).toBeAttached();
    await page.clock.runFor(320);
    if (width === 390) await page.locator('#btn-open-sidebar-menu').click();
    const brand = page.locator('aside [role="group"][aria-label="HRMDO Records Management System"]');
    const header = page.locator('aside > div').first();
    const originalHeight = await header.evaluate(el => el.getBoundingClientRect().height);
    let revision = 1000000;
    const switchTheme = async (theme: SystemThemeId) => {
      await page.evaluate(value => {
        const channel = new BroadcastChannel('hrmdo-theme');
        channel.postMessage(value);
        channel.close();
      }, { theme, revision: ++revision });
      await expect(page.locator('html')).toHaveAttribute('data-system-theme', theme);
    };
    for (const { id, title, subtitle } of greetings) {
      await switchTheme(id);
      await expect(brand).toContainText('Records Management System');
      await page.clock.runFor(15000);
      await expect(brand).toContainText(title);
      await expect(brand).toContainText(subtitle);
      // Allow two pixels for browser font ink rounding, but reject an extra clipped line.
      for (const line of [1, 2]) {
        const dimensions = await brand.locator('p').nth(line).evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight }));
        expect(dimensions.scroll, id + ' line ' + line).toBeLessThanOrEqual(dimensions.client + 2);
      }
      expect(await header.evaluate(el => el.getBoundingClientRect().height)).toBe(originalHeight);
      expect(await page.locator('aside').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (['breast-cancer-awareness', 'womens-month', 'chinese-new-year'].includes(id)) {
        await page.screenshot({ path: testInfo.outputPath(id + '.png') });
      }
      await page.clock.runFor(12000);
      await expect(brand).toContainText('Records Management System');
      await expect(brand).toContainText('Records \u00b7 Workflow \u00b7 Archives');
    }
    for (const id of ['classic', 'government', 'weather-sync'] as const) {
      await switchTheme(id);
      await page.clock.runFor(15000);
      await expect(brand).toContainText('Records Management System');
      await expect(brand.locator('.brand-type-cursor')).toHaveCount(0);
    }
  });
}
