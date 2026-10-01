import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

test('targeted Payroll shell, list, tasks and detail use scoped read endpoints',async({page})=>{
  test.skip(process.env.VITE_PAYROLL_TARGETED_READS!=='1','Requires the targeted Payroll build');
  const fixture=await startFixture(18787,{HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1'});
  try{
    const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
    const admin=await new Client(fixture.base).login();
    const owner=admin.state.users.find((user:{role:string})=>user.role==='admin');
    const desk={assignmentType:'Person',userId:owner.id,userName:owner.name};
    const batch={id:'browser-payroll',batchNumber:'P9-BROWSER',batchBarcode:'P9-BROWSER-BAR',classification:'Payroll',payrollType:'Salary',office:'HRMDO',payrollPeriod:'October',receivedFromLiaison:'Liaison',remarks:'Phase nine',dateReceived:'2026-10-01T00:00:00Z',dateEncoded:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',createdAt:'2026-10-01T00:00:00Z',encodedBy:{userId:owner.id,userName:owner.name,userRole:'Administrator'},currentStage:'initial_checking',currentStageName:'Initial Checking',status:'INITIAL_CHECKING',assignedDesk:desk,initialCheckingDesk:desk,workflowStages:[{stageNumber:4,name:'Release',status:'Pending',assignedTo:desk}],itemIds:['browser-item'],workGroupIds:[],attachments:[],workflowHistory:[],totalItemsCount:1};
    const item={id:'browser-item',batchId:batch.id,batchNumber:batch.batchNumber,itemNumber:1,barcode:'P9-ITEM-BAR',title:'Browser payroll item',office:'HRMDO',classificationType:'Salary',status:'In_Progress',currentStage:'initial_checking',verificationStatus:'Pending',employmentClassification:'Regular',auditHistory:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE9_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE9_ROWS:JSON.stringify([{collection:'payrollBatches',id:batch.id,value:batch},{collection:'payrollItems',id:item.id,value:item}])});
    fixture.run(['scripts/backfill_payroll_reads.php','--apply']);
    const reads:string[]=[];
    page.on('request',request=>{if(request.url().includes('/api/payroll_'))reads.push(request.url());});
    await page.goto(`${fixture.base}/`);
    await page.getByLabel('Email address or username').fill('admin@example.test');
    await page.getByLabel('Password',{exact:true}).fill(testPassword);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:'Payroll Management',exact:true}).click();
    await expect(page.getByText('P9-BROWSER',{exact:true}).first()).toBeVisible();
    await page.getByRole('button',{name:'Open',exact:true}).first().click();
    await expect(page.getByRole('dialog',{name:'Payroll batch details'}),pageErrors.join('; ')).toContainText('Browser payroll item');
    expect(reads.some(url=>url.includes('payroll_shell_summary.php'))).toBe(true);
    expect(reads.some(url=>url.includes('payroll_batches.php'))).toBe(true);
    expect(reads.some(url=>url.includes('payroll_batch.php'))).toBe(true);
  }finally{await fixture.stop();}
});
