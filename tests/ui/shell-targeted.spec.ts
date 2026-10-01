import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
let documentId='';
const targetedSearch=process.env.VITE_DOCUMENT_SEARCH_TARGETED_READS==='1';
const targetedShell=process.env.VITE_DOCUMENT_SHELL_TARGETED_READS==='1';
const targetedDetail=process.env.VITE_DOCUMENT_DETAIL_TARGETED_READS==='1';
test.beforeAll(async()=>{
  fixture=await startFixture(18782,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1'});
  const admin=await new Client(fixture.base).login();
  const user=admin.state.users.find((item:any)=>item.role==='admin');
  await admin.action('createWorkflowTemplate',[{title:'Shell workflow',description:'Shell test',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Shell review',description:'Review',assigneeType:'Person',assigneeUserId:user.id,assigneeName:user.name,slaHours:24,requiredAction:'Verify & Process',allowReturn:true,requiresAttachment:false}]}]);
  documentId=(await admin.action('registerDocument',[{title:'Shell searchable record',subject:'Phase eight shell',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Records Unit',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'',barcode:'SHELL-BAR-001',files:[]}])).result.id;
});
test.afterAll(async()=>{await fixture?.stop();});
const login=async(page:import('@playwright/test').Page)=>{
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('#header-quick-search-input')).toBeVisible();
};
const search=async(page:import('@playwright/test').Page,value:string)=>{
  await page.locator('#header-quick-search-input').fill(value);
  await page.locator('#btn-header-quick-search').click();
};

test('shell flags preserve badge and notification while OFF or ON',async({page})=>{
  let summaryReads=0;
  page.on('request',request=>{if(request.url().includes('/api/document_shell_summary.php')) summaryReads++;});
  await login(page);
  const nav=page.getByRole('button',{name:/^My Tasks & Queues/});
  await expect(nav).toContainText('1');
  const bell=page.locator('#btn-header-notifications');
  await expect(bell).toHaveAttribute('aria-label',/unread/);
  await bell.click();
  await expect(page.getByRole('dialog',{name:'Notifications'}).getByText('Document assigned to you')).toBeVisible();
  expect(summaryReads>0).toBe(targetedShell);
});

test('search is submit-only, opens exact document, and handles partial and empty results',async({page})=>{
  let searchReads=0,detailReads=0;
  page.on('request',request=>{if(request.url().includes('/api/document_search.php'))searchReads++;if(request.url().includes(`/api/documents.php?id=${documentId}`))detailReads++;});
  await login(page);
  await page.locator('#header-quick-search-input').fill('SHELL-BAR-001');
  await page.waitForTimeout(250);
  expect(searchReads).toBe(0);
  await page.locator('#btn-header-quick-search').click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  expect(searchReads).toBe(targetedSearch?1:0);
  expect(detailReads).toBe(targetedSearch&&targetedDetail?1:0);
  await page.locator('#btn-close-detail-modal').click();
  await search(page,'searchable');
  const results=page.getByRole('dialog',{name:/Results for/});
  await expect(results.getByText('Shell searchable record')).toBeVisible();
  await results.getByRole('button',{name:/Open/}).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  await page.locator('#btn-close-detail-modal').click();
  await search(page,'none-of-these-records');
  await expect(page.getByText('No matching records')).toBeVisible();
});

test('targeted search error is safe and retry succeeds',async({page})=>{
  test.skip(!targetedSearch,'Targeted search build only.');
  let fail=true;
  await page.route('**/api/document_search.php?*',async route=>{
    if(fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"SQL internals"}'});return;}
    await route.continue();
  });
  await login(page);
  await search(page,'searchable');
  const alert=page.getByRole('alert').filter({hasText:'Document search could not be loaded'});
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText('SQL internals');
  await alert.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByText('Shell searchable record')).toBeVisible();
});

test('newer targeted search wins over a delayed older response',async({page})=>{
  test.skip(!targetedSearch,'Targeted search build only.');
  await page.route('**/api/document_search.php?*',async route=>{
    const term=new URL(route.request().url()).searchParams.get('q');
    if(term==='older') await new Promise(resolve=>setTimeout(resolve,600));
    await route.fulfill({contentType:'application/json',body:JSON.stringify({exact:null,items:term==='newer'?[{id:documentId,tracking_number:'SHELL-NEW',title:'Newer response',classification:'Communication',document_type:'Office Order',source_office:'HRMDO',status:'In_Progress',current_location:'HRMDO'}]:[],total:term==='newer'?1:0})});
  });
  await login(page);
  await search(page,'older');
  await search(page,'newer');
  await expect(page.getByText('Newer response')).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.getByText('Newer response')).toBeVisible();
});

test('successful document mutation refreshes targeted shell count promptly',async({page})=>{
  test.skip(!targetedShell,'Targeted shell build only.');
  let reads=0;
  page.on('request',request=>{if(request.url().includes('/api/document_shell_summary.php'))reads++;});
  await login(page);
  const nav=page.getByRole('button',{name:/^My Tasks & Queues/});
  await expect(nav).toContainText('1');
  await page.locator('#btn-register-doc-header').click();
  await page.locator('#reg-input-classification').selectOption('Communication');
  await page.locator('#reg-input-doctype').selectOption('Office Order');
  await page.locator('#reg-input-title').fill('Shell mutation document');
  await page.locator('#reg-input-barcode').fill('SHELL-MUTATION-002');
  const before=reads;
  await page.locator('#btn-submit-register-document').click();
  await expect(nav).toContainText('2');
  expect(reads).toBeGreaterThan(before);
});
