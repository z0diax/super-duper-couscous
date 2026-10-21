import { test, expect, type Page } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18813); });
test.afterAll(async () => { await fixture?.stop(); });

async function open(page: Page) {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if ((page.viewportSize()?.width ?? 1440) < 768) await page.getByRole('button',{name:'Open sidebar menu',exact:true}).click();
  await page.getByRole('button', { name: 'Leave Records', exact: true }).click();
  await page.getByRole('button', { name: 'Register Leave or EWP', exact: true }).click();
}
const field = (page: Page) => page.locator('#input-leave-specific-details');
async function seed(category: string, value: string) {
  const admin = await new Client(fixture.base).login();
  await admin.request('leave_suggestions.php','POST',{category,value});
}

test('medical history entered by another authorized account is suggested to administrators', async ({ page }) => {
  const admin=await new Client(fixture.base).login();
  await admin.action('addUser',[{name:'Private medical encoder',email:'private-encoder@example.test',password:testPassword,role:'receiving_officer',roleTitle:'Intake',office:'HRMDO',division:'HRMDO',position:'Officer',sidebarModules:['leave']}]);
  const encoder=await new Client(fixture.base).login('private-encoder@example.test');
  await encoder.action('fileLeaveApplication',[{employeeName:'Private applicant',office:'HRMDO',leaveType:'Sick Leave',leaveSubtype:'OUT_PATIENT',leaveDetails:'Private other-account history',dateRanges:[{startDate:'2026-10-14',endDate:'2026-10-14',dayType:'WHOLE_DAY'}]}]);
  await open(page);
  await page.locator('#select-filing-leave-type').selectOption('Sick Leave');
  await field(page).fill('Private other-account');
  await page.getByRole('option',{name:'Private other-account history',exact:true}).click();
  await expect(field(page)).toHaveValue('Private other-account history');
  await expect(page.getByText('No saved medical suggestions for this account.',{exact:true})).toHaveCount(0);
});

test('older leave destinations are suggested without registering them again', async ({ page }) => {
  const admin=await new Client(fixture.base).login();
  const record=(await admin.action('fileLeaveApplication',[{employeeName:'Historical applicant',office:'HRMDO',leaveType:'Vacation Leave',leaveSubtype:'WITHIN_PHILIPPINES',dateRanges:[{startDate:'2026-10-14',endDate:'2026-10-14',dayType:'WHOLE_DAY'}]}])).result;
  // Simulate a destination saved before the automatic vocabulary projection existed.
  fixture.run(['-r',"require 'api/db.php'; database()->prepare(\"UPDATE app_records SET record_json=JSON_SET(record_json,'$.leaveDetails',?) WHERE collection='leaveApplications' AND id=?\")->execute(['Cebu historical destination',getenv('HISTORY_RECORD_ID')]);"],{HISTORY_RECORD_ID:record.id});
  fixture.run(['scripts/backfill_leave_suggestions.php']);
  await open(page);
  await field(page).fill('CEB');
  await page.getByRole('option', { name: 'Cebu historical destination', exact: true }).click();
  await expect(field(page)).toHaveValue('Cebu historical destination');
  await page.locator('#select-filing-leave-type').selectOption('Special Privilege Leave');
  await field(page).fill('CEB');
  await expect(page.getByRole('option', { name: 'Cebu historical destination', exact: true })).toBeVisible();
});

test('older Sick Leave details are suggested without registering them again', async ({ page }) => {
  const admin=await new Client(fixture.base).login();
  const record=(await admin.action('fileLeaveApplication',[{employeeName:'Historical sick applicant',office:'HRMDO',leaveType:'Sick Leave',leaveSubtype:'OUT_PATIENT',leaveDetails:'Initial medical fixture',dateRanges:[{startDate:'2026-10-14',endDate:'2026-10-14',dayType:'WHOLE_DAY'}]}])).result;
  fixture.run(['-r',"require 'api/db.php'; database()->prepare(\"UPDATE app_records SET record_json=JSON_SET(record_json,'$.leaveDetails',?) WHERE collection='leaveApplications' AND id=?\")->execute(['Conjunctivitis historical fixture',getenv('HISTORY_RECORD_ID')]);"],{HISTORY_RECORD_ID:record.id});
  fixture.run(['scripts/backfill_leave_suggestions.php']);
  await open(page);
  await page.locator('#select-filing-leave-type').selectOption('Sick Leave');
  await field(page).fill('CONJ');
  await page.getByRole('option', { name: 'Conjunctivitis historical fixture', exact: true }).click();
  await expect(field(page)).toHaveValue('Conjunctivitis historical fixture');
  await expect(page.locator('#select-leave-subtype')).toHaveValue('');
});

