import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';
let fixture: any;
test.beforeAll(async () => { fixture = await startFixture(18766); });
test.afterAll(async () => { await fixture?.stop(); });
test('login works when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true }); });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Operational Overview')).toBeVisible();
  await page.locator('#btn-dash-register-new').click();
  await expect(page.locator('#btn-submit-register-document')).toBeVisible();
  expect(errors).toEqual([]);
});
test('refresh restores the payroll workspace and unsaved intake draft', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Payroll Management/ }).click();
  await expect(page.getByRole('heading', { name: 'Payroll Management & Processing' })).toBeVisible();
  await page.getByRole('button', { name: 'Register Payroll', exact: true }).click();
  await page.getByRole('button', { name: /Payroll Batch Entry/ }).click();
  await page.getByPlaceholder('Barcode (e.g. PAY-2026-10291)').fill('RESUME-PAYROLL-001');
  await page.getByPlaceholder('Title / Claimant / Description').fill('Payroll draft that survives refresh');
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).join(' '))).toContain('"activeTab":"payroll"');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Payroll Management & Processing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Register Incoming Payroll' })).toBeVisible();
  await expect(page.getByPlaceholder('Barcode (e.g. PAY-2026-10291)')).toHaveValue('RESUME-PAYROLL-001');
  await expect(page.getByPlaceholder('Title / Claimant / Description')).toHaveValue('Payroll draft that survives refresh');
});
test('configure catalogue, workflow, register with a real file, reload every screen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Operational Overview')).toBeVisible();
  await page.getByRole('button', { name: 'Classification Catalogue', exact: true }).click();
  await page.locator('#btn-add-classification-type').click();
  await page.locator('#input-new-type-name').fill('Browser Test Type');
  await page.locator('#btn-confirm-add-type').click();
  await expect(page.getByText('Browser Test Type', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workflow Engine', exact: true }).click();
  await page.getByRole('button', { name: /Create.*Template|New.*Workflow|New.*Template/ }).first().click();
  const form = page.locator('form').last();
  await form.locator('input[type=text]').first().fill('Browser workflow');
  await form.getByText('Memorandum', { exact: true }).click();
  // The default workflow uses Office Order; assign all steps to the administrator.
  for (const select of await form.getByLabel('Assigned officer').all()) {
    const options = await select.locator('option').allTextContents();
    const label = options.find(o => o.includes('System Administrator'))!;
    await select.selectOption({ label });
  }
  await form.getByRole('button', { name: /Create.*Template|Save.*Template|Create Workflow/ }).click();
  await expect(page.getByText('Browser workflow', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Office Order, Memorandum/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.locator('#btn-dash-register-new').click();
  await page.locator('#reg-input-title').fill('Browser document');
  await page.locator('#reg-input-barcode').fill('BROWSER-DOC-001');
  await page.locator('#reg-file-upload-input').setInputFiles({ name: 'browser-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nBrowser evidence\n%%EOF') });
  await page.locator('#btn-submit-register-document').click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  await page.locator('#btn-close-detail-modal').click();
  await page.reload(); await expect(page.getByText('Operational Overview')).toBeVisible();
  await page.getByRole('button', { name: 'Document Registry', exact: true }).click();
  await expect(page.getByText('BROWSER-DOC-001', { exact: true })).toBeVisible();
  for (const label of ['My Tasks & Queues', 'Payroll Management', 'Leave Continuity', 'Workflow Engine', 'Classification Catalogue', 'Users & Designations', 'V1 Historical Archive', 'Audit Trail & Reports']) {
    await page.getByRole('button', { name: label }).click();
    await expect(page.locator('main')).not.toBeEmpty();
  }
  await page.screenshot({ path: 'test-results/application-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('failed saves keep the form open and show the server error', async ({ page }) => {
  await page.goto(`${fixture.base}/`); await page.getByLabel('Email address').fill('admin@example.test'); await page.getByLabel('Password', { exact: true }).fill(testPassword); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Classification Catalogue', exact: true }).click(); await page.locator('#btn-add-classification-type').click(); await page.locator('#input-new-type-name').fill('Will fail');
  await page.route('**/api/state.php', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({error:'Database temporarily unavailable.'}) }); else await route.continue();
  });
  await page.locator('#btn-confirm-add-type').click();
  await expect(page.getByText('Database temporarily unavailable.')).toBeVisible();
  await expect(page.locator('#input-new-type-name')).toHaveValue('Will fail');
});
test('user creation creates a usable login with the selected permissions', async ({ page }) => {
  const shortPassword = 'abc';
  await page.goto(`${fixture.base}/`); await page.getByLabel('Email address').fill('admin@example.test'); await page.getByLabel('Password', { exact: true }).fill(testPassword); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Users & Designations', exact: true }).click();
  await page.getByRole('button', { name: 'Add New Personnel', exact: true }).click();
  await page.getByPlaceholder('e.g. Maria Santos').fill('Browser Officer');
  await page.getByPlaceholder('m.santos@hrmdo.gov.ph').fill('browser-officer@example.test');
  await page.getByLabel('Account password').fill(shortPassword);
  const form = page.locator('form').last();
  await form.locator('select').first().selectOption('__CUSTOM__');
  await page.getByPlaceholder('Enter custom role title...').fill('Document Verification Officer');
  await form.getByRole('button', { name: /Create|Register|Save/ }).click();
  await expect(page.getByText('Browser Officer', { exact: true }).first()).toBeVisible();
  await page.locator('#btn-persona-switcher').click(); await page.locator('#btn-sign-out').click();
  await page.getByLabel('Email address').fill('browser-officer@example.test'); await page.getByLabel('Password', { exact: true }).fill(shortPassword); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Operational Overview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Users & Designations', exact: true })).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/application-mobile.png',fullPage:true,animations:'disabled'});
});
test('payroll batch intake saves its items and a downloadable attachment', async ({ page }) => {
  await page.goto(`${fixture.base}/`); await page.getByLabel('Email address').fill('admin@example.test'); await page.getByLabel('Password', { exact: true }).fill(testPassword); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const setup = await new Client(fixture.base).login();
  const adminUser = setup.state.users.find((user:any) => user.role === 'admin');
  const payrollStep = (stepNumber:number, name:string, requiredAction:string, assigneeType:string, extra:any = {}) => ({ stepNumber, name, description:'Browser batch workflow', assigneeType, assigneeName:adminUser.name, slaHours:24, requiredAction, allowReturn:false, requiresAttachment:false, ...extra });
  await setup.action('createWorkflowTemplate',[{ title:'Browser payroll batch workflow', description:'Docket then assign Initial Checking', classification:'Payroll', documentType:'Salary', employmentClassification:'All', isActive:true, steps:[
    payrollStep(1,'Docketing','Receive','Person',{assigneeUserId:adminUser.id}),
    payrollStep(2,'Initial Checking','Verify & Process','Person',{assigneeUserId:adminUser.id}),
    payrollStep(3,'Parallel Groups','Verify & Process','Role',{assigneeRole:'processor'}),
    payrollStep(4,'Release','Release & Archive','Role',{assigneeRole:'releasing_officer'}),
  ] }]);
  await page.reload();
  await page.getByRole('button', { name: /^Payroll Management/ }).click();
  await page.getByRole('button', { name: 'Routing Rules', exact: true }).click();
  await page.getByRole('button', { name: 'Change Assignee', exact: true }).first().click();
  const selectedOfficer = await page.getByLabel(/primary processor/).inputValue();
  expect(selectedOfficer).not.toBe('');
  await page.getByRole('button', { name: 'Save Rule', exact: true }).click();
  await expect(page.getByText('Assigned Processor:').first().locator('..')).not.toContainText('Unassigned');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#btn-register-payroll-header').click();
  await page.getByRole('button', { name: /Payroll Batch/ }).click();
  await page.getByPlaceholder('Barcode (e.g. PAY-2026-10291)').fill('BROWSER-PAY-001');
  await page.getByPlaceholder('Title / Claimant / Description').fill('Browser payroll item');
  await page.locator('#batch-payroll-form select').last().selectOption('Salary');
  await page.getByLabel('Batch supporting files').setInputFiles({name:'transmittal.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nTransmittal\n%%EOF')});
  await page.getByRole('button',{name:/Register Batch/}).click();
  await expect(page.locator('#batch-payroll-form')).toHaveCount(0);
  const client = await new Client(fixture.base).login();
  const item = client.state.payrollItems.find((i:any)=>i.barcode==='BROWSER-PAY-001'); expect(item).toBeTruthy();
  const batch = client.state.payrollBatches.find((b:any)=>b.id===item.batchId); expect(batch.attachments[0].name).toBe('transmittal.pdf');
  await page.getByRole('button', { name: 'My Tasks & Queues', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payroll tasks' })).toBeVisible();
  await expect(page.getByText(batch.batchNumber, { exact: true })).toBeVisible();
  await page.locator(`#btn-open-payroll-task-${batch.id}`).click();
  await expect(page.getByText('Stage 2: Initial Checking Workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /^Payroll Management/ }).click();
  await page.getByLabel(`Edit ${batch.batchNumber}`).click();
  await page.getByLabel('Payroll Period').fill('September 2026');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Edit Payroll Batch' })).toBeVisible();
  await expect(page.getByLabel('Payroll Period')).toHaveValue('September 2026');
  await page.getByRole('button', {name:'Save Changes', exact:true}).click();
  await expect(page.getByText('September 2026', {exact:true})).toBeVisible();
  await page.getByLabel('List view').click();
  await expect(page.getByText(batch.batchNumber, {exact:true}).last()).toBeVisible();
  await page.getByLabel(`Delete ${batch.batchNumber}`).last().click();
  await page.getByRole('button', {name:'Confirm', exact:true}).click();
  await expect(page.getByText(batch.batchNumber, {exact:true})).toHaveCount(0);
});
test('new role form survives database refresh and saves', async ({ page }) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Users & Designations', exact: true }).click();

  // Open through an existing role badge, then switch to Add Role. This was the
  // route that retained initialEditingRoleId and reset the form during polling.
  await page.getByTitle('Click to view/edit this system base role').first().click();
  await page.locator('form').last().locator('button[type="button"]').first().click();
  await page.getByRole('button', { name: 'Add Role', exact: true }).click();
  await page.getByLabel('Role display name').fill('Records Quality Controller');
  await page.getByLabel('Role code').fill('RQC');
  await page.getByLabel('System key').fill('records_quality_controller');
  await page.getByLabel('Role description').fill('Checks document quality before release.');

  // The application polls the database every 30 seconds. The old effect reset
  // these fields when that poll replaced the systemRoles array.
  await page.waitForTimeout(31_000);
  await expect(page.getByLabel('Role display name')).toHaveValue('Records Quality Controller');
  await expect(page.getByLabel('Role code')).toHaveValue('RQC');
  await expect(page.getByLabel('System key')).toHaveValue('records_quality_controller');

  await page.locator('#btn-save-system-role').click();
  await expect(page.getByText('Records Quality Controller', { exact: true }).first()).toBeVisible();
  let roleCard = page.getByText('Records Quality Controller', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await roleCard.getByRole('button', { name: 'Edit Role', exact: true }).click();
  await page.getByLabel('Role display name').fill('Records Quality Lead');
  await page.getByLabel('System key').fill('records_quality_lead');
  await page.getByText('Supervise & Route', { exact: true }).locator('xpath=ancestor::label').locator('input').check();
  await page.locator('#btn-save-system-role').click();
  await expect(page.getByLabel('Role display name')).toHaveCount(0);
  await expect(page.getByText('Records Quality Lead', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('records_quality_lead', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Users & Designations', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Users & Designations', exact: true }).click();
  await page.getByRole('button', { name: 'System Base Roles' }).click();
  await expect(page.getByText('Records Quality Lead', { exact: true }).first()).toBeVisible();
  roleCard = page.getByText('Records Quality Lead', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await roleCard.getByRole('button', { name: 'Delete Role', exact: true }).click();
  await roleCard.getByRole('button', { name: 'Confirm Delete', exact: true }).click();
  await expect(page.getByText('Records Quality Lead', { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Users & Designations', exact: true }).click();
  await page.getByRole('button', { name: 'System Base Roles' }).click();
  await expect(page.getByText('Records Quality Lead', { exact: true })).toHaveCount(0);
});
