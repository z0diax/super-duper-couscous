import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => {
  fixture=await startFixture(18773,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'0'});
  const admin=await new Client(fixture.base).login();
  await admin.action('createWorkflowTemplate',[{title:'Legacy registry',description:'Legacy UI test',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Review',description:'Review',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false}]}]);
  await admin.action('registerDocument',[{title:'Legacy registry record',subject:'Subject',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Legacy test',barcode:'LEGACY-REGISTRY-1',files:[]}]);
});
test.afterAll(async () => { await fixture?.stop(); });

test('legacy registry renders AppContext documents without targeted requests',async ({page})=>{
  const targetedRequests:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/documents.php')) targetedRequests.push(request.url());});
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Document Registry',exact:true}).click();
  await expect(page.getByText('Legacy registry record',{exact:true})).toBeVisible();
  await expect(page.getByText('No records match these filters')).toHaveCount(0);
  await page.locator('#registry-filter-priority').selectOption('Urgent');
  await expect(page.getByText('No records match these filters')).toBeVisible();
  expect(targetedRequests).toEqual([]);
});