test('unsaved terms can be saved from the dropdown and immediately found without helper text', async ({ page }) => {
  await open(page);
  await page.locator('#select-filing-leave-type').selectOption('Sick Leave');
  await expect(page.getByText('Enter to save a suggestion.', { exact: false })).toHaveCount(0);
  await field(page).fill('CON private browser term');
  await expect(page.getByRole('listbox').locator('..')).toContainText('No matching saved suggestions.');
  await page.getByRole('button', { name: 'Save suggestion Enter', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Suggestion saved' })).toBeVisible();
  await expect(field(page)).toHaveValue('CON private browser term');
  await field(page).fill('CON');
  await page.getByRole('option', { name: 'CON private browser term', exact: true }).click();
  await expect(field(page)).toHaveValue('CON private browser term');
  await page.locator('#select-filing-leave-type').selectOption('Vacation Leave');
  await expect(page.getByText('Save only non-confidential destinations;', { exact: false })).toHaveCount(0);
});

test('activation, Enter register/select, keyboard, persistence and normal Tab behavior', async ({ page }) => {
  await seed('medical','Fever'); await seed('medical','Fever with headache');
  await open(page);
  for (const type of ['Vacation Leave','Special Privilege Leave','Sick Leave']) {
    await page.locator('#select-filing-leave-type').selectOption(type);
    await expect(field(page)).toHaveAttribute('role','combobox');
  }
  await page.locator('#select-leave-subtype').selectOption('OUT_PATIENT');
  await field(page).fill('F');
  await expect(page.getByRole('option', { name: 'Fever', exact: true })).toBeVisible();
  await field(page).fill('FEV');
  await expect(page.getByRole('option', { name: 'Fever', exact: true })).toBeVisible();
  await field(page).press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Fever', exact: true })).toHaveAttribute('aria-selected','true');
  await field(page).press('ArrowDown'); await field(page).press('ArrowUp');
  await field(page).press('Enter');
  await expect(field(page)).toHaveValue('Fever');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await field(page).fill('Unique medical browser phrase');
  await field(page).press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Suggestion saved'})).toBeVisible();
  await expect(field(page)).toHaveValue('Unique medical browser phrase');
  await expect(page.getByRole('button', { name: 'Register Leave Application', exact: true })).toBeVisible();
  await field(page).press('Shift+Enter');
  await expect(field(page)).toHaveValue('Unique medical browser phrase\n');
  await field(page).fill('   '); await field(page).press('Enter');
  await expect(field(page)).toHaveValue('   ');
  await expect(field(page)).toHaveAttribute('maxlength','2000');
  await page.reload();
  await page.getByRole('button', { name: 'Register Leave or EWP', exact: true }).click();
  await page.locator('#select-filing-leave-type').selectOption('Sick Leave');
  await field(page).fill('Unique medical');
  await page.getByRole('option', { name:'Unique medical browser phrase',exact:true }).click();
  await expect(field(page)).toHaveValue('Unique medical browser phrase');
  await field(page).fill('FEV');
  await expect(page.getByRole('listbox')).toBeVisible();
  await field(page).press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
  await field(page).press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Fever', exact: true })).toHaveAttribute('aria-selected','true');
  await field(page).press('Escape');
  await field(page).click(); await expect(page.getByRole('listbox')).toBeVisible();
  await field(page).press('Tab'); await expect(field(page)).not.toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.locator('#select-filing-leave-type').selectOption('Study Leave');
  await expect(page.getByRole('combobox', { name:/Illness/ })).toHaveCount(0);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.locator('#select-filing-leave-type').selectOption('Others');
  await expect(field(page)).not.toHaveAttribute('role','combobox');
});

test('errors preserve text, retry works, rapid typing cannot show stale suggestions', async ({ page }) => {
  await open(page);
  let rejectSave = true;
  await page.route('**/api/leave_suggestions.php', async route => {
    if (route.request().method() === 'POST' && rejectSave) {
      rejectSave = false;
      await route.fulfill({status:503,json:{error:'Temporary suggestion service error'}});
    } else await route.continue();
  });
  await field(page).fill('Retry destination'); await field(page).press('Enter');
  await expect(page.getByRole('alert').filter({hasText:'Temporary suggestion service error'})).toBeVisible();
  await expect(field(page)).toHaveValue('Retry destination');
  await field(page).press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Suggestion saved'})).toBeVisible();
  await page.route('**/api/leave_suggestions.php?**', async route => {
    const q=new URL(route.request().url()).searchParams.get('q');
    if (q === 'Old') {
      await new Promise(resolve=>setTimeout(resolve,700));
      await route.fulfill({json:{items:[{id:'old',value:'Old result'}]}}).catch(()=>{});
    } else if (q === 'New') await route.fulfill({json:{items:[{id:'new',value:'New result'}]}});
    else await route.continue();
  });
  await field(page).fill('Old');
  await page.waitForRequest(request=>request.url().includes('q=Old'));
  await field(page).fill('New');
  await expect(page.getByRole('option',{name:'New result'})).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole('option',{name:'Old result'})).toHaveCount(0);
  await expect(field(page)).toHaveValue('New');
  await page.getByRole('textbox',{name:'Remarks',exact:true}).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('Enter only saves a suggestion even in a complete form; registration and editing use leaveDetails', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T04:00:00Z'));
  await open(page);
  await page.locator('#leave-input-barcode').fill('AUTOCOMPLETE-BROWSER');
  await page.locator('#leave-input-applicant').fill('Autocomplete applicant');
  await page.locator('#leave-select-office').selectOption({index:1});
  await page.locator('#select-leave-subtype').selectOption('WITHIN_PHILIPPINES');
  await page.getByRole('button',{name:'Select Leave Date Range'}).click();
  await page.getByRole('button',{name:'2026-10-15',exact:true}).click();
  await page.getByRole('button',{name:'2026-10-16',exact:true}).click();
  const writes: string[]=[];
  page.on('request',request=>{if(request.url().endsWith('/state.php') && request.method()==='POST') writes.push(request.postData()||'');});
  await field(page).fill('Cebu test destination'); await field(page).press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Suggestion saved'})).toBeVisible();
  expect(writes.filter(body=>body.includes('fileLeaveApplication'))).toHaveLength(0);
  await page.locator('#btn-submit-filing').click();
  const row=page.getByText('AUTOCOMPLETE-BROWSER',{exact:true}).locator('xpath=ancestor::tr');
  await row.getByRole('button',{name:'Edit Leave Application',exact:true}).click();
  await expect(field(page)).toHaveValue('Cebu test destination');
  await field(page).fill('Ceb');
  await page.getByRole('option',{name:'Cebu test destination',exact:true}).click();
  await page.locator('#select-filing-leave-type').selectOption('Special Privilege Leave');
  await expect(field(page)).toHaveValue('');
  await page.locator('#select-leave-subtype').selectOption('WITHIN_PHILIPPINES');
  await field(page).fill('Ceb');
  await page.getByRole('option',{name:'Cebu test destination',exact:true}).click();
  await page.locator('#btn-submit-filing').click();
  await expect(row).toContainText('Special Privilege Leave');
  await row.getByRole('button',{name:'Edit Leave Application',exact:true}).click();
  await expect(field(page)).toHaveValue('Cebu test destination');
});

test('mobile touch selection and dropdown follows modal scrolling without clipping', async ({ browser }) => {
  await seed('destination','Mobile destination');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try {
    await open(page);
    await field(page).fill('Mobile');
    const option=page.getByRole('option',{name:'Mobile destination',exact:true});
    await expect(option).toBeVisible();
    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await page.getByRole('listbox').evaluate(element=>element.parentElement?.parentElement===document.body)).toBe(true);
    const popup=page.getByRole('listbox').locator('..');
    let box=await popup.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(390);
    await field(page).evaluate(element=>{const modal=element.closest('form')!.parentElement!;modal.scrollTop+=45;});
    await expect.poll(async()=>{
      const inputBox=await field(page).boundingBox();const popupBox=await popup.boundingBox();
      return Math.min(Math.abs(popupBox!.y-(inputBox!.y+inputBox!.height+4)),Math.abs(popupBox!.y+popupBox!.height-(inputBox!.y-4)));
    }).toBeLessThan(3);
    await option.tap();
    await expect(field(page)).toHaveValue('Mobile destination');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.screenshot({path:'test-results/leave-autocomplete-mobile.png'});
  } finally { await context.close(); }
});
