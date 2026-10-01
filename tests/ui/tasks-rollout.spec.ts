import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
let documentId='';
const targeted=process.env.VITE_DOCUMENT_TASKS_TARGETED_READS==='1';
const targetedDetail=process.env.VITE_DOCUMENT_DETAIL_TARGETED_READS==='1';
test.beforeAll(async()=>{
  fixture=await startFixture(18780,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  const admin=await new Client(fixture.base).login();
  await admin.action('addUser',[{name:'Task Worker',email:'task-worker@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}]);
  await admin.action('createWorkflowTemplate',[{title:'Task rollout',description:'Browser task',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Initial review',description:'Review',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false}]}]);
  documentId=(await admin.action('registerDocument',[{title:'Real task document',subject:'Browser task',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Browser task',barcode:'P7-BROWSER',files:[]}])).result.id;
});
test.afterAll(async()=>{await fixture?.stop();});
const login=async(page:import('@playwright/test').Page)=>{
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('task-worker@example.test');
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:/^My Tasks & Queues/}).click();
};
const row=(id:number)=>({id:`fake-${id}`,tracking_number:`TASK-${id}`,barcode:`TASK-${id}`,title:`Visible task ${id}`,subject:'Subject',source_office:'HRMDO',sender_name:'Sender',classification:'Communication',document_type:'Office Order',employment_classification:null,priority:'Routine',status:'In_Progress',date_received:'2026-09-30',current_step_number:1,total_steps:2,current_location:'HRMDO',current_step_name:'Review',assigned_display_name:'Processor',is_legacy_v1:0});
const response=(items:ReturnType<typeof row>[],page:number,limit:number,total:number,all=total)=>({data:items,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)},queueCounts:{my_tasks:all,team_queue:0,returned:0,waiting:0,ready_for_release:0,completed:0}});

test('task flag OFF retains legacy queue and does not request task endpoint',async({page})=>{
  test.skip(targeted,'This test runs with the task flag OFF build.');
  let reads=0; page.on('request',request=>{if(request.url().includes('/api/document_tasks.php')) reads++;});
  await login(page);
  await expect(page.getByText('Real task document',{exact:true})).toBeVisible();
  await page.locator(`#btn-open-task-${documentId}`).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  expect(reads).toBe(0);
});

test('task flag ON loads pages and filters, rejects stale replies, shows empty and retries errors',async({page})=>{
  test.skip(!targeted,'This test runs with the task flag ON build.');
  const queries:URLSearchParams[]=[];
  let failOnce=true;
  await page.route('**/api/document_tasks.php?*',async route=>{
    const params=new URL(route.request().url()).searchParams; queries.push(params);
    const search=params.get('search')||'',current=Number(params.get('page')||1),limit=Number(params.get('limit')||25);
    if(search==='error'&&failOnce){failOnce=false;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"SQL internals"}'});return;}
    if(search==='old') await new Promise(resolve=>setTimeout(resolve,650));
    else await new Promise(resolve=>setTimeout(resolve,80));
    const empty=search==='zzzz',filtered=!!search||params.has('classification');
    const items=empty?[]:search==='new'?[row(99)]:search==='old'?[row(98)]:filtered?[row(1)]:Array.from({length:current===1?25:1},(_,i)=>row((current-1)*25+i+1));
    await route.fulfill({contentType:'application/json',body:JSON.stringify(response(items,current,limit,empty?0:filtered?1:26,26))});
  });
  await login(page);
  await expect(page.getByRole('status').filter({hasText:'Loading document tasks'})).toBeVisible();
  await expect(page.getByText('Visible task 1',{exact:true})).toBeVisible();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button',{name:'Next'}).click();
  await expect(page.getByText('Visible task 26',{exact:true})).toBeVisible();
  await page.locator('#queue-filter-classification').selectOption('Request');
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  expect(queries.some(query=>query.get('classification')==='Request'&&query.get('page')==='1')).toBe(true);
  await page.locator('#queue-search-input').fill('old');
  await page.waitForTimeout(350);
  await page.locator('#queue-search-input').fill('new');
  await expect(page.getByText('Visible task 99',{exact:true})).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText('Visible task 98',{exact:true})).toHaveCount(0);
  await page.locator('#queue-search-input').fill('zzzz');
  await expect(page.getByText('No tasks match these filters')).toBeVisible();
  await page.locator('#queue-search-input').fill('error');
  await expect(page.getByRole('alert')).toContainText('Document tasks could not be loaded');
  await expect(page.getByRole('alert')).not.toContainText('SQL internals');
  await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByText('Visible task 1',{exact:true})).toBeVisible();
});

test('targeted task opens detail by ID using independent Detail flag',async({page})=>{
  test.skip(!targeted,'This test runs with the task flag ON build.');
  let detailReads=0;
  page.on('request',request=>{if(request.url().includes(`/api/documents.php?id=${documentId}`)) detailReads++;});
  await login(page);
  await expect(page.locator(`#btn-open-task-${documentId}`)).toBeVisible();
  await page.locator(`#btn-open-task-${documentId}`).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
  expect(detailReads).toBe(targetedDetail?1:0);
});
