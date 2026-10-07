import { test, expect } from '@playwright/test';
import { startFixture, Client } from '../support.mjs';
import { HALLO_CHRISTMAS_LOADER_CONTENT } from '../../src/theme/themeLoaderContent';
import { HALLO_CHRISTMAS_MESSAGES } from '../../src/theme/halloChristmasPhase';
import type { HalloChristmasPhase } from '../../src/theme/themeTypes';

test.use({ timezoneId: 'Asia/Manila' });
let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18785); });
test.afterAll(async () => { await fixture?.stop(); });

for (const [phase, date] of [
  ['halloween', '2026-10-31T16:30:00+08:00'],
  ['remembrance', '2026-11-02T00:30:00+08:00'],
  ['christmas', '2026-11-03T00:30:00+08:00'],
] as [HalloChristmasPhase, string][]) {
  for (const reduced of [false, true]) {
    test(phase + ' agrees across startup, navbar, sidebar, and greeting; reduced=' + reduced, async ({ page }, testInfo) => {
      const admin = await new Client(fixture.base).login();
      const setting = await admin.request('settings.php', 'PUT', { theme: 'hallo-christmas' });
      await page.context().addCookies(admin.cookie.split('; ').map(cookie => {
        const split = cookie.indexOf('=');
        return { name: cookie.slice(0, split), value: cookie.slice(split + 1), url: fixture.base + '/' };
      }));
      await page.clock.install({ time: new Date(date) });
      await page.clock.pauseAt(new Date(date));
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await page.addInitScript(value => localStorage.setItem('hrmdo-dts.theme-state.v1', JSON.stringify(value)), setting);
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/api/auth.php', async route => {
        if (route.request().method() === 'GET') await held;
        await route.continue();
      });
      try {
        await page.goto(fixture.base + '/');
        const loader = page.locator('[data-loader-effect]');
        await expect(loader).toHaveAttribute('data-hallo-phase', phase);
        await expect(loader.locator('[data-hallo-art="' + phase + '"]')).toHaveCount(2);
        await expect(loader.locator('[data-hallo-art]:not([data-hallo-art="' + phase + '"])')).toHaveCount(0);
        if (!reduced) await page.screenshot({ path: testInfo.outputPath('seasonal-loader.png') });
        const selected = await page.locator('.app-loader-content-text').textContent();
        expect(HALLO_CHRISTMAS_LOADER_CONTENT[phase].some(entry => entry.text === selected)).toBe(true);
        if (reduced) {
          await expect(loader.locator('.app-loader-theme-particle:visible')).toHaveCount(0);
          expect(await loader.locator('.app-loader-theme-particle').evaluateAll(elements => elements.every(el => getComputedStyle(el).animationName === 'none'))).toBe(true);
        }
        release();
        await expect(page.locator('.app-loader-message')).toHaveText('Opening Records Management System...');
        await expect(page.locator('.app-loader-content-text')).toHaveText(selected!);
        await page.clock.runFor(5000);
        if (!reduced) await expect(page.locator('.app-loader-screen')).toHaveClass(/app-loader-exiting/);
        await page.clock.runFor(360);
        await expect(page.locator('[data-nav-effect]')).toBeVisible();
        await page.clock.runFor(320);
        const navbar = page.locator('[data-nav-effect]');
        const sidebar = page.locator('[data-sidebar-effect]');
        await expect(navbar).toHaveAttribute('data-hallo-phase', phase);
        await expect(sidebar).toHaveAttribute('data-hallo-phase', phase);
        await expect(navbar.locator('[data-hallo-art="' + phase + '"]')).toHaveCount(2);
        await expect(sidebar.locator('[data-hallo-art="' + phase + '"]')).toHaveCount(1);
        await expect(page.locator('[data-hallo-art]:not([data-hallo-art="' + phase + '"])')).toHaveCount(0);
        const brand = page.locator('aside [role="group"][aria-label="HRMDO Records Management System"]');
        await expect(brand).toContainText('Records Management System');
        if (reduced) {
          await expect(navbar.locator('.theme-effect-particle')).toHaveCount(0);
          await expect(brand.locator('.brand-type-cursor')).toHaveCount(0);
        } else {
          await page.clock.runFor(15000);
          await expect(brand).toContainText(HALLO_CHRISTMAS_MESSAGES[phase].title);
          await expect(brand).toContainText(HALLO_CHRISTMAS_MESSAGES[phase].subtitle);
          expect(await brand.locator('p').nth(1).evaluate(el => el.scrollHeight <= el.clientHeight + 2)).toBe(true);
          expect(await brand.locator('p').nth(2).evaluate(el => el.scrollHeight <= el.clientHeight + 2)).toBe(true);
          await page.screenshot({ path: testInfo.outputPath('seasonal-greeting.png') });
          await page.clock.runFor(10000);
          await expect(brand).toContainText('Records Management System');
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#btn-open-sidebar-menu').click();
        expect(await page.locator('aside').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hrmdo-dts.appearance.effects-enabled', newValue: 'false' })));
        await expect(navbar).toHaveCount(0);
        await expect(sidebar).toHaveCount(0);
        await expect(brand).toContainText('Records Management System');
      } finally { release(); }
    });
  }
}
