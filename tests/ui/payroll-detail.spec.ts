import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
let batchId: string;
let pooledDocumentTracking: string;

test.beforeAll(async () => {
  fixture = await startFixture(18768);
  const admin = await new Client(fixture.base).login();
  const adminUser = admin.state.users.find((user: any) => user.role === 'admin');
  const addProcessor = async (name: string) => (await admin.action('addUser', [{
    name, email: `${name.toLowerCase()}@example.test`, password: testPassword,
    role: 'processor', roleTitle: 'Management Division', office: 'HRMDO',
    division: 'Management Division', position: 'Payroll Officer',
  }])).result;
  const jun = await addProcessor('Jun');
  const reymart = await addProcessor('Reymart');
  const miguel = await addProcessor('Miguel');
  const phase = (stepNumber: number, name: string, requiredAction: string, extra = {}) => ({
    stepNumber, name, description: '', assigneeType: 'Person', assigneeUserId: adminUser.id,
    assigneeName: adminUser.name, slaHours: 24, requiredAction,
    allowHold: true, allowReturn: true, requiresAttachment: false, ...extra,
  });
  await admin.action('createWorkflowTemplate', [{
    title: 'Payroll detail browser workflow', description: '', classification: 'Payroll',
    documentType: 'Salary', employmentClassification: 'All', isActive: true,
    steps: [
      phase(1, 'Intake', 'Receive'),
      phase(2, 'Sorting', 'Verify & Process'),
      phase(3, 'Verification & Signing', 'Approve & Sign', { payrollAssignmentSource: 'employment_routing' }),
      phase(4, 'Release', 'Release & Archive'),
    ],
  }]);
  await admin.action('createWorkflowTemplate', [{
    title: 'Communication personnel pool workflow', description: '', classification: 'Communication',
    documentType: 'Office Order', documentTypes: ['Office Order'], isActive: true,
    steps: [
      phase(1, 'Document Intake', 'Receive'),
      phase(2, 'Records Review', 'Verify & Process', { assignmentSource: 'personnel_pool', personnelPoolUserIds: [adminUser.id, jun.id] }),
      phase(3, 'Final Review', 'Review & Recommend', { assignmentSource: 'personnel_pool', personnelPoolUserIds: [jun.id, reymart.id] }),
    ],
  }]);
  const pooledDocument = (await admin.action('registerDocument', [{
    title: 'Personnel pool browser document', subject: 'Routing test', sourceType: 'Internal',
    sourceOffice: 'HRMDO', senderName: 'Records Unit', classification: 'Communication',
    documentType: 'Office Order', priority: 'Routine', description: '', barcode: 'POOL-BROWSER-001', files: [], initialAssigneeId: adminUser.id,
  }])).result;
  pooledDocumentTracking = pooledDocument.trackingNumber;
  const jowRule = admin.state.employmentRoutingRules.find((rule: any) => rule.classification === 'JOW/COS');
  const regularRule = admin.state.employmentRoutingRules.find((rule: any) => rule.classification === 'Regular');
  await admin.action('updateEmploymentRoutingRule', [{
    ...jowRule, assignmentMode: 'pool', eligibleProcessorIds: [jun.id, reymart.id],
  }]);
  await admin.action('updateEmploymentRoutingRule', [{
    ...regularRule, assignmentMode: 'fixed', primaryProcessorId: miguel.id,
  }]);
  const batch = (await admin.action('registerPayrollBatch', [{
    office: 'HRMDO - Human Resource Management and Development Office', payrollType: 'Salary',
    batchBarcode: 'PAYROLL-DETAIL-001', files: [], items: [
      { title: 'SANTOS, MARIA ET AL.', barcode: 'DETAIL-JOW-JUN', classificationType: 'Salary' },
      { title: 'CRUZ, ANA ET AL.', barcode: 'DETAIL-JOW-REYMART', classificationType: 'Salary' },
      { title: 'REYES, JOSE ET AL.', barcode: 'DETAIL-REGULAR', classificationType: 'Salary' },
    ],
  }])).result;
  batchId = batch.id;
  for (const [index, classification] of ['JOW/COS', 'JOW/COS', 'Regular'].entries()) {
    await admin.action('updatePayrollItemClassification', [batch.itemIds[index], classification]);
  }
  await admin.action('completeInitialCheckingAndRoute', [batch.id, {
    [batch.itemIds[0]]: jun.id, [batch.itemIds[1]]: reymart.id,
  }]);
  const completedGroup = admin.state.workGroups.find((group: any) => group.batchId === batch.id && group.assignedProcessorId === reymart.id);
  const reymartClient = await new Client(fixture.base).login(reymart.email);
  await reymartClient.action('processWorkGroupItems', [completedGroup.id, completedGroup.itemIds, 'complete']);
});

