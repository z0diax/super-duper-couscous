import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18772, { HRMDO_DOCUMENT_TARGETED_READS_ENABLED: '1' }); });
test.afterAll(async () => { await fixture?.stop(); });
const login = async (page: import('@playwright/test').Page) => {
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Document Registry', exact: true }).click();
};
const row = (id: number) => ({ id:`visible-${id}`, tracking_number:`REG-${id}`, barcode:`REG-${id}`, title:`Visible ${id}`, subject:'Subject', source_office:'HRMDO', sender_name:'Sender', classification:'Communication', document_type:'Office Order', employment_classification:null, priority:'Routine', status:'In_Progress', date_received:'2026-09-30', current_step_number:1, total_steps:2, current_location:'HRMDO', current_step_name:'Review', workflow_template_id:'template', encoded_by_user_id:'admin', is_legacy_v1:0 });
const response = (items: ReturnType<typeof row>[], page: number, limit: number, total: number, all=total) => ({ data:items, pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}, registryCounts:{all,v1:0,v2:all,outside:0} });

test('targeted registry loads server pages, sends filters, and ignores older responses', async ({ page }) => {
  const queries: URLSearchParams[]=[];
  await page.route('**/api/documents.php?*', async route => {
    const params=new URL(route.request().url()).searchParams; queries.push(params);
    const current=Number(params.get('page') || 1), limit=Number(params.get('limit') || 25);
    if (params.get('status')==='Pending_Approval') await new Promise(resolve=>setTimeout(resolve,350));
    else await new Promise(resolve=>setTimeout(resolve,80));
    const items=params.get('priority')==='Urgent'?[row(99)]:params.get('status')==='Pending_Approval'?[row(98)]:Array.from({length:current===1?25:1},(_,i)=>row((current-1)*25+i+1));
    await route.fulfill({ contentType:'application/json', body:JSON.stringify(response(items,current,limit,params.has('priority')||params.has('status')?1:26,26)) });
  });
  await login(page);
  await expect(page.getByRole('status').filter({hasText:'Loading registry records'})).toBeVisible();
  await expect(page.getByText('Visible 1', {exact:true})).toBeVisible();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button',{name:'Next'}).click();
  await expect(page.getByText('Visible 26',{exact:true})).toBeVisible();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('button',{name:'Previous'}).click();
  await expect(page.getByText('Visible 1',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next'}).click();
  await page.locator('#registry-filter-status').selectOption('Pending_Approval');
  await page.locator('#registry-filter-priority').selectOption('Urgent');
  await expect(page.getByText('Visible 99',{exact:true})).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText('Visible 99',{exact:true})).toBeVisible();
  await expect(page.getByText('Visible 98',{exact:true})).toHaveCount(0);
  expect(queries.some(query=>query.get('page')==='2')).toBe(true);
  expect(queries.some(query=>query.get('status')==='Pending_Approval'&&query.get('priority')==='Urgent'&&query.get('page')==='1')).toBe(true);
  expect(queries.every(query=>query.get('registry')==='1')).toBe(true);
  await page.locator('#registry-page-size').selectOption('100');
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await expect(page.getByRole('button',{name:'Next'})).toBeDisabled();
  expect(queries.some(query=>query.get('limit')==='100'&&query.get('page')==='1')).toBe(true);
});

test('targeted registry distinguishes empty results and retries safe errors', async ({ page }) => {
  let mode:'empty'|'filtered'|'error'|'success'='empty';
  await page.route('**/api/documents.php?*', async route => {
    if (mode==='error') { await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Internal database path"}'}); return; }
    const all=mode==='empty'?0:1, items=mode==='success'?[row(1)]:[];
    await route.fulfill({contentType:'application/json',body:JSON.stringify(response(items,1,25,items.length,all))});
  });
  await login(page);
  await expect(page.getByText('No documents yet')).toBeVisible();
  mode='filtered'; await page.locator('#registry-filter-priority').selectOption('Urgent');
  await expect(page.getByText('No records match these filters')).toBeVisible();
  mode='error'; await page.locator('#registry-filter-priority').selectOption('Routine');
  await expect(page.getByRole('alert')).toContainText('Registry records could not be loaded.');
  await expect(page.getByRole('alert')).not.toContainText('Internal database path');
  mode='success'; await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByText('Visible 1',{exact:true})).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('targeted registry row opens detail according to the independent Detail flag', async ({ page }) => {
  const admin=await new Client(fixture.base).login();
  await admin.action('createWorkflowTemplate',[{title:'Detail routing',description:'Detail test',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Review',description:'Review',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false}]}]);
  const doc=(await admin.action('registerDocument',[{title:'Targeted detail record',subject:'Subject',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Detail test',barcode:'TARGETED-DETAIL-1',files:[]}])).result;
  let detailRequests=0;
  await page.route('**/api/documents.php?*',async route=>{
    const params=new URL(route.request().url()).searchParams;
    if(params.has('id')) {
      detailRequests++;
      await route.continue();
      return;
    }
    const item={...row(1),id:doc.id,tracking_number:doc.trackingNumber,title:doc.title};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(response([item],1,25,1))});
  });
  await login(page);
  await expect(page.getByText('Targeted detail record',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Inspect'}).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  expect(detailRequests).toBe(process.env.VITE_DOCUMENT_DETAIL_TARGETED_READS==='1'?1:0);
  await page.locator('#btn-close-detail-modal').click();
});
