import { test, expect, type Page } from '@playwright/test';
import { startFixture, Client } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18794); });
test.afterAll(async () => { await fixture?.stop(); });

async function openWinter(page: Page) {
  const admin = await new Client(fixture.base).login();
  const setting = await admin.request('settings.php', 'PUT', { theme: 'winter' });
  await page.context().addCookies(admin.cookie.split('; ').map((cookie: string) => {
    const i = cookie.indexOf('='); return { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: fixture.base + '/' };
  }));
  const time = new Date('2026-12-10T12:00:00+08:00');
  await page.clock.install({ time }); await page.clock.pauseAt(time);
  await page.addInitScript(value => {
    sessionStorage.setItem('hrmdo.initial-loader-shown', '1');
    localStorage.setItem('hrmdo-dts.theme-state.v1', JSON.stringify(value));
    Math.random = () => .5;
  }, setting);
  await page.goto(fixture.base + '/');
  await expect(page.locator('.app-content > header [data-nav-effect]')).toHaveAttribute('data-nav-effect', 'winter');
  return admin;
}
async function effects(page: Page, enabled: boolean) {
  await page.evaluate(value => window.dispatchEvent(new StorageEvent('storage', { key: 'hrmdo-dts.appearance.effects-enabled', newValue: String(value) })), enabled);
}
async function theme(page: Page, value: string, revision: number) {
  await page.evaluate(({ value, revision }) => {
    const channel = new BroadcastChannel('hrmdo-theme');
    channel.postMessage({ theme: value, effectiveWeatherTheme: value === 'weather-sync' ? 'winter' : null, revision, updatedAt: null, weatherUpdatedAt: null }); channel.close();
  }, { value, revision });
}

test('Winter fly-by waits, animates internally, exits, and repeats without restarting snow', async ({ page }) => {
  await openWinter(page);
  const santa = page.locator('[data-winter-santa]');
  const field = page.locator('.app-content > header [data-nav-effect]');
  const snow = await field.locator('.theme-effect-particle--snow').first().elementHandle();
  await expect(field.locator('.winter-nav-motif')).toHaveCount(2);
  await expect(santa).toHaveCount(0);
  await page.clock.runFor(11_499); await expect(santa).toHaveCount(0);
  await page.clock.runFor(1); await expect(santa).toHaveCount(1);
  await expect(santa).toHaveAttribute('aria-hidden', 'true');
  await expect(santa).toHaveCSS('pointer-events', 'none');
  await expect(santa.locator('svg')).toHaveAttribute('focusable', 'false');
  await expect(santa.locator('.winter-santa-reindeer')).toHaveCount(3);
  await expect(santa.locator('.winter-santa-glint')).toHaveCount(4);
  const sample = await santa.evaluate(el => {
    const crossing = el.getAnimations().find(a => (a as CSSAnimation).animationName === 'winter-santa-crossing')!;
    crossing.pause(); crossing.currentTime = 0;
    const initial = el.getBoundingClientRect();
    crossing.currentTime = 9000;
    const final = el.getBoundingClientRect();
    crossing.currentTime = 4300;
    const parts = ['.winter-santa-legs--front', '.winter-santa-legs--rear', '.winter-santa-deer-head', '.winter-santa-sleigh', '.winter-santa-character', '.winter-santa-hat', '.winter-santa-beard', '.winter-santa-glint'];
    const moving = parts.map(selector => {
      const part = el.querySelector(selector)!;
      const animation = part.getAnimations()[0]; animation.pause(); animation.currentTime = 100;
      const first = getComputedStyle(part).transform + getComputedStyle(part).opacity;
      animation.currentTime = 450;
      return first !== getComputedStyle(part).transform + getComputedStyle(part).opacity;
    });
    const front = new DOMMatrix(getComputedStyle(el.querySelector('.winter-santa-legs--front')!).transform);
    const rear = new DOMMatrix(getComputedStyle(el.querySelector('.winter-santa-legs--rear')!).transform);
    return { startRight: initial.right, fieldLeft: el.parentElement!.getBoundingClientRect().left, endLeft: final.left, viewport: innerWidth, moving, opposingLegs: front.b * rear.b < 0 };
  });
  expect(sample.startRight).toBeLessThan(sample.fieldLeft);
  expect(sample.endLeft).toBeGreaterThanOrEqual(sample.viewport);
  expect(sample.moving.every(Boolean)).toBe(true);
  expect(sample.opposingLegs).toBe(true);
  await page.screenshot({ path: 'test-results/winter-santa-desktop.png' });
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications', exact: true }).click();
  expect(await snow!.evaluate(el => el.isConnected)).toBe(true);
  await page.clock.runFor(9_000); await expect(santa).toHaveCount(0);
  await page.clock.runFor(32_499); await expect(santa).toHaveCount(0);
  await page.clock.runFor(1); await expect(santa).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('theme changes and effects preferences cancel and restart the initial delay', async ({ page }) => {
  await openWinter(page);
  const santa = page.locator('[data-winter-santa]');
  await page.clock.runFor(5_000);
  await theme(page, 'classic', 1000);
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'classic');
  await page.clock.runFor(20_000); await expect(santa).toHaveCount(0);
  await theme(page, 'winter', 1001);
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'winter');
  await page.clock.runFor(11_500); await expect(santa).toHaveCount(1);
  await effects(page, false); await expect(santa).toHaveCount(0);
  await page.clock.runFor(60_000); await expect(santa).toHaveCount(0);
  await effects(page, true); await expect(santa).toHaveCount(0);
  await page.clock.runFor(11_500); await expect(santa).toHaveCount(1);
  await theme(page, 'weather-sync', 1002);
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'weather-sync');
  await page.clock.runFor(60_000); await expect(santa).toHaveCount(0);
});

test('reduced motion and crowded mobile headers suppress Santa; tablet resumes safely', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWinter(page);
  const santa = page.locator('[data-winter-santa]');
  await page.clock.runFor(60_000); await expect(santa).toHaveCount(0);
  await expect(page.locator('.app-content > header .winter-nav-motif')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.runFor(60_000); await expect(santa).toHaveCount(0);
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.clock.runFor(11_500); await expect(santa).toHaveCount(1);
  await expect(santa).toHaveCSS('width', '240px');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(santa).toHaveCount(0);
  await page.clock.runFor(60_000); await expect(santa).toHaveCount(0);
});
