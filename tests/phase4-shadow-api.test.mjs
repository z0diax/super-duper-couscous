import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

const step=(n,role,action,extra={})=>({stepNumber:n,name:`Phase ${n}`,description:'Phase 4 test',assigneeType:'Role',assigneeRole:role,assigneeName:role,slaHours:24,requiredAction:action,allowReturn:n>1,allowHold:true,requiresAttachment:false,...extra});
const data=(barcode,documentType='Office Order',classification='Communication')=>({title:`Record ${barcode}`,subject:'Test',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification,documentType,priority:'Routine',description:'Test',barcode,files:[]});

test('runtime document and workflow writes synchronize atomically with their shadow tables',async()=>{
  const fixture=await startFixture(18768,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    const verify=()=>{const result=JSON.parse(fixture.run(['scripts/backfill_documents_workflow.php','--verify'])); assert.equal(result.status,'ok',JSON.stringify(result.issues)); return result;};
    const worker=(await admin.action('addUser',[{name:'Phase 4 Processor',email:'phase4-processor@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
    const configured=(await admin.action('createWorkflowTemplate',[{title:'Shadow lifecycle',description:'Internal lifecycle',classification:'Communication',documentType:'Office Order',isActive:true,steps:[step(1,'processor','Verify & Process'),step(2,'reviewer','Review & Recommend'),step(3,'releasing_officer','Release & Archive')]}])).result;
    verify();
    const doc=(await admin.action('registerDocument',[data('PHASE4-INTERNAL')])).result;
    assert.equal(verify().counts.documents.normalized,1);
    await admin.action('claimTask',[doc.id]); verify();
    await admin.action('completeStep',[doc.id,'Processed']); verify();
    await admin.action('returnStep',[doc.id,'Needs correction']); verify();
    await admin.action('reassignTask',[doc.id,worker.id,'','Reassign for correction']); verify();
    await admin.action('placeDocumentHold',[doc.id,{reason:'Need evidence',remarks:'Please attach',files:[]}]); verify();
    const fileBody=new FormData(); fileBody.append('file',new Blob(['Phase 4 attachment'],{type:'text/plain'}),'evidence.txt');
    const file=(await admin.request('files.php','POST',fileBody,201)).file;
    await admin.action('submitDocumentCompliance',[doc.id,{remarks:'Evidence received',files:[file]}]);
    assert.equal(verify().counts.document_attachments.normalized,2);
    await admin.action('recheckDocumentHold',[doc.id,{}]); verify();
    await admin.action('addDocumentRemark',[doc.id,'Ready to proceed']); verify();
    await admin.action('completeStep',[doc.id,'Corrected']); verify();
    await admin.action('completeStep',[doc.id,'Reviewed']); verify();
    await admin.action('releaseDocument',[doc.id,{releasedTo:'Records liaison',releaseMode:'HRMDO Liaison'}]);
    const released=verify(); assert.equal(released.counts.document_custody_history.normalized,2);
    const detail=(await admin.request(`documents.php?id=${encodeURIComponent(doc.id)}`)).data;
    assert.equal(detail.status,'Released'); assert.equal(detail.workflowSteps[0].status,'Completed');
    assert.equal(detail.attachments[0].id,file.id); assert.equal(detail.custodyHistory.at(-1).movementType,'FINAL_RELEASE');
    const updated=(await admin.action('updateWorkflowTemplate',[{...configured,title:'Shadow lifecycle v2'}])).result;
    assert.equal(updated.version,2); verify();
    const versions=JSON.parse(fixture.run(['-r',`require 'api/db.php'; $p=database(); $q=$p->prepare('SELECT version,is_current FROM workflow_templates WHERE id=? ORDER BY version'); $q->execute([getenv('PHASE4_TEMPLATE')]); echo json_encode($q->fetchAll());`],{PHASE4_TEMPLATE:configured.id}));
    assert.deepEqual(versions.map(row=>[Number(row.version),Number(row.is_current)]),[[1,0],[2,1]]);
    const deactivated=(await admin.action('updateWorkflowTemplate',[{...updated,isActive:false}])).result;
    assert.equal(deactivated.version,3); assert.equal(deactivated.isActive,false); verify();
    const unused=(await admin.action('createWorkflowTemplate',[{title:'Disposable workflow',description:'Unused',classification:'Communication',documentType:'Letter',isActive:false,steps:[step(1,'processor','Verify & Process')]}])).result;
    await admin.action('deleteWorkflowTemplate',[unused.id]); verify();
    const oldVersion=JSON.parse(fixture.run(['-r',`require 'api/db.php'; $p=database(); $q=$p->prepare('SELECT COUNT(*) FROM workflow_templates WHERE id=? AND is_current=0'); $q->execute([getenv('PHASE4_TEMPLATE')]); echo json_encode((int)$q->fetchColumn());`],{PHASE4_TEMPLATE:unused.id}));
    assert.equal(oldVersion,1);
    const extTemplate=(await admin.action('createWorkflowTemplate',[{title:'External shadow',description:'External lifecycle',classification:'Request',documentType:'Certification',isActive:true,steps:[step(1,'receiving_officer','Receive'),{stepNumber:2,name:'Outside review',description:'External',stageType:'EXTERNAL_HANDOFF_REVIEW',assigneeType:'System',assigneeName:'System',slaHours:48,requiredAction:'External Handoff',allowReturn:false,requiresAttachment:false,externalPurpose:'Review',externalDestinationMode:'FIXED_DESTINATION',externalDestinationOffice:'Outside office',returnReceiverType:'Role',returnReceiverRole:'receiving_officer',returnReceiverName:'Receiving Officer'},step(3,'processor','Verify & Process')]}])).result;
    assert(extTemplate.id); verify();
    const ext=(await admin.action('registerDocument',[data('PHASE4-EXTERNAL','Certification','Request')])).result;
    await admin.action('recordExternalHandoff',[ext.id,{destinationOffice:'Outside office',purpose:'Review',handedTo:'Clerk',files:[]}]); verify();
    await admin.action('recordExternalReturn',[ext.id,{returnedFrom:'Outside office',returnedBy:'Clerk',result:'Reviewed',files:[]}]);
    assert.equal(verify().counts.document_custody_history.normalized,5);
    const extDetail=(await admin.request(`documents.php?id=${encodeURIComponent(ext.id)}`)).data;
    assert.equal(extDetail.workflowSteps[1].externalStatus,'COMPLETED'); assert.equal(extDetail.currentStepNumber,3);
    await admin.action('deleteDocument',[doc.id]);
    assert.equal(verify().counts.documents.normalized,1);
    await admin.request(`documents.php?id=${encodeURIComponent(doc.id)}`,'GET',undefined,404);
    const preRevision=admin.revision;
    fixture.run(['-r',`require 'api/db.php'; database()->exec("CREATE TRIGGER phase4_shadow_failure BEFORE INSERT ON document_workflow_steps FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected shadow failure'");`]);
    await admin.action('registerDocument',[data('PHASE4-ROLLBACK','Certification','Request')],503);
    fixture.run(['-r',`require 'api/db.php'; database()->exec('DROP TRIGGER phase4_shadow_failure');`]);
    await admin.refresh(); assert.equal(admin.revision,preRevision);
    const remaining=JSON.parse(fixture.run(['-r',`require 'api/db.php'; $p=database(); $q=$p->query("SELECT COUNT(*) FROM app_records WHERE collection='documents' AND JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.trackingNumber'))='PHASE4-ROLLBACK'"); echo json_encode((int)$q->fetchColumn());`]));
    assert.equal(remaining,0); verify();
  } finally { await fixture.stop(); }
});

test('targeted read HTTP endpoints enforce sessions, scope, parameters and feature flag',async t=>{
  const fixture=await startFixture(18769,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    const processorUser=(await admin.action('addUser',[{name:'Phase 4 Worker',email:'worker@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
    await admin.action('addUser',[{name:'Phase 4 Outsider',email:'outsider@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'Elsewhere',division:'Elsewhere',position:'Employee'}]);
    const worker=await new Client(fixture.base).login('worker@example.test');
    const outsider=await new Client(fixture.base).login('outsider@example.test');
    const definitions=[['Office Order','Person',{assigneeUserId:processorUser.id}],['Memorandum','Role',{assigneeRole:'processor'}],['Letter','Team',{assigneeTeam:'Operations'}]];
    const docs=[];
    for (const [type,assignment,extra] of definitions) {
      await admin.action('createWorkflowTemplate',[{title:`${type} routing`,description:'Endpoint fixture',classification:'Communication',documentType:type,isActive:true,steps:[{...step(1,'processor','Verify & Process'),assigneeType:assignment,...extra}]}]);
      docs.push((await admin.action('registerDocument',[data(`API-${type.replaceAll(' ','-')}`,type)])).result);
    }
    const anonymous=new Client(fixture.base);
    await anonymous.request('documents.php','GET',undefined,401);
    await admin.request('documents.php','POST',{},405);
    const list=await worker.request('documents.php');
    assert.equal(list.pagination.limit,25); assert.equal(list.pagination.total,3); assert.equal(list.data.length,3);
    assert(!Object.hasOwn(list.data[0],'workflowSteps'));
    assert.equal((await admin.request('documents.php?page=2&limit=1')).pagination.totalPages,3);
    assert.equal((await admin.request('documents.php?limit=100')).pagination.limit,100);
    await admin.request('documents.php?page=0','GET',undefined,400);
    await admin.request('documents.php?limit=101','GET',undefined,400);
    await admin.request('documents.php?unexpected=1','GET',undefined,400);
    await admin.request('documents.php?assignedUser=x&assignedRole=y&id=foo','GET',undefined,400);
    assert.equal((await admin.request('documents.php?status=In_Progress&classification=Communication')).pagination.total,3);
    assert.equal((await admin.request('documents.php?documentType=Memorandum')).pagination.total,1);
    const one=docs[0];
    for (const query of [`id=${one.id}`,`trackingNumber=${encodeURIComponent(one.trackingNumber)}`,`barcode=${encodeURIComponent(one.barcode)}`]) {
      assert.equal((await worker.request(`documents.php?${query}`)).data.id,one.id);
      await outsider.request(`documents.php?${query}`,'GET',undefined,404);
    }
    await worker.request('documents.php?id=missing','GET',undefined,404);
    assert.equal((await admin.request(`documents.php?id=${one.id}`)).data.id,one.id);
    assert.deepEqual((await worker.request('document_tasks.php')).data.map(row=>row.id).sort(),docs.map(doc=>doc.id).sort());
    await worker.request('document_tasks.php?userId=other','GET',undefined,400);
    assert.equal((await outsider.request('document_tasks.php')).pagination.total,0);
    await outsider.request('workflow_templates.php','GET',undefined,403);
    const templates=await admin.request('workflow_templates.php');
    assert.equal(templates.pagination.total,3);
    const current=await admin.request(`workflow_templates.php?id=${docs[0].workflowTemplateId}`);
    assert.equal(current.data.steps.length,1);
    assert.equal((await admin.request(`workflow_templates.php?id=${docs[0].workflowTemplateId}&version=1`)).data.version,1);
    await admin.request('workflow_templates.php?version=1','GET',undefined,400);
    await admin.request('workflow_templates.php?id=missing','GET',undefined,404);
    const measure=async file=>{
      const durations=[]; let bytes=0;
      for(let i=0;i<5;i++) {
        const started=performance.now();
        const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:admin.cookie}});
        const body=await response.text();
        assert.equal(response.status,200); durations.push(performance.now()-started); bytes=Buffer.byteLength(body);
      }
      durations.sort((a,b)=>a-b);
      return {bytes,medianMs:Number(durations[2].toFixed(2))};
    };
    t.diagnostic(`isolated HTTP sample ${JSON.stringify({state:await measure('state.php'),detail:await measure(`documents.php?id=${one.id}`),list:await measure('documents.php?limit=25')})}`);
  } finally { await fixture.stop(); }
  const disabled=await startFixture(18770,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'0'});
  try {
    const admin=await new Client(disabled.base).login();
    await admin.request('documents.php','GET',undefined,503);
    assert.equal((await admin.request('state.php')).state.documents.length,0);
  } finally { await disabled.stop(); }
});
