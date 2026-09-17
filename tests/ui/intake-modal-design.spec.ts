import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';

let fixture: any;

test.beforeAll(async () => {
  fixture = await startFixture(18771);
  const admin = await new Client(fixture.base).login();
  const adminUser = admin.state.users.find((user: any) => user.role === 'admin');
  const phase = (stepNumber: number, name: string, requiredAction: string, extra = {}) => ({
    stepNumber, name, description: `${name} instructions`, assigneeType: 'Person',
    assigneeUserId: adminUser.id, assigneeName: adminUser.name, slaHours: 24,
    requiredAction, allowReturn: true, requiresAttachment: false, ...extra,
  });
  await admin.action('createWorkflowTemplate', [{
    title: 'Payroll intake workflow', description: 'Shared payroll route',
    classification: 'Payroll', documentType: 'Salary', employmentClassification: 'All', isActive: true,
    steps: [
      phase(1, 'Docketing', 'Receive'),
      phase(2, 'Initial Checking', 'Verify & Process'),
      phase(3, 'Verification & Signing', 'Approve & Sign', { payrollAssignmentSource: 'employment_routing' }),
      phase(4, 'Release', 'Release & Archive'),
    ],
  }]);
  await admin.action('createWorkflowTemplate', [{
    title: 'Searchable document workflow', description: 'Search results fixture',
    classification: 'Communication', documentType: 'Office Order', isActive: true,
    steps: [phase(1, 'Records Review', 'Verify & Process')],
  }]);
  for (const [barcode, title] of [['SEARCH-DOC-001', 'Shared keyword first document'], ['SEARCH-DOC-002', 'Shared keyword second document']]) {
    await admin.action('registerDocument', [{
      title, subject: title, sourceType: 'Internal', sourceOffice: 'HRMDO', senderName: 'Records Unit',
      classification: 'Communication', documentType: 'Office Order', priority: 'Routine', description: '', barcode, files: [],
    }]);
  }
  await admin.action('registerPayrollBatch', [{
    office: 'HRMDO', payrollType: 'Salary', batchBarcode: 'PB-SEARCH-001',
    remarks: 'Searchable browser payroll batch', files: [],
    items: [{ barcode: 'PAY-SEARCH-ITEM-001', office: 'HRMDO', title: 'Searchable payroll item', classificationType: 'Salary' }],
  }]);
});
test.afterAll(async () => { await fixture?.stop(); });

test('document and payroll intake use the same modal design system', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.locator('#btn-dash-register-new').click();
  const documentDialog = page.getByRole('dialog', { name: 'Register Incoming Document' });
  await expect(documentDialog).toBeVisible();
  const documentHeaderColor = await documentDialog.locator('header').evaluate(element => getComputedStyle(element).backgroundColor);
  await expect(documentDialog.locator('footer')).toBeInViewport();
  await page.screenshot({ path: 'test-results/document-intake-modal.png' });
  await page.getByRole('button', { name: 'Close document intake' }).click();

  await page.getByRole('button', { name: /^Payroll Management/ }).click();
  await page.getByRole('button', { name: 'Register Payroll', exact: true }).click();
  const payrollDialog = page.getByRole('dialog', { name: 'Register Incoming Payroll' });
  await expect(payrollDialog).toBeVisible();
  const payrollHeaderColor = await payrollDialog.locator('header').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(payrollHeaderColor).toBe(documentHeaderColor);
  await expect(payrollDialog.locator('footer')).toBeInViewport();
  await expect(payrollDialog.getByText('1. Payroll Entry Mode')).toBeVisible();
  await expect(payrollDialog.getByText('Configured phase preview')).toHaveCount(0);
  await payrollDialog.getByRole('button', { name: 'Show payroll workflow' }).click();
  const workflowDialog = page.getByRole('dialog', { name: 'Payroll intake workflow' });
  await expect(workflowDialog).toBeVisible();
  await expect(workflowDialog.getByRole('heading', { name: 'Verification & Signing' })).toBeVisible();
  await workflowDialog.getByRole('button', { name: 'Close payroll workflow' }).click();
  await page.screenshot({ path: 'test-results/payroll-intake-modal.png' });
  await payrollDialog.getByRole('button', { name: /Payroll Batch Entry/ }).click();
  await expect(payrollDialog.getByText('Batch Items Form')).toBeVisible();
  await expect(payrollDialog.getByText('Configured Payroll Workflow:')).toHaveCount(0);
  await payrollDialog.getByRole('button', { name: 'Show payroll workflow' }).click();
  await expect(page.getByRole('dialog', { name: 'Payroll intake workflow' })).toBeVisible();
  await page.screenshot({ path: 'test-results/payroll-batch-intake-modal.png' });
});

test('global search opens payroll batches by batch and item barcode', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const search = page.locator('#header-quick-search-input');
  await search.fill('PB-SEARCH-001');
  await page.locator('#btn-header-quick-search').click();
  const batchDialog = page.getByRole('dialog', { name: 'Payroll batch details' });
  await expect(batchDialog).toBeVisible();
  await expect(batchDialog.getByRole('heading', { name: 'PB-SEARCH-001' })).toBeVisible();
  await batchDialog.getByRole('button', { name: 'Close payroll batch' }).click();

  await search.fill('PAY-SEARCH-ITEM-001');
  await page.locator('#btn-header-quick-search').click();
  await expect(batchDialog).toBeVisible();
  await expect(batchDialog.getByText('PAY-SEARCH-ITEM-001', { exact: true })).toBeVisible();
  await batchDialog.getByRole('button', { name: 'Close payroll batch' }).click();

  await search.fill('Searchable');
  await page.locator('#btn-header-quick-search').click();
  const resultsDialog = page.getByRole('dialog', { name: 'Results for “Searchable”' });
  await expect(resultsDialog).toBeVisible();
  await expect(resultsDialog.getByText('PB-SEARCH-001', { exact: true })).toBeVisible();
  await expect(resultsDialog.getByText('PAY-SEARCH-ITEM-001', { exact: true })).toBeVisible();
  await expect(batchDialog).toHaveCount(0);
  await resultsDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await search.fill('Shared keyword');
  await page.locator('#btn-header-quick-search').click();
  const documentResults = page.getByRole('dialog', { name: 'Results for “Shared keyword”' });
  await expect(documentResults).toBeVisible();
  await expect(documentResults.getByText('SEARCH-DOC-001', { exact: true })).toBeVisible();
  await expect(documentResults.getByText('SEARCH-DOC-002', { exact: true })).toBeVisible();
  await expect(documentResults.getByText('2 matching records', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/global-search-results.png' });
  await documentResults.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Document Registry', exact: true }).click();
  await expect(page.locator('#registry-search-input')).toHaveCount(0);
  await page.getByRole('button', { name: /^Payroll Management/ }).click();
  await expect(page.getByPlaceholder('Search barcode, office...')).toHaveCount(0);
  await expect(page.locator('#header-quick-search-input')).toBeVisible();
});
