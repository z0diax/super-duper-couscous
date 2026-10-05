import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startFixture, Client, testPassword } from './support.mjs';

test('administrators delete active and completed dynamic records transactionally and retain deletion audit',async()=>{
  const f=await startFixture(18807,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(f.base).login();
    await admin.action('addUser',[{name:'Deletion Worker',email:'delete-worker@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'HRMDO',division:'HRMDO',position:'Officer'}]);
    const person=admin.state.users.find(user=>user.email==='delete-worker@example.test');
    const worker=await new Client(f.base).login('delete-worker@example.test');
    const input={action:'register',classification:'Others',documentType:'Manual delete test',title:'Native deletion',sourceOffice:'HRMDO',barcode:'DELETE-ACTIVE',initialAssigneeId:person.id};
    const form=new FormData();form.append('file',new Blob(['Delete attachment'],{type:'text/plain'}),'delete.txt');
    const file=(await admin.request('files.php','POST',form,201)).file;
    const doc=(await admin.request('document_routing.php','POST',{...input,files:[file]})).data;
    const deletion={action:'delete',documentId:doc.id};
    await worker.request('document_routing.php','POST',deletion,403);
    await admin.request('document_routing.php','POST',deletion,403,{'X-CSRF-Token':'invalid'});
    assert.equal((await worker.request('document_tasks.php?queue=my_tasks')).pagination.total,1);
    assert.equal((await admin.request('document_routing.php','POST',deletion)).data.deleted,true);
    await admin.request('document_routing.php','POST',deletion,404);
    await admin.request(`documents.php?id=${doc.id}`,'GET',undefined,404);
    assert.equal((await worker.request('document_tasks.php?queue=my_tasks')).pagination.total,0);
    const download=await fetch(`${f.base}/api/files.php?id=${file.id}`,{headers:{Cookie:worker.cookie}});assert.equal(download.status,404);
    const remaining=JSON.parse(f.run(['-r',"require 'api/db.php';$p=database();$counts=[];foreach(['documents'=>'id','document_workflow_steps'=>'document_id','document_attachments'=>'document_id','document_custody_history'=>'document_id','app_files'=>'owner_id'] as $table=>$column){$q=$p->prepare('SELECT COUNT(*) FROM `'.$table.'` WHERE `'.$column.'`=?');$q->execute([getenv('DELETED_DOCUMENT')]);$counts[]=(int)$q->fetchColumn();}echo json_encode($counts);"],{DELETED_DOCUMENT:doc.id}));
    assert.deepEqual(remaining,[0,0,0,0,0]);
    let completed=(await admin.request('document_routing.php','POST',{...input,barcode:'DELETE-COMPLETED'})).data;
    completed=(await worker.request('document_routing.php','POST',{documentId:completed.id,action:'complete',routingRevision:completed.routingRevision,remarks:'Done'})).data;
    await admin.request('document_routing.php','POST',{action:'delete',documentId:completed.id});
    await admin.refresh();
    for(const record of [doc,completed]) {
      const events=admin.state.auditLogs.filter(event=>event.documentId===record.id && event.actionType==='DOCUMENT_DELETED');
      assert.equal(events.length,1);assert.deepEqual(JSON.parse(events[0].details).custodyHistory,record.custodyHistory);
    }
    assert.equal((await admin.request('documents.php?registry=1')).pagination.total,0);
    await admin.action('createWorkflowTemplate',[{title:'Normal delete test',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Receive',assigneeType:'Person',assigneeUserId:person.id,assigneeName:person.name,slaHours:24,requiredAction:'Receive',allowHold:false,allowReturn:false,requiresAttachment:false}]}]);
    const normal=(await admin.action('registerDocument',[{...input,classification:'Communication',documentType:'Office Order',barcode:'DELETE-NORMAL'}])).result;
    await admin.request('document_routing.php','POST',{action:'delete',documentId:normal.id},409);
    assert.equal((await admin.request(`documents.php?id=${normal.id}`)).data.id,normal.id);
    await admin.action('deleteDocument',[normal.id]);
    await admin.request(`documents.php?id=${normal.id}`,'GET',undefined,404);
  } finally {await f.stop();}
});

test('Others uses durable normalized routing, assignment locks, history and completion',async()=>{
  const f=await startFixture(18805,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(f.base).login();
    for(const name of ['Alice','Bob','Carol']) await admin.action('addUser',[{name,email:`${name.toLowerCase()}@example.test`,password:testPassword,role:'employee',roleTitle:'Employee',office:'HRMDO',division:'HRMDO',position:'Officer'}]);
    const people=(await admin.request('document_routing.php')).data;
    const [a,b,c]=['Alice','Bob','Carol'].map(name=>people.find(p=>p.name===name));
    const alice=await new Client(f.base).login('alice@example.test'),bob=await new Client(f.base).login('bob@example.test'),carol=await new Client(f.base).login('carol@example.test');
    const input={action:'register',classification:'Others',documentType:'Manual unknown type',title:'Dynamic routing example',sourceOffice:'HRMDO',barcode:'DYNAMIC-TEST-1',initialAssigneeId:a.id};
    for(const change of [{documentType:''},{initialAssigneeId:''},{initialAssigneeId:'missing'},{classification:'Request'}]) await admin.request('document_routing.php','POST',{...input,...change},422);
    await alice.request('document_routing.php','POST',input,403);
    await admin.request('document_routing.php','POST',input,403,{'X-CSRF-Token':'invalid'});
    const temporary=(await admin.action('addUser',[{name:'Temporary',email:'temporary@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'HRMDO',division:'HRMDO',position:'Officer'}])).result;
    await admin.action('deleteUser',[temporary.id]);
    await admin.request('document_routing.php','POST',{...input,initialAssigneeId:temporary.id},422);
    const form=new FormData();form.append('file',new Blob(['attachment content'],{type:'text/plain'}),'routing.txt');
    const file=(await admin.request('files.php','POST',form,201)).file;
    let doc=(await admin.request('document_routing.php','POST',{...input,files:[file]})).data;
    assert.equal(doc.routingMode,'dynamic');assert.equal(doc.workflowTemplateId,null);
    const id=doc.id;
    await admin.request('document_routing.php','POST',input,409);
    const registered=await admin.request('documents.php?registry=1&classification=Others&page=1&limit=1');
    assert.equal(registered.pagination.total,1);assert.equal(registered.data[0].id,id);assert.equal(registered.data[0].routing_mode,'dynamic');
    const tasks=async client=>(await client.request('document_tasks.php?queue=my_tasks&classification=Others&limit=1')).data.map(row=>row.id);
    assert.deepEqual(await tasks(alice),[id]);assert.deepEqual(await tasks(bob),[]);
    const outsiderDownload=await fetch(`${f.base}/api/files.php?id=${file.id}`,{headers:{Cookie:carol.cookie}});assert.equal(outsiderDownload.status,404);
    await alice.action('completeStep',[id,'Attempt to bypass routing','Verified',[]],404);
    const action=(action,targetUserId,remarks='Please check')=>({documentId:id,action,targetUserId,remarks,routingRevision:doc.routingRevision});
    await bob.request('document_routing.php','POST',action('forward',c.id),403);
    await bob.request('document_routing.php','POST',action('complete'),403);
    await alice.request('document_routing.php','POST',action('forward',b.id,''),422);
    await alice.request('document_routing.php','POST',action('complete',undefined,''),422);
    await alice.request('document_routing.php','POST',action('forward','missing'),422);
    await alice.request('document_routing.php','POST',action('forward',a.id),422);
    const stale=action('forward',b.id);
    const aliceSecond=await new Client(f.base).login('alice@example.test');
    const concurrent=await Promise.all([alice,aliceSecond].map(async client=>{
      const response=await fetch(`${f.base}/api/document_routing.php`,{method:'POST',headers:{Cookie:client.cookie,'Content-Type':'application/json','X-CSRF-Token':client.csrf},body:JSON.stringify(stale)});
      return {status:response.status,payload:await response.json()};
    }));
    assert.deepEqual(concurrent.map(result=>result.status).sort(),[200,403]);
    doc=concurrent.find(result=>result.status===200).payload.data;
    await alice.request('document_routing.php','POST',stale,403);
    assert.deepEqual(await tasks(alice),[]);assert.deepEqual(await tasks(bob),[id]);
    await bob.request('document_routing.php','POST',{...action('forward',c.id),routingRevision:1},409);
    const downloaded=await fetch(`${f.base}/api/files.php?id=${file.id}`,{headers:{Cookie:bob.cookie}});assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'attachment content');
    doc=(await bob.request('document_routing.php','POST',action('forward',c.id))).data;
    assert.deepEqual(await tasks(bob),[]);assert.deepEqual(await tasks(carol),[id]);
    await carol.login('carol@example.test');
    const detail=await carol.request(`documents.php?id=${id}`);assert.equal(detail.data.custodyHistory.length,3);assert.equal(detail.data.attachments[0].id,file.id);
    doc=(await carol.request('document_routing.php','POST',action('complete'))).data;
    assert.equal(doc.status,'Archived');assert.deepEqual(await tasks(carol),[]);
    assert.deepEqual(doc.custodyHistory.map(h=>h.movementType),['DOCKETED_SENT','FORWARDED','FORWARDED','COMPLETED']);
    assert.deepEqual(doc.custodyHistory.map(h=>[h.fromUserId,h.toUserId]),[[admin.state.users.find(p=>p.email==='admin@example.test').id,a.id],[a.id,b.id],[b.id,c.id],[c.id,c.id]]);
    await carol.request('document_routing.php','POST',action('complete'),409);
    await carol.request('document_routing.php','POST',action('forward',a.id),409);
    assert.equal((await carol.request('document_tasks.php?queue=completed')).data[0].id,id);
    assert.equal(JSON.parse(f.run(['scripts/backfill_documents_workflow.php','--verify'])).status,'ok');
    assert.equal(f.run(['-r',"require 'api/db.php';echo database()->query(\"SELECT COUNT(*) FROM app_records WHERE collection='documents'\")->fetchColumn();"]),'0');
    assert.equal((await alice.request(`documents.php?id=${id}`)).data.custodyHistory.length,4);
    const archived=await admin.request('documents.php?registry=1&classification=Others&status=Archived');assert.equal(archived.data[0].id,id);
    const template=(await admin.action('createWorkflowTemplate',[{title:'Others predefined route',classification:'Others',documentType:'General Request',isActive:true,steps:[{stepNumber:1,name:'Review request',description:'Review',assigneeType:'Person',assigneeUserId:a.id,assigneeName:a.name,slaHours:24,requiredAction:'Verify & Process',allowHold:false,allowReturn:false,requiresAttachment:false}]}])).result;
    await admin.request('document_routing.php','POST',{...input,documentType:'General Request',barcode:'NORMAL-OTHERS'},409);
    const normal=(await admin.action('registerDocument',[{...input,documentType:'General Request',barcode:'NORMAL-OTHERS'}])).result;
    assert.equal(normal.workflowTemplateId,template.id);assert.equal(normal.routingMode,undefined);
    await alice.request('document_routing.php','POST',{documentId:normal.id,action:'complete',routingRevision:1,remarks:'Attempt'},409);
    await alice.action('completeStep',[normal.id,'Processed','Verified',[]]);
    await admin.action('registerDocument',[{...input,classification:'Communication',documentType:'Letter',barcode:'MISSING-NORMAL'}],422);
    const backup=f.run(['scripts/backup.php']).match(/Database backup: (.+)/)[1].trim();
    const recovery=`hrmdo_test_${Date.now()}_abcdee`;
    try {
      f.run(['scripts/restore.php',backup],{HRMDO_DATABASE:recovery});
      const restored=JSON.parse(f.run(['-r',"require 'api/db.php';$q=database()->prepare('SELECT source_json FROM documents WHERE id=?');$q->execute([getenv('RESTORE_DOCUMENT')]);echo $q->fetchColumn();"],{HRMDO_DATABASE:recovery,RESTORE_DOCUMENT:id}));
      assert.deepEqual(restored.custodyHistory,doc.custodyHistory);assert.equal(restored.status,'Archived');
      assert.equal(f.run(['-r',"require 'api/db.php';$q=database()->prepare('SELECT COUNT(*) FROM document_custody_history WHERE document_id=?');$q->execute([getenv('RESTORE_DOCUMENT')]);echo $q->fetchColumn();"],{HRMDO_DATABASE:recovery,RESTORE_DOCUMENT:id}),'4');
    } finally {
      f.run(['-r',"require 'api/db.php';$name=app_config()['database'];if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',$name))exit(2);database(false)->exec('DROP DATABASE IF EXISTS `'.$name.'`');"],{HRMDO_DATABASE:recovery});
      assert(path.resolve(backup).startsWith(path.resolve('storage/backups')+path.sep));fs.unlinkSync(backup);
    }
  } finally {await f.stop();}
});
