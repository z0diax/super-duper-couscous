import test from 'node:test';
import assert from 'node:assert/strict';
import {startFixture,Client,testPassword} from './support.mjs';

const doc=barcode=>({title:`Sync ${barcode}`,subject:'Revision synchronization',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Phase 11',barcode,files:[]});
const template={title:'Phase 11 office order',description:'Revision fixture',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Process',description:'Process',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false}]};

test('lightweight revision and reference APIs support multi-user Document and Payroll writes',async()=>{
  const fixture=await startFixture(18792,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1'});
  try{
    const a=await new Client(fixture.base).login();
    const created=(await a.action('addUser',[{name:'Second Administrator',email:'second-admin-p11@example.test',password:testPassword,role:'admin',roleTitle:'Administrator',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
    assert.ok(created.id);
    await a.action('createWorkflowTemplate',[template]);
    await a.action('createWorkflowTemplate',[{title:'Phase 11 Payroll Salary',description:'Revision fixture',classification:'Payroll',documentType:'Salary',employmentClassification:'All',isActive:true,steps:[
      {stepNumber:1,name:'Docketing',description:'Receive',assigneeType:'Role',assigneeRole:'receiving_officer',assigneeName:'Receiving Officer',slaHours:24,requiredAction:'Receive',allowReturn:false,allowHold:true,requiresAttachment:false},
      {stepNumber:2,name:'Initial Checking',description:'Classify',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false},
      {stepNumber:3,name:'Parallel Groups',description:'Process',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false},
      {stepNumber:4,name:'Release',description:'Release',assigneeType:'Role',assigneeRole:'releasing_officer',assigneeName:'Releasing Officer',slaHours:24,requiredAction:'Release & Archive',allowReturn:false,allowHold:true,requiresAttachment:false}
    ]}]);
    const b=await new Client(fixture.base).login('second-admin-p11@example.test');
    const baseline=b.revision;
    const initial=await b.request('revision.php');assert.equal(initial.revision,baseline);assert.equal(initial.user.id,created.id);
    const originalConfig=initial.configRevision;
    const aDoc=(await a.action('registerDocument',[doc('P11-A')])).result;
    const next=await b.request('revision.php');assert.equal(next.revision,baseline+1);assert.equal(next.configRevision,originalConfig);
    b.revision=next.revision;
    const bDoc=(await b.action('registerDocument',[doc('P11-B')],200,{refresh:false})).result;
    assert.ok(aDoc.id&&bDoc.id);
    await a.request('documents.php?id='+encodeURIComponent(bDoc.id));

    const payroll=(await a.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'P11-BATCH',items:[{title:'Phase 11 payroll',barcode:'P11-ITEM'}],files:[]}])).result;
    const beforePayroll=b.revision;
    await b.action('updatePayrollItemClassification',[payroll.itemIds[0],'Regular'],409,{refresh:false});
    assert.equal(b.revision,beforePayroll);
    const recovered=await b.request('revision.php');b.revision=recovered.revision;
    await b.action('updatePayrollItemClassification',[payroll.itemIds[0],'Regular'],200,{refresh:false});
    assert.equal((await b.request('payroll_batch.php?id='+payroll.id)).items[0].employmentClassification,'Regular');

    const staleConfig=originalConfig;
    const worker=(await a.action('addUser',[{name:'Config Worker',email:'config-worker-p11@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'HRMDO',division:'Other',position:'Officer'}])).result;
    const changed=await b.request('revision.php');assert.ok(changed.configRevision>staleConfig);
    const reference=await b.request('reference.php');assert.equal(reference.configRevision,changed.configRevision);
    assert.ok(reference.data.users.some(user=>user.email==='config-worker-p11@example.test'));
    assert.equal(reference.data.documents,undefined);assert.equal(reference.data.payrollItems,undefined);assert.equal(reference.data.auditLogs,undefined);
    const workerSession=await new Client(fixture.base).login('config-worker-p11@example.test');
    await a.action('updateUser',[{...worker,role:'processor',roleTitle:'Processor',password:''}]);
    assert.equal((await workerSession.request('revision.php')).user.role,'processor');
    await a.action('deleteUser',[worker.id]);
    await workerSession.request('revision.php','GET',undefined,401);
    assert.equal((await fetch(`${fixture.base}/api/revision.php`)).status,401);
    const raw=await fetch(`${fixture.base}/api/revision.php`,{headers:{Cookie:b.cookie}});assert.match(raw.headers.get('cache-control')||'',/no-store/);
    await b.request('revision.php?verbose=1','GET',undefined,400);
  }finally{await fixture.stop();}
});

test('simultaneous writes admit one revision and reject the other without duplicate effect',async()=>{
  const fixture=await startFixture(18793);
  try{
    const a=await new Client(fixture.base).login();
    const b=await new Client(fixture.base).login();
    const rev=a.revision;
    const request=(client,barcode)=>fetch(`${fixture.base}/api/state.php`,{method:'POST',headers:{Cookie:client.cookie,'Content-Type':'application/json','X-CSRF-Token':client.csrf},body:JSON.stringify({action:'registerEwpRecord',args:[{barcode,employeeName:'Employee',office:'HRMDO',amount:1,purpose:'Assistance',remarks:''}],revision:rev})});
    const responses=await Promise.all([request(a,'P11-CONCURRENT-A'),request(b,'P11-CONCURRENT-B')]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
    await a.refresh();assert.equal(a.state.ewpRecords.length,1);
  }finally{await fixture.stop();}
});

test('unattached uploads can be removed only by their uploader',async()=>{
  const fixture=await startFixture(18796);
  try{
    const a=await new Client(fixture.base).login();
    await a.action('addUser',[{name:'File Officer B',email:'file-b-p11@example.test',password:testPassword,role:'admin',roleTitle:'Administrator',office:'HRMDO',division:'Operations',position:'Officer'}]);
    const b=await new Client(fixture.base).login('file-b-p11@example.test');
    const body=new FormData();body.append('file',new Blob(['temporary upload'],{type:'text/plain'}),'phase11.txt');
    const upload=await a.request('files.php','POST',body,201);
    const id=upload.file.id;
    await b.request(`files.php?id=${id}`,'DELETE',undefined,404);
    assert.equal((await a.request(`files.php?id=${id}`,'DELETE')).ok,true);
    await a.request(`files.php?id=${id}`,'DELETE',undefined,404);
  }finally{await fixture.stop();}
});
