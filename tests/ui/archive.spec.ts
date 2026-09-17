import { test, expect } from '@playwright/test';
import { startFixture, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18773); });
test.afterAll(async () => { await fixture?.stop(); });

test('historical archive separates and searches its three read-only datasets', async ({ page }) => {
  await page.route('**/api/archive.php?*', async route => {
    const url = new URL(route.request().url());
    const table = url.searchParams.get('table');
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const records: Record<string, any[]> = {
      document: [{ id: 1, barcode: 'DOC-ARCHIVE-001', title: 'Archived office order', office: 'HRMDO', classification: 'Communication', status: 'Released', action_taken: 'Released', timestamp: '2024-02-10 09:00:00' }],
      ewp_records: [{ id: 2, barcode: 'EWP-ARCHIVE-001', employee_name: 'JUAN DELA CRUZ', office: 'HRMDO', amount: '1500.00', purpose: 'Medical assistance', status: 'Approved', created_timestamp: '2024-03-11 09:00:00' }],
      leave_requests: [{ id: 3, barcode: 'LEAVE-ARCHIVE-001', employee_name: 'MARIA SANTOS', office: 'HRMDO', type: 'Vacation Leave', subtype: '', subtype_detail: '', start_date: '2024-04-01', end_date: '2024-04-02', status: 'Released', created_timestamp: '2024-03-20 09:00:00' }],
    };
    const items = (records[table || 'document'] || []).filter(item => !query || JSON.stringify(item).toLowerCase().includes(query));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, counts: { document: 6996, ewp_records: 49, leave_requests: 6550 }, pagination: { page: 1, pageSize: 25, totalRecords: items.length, totalPages: 1 } }) });
  });
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Historical Archive', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Historical Archive' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Documents/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('DOC-ARCHIVE-001')).toBeVisible();
  await page.getByRole('tab', { name: /EWP Records/ }).click();
  await expect(page.getByText('EWP-ARCHIVE-001')).toBeVisible();
  await page.locator('#archive-search-input').fill('missing record');
  await expect(page.getByText('No matching records')).toBeVisible();
  await page.getByRole('tab', { name: /Leave Requests/ }).click();
  await expect(page.getByText('LEAVE-ARCHIVE-001')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: /Leave Requests/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('LEAVE-ARCHIVE-001')).toBeVisible();
  await page.screenshot({ path: 'test-results/historical-archive.png', fullPage: true });
});
