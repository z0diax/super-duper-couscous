import {test,expect,type Browser,type Page} from '@playwright/test';
import {startFixture,Client,testPassword} from '../support.mjs';

const login=async(page:Page,base:string,email:string)=>{
  await page.goto(`${base}/`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
};
const postAction=async(page:Page,base:string,action:string,args:unknown[])=>{
  const session=await (await page.context().request.get(`${base}/api/auth.php`)).json();
  const revision=await (await page.context().request.get(`${base}/api/revision.php`)).json();
  const response=await page.context().request.post(`${base}/api/state.php`,{data:{action,args,revision:revision.revision},headers:{'X-CSRF-Token':session.csrfToken}});
  expect(response.status()).toBe(200);return response.json();
};
const fillEwp=async(page:Page,barcode:string)=>{
  await page.getByRole('button',{name:'Register Leave or EWP'}).click();
  await page.locator('button[aria-pressed]').filter({hasText:'EWP Record'}).click();
  await page.locator('#leave-input-barcode').fill(barcode);
  await page.locator('#leave-input-applicant').fill('Browser Employee');
  await page.locator('#leave-select-office').selectOption('HRMDO - Human Resource Management and Development Office');
  await page.locator('#ewp-input-amount').fill('100');
  await page.locator('#ewp-input-purpose').fill('Assistance');
};

test('two browser contexts sync revisions, observe targeted changes and recover a stale write',async({browser}: {browser:Browser})=>{
  test.setTimeout(120000);
  test.skip(process.env.VITE_LIGHTWEIGHT_STATE_SYNC!=='1','Requires the fully targeted lightweight build');
  const fixture=await startFixture(18794,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1'});
  const contextA=await browser.newContext();const contextB=await browser.newContext();
  try{
    const seed=await new Client(fixture.base).login();
    await seed.action('addUser',[{name:'Browser Officer B',email:'browser-b-p11@example.test',password:testPassword,role:'admin',roleTitle:'Administrator',office:'HRMDO',division:'Operations',position:'Officer'}]);
    await seed.action('createWorkflowTemplate',[{title:'Browser office order',description:'Phase 11',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Process',description:'Process',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false}]}]);
    const pageA=await contextA.newPage(),pageB=await contextB.newPage();
    const bRevisions:number[]=[];let bStateGets=0;
    pageB.on('request',request=>{if(request.method()==='GET'&&request.url().includes('/api/state.php'))bStateGets++;});
    pageB.on('response',async response=>{if(response.url().includes('/api/revision.php')&&response.ok()){try{bRevisions.push((await response.json()).revision);}catch{/* Navigation may close the response. */}}});
    await login(pageA,fixture.base,'admin@example.test');await login(pageB,fixture.base,'browser-b-p11@example.test');
    await pageB.getByRole('button',{name:'Document Registry',exact:true}).click();
    const document=await postAction(pageA,fixture.base,'registerDocument',[{title:'Phase 11 cross-user document',subject:'Visibility',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Phase 11',barcode:'P11-BROWSER-DOC',files:[]}]);
    await expect(pageB.getByText('Phase 11 cross-user document')).toBeVisible({timeout:22000});
    await expect.poll(()=>Math.max(-1,...bRevisions),{timeout:12000}).toBeGreaterThanOrEqual(document.revision);
    await pageB.getByRole('button',{name:'Leave Records',exact:true}).click();
    await pageB.getByRole('tab',{name:/EWP Records/}).click();
    const first=await postAction(pageA,fixture.base,'registerEwpRecord',[{barcode:'P11-BROWSER-A',employeeName:'A Employee',office:'HRMDO',amount:50,purpose:'Assistance',remarks:''}]);
    await expect(pageB.getByText('P11-BROWSER-A')).toBeVisible({timeout:20000});
    await expect.poll(()=>Math.max(-1,...bRevisions),{timeout:12000}).toBeGreaterThanOrEqual(first.revision);
    await fillEwp(pageB,'P11-BROWSER-B');
    await pageB.locator('#btn-submit-filing').click();
    await expect(pageB.getByText('P11-BROWSER-B')).toBeVisible({timeout:12000});

    await pageB.route('**/api/revision.php',route=>route.abort());
    const second=await postAction(pageA,fixture.base,'registerEwpRecord',[{barcode:'P11-BROWSER-A2',employeeName:'A Employee',office:'HRMDO',amount:75,purpose:'Assistance',remarks:''}]);
    await fillEwp(pageB,'P11-BROWSER-C');
    await pageB.locator('#btn-submit-filing').click();
    await expect(pageB.getByText('Review the latest record')).toBeVisible();
    await expect(pageB.getByRole('button',{name:'Retry sync'})).toBeVisible();
    await expect(pageB.locator('#leave-input-barcode')).toHaveValue('P11-BROWSER-C');
    await pageB.unroute('**/api/revision.php');
    await pageB.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect.poll(()=>Math.max(-1,...bRevisions),{timeout:12000}).toBeGreaterThanOrEqual(second.revision);
    await expect(pageB.getByRole('button',{name:'Retry sync'})).toHaveCount(0);
    await pageB.locator('#btn-submit-filing').click();
    await expect(pageB.getByText('P11-BROWSER-C')).toBeVisible({timeout:12000});
    const state=await seed.refresh();assertUnique(state.state.ewpRecords.map((record:{barcode:string})=>record.barcode),'P11-BROWSER-C');
    expect(bStateGets).toBe(1);
  }finally{await contextA.close();await contextB.close();await fixture.stop();}
});

function assertUnique(values:string[],target:string){expect(values.filter(value=>value===target)).toHaveLength(1);}

test('failed reference refresh is visible and retries after reconnect',async({page})=>{
  test.skip(process.env.VITE_LIGHTWEIGHT_STATE_SYNC!=='1','Requires the fully targeted lightweight build');
  const fixture=await startFixture(18797,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1'});
  try{
    const other=await new Client(fixture.base).login();
    await login(page,fixture.base,'admin@example.test');
    await page.route('**/api/reference.php',route=>route.abort());
    await other.action('addUser',[{name:'Reference Recovery User',email:'reference-recovery-p11@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'HRMDO',division:'Operations',position:'Officer'}]);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button',{name:'Retry sync'})).toBeVisible({timeout:12000});
    await page.unroute('**/api/reference.php');
    await page.getByRole('button',{name:'Retry sync'}).click();
    await expect(page.getByRole('button',{name:'Retry sync'})).toHaveCount(0);
    await page.getByRole('button',{name:'Users & Designations'}).click();
    await expect(page.getByText('Reference Recovery User')).toBeVisible();
  }finally{await fixture.stop();}
});
