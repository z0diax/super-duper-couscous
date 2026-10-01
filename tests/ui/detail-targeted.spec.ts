import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
let firstId = '', secondId = '';
test.beforeAll(async () => {
  fixture=await startFixture(18775,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  const admin=await new Client(fixture.base).login();
  for(const type of ['Office Order','Memorandum']) {
    await admin.action('createWorkflowTemplate',[{title:`${type} detail`,description:'Browser detail',classification:'Communication',documentType:type,isActive:true,steps:[
      {stepNumber:1,name:'Initial review',description:'Review',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false},
      {stepNumber:2,name:'Final review',description:'Review',assigneeType:'Role',assigneeRole:'reviewer',assigneeName:'Reviewer',slaHours:24,requiredAction:'Review & Recommend',allowReturn:true,allowHold:true,requiresAttachment:false},
    ]}]);
    const doc=(await admin.action('registerDocument',[{title:type==='Office Order'?'First targeted detail':'Second targeted detail',subject:'Browser detail',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:type,priority:'Routine',description:'Browser detail',barcode:`PHASE6-${type.replaceAll(' ','-')}`,files:[]}])).result;
    if(type==='Office Order') firstId=doc.id; else secondId=doc.id;
  }
  const body=new FormData(); body.append('file',new Blob(['Detail evidence'],{type:'text/plain'}),'detail-evidence.txt');
  const file=(await admin.request('files.php','POST',body,201)).file;
  await admin.action('uploadSupportingFile',[firstId,file]);
});
test.afterAll(async()=>{await fixture?.stop();});
const login=async(page:import('@playwright/test').Page)=>{
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Document Registry',exact:true}).click();
  await expect(page.locator(`#btn-open-doc-reg-${firstId}`)).toBeVisible();
};

test('targeted detail shows loading, workflow, custody, attachments and scoped audit',async({page})=>{
  let detailRequests=0;
  await page.route(`**/api/documents.php?id=${firstId}`,async route=>{detailRequests++; await new Promise(resolve=>setTimeout(resolve,300)); await route.continue();});
  await login(page);
  await page.locator(`#btn-open-doc-reg-${firstId}`).click();
  await expect(page.getByRole('status').filter({hasText:'Loading document details'})).toBeVisible();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  await expect(page.getByText('Initial review',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Document Details'}).click();
  await expect(page.getByText('Custody history',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Attachments/}).click();
  await expect(page.getByText('detail-evidence.txt')).toBeVisible();
  await page.getByRole('button',{name:/^Audit Trail \(/}).click();
  await expect(page.getByText(/of .* events · newest first/)).toBeVisible();
  expect(detailRequests).toBe(1);
  await page.reload();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  expect(detailRequests).toBe(2);
});

test('404 and server failures show safe detail errors with retry',async({page})=>{
  let status=404;
  await page.route(`**/api/documents.php?id=${firstId}`,async route=>{
    if(status===200) await route.continue();
    else if(status===0) await route.abort('failed');
    else await route.fulfill({status,contentType:'application/json',body:'{"error":"Internal SQL path"}'});
  });
  await login(page);
  await page.locator(`#btn-open-doc-reg-${firstId}`).click();
  await expect(page.getByRole('alert')).toContainText('not found or is no longer available');
  await expect(page.getByRole('alert')).not.toContainText('SQL');
  status=503; await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  status=401; await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByRole('alert')).toContainText('session could not be verified');
  status=0; await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  status=200; await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
});

test('closing during a request and opening another document prevents stale replacement',async({page})=>{
  let firstCompleted=false;
  await page.route(`**/api/documents.php?id=${firstId}`,async route=>{await new Promise(resolve=>setTimeout(resolve,600)); firstCompleted=true; await route.continue();});
  await login(page);
  await page.locator(`#btn-open-doc-reg-${firstId}`).click();
  await expect(page.getByRole('status').filter({hasText:'Loading document details'})).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator(`#btn-open-doc-reg-${secondId}`).click();
  await expect(page.getByRole('heading',{name:'Second targeted detail'})).toBeVisible();
  await expect.poll(()=>firstCompleted).toBe(true);
  await expect(page.getByRole('heading',{name:'Second targeted detail'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'First targeted detail'})).toHaveCount(0);
});

test('legacy state mutations explicitly refresh targeted detail and Registry',async({page})=>{
  let reads=0, writes=0, lists=0;
  page.on('request',request=>{if(request.url().includes('/api/documents.php?id=')) reads++; if(request.url().includes('/api/documents.php?registry=')) lists++; if(request.url().includes('/api/state.php')&&request.method()==='POST') writes++;});
  await login(page);
  await page.locator(`#btn-open-doc-reg-${firstId}`).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  const initialReads=reads, initialLists=lists;
  await page.getByRole('button',{name:'Complete and advance'}).click();
  await page.getByRole('button',{name:'Save action'}).click();
  await expect(page.getByText('Phase 2 of 2').first()).toBeVisible();
  await expect.poll(()=>reads).toBeGreaterThan(initialReads);
  await expect.poll(()=>lists).toBeGreaterThan(initialLists);
  expect(writes).toBe(1);
  const afterComplete=reads;
  await page.getByRole('button',{name:'Place on hold'}).click();
  await page.getByPlaceholder('Hold reason or missing requirement').fill('Need review');
  await page.getByRole('button',{name:'Save action'}).click();
  await expect(page.getByText(/On hold — awaiting compliance/).first()).toBeVisible();
  await expect.poll(()=>reads).toBeGreaterThan(afterComplete);
  expect(writes).toBe(2);
});
