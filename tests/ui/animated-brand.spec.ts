import { test, expect } from '@playwright/test';
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
  await expect(brand).toContainText('Breast Cancer Awareness Month', { timeout: 20000 });
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
  await expect(brand).not.toContainText('Breast Cancer Awareness Month');
  await expect(brand.locator('.brand-type-cursor')).toHaveCount(0);
  await switchTheme('breast-cancer-awareness');
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'breast-cancer-awareness');
  await expect(brand).toContainText('Records Management System');

  await page.locator('#btn-persona-switcher').click();
  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'Off' }).click();
  await expect(brand).toContainText('Records Management System');
  await expect(brand).not.toContainText('Breast Cancer Awareness Month');
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
  await expect(brand).toContainText('Breast Cancer Awareness Month', { timeout: 20000 });
  const titleFits = await brand.locator('p').nth(1).evaluate(element => element.scrollHeight <= element.clientHeight);
  expect(titleFits).toBe(true);
  expect(await page.locator('aside').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
