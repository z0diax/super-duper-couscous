import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

const step=(n,assignment,extra={})=>({stepNumber:n,name:`Phase ${n}`,description:'Detail parity',assigneeType:assignment,assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:n>1,allowHold:true,requiresAttachment:false,...extra});
const record=(barcode,type='Office Order',classification='Communication')=>({title:`Detail ${barcode}`,subject:'Detail parity',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification,documentType:type,priority:'Routine',description:'Detail parity',barcode,files:[]});

test('targeted detail preserves lifecycle, audit, visibility and protected files',async t=>{
  const fixture=await startFixture(18774,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    const processor=(await admin.action('addUser',[{name:'Detail Processor',email:'detail-processor@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
    await admin.action('addUser',[{name:'Detail Outsider',email:'detail-outsider@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'Elsewhere',division:'Elsewhere',position:'Employee'}]);
    await admin.action('createWorkflowTemplate',[{title:'Detail lifecycle',description:'Internal',classification:'Communication',documentType:'Office Order',isActive:true,steps:[step(1,'Person',{assigneeUserId:processor.id}),step(2,'Role',{assigneeRole:'reviewer',requiredAction:'Review & Recommend'}),step(3,'Role',{assigneeRole:'releasing_officer',requiredAction:'Release & Archive'})]}]);
    const doc=(await admin.action('registerDocument',[record('DETAIL-INTERNAL')])).result;
    const assigned=[];
    for(const [type,assignment,extra] of [['Memorandum','Role',{assigneeRole:'processor'}],['Letter','Team',{assigneeTeam:'Operations'}]]) {
      await admin.action('createWorkflowTemplate',[{title:`Detail ${type}`,description:'Assignment parity',classification:'Communication',documentType:type,isActive:true,steps:[step(1,assignment,extra)]}]);
      assigned.push((await admin.action('registerDocument',[record(`DETAIL-${type}`,type)])).result);
    }
    const parity=async(id,user=admin)=>{
      const legacy=(await user.refresh()).state.documents.find(item=>item.id===id);
      const target=await user.request(`documents.php?id=${id}`);
      assert.deepEqual(target.data,legacy);
      assert.deepEqual(target.auditEvents,(user.state.auditLogs||[]).filter(event=>event.documentId===id));
      assert(target.auditEvents.every(event=>event.documentId===id));
      return target.data;
    };
    await parity(doc.id);
    const worker=await new Client(fixture.base).login('detail-processor@example.test');
    const outsider=await new Client(fixture.base).login('detail-outsider@example.test');
    assert.equal((await parity(doc.id,worker)).id,doc.id);
    for(const assignedDoc of assigned) {
      assert.equal((await parity(assignedDoc.id,worker)).id,assignedDoc.id);
      assert.equal((await worker.request(`documents.php?trackingNumber=${encodeURIComponent(assignedDoc.trackingNumber)}`)).data.id,assignedDoc.id);
      assert.equal((await worker.request(`documents.php?barcode=${encodeURIComponent(assignedDoc.barcode)}`)).data.id,assignedDoc.id);
    }
    await outsider.request(`documents.php?id=${doc.id}`,'GET',undefined,404);
    await outsider.request(`documents.php?trackingNumber=${encodeURIComponent(doc.trackingNumber)}`,'GET',undefined,404);
    await outsider.request(`documents.php?barcode=${encodeURIComponent(doc.barcode)}`,'GET',undefined,404);
    await outsider.request('documents.php?id=missing','GET',undefined,404);
    await admin.action('completeStep',[doc.id,'Processed']); await parity(doc.id);
    await admin.action('returnStep',[doc.id,'Correction']); await parity(doc.id);
    await admin.action('placeDocumentHold',[doc.id,{reason:'Need evidence',remarks:'Please attach',files:[]}]); await parity(doc.id);
    const body=new FormData(); body.append('file',new Blob(['Phase 6 evidence'],{type:'text/plain'}),'evidence.txt');
    const file=(await admin.request('files.php','POST',body,201)).file;
    await admin.action('submitDocumentCompliance',[doc.id,{remarks:'Evidence received',files:[file]}]);
    const compliance=await parity(doc.id); assert.equal(compliance.attachments[0].id,file.id); assert.equal(compliance.complianceAttachments[0].id,file.id);
    for (const client of [admin,worker,outsider]) {
      const response=await fetch(`${fixture.base}/api/files.php?id=${file.id}`,{headers:{Cookie:client.cookie}});
      assert.equal(response.status,client===outsider?404:200);
    }
    await admin.action('recheckDocumentHold',[doc.id,{}]); await parity(doc.id);
    await admin.action('addDocumentRemark',[doc.id,'Checked']); await parity(doc.id);
    await admin.action('completeStep',[doc.id,'Corrected']); await parity(doc.id);
    await admin.action('completeStep',[doc.id,'Reviewed']); await parity(doc.id);
    await admin.action('releaseDocument',[doc.id,{releasedTo:'Records liaison',releaseMode:'HRMDO Liaison'}]);
    const released=await parity(doc.id); assert.equal(released.status,'Released'); assert.equal(released.custodyHistory.at(-1).movementType,'FINAL_RELEASE');
    await admin.action('createWorkflowTemplate',[{title:'Detail external',description:'External',classification:'Request',documentType:'Certification',isActive:true,steps:[step(1,'Role',{assigneeRole:'receiving_officer',requiredAction:'Receive'}),{stepNumber:2,name:'Outside review',description:'External',stageType:'EXTERNAL_HANDOFF_REVIEW',assigneeType:'System',assigneeName:'System',slaHours:48,requiredAction:'External Handoff',allowReturn:false,requiresAttachment:false,externalPurpose:'Review',externalDestinationMode:'FIXED_DESTINATION',externalDestinationOffice:'Outside office',returnReceiverType:'Role',returnReceiverRole:'receiving_officer',returnReceiverName:'Receiving Officer'},step(3,'Role')]}]);
    const ext=(await admin.action('registerDocument',[record('DETAIL-EXTERNAL','Certification','Request')])).result;
    await parity(ext.id);
    await admin.action('recordExternalHandoff',[ext.id,{destinationOffice:'Outside office',purpose:'Review',handedTo:'Clerk',files:[]}]); await parity(ext.id);
    await admin.action('recordExternalReturn',[ext.id,{returnedFrom:'Outside office',returnedBy:'Clerk',result:'Reviewed',files:[]}]);
    const returned=await parity(ext.id); assert.equal(returned.workflowSteps[1].externalStatus,'COMPLETED');
    const measure=async file=>{
      const times=[]; let bytes=0;
      for(let i=0;i<5;i++) { const start=performance.now(); const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:admin.cookie}}); const text=await response.text(); assert.equal(response.status,200); bytes=Buffer.byteLength(text); times.push(performance.now()-start); }
      times.sort((a,b)=>a-b); return {bytes,medianMs:Number(times[2].toFixed(2))};
    };
    t.diagnostic(`same-fixture detail HTTP sample ${JSON.stringify({state:await measure('state.php'),detail:await measure(`documents.php?id=${doc.id}`)})}`);
  } finally { await fixture.stop(); }
});
