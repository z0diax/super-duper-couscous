import { test, expect } from '@playwright/test';
import { startFixture, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18774); });
test.afterAll(async () => { await fixture?.stop(); });

test('leave intake switches to EWP and registers the requested fields', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Leave Records', exact: true }).click();
  await page.getByRole('button', { name: 'Register Leave or EWP' }).click();
  await expect(page.getByText('1. Leave Intake Mode')).toBeVisible();
  await page.getByRole('button', { name: /EWP Record/ }).click();
  await page.locator('#leave-input-barcode').fill('EWP-BROWSER-001');
  await page.locator('#leave-input-applicant').fill('Browser Employee');
  await page.locator('#leave-select-office').selectOption({ index: 1 });
  await page.locator('#ewp-input-amount').fill('1750.50');
  await expect(page.locator('#ewp-input-amount')).toHaveValue('1,750.50');
  await page.locator('#ewp-input-purpose').fill('Medical assistance');
  await page.getByRole('textbox', { name: 'Remarks' }).fill('Submitted complete requirements');
  await page.getByRole('button', { name: 'Register EWP Record', exact: true }).click();
  await expect(page.getByRole('tab', { name: /EWP Records/ })).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('Leave Registry')).toHaveCount(0);
  await expect(page.getByText('EWP-BROWSER-001')).toBeVisible();
  await expect(page.getByText('Browser Employee')).toBeVisible();
  await expect(page.getByText('Medical assistance')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: /EWP Records/ })).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('EWP-BROWSER-001')).toBeVisible();
  await page.screenshot({ path: 'test-results/leave-ewp-registry.png', fullPage: true });
});
