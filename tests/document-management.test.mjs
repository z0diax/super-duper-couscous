import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

test('controlled document management protects ownership, processing, history, retention and concurrency',async()=>{
  const f=await startFixture(18809,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(f.base).login();
    for(const [name,role] of [['Creator','receiving_officer'],['Worker','processor'],['Successor','processor']]){
      await admin.action('addUser',[{name,email:`${name.toLowerCase()}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division:'Operations',position:'Officer'}]);
    }
    const users=Object.fromEntries(admin.state.users.map(u=>[u.name,u]));
    const creator=await new Client(f.base).login('creator@example.test');
    const worker=await new Client(f.base).login('worker@example.test');
    const successor=await new Client(f.base).login('successor@example.test');
    await admin.action('createWorkflowTemplate',[{title:'Controlled metadata',classification:'Communication',documentType:'Office Order',isActive:true,steps:[
      {stepNumber:1,name:'Intake',assigneeType:'Role',assigneeRole:'receiving_officer',assigneeName:'Intake',slaHours:24,requiredAction:'Receive',allowHold:false,allowReturn:false,requiresAttachment:false},
      {stepNumber:2,name:'Verify',assigneeType:'Person',assigneeUserId:users.Worker.id,assigneeName:'Worker',slaHours:24,requiredAction:'Verify & Process',allowHold:true,allowReturn:false,requiresAttachment:false},
      {stepNumber:3,name:'Release',assigneeType:'Person',assigneeUserId:admin.state.users.find(u=>u.role==='admin').id,assigneeName:'Admin',slaHours:24,requiredAction:'Release & Archive',allowHold:false,allowReturn:false,requiresAttachment:false},
    ]}]);
    const input={title:'Original title',subject:'Original subject',description:'Original description',classification:'Communication',documentType:'Office Order',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Original sender',priority:'Routine',files:[]};
    const detail=async(client,id)=>(await client.request(`documents.php?manage=1&id=${id}`)).data;
    const write=async(client,doc,action,fields,reason='',status=200)=>client.request('documents.php','POST',{action,documentId:doc.id,expectedVersion:doc.management.version,reason,...(fields?{fields}:{})},status);
    const create=async(barcode,files=[]) => (await creator.action('registerDocument',[{...input,barcode,files}])).result;
    const form=new FormData();form.append('file',new Blob(['Evidence'],{type:'text/plain'}),'evidence.txt');
    const file=(await creator.request('files.php','POST',form,201)).file;
    let doc=await detail(creator,(await create('CONTROL-EDIT',[file])).id);
    assert.equal(doc.currentStepNumber,2);assert.equal(doc.workflowSteps[0].status,'Completed');
    assert.equal(doc.management.processingStarted,false);assert.equal(doc.management.canEdit,true);assert.equal(doc.management.canDelete,true);
    const original=structuredClone(doc);
    await write(worker,await detail(worker,doc.id),'edit',{title:'Intruder'},'',403);
    await write(worker,await detail(worker,doc.id),'delete',undefined,'Intruder',403);
    await worker.action('deleteDocument',[doc.id],403);
    for(const fields of [{trackingNumber:'REPLACE'},{barcode:'REPLACE'},{encodedBy:{userId:users.Worker.id}},{workflowSteps:[]},{custodyHistory:[]},{classification:'Others'},{documentType:'Hiring'},{dateEncoded:'2020-01-01'}]){
      await write(creator,doc,'edit',fields,'',422);
    }
    await write(creator,doc,'edit',{title:''},'',422);
    await write(creator,doc,'edit',{priority:'Invalid'},'',422);
    await write(creator,doc,'edit',{title:doc.title},'',422);
    await creator.request('documents.php','POST',{action:'edit',documentId:doc.id,expectedVersion:doc.management.version,fields:{title:'CSRF'}},403,{'X-CSRF-Token':'bad'});
    const saved=(await write(creator,doc,'edit',{title:'Corrected title',subject:'Corrected subject',senderContact:'555-0100',priority:'Urgent'},'Clerical update')).data;
    assert.equal(saved.title,'Corrected title');assert.equal(saved.id,doc.id);assert.equal(saved.trackingNumber,original.trackingNumber);
    for(const key of ['encodedBy','dateEncoded','dateReceived','workflowSteps','custodyHistory','attachments','workflowTemplateId','currentStepNumber']) assert.deepEqual(saved[key],original[key]);
    await write(creator,doc,'edit',{title:'Stale overwrite'},'',409);
    const registry=(await creator.request('documents.php?registry=1')).data.find(row=>row.id===doc.id);
    assert.equal(registry.title,'Corrected title');assert.equal(registry.management.canEdit,true);
    await creator.refresh();assert.equal(creator.state.documents.find(d=>d.id===doc.id).title,'Corrected title');
    assert.equal(creator.state.documents.find(d=>d.id===doc.id).management.version,saved.management.version);
    assert.equal((await worker.request(`documents.php?id=${doc.id}`)).data.title,'Corrected title');
    const db=JSON.parse(f.run(['-r',"require 'api/db.php';$p=database();$q=$p->prepare(\"SELECT record_json FROM app_records WHERE collection='documents' AND id=?\");$q->execute([getenv('CHECK_DOCUMENT')]);echo $q->fetchColumn();"],{CHECK_DOCUMENT:doc.id}));
    assert.equal(db.title,'Corrected title');assert.equal(db.management,undefined);
    const stale=saved;
    await worker.action('placeDocumentHold',[doc.id,{reason:'Awaiting clarification',remarks:'Awaiting clarification'}]);
    await write(creator,stale,'edit',{title:'Raced with hold'},'',409);
    doc=await detail(creator,doc.id);
    assert.equal(doc.management.processingStarted,true);assert.equal(doc.management.canEdit,false);assert.equal(doc.management.canDelete,false);
    await write(creator,doc,'edit',{title:'After processing'},'',403);
    await write(creator,doc,'delete',undefined,'',409);
    await admin.action('deleteDocument',[doc.id],409);
    let active=await detail(admin,doc.id);
    assert.equal(active.management.mode,'correction');assert.equal(active.management.canDelete,false);
    await write(admin,active,'correct',{title:'Missing reason'},'',422);
    await write(admin,active,'edit',{title:'Wrong mode'},'',409);
    await write(admin,active,'correct',{workflowSteps:[]},'Attempt to reset',422);
    await write(admin,active,'correct',{custodyHistory:[]},'Attempt to erase',422);
    const corrected=(await write(admin,active,'correct',{description:'Approved clerical correction'},'Correct transcription error')).data;
    assert.deepEqual(corrected.workflowSteps,active.workflowSteps);assert.deepEqual(corrected.custodyHistory,active.custodyHistory);
    assert.deepEqual(corrected.attachments,active.attachments);
    const logs=(await admin.request(`documents.php?id=${doc.id}`)).auditEvents;
    const correction=logs.find(event=>event.actionType==='DOCUMENT_CORRECTED');
    assert.equal(correction.actorId,admin.state.users.find(u=>u.role==='admin').id);assert.ok(correction.timestamp);
    assert.deepEqual(JSON.parse(correction.details),{reason:'Correct transcription error',changes:{description:{before:'Original description',after:'Approved clerical correction'}}});
    const edit=logs.find(event=>event.actionType==='DOCUMENT_EDITED');
    assert.equal(edit.actorId,users.Creator.id);assert.deepEqual(JSON.parse(edit.details).changes.title,{before:'Original title',after:'Corrected title'});

    const deletion=await detail(creator,(await create('CONTROL-DELETE')).id);
    await write(creator,deletion,'delete',undefined,'Entered twice');
    await creator.request(`documents.php?manage=1&id=${deletion.id}`,'GET',undefined,404);
    await creator.refresh();assert.equal(creator.state.documents.some(d=>d.id===deletion.id),false);
    const deletionAudit=creator.state.auditLogs.find(event=>event.documentId===deletion.id && event.actionType==='DOCUMENT_DELETED');
    assert.equal(deletionAudit.actorId,users.Creator.id);assert.equal(JSON.parse(deletionAudit.details).reason,'Entered twice');
    assert.equal(JSON.parse(deletionAudit.details).document.trackingNumber,'CONTROL-DELETE');

    // Claiming an already-person-assigned task need not change its snapshot;
    // its actual audit action must still revoke creator modification rights.
    let claimed=await detail(creator,(await create('CONTROL-CLAIM')).id);
    await worker.action('claimTask',[claimed.id]);
    await write(creator,claimed,'edit',{title:'After claim'},'',409);
    claimed=await detail(creator,claimed.id);
    assert.equal(claimed.management.processingStarted,true);
    assert.equal(claimed.management.canDelete,false);
    const legacyDelete=await create('CONTROL-LEGACY-DELETE');
    await creator.action('deleteDocument',[legacyDelete.id]);
    await admin.refresh();
    assert.ok(admin.state.auditLogs.find(event=>event.documentId===legacyDelete.id && event.actionType==='DOCUMENT_DELETED'));

    // Dynamic metadata changes never introduce app_records copies or change routing.
    const dynamicInput={action:'register',...input,classification:'Others',documentType:'Hiring',initialAssigneeId:users.Worker.id,barcode:'CONTROL-DYNAMIC'};
    let dynamic=(await creator.request('document_routing.php','POST',dynamicInput)).data;
    assert.equal(dynamic.management.processingStarted,false);
    dynamic=(await write(creator,dynamic,'edit',{title:'Dynamic corrected'})).data;
    assert.equal(dynamic.routingRevision,1);
    const openDynamic=await detail(creator,dynamic.id);
    dynamic=(await worker.request('document_routing.php','POST',{action:'forward',documentId:dynamic.id,routingRevision:1,targetUserId:users.Successor.id,remarks:'Review'})).data;
    await write(creator,openDynamic,'delete',undefined,'Raced with forward',409);
    assert.equal(dynamic.management.canEdit,false);
    await creator.request('document_routing.php','POST',{action:'delete',documentId:dynamic.id,expectedVersion:openDynamic.management.version},409);
    active=await detail(admin,dynamic.id);
    dynamic=(await write(admin,active,'correct',{subject:'Corrected active subject'},'Subject typo')).data;
    assert.deepEqual(dynamic.custodyHistory,active.custodyHistory);assert.equal(dynamic.routingRevision,2);
    dynamic=(await successor.request('document_routing.php','POST',{action:'complete',documentId:dynamic.id,routingRevision:2,remarks:'Done'})).data;
    const completed=await detail(admin,dynamic.id);
    assert.equal(completed.management.canEdit,false);assert.equal(completed.management.canDelete,false);
    await write(admin,completed,'correct',{title:'Archived rewrite'},'No',403);
    await write(admin,completed,'delete',undefined,'No',409);
    assert.equal(f.run(['-r',"require 'api/db.php';$q=database()->prepare(\"SELECT COUNT(*) FROM app_records WHERE collection='documents' AND id=?\");$q->execute([getenv('CHECK_DOCUMENT')]);echo $q->fetchColumn();"],{CHECK_DOCUMENT:dynamic.id}),'0');

    // Process a separate predefined document through release; keep it protected.
    let released=await create('CONTROL-RELEASE');
    await worker.action('completeStep',[released.id,'Verified','Verified',[]]);
    await admin.action('releaseDocument',[released.id,{releasedTo:'Records Office',releaseMode:'In-Person Pickup',receiptRemarks:'Received'}]);
    released=await detail(admin,released.id);
    assert.equal(released.status,'Released');assert.equal(released.management.canEdit,false);
    await write(admin,released,'delete',undefined,'No',409);

    // Force an audit failure AFTER metadata writes: both sources must roll back.
    const rollback=await detail(creator,(await create('CONTROL-ROLLBACK')).id);
    const revisionBefore=(await creator.request('revision.php')).revision;
    f.run(['-r',"require 'api/db.php';database()->exec(\"CREATE TRIGGER fail_management_audit BEFORE INSERT ON app_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Forced management audit failure'\");"]);
    await write(creator,rollback,'edit',{title:'Must roll back'},'Test',503);
    f.run(['-r',"require 'api/db.php';database()->exec('DROP TRIGGER fail_management_audit');"]);
    assert.equal((await detail(creator,rollback.id)).title,rollback.title);
    assert.equal((await creator.request('revision.php')).revision,revisionBefore);
    await creator.refresh();assert.equal(creator.state.documents.find(d=>d.id===rollback.id).title,rollback.title);

    // Attachment deletion revokes access and removes normalized child rows.
    const upload=new FormData();upload.append('file',new Blob(['Delete me'],{type:'text/plain'}),'delete.txt');
    const attachment=(await creator.request('files.php','POST',upload,201)).file;
    let remove=(await creator.request('document_routing.php','POST',{...dynamicInput,barcode:'CONTROL-DYNAMIC-DELETE',files:[attachment]})).data;
    await write(creator,remove,'delete',undefined,'Duplicate docket');
    const download=await fetch(`${f.base}/api/files.php?id=${attachment.id}`,{headers:{Cookie:creator.cookie}});assert.equal(download.status,404);
    assert.deepEqual(JSON.parse(f.run(['-r',"require 'api/db.php';$p=database();$counts=[];foreach(['documents'=>'id','document_workflow_steps'=>'document_id','document_custody_history'=>'document_id','document_attachments'=>'document_id','app_files'=>'owner_id'] as $table=>$column){$q=$p->prepare('SELECT COUNT(*) FROM `'.$table.'` WHERE `'.$column.'`=?');$q->execute([getenv('CHECK_DOCUMENT')]);$counts[]=(int)$q->fetchColumn();}echo json_encode($counts);"],{CHECK_DOCUMENT:remove.id})),[0,0,0,0,0]);
    assert.equal(JSON.parse(f.run(['scripts/backfill_documents_workflow.php','--verify'])).status,'ok');
    // Unknown snapshots are denied rather than assumed unprocessed.
    f.run(['-r',"require 'api/db.php';$p=database();$q=$p->prepare(\"UPDATE documents SET source_json=JSON_REMOVE(source_json,'$.custodyHistory') WHERE id=?\");$q->execute([getenv('CHECK_DOCUMENT')]);"],{CHECK_DOCUMENT:rollback.id});
    const unknown=(await admin.request('documents.php?registry=1')).data.find(d=>d.id===rollback.id);
    assert.equal(unknown.management.processingStarted,null);assert.equal(unknown.management.canEdit,false);assert.equal(unknown.management.canDelete,false);
  }finally{await f.stop();}
});

test('management works with targeted reads disabled without relaxing existing read rollout gates',async()=>{
  const f=await startFixture(18811,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'0'});
  try{
    const admin=await new Client(f.base).login();
    await admin.action('createWorkflowTemplate',[{title:'Legacy management',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Review',assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowHold:false,allowReturn:false,requiresAttachment:false}]}]);
    const doc=(await admin.action('registerDocument',[{title:'Default build',subject:'Subject',classification:'Communication',documentType:'Office Order',sourceOffice:'HRMDO',priority:'Routine',barcode:'LEGACY-MANAGE',files:[]}])).result;
    await admin.request('documents.php?registry=1','GET',undefined,503);
    const loaded=(await admin.request(`documents.php?manage=1&id=${doc.id}`)).data;
    assert.equal(loaded.management.canEdit,true);
    const saved=(await admin.request('documents.php','POST',{action:'edit',documentId:doc.id,expectedVersion:loaded.management.version,fields:{title:'Edited default build'},reason:''})).data;
    await admin.refresh();assert.equal(admin.state.documents.find(d=>d.id===doc.id).title,saved.title);
  }finally{await f.stop();}
});