test.afterAll(async () => { await fixture?.stop(); });

test('batch details distinguish personnel groups and remain usable on mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address or username').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Payroll Management', exact: true }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Payroll batch details' });
  await expect(dialog).toBeVisible();
  const junTab = dialog.getByRole('tab', { name: 'JOW/COS — Jun', exact: true });
  const reymartTab = dialog.getByRole('tab', { name: 'JOW/COS — Reymart', exact: true });
  await expect(junTab).toBeVisible();
  await expect(reymartTab).toBeVisible();
  await junTab.click();
  await expect(junTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByText('DETAIL-JOW-JUN', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/In_Progress|Ready_For_Release/);
  await expect(dialog.getByRole('button', { name: 'Verify & Sign', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Complete group/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/payroll-batch-desktop.png', fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const closeButton = dialog.getByRole('button', { name: 'Close payroll batch', exact: true });
  await expect(closeButton).toBeVisible();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds?.x).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/payroll-batch-mobile.png', animations: 'disabled' });
  await expect(dialog.getByLabel('Recipient')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Release payrolls (1)', exact: true }).click();
  const releaseDialog = page.getByRole('dialog', { name: 'Release payrolls', exact: true });
  await expect(releaseDialog.getByLabel('Recipient')).toBeVisible();
  await expect(releaseDialog.getByRole('button', { name: 'Release 1 payroll', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/payroll-release-mobile.png', animations: 'disabled' });
  await releaseDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(releaseDialog).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await closeButton.click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('assigned payroll processor retains signing and hold controls', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address or username').fill('jun@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^My Tasks & Queues/ }).click();
  await page.locator(`#btn-open-payroll-task-${batchId}`).click();

  const dialog = page.getByRole('dialog', { name: 'Payroll batch details' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('1 visible to you', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'JOW/COS — Jun', exact: true })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'JOW/COS — Reymart', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Verify & Sign', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Hold', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Complete group/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/payroll-batch-processor.png', fullPage: true, animations: 'disabled' });
});

test('workflow phase opens focused payroll routing settings', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address or username').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Workflow Engine', exact: true }).click();
  await page.getByRole('heading', { name: 'Payroll detail browser workflow', level: 3, exact: true }).click();
  await page.getByRole('button', { name: 'Edit Workflow', exact: true }).click();

  const routingButtons = page.getByRole('button', { name: 'Routing Settings', exact: true });
  await expect(routingButtons).toHaveCount(3);
  await routingButtons.last().click();
  const dialog = page.getByRole('dialog', { name: 'Routing settings for Phase 3' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Employment classification rules', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Per payroll item', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Personnel pool/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/workflow-routing-settings.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Employment classification rules · Selected during Phase 2', { exact: true })).toBeVisible();
});

test('ordinary document workflows configure and use a personnel pool', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address or username').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Workflow Engine', exact: true }).click();
  await page.getByRole('heading', { name: 'Communication personnel pool workflow', level: 3 }).click();
  await page.getByRole('button', { name: 'Edit Workflow', exact: true }).click();
  const routingButtons = page.getByRole('button', { name: 'Routing Settings', exact: true });
  await expect(routingButtons).toHaveCount(3);
  await routingButtons.nth(1).click();
  const routingDialog = page.getByRole('dialog', { name: 'Routing settings for Phase 2' });
  await expect(routingDialog.getByText('Applies to: Communication · Office Order')).toBeVisible();
  await expect(routingDialog.getByText('Personnel pool', { exact: true })).toBeVisible();
  await expect(routingDialog.getByText('2 selected', { exact: true })).toBeVisible();
  await routingDialog.getByRole('button', { name: 'Done', exact: true }).click();

  await page.locator('#btn-register-doc-header').click();
  await expect(page.getByLabel('Assign Phase 2 to')).toBeVisible();
  await page.locator('#btn-close-register-modal').click();

  await page.getByRole('button', { name: 'Document Registry', exact: true }).click();
  const row = page.getByText(pooledDocumentTracking, { exact: true }).locator('xpath=ancestor::tr');
  await row.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Complete and advance', exact: true }).click();
  const selector = page.getByLabel('Assign Phase 3 to');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(3);
});
