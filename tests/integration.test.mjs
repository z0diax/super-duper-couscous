import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startFixture, Client, testPassword } from './support.mjs';
let fixture, admin, employee, receiver, processor, approver, releaser, workflow, payrollWorkflow, doc, batch;
const userData = (role) => ({name:`Test ${role}`,email:`${role}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division:'Operations',position:'Officer'});
const step = (n,role,action,extra={}) => ({stepNumber:n,name:`Step ${n}`,description:'Test routing',assigneeType:'Role',assigneeRole:role,assigneeName:role,slaHours:24,requiredAction:action,allowHold:true,allowReturn:n>1,requiresAttachment:false,...extra});
const documentData = (barcode) => ({title:'Integration document',subject:'Test subject',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Test Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Test',barcode,files:[]});
before(async()=>{ fixture=await startFixture(); admin=await new Client(fixture.base).login(); });
after(async()=>{ await fixture?.stop(); });

test('installer is repeatable and all collections are available',async()=>{
  assert.equal(admin.state.classifications.length,4); assert.equal(admin.state.systemRoles.length,8); assert.equal(admin.state.documents.length,0);
  const previous=JSON.stringify(admin.state); fixture.run(['scripts/install.php']); await admin.refresh(); assert.equal(JSON.stringify(admin.state),previous);
});
test('authentication, CSRF and whole-state writes are enforced',async()=>{
  const anonymous=new Client(fixture.base); await anonymous.request('state.php','GET',undefined,401);
  await anonymous.request('auth.php'); await anonymous.request('auth.php','POST',{email:'admin@example.test',password:'wrong'},401);
  await admin.request('state.php','PUT',{state:{users:[]}},405);
  await admin.request('state.php','POST',{action:'runMigrationCheck',args:[],revision:admin.revision},403,{'X-CSRF-Token':'invalid'});
});
test('user accounts can sign in; non-admin accounts cannot alter configuration',async()=>{
  for(const role of ['employee','receiving_officer','processor','approver','releasing_officer']) await admin.action('addUser',[userData(role)]);
  employee=await new Client(fixture.base).login('employee@example.test'); processor=await new Client(fixture.base).login('processor@example.test');
  receiver=await new Client(fixture.base).login('receiving_officer@example.test');
  approver=await new Client(fixture.base).login('approver@example.test'); releaser=await new Client(fixture.base).login('releasing_officer@example.test');
  await employee.action('addUser',[userData('admin')],403);
  const employeeAccount=admin.state.users.find(user=>user.role==='employee');
  await admin.action('updateUser',[{...employeeAccount,password:'',sidebarModules:['leave']}]);
  await employee.refresh(); assert.deepEqual(employee.state.users.find(user=>user.id===employeeAccount.id).sidebarModules,['leave']);
  await admin.action('addUser',[userData('processor')],409);
  await admin.action('deleteUser',[admin.state.users.find(u=>u.role==='admin').id],422);
  assert(!JSON.stringify(admin.state).includes(testPassword)); assert(!JSON.stringify(admin.state).includes('password_hash'));
});
test('payroll batch intake derives its first phases from the configured workflow template',async()=>{
  const configured=(await admin.action('createWorkflowTemplate',[{title:'Config-driven Voucher Payroll',description:'Custom payroll phase labels and actions',classification:'Payroll',documentType:'Voucher',employmentClassification:'Job Order (JOW)',isActive:true,steps:[
    {...step(1,'receiving_officer','Review & Recommend'),name:'Receiving Validation'},
    {...step(2,'processor','Approve & Sign'),name:'Payroll Classification Review'},
    {...step(3,'releasing_officer','Release & Archive'),name:'Custom Payroll Release'},
  ]}])).result;
  const configuredBatch=(await receiver.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Voucher',batchBarcode:'CONFIG-DRIVEN-VOUCHER-001',items:[{title:'Config-driven payroll item',barcode:'CONFIG-DRIVEN-PAY-001',classificationType:'Voucher'}],files:[]}])).result;
  assert.equal(configuredBatch.workflowTemplateId,configured.id);
  assert.equal(configuredBatch.workflowStages[0].name,'Receiving Validation');
  assert.equal(configuredBatch.workflowStages[1].name,'Payroll Classification Review');
  assert.equal(configuredBatch.initialCheckingDesk.roleId,'processor');
});
test('catalogue create/edit/toggle and routing validation persist',async()=>{
  const category=admin.state.classifications.find(c=>c.classification==='Communication');
  const added=(await admin.action('addClassificationType',[category.id,{name:'Special Letter',description:'Test',defaultSlaHours:12}])).result;
  await admin.action('addClassificationType',[category.id,{name:'special letter',description:'Duplicate',defaultSlaHours:12}],409);
  await admin.action('updateClassificationType',[category.id,{...added,description:'Updated'}]);
  await admin.action('toggleClassificationType',[category.id,added.id]);
  await admin.action('registerDocument',[{...documentData('BLOCKED'),documentType:'Special Letter'}],422);
  await admin.action('deleteClassificationType',[category.id,added.id]);
  assert(!admin.state.classifications.find(c=>c.id===category.id).types.some(t=>t.id===added.id));
  await admin.action('createWorkflowTemplate',[{title:'Invalid',classification:'Communication',documentType:'Office Order',isActive:true,steps:[]}],422);
  workflow=(await admin.action('createWorkflowTemplate',[{title:'Communication approval',description:'Full lifecycle',classification:'Communication',documentType:'Office Order',isActive:true,steps:[step(1,'processor','Verify & Process'),step(2,'approver','Approve & Sign',{requiresAttachment:true}),step(3,'releasing_officer','Release & Archive')]}])).result;
  const multi=(await admin.action('createWorkflowTemplate',[{title:'Shared communication route',description:'One route for several types',classification:'Communication',documentType:'Memorandum',documentTypes:['Memorandum','Letter'],isActive:true,steps:[step(1,'processor','Verify & Process')]}])).result;
  assert.deepEqual(multi.documentTypes,['Memorandum','Letter']);
  assert.equal((await admin.action('registerDocument',[{...documentData('MULTI-MEMO'),documentType:'Memorandum'}])).result.workflowTemplateId,multi.id);
  assert.equal((await admin.action('registerDocument',[{...documentData('MULTI-LETTER'),documentType:'Letter'}])).result.workflowTemplateId,multi.id);
  const letter=admin.state.classifications.find(c=>c.id===category.id).types.find(t=>t.name==='Letter');
  await admin.action('deleteClassificationType',[category.id,letter.id],422);
});
test('document creation is atomic, unique, and retains a workflow snapshot',async()=>{
  await employee.action('registerDocument',[documentData('FORBIDDEN')],403);
  doc=(await admin.action('registerDocument',[{...documentData('DOC-TEST-001'),senderName:'HRMDO Signatory'}])).result;
  assert.equal(doc.workflowSteps.length,3); assert.equal(doc.senderName,'HRMDO'); const revision=admin.revision;
  await admin.action('registerDocument',[documentData('doc-test-001')],409); assert.equal(admin.revision,revision);
  await admin.action('updateWorkflowTemplate',[{...workflow,title:'Updated workflow',steps:workflow.steps.map(s=>({...s,slaHours:36}))}]);
  assert.equal(admin.state.documents.find(d=>d.id===doc.id).workflowSteps[0].slaHours,24);
  await admin.action('deleteWorkflowTemplate',[workflow.id],422);
  await employee.action('completeStep',[doc.id,'Forged completion'],404);
});
test('stale sessions cannot overwrite changes or complete the next step accidentally',async()=>{
  const other=await new Client(fixture.base).login(); await admin.refresh(); const stale=other.revision;
  await admin.action('addDocumentRemark',[doc.id,'First update'],200,{refresh:false});
  await other.request('state.php','POST',{action:'addDocumentRemark',args:[doc.id,'Stale update'],revision:stale},409);
  await other.refresh(); assert.equal(other.state.documents.find(d=>d.id===doc.id).remarks.length,1);
});
test('claim, return, required uploads, approval, release, and read-only history',async()=>{
  await processor.action('claimTask',[doc.id]); await processor.action('completeStep',[doc.id,'Verified']);
  await approver.action('approveDocument',[doc.id,'Approve without attachment'],422);
  await approver.action('returnStep',[doc.id,'Correct supporting records']);
  await processor.action('completeStep',[doc.id,'Corrections verified']);
  await approver.action('completeStep',[doc.id,'Bypass approval'],422);
  const body=new FormData(); body.append('file',new Blob(['%PDF-1.4\nIntegration evidence\n%%EOF'],{type:'application/pdf'}),'evidence.pdf');
  const file=(await approver.request('files.php','POST',body,201)).file;
  await employee.action('uploadSupportingFile',[doc.id,file],404);
  await approver.action('uploadSupportingFile',[doc.id,file]);
  await approver.action('approveDocument',[doc.id,'Approved']);
  await processor.action('releaseDocument',[doc.id,{releasedTo:'Office',releaseMode:'Electronic Copy'}],403);
  assert.equal(processor.state.documents.some(record=>record.id===doc.id),true); // previous processor: view only
  await releaser.action('releaseDocument',[doc.id,{releasedTo:'Office',releaseMode:'Electronic Copy'}]);
  await admin.refresh(); const saved=admin.state.documents.find(d=>d.id===doc.id); assert.equal(saved.status,'Released'); assert(saved.workflowSteps.every(s=>s.status==='Completed'));
  await admin.action('addDocumentRemark',[doc.id,'Cannot edit released record'],409);
  const response=await fetch(`${fixture.base}/api/files.php?id=${file.id}`,{headers:{Cookie:admin.cookie}}); assert.equal(response.status,200); assert.match(await response.text(),/Integration evidence/);
  assert.equal((await fetch(`${fixture.base}/api/files.php?id=${file.id}`,{headers:{Cookie:processor.cookie}})).status,200);
  assert.equal((await fetch(`${fixture.base}/api/files.php?id=${file.id}`,{headers:{Cookie:approver.cookie}})).status,200);
  const deniedFile=await fetch(`${fixture.base}/api/files.php?id=${file.id}`,{headers:{Cookie:employee.cookie}}); assert.equal(deniedFile.status,404);
  await employee.refresh(); assert.equal(employee.state.documents.some(record=>record.id===doc.id),false);
  assert.equal(employee.state.auditLogs.some(event=>event.documentId===doc.id),false);
  const anonymous=await fetch(`${fixture.base}/api/files.php?id=${file.id}`); assert.equal(anonymous.status,401);
  const unsafe=new FormData(); unsafe.append('file',new Blob(['<?php echo 1; ?>']),'shell.php'); await admin.request('files.php','POST',unsafe,422);
  assert(admin.state.auditLogs.some(a=>a.documentId===doc.id && a.actionType==='DOCUMENT_APPROVED' && a.actorId===approver.state.users.find(u=>u.role==='approver').id));
});
test('payroll batch checking, exceptions, routing, processing and release',async()=>{
  await admin.refresh(); const receivingUser=admin.state.users.find(u=>u.role==='receiving_officer'); const processingUser=admin.state.users.find(u=>u.role==='processor');
  const reviewOnlyUser=admin.state.users.find(u=>u.role==='approver'); const firstRule=admin.state.employmentRoutingRules[0];
  payrollWorkflow=(await admin.action('createWorkflowTemplate',[{title:'Payroll receiving to initial checking',description:'Separates docketing from Initial Checking',classification:'Payroll',documentType:'Salary',employmentClassification:'All',isActive:true,steps:[
    {...step(1,'receiving_officer','Receive'),name:'Docketing',assigneeType:'Person',assigneeUserId:receivingUser.id},
    {...step(2,'processor','Verify & Process'),name:'Initial Checking',assigneeType:'Person',assigneeUserId:processingUser.id},
    {...step(3,'processor','Verify & Process'),name:'Parallel Groups'},
    {...step(4,'releasing_officer','Release & Archive'),name:'Release'},
  ]}])).result;
  const assignedReviewOfficer=(await admin.action('updateEmploymentRoutingRule',[{...firstRule,primaryProcessorId:reviewOnlyUser.id}])).result;
  assert.equal(assignedReviewOfficer.primaryProcessorId,reviewOnlyUser.id);
  for(const rule of admin.state.employmentRoutingRules) await admin.action('updateEmploymentRoutingRule',[{...rule,primaryProcessorId:processingUser.id}]);
  batch=(await receiver.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'BATCH-001',items:[{title:'Regular payroll',barcode:'PAY-001'},{title:'Casual payroll',barcode:'PAY-002'}],files:[]}])).result;
  assert.equal(batch.encodedBy.userId,receivingUser.id);
  assert.equal(batch.workflowTemplateId,payrollWorkflow.id);
  assert.equal(batch.workflowStages[0].status,'Completed');
  assert.equal(batch.workflowStages[0].completedBy.userId,receivingUser.id);
  assert.equal(batch.currentStage,'initial_checking');
  assert.equal(batch.initialCheckingDesk.userId,processingUser.id);
  assert(batch.workflowHistory.some(event=>event.action==='WORKFLOW_STAGE_ASSIGNED' && event.details.includes(processingUser.name)));
  await processor.refresh();
  assert(processor.state.payrollBatches.some(record=>record.id===batch.id)); // Phase 2 receives the work item.
  await processor.action('updatePayrollBatch',[{id:batch.id}],403); // The Phase 2 assignee is not the entry creator.
  await receiver.action('updatePayrollItemClassification',[batch.itemIds[0],'Regular'],403);
  await admin.action('completeInitialCheckingAndRoute',[batch.id],422);
  await processor.action('updatePayrollItemClassification',[batch.itemIds[0],'Regular']);
  await processor.action('markPayrollItemException',[batch.itemIds[1],'Missing DTR']);
  await processor.action('completeInitialCheckingAndRoute',[batch.id]);
  assert.equal(processor.state.payrollItems.find(item=>item.id===batch.itemIds[0]).currentStage,'verification_signing');
  assert.equal(processor.state.payrollItems.find(item=>item.id===batch.itemIds[1]).currentStage,'initial_checking');
  assert.equal(processor.state.payrollItems.find(item=>item.id===batch.itemIds[1]).status,'On_Hold');
  let groups=processor.state.workGroups.filter(g=>g.batchId===batch.id); assert.equal(groups.length,1);
  await releaser.action('releasePayrollBatch',[batch.id,{releasedTo:'Office',releaseMode:'Electronic Copy'}],409);
  await employee.action('processWorkGroupItems',[groups[0].id,groups[0].itemIds,'complete'],403);
  const phaseThreeItemId=groups[0].itemIds[0];
  await processor.action('placePayrollItemHold',[phaseThreeItemId,{reason:'Signature mismatch',remarks:'Return signed page',files:[]}]);
  let heldInPhaseThree=processor.state.payrollItems.find(item=>item.id===phaseThreeItemId);
  assert.equal(heldInPhaseThree.currentStage,'verification_signing');
  assert.equal(heldInPhaseThree.workGroupId,groups[0].id);
  await processor.action('resumePayrollItemHold',[phaseThreeItemId]);
  assert.equal(processor.state.payrollItems.find(item=>item.id===phaseThreeItemId).status,'In_Progress');
  await processor.action('placePayrollItemHold',[phaseThreeItemId,{reason:'Signature still incomplete',remarks:'Request corrected page',files:[]}]);
  await receiver.action('submitPayrollItemCompliance',[phaseThreeItemId,{remarks:'Signed page returned',files:[]}]);
  await processor.action('resumePayrollItemHold',[phaseThreeItemId]);
  await processor.action('processWorkGroupItems',[groups[0].id,groups[0].itemIds,'complete']);
  assert.equal(processor.state.payrollItems.find(item=>item.id===batch.itemIds[0]).status,'Ready_For_Release');
  assert(processor.state.payrollItems.find(item=>item.id===batch.itemIds[0]).auditHistory.some(event=>event.action==='PAYROLL_AUTO_ROUTED_TO_RELEASE'));
  await releaser.action('placePayrollItemHold',[phaseThreeItemId,{reason:'Release receipt incomplete',remarks:'Obtain recipient details',files:[]}]);
  assert.equal(releaser.state.payrollItems.find(item=>item.id===phaseThreeItemId).currentStage,'release');
  await receiver.action('submitPayrollItemCompliance',[phaseThreeItemId,{remarks:'Recipient details supplied',files:[]}]);
  await releaser.action('resumePayrollItemHold',[phaseThreeItemId]);
  await releaser.action('releasePayrollBatch',[batch.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  assert.equal(releaser.state.payrollItems.find(item=>item.id===batch.itemIds[0]).status,'Released');
  assert.equal(releaser.state.payrollItems.some(item=>item.id===batch.itemIds[1]),false);
  assert.equal(releaser.state.payrollBatches.find(b=>b.id===batch.id).status,'PROCESSING_WITH_HOLDS');
  await receiver.action('recordPayrollItemCompliance',[batch.itemIds[1],'DTR received'],403);
  await processor.action('recordPayrollItemCompliance',[batch.itemIds[1],'DTR received']);
  assert.equal(processor.state.payrollItems.find(item=>item.id===batch.itemIds[1]).verificationStatus,'Pending');
  await processor.action('bulkClassifyPayrollItems',[[batch.itemIds[1]],'Casual',true]);
  await processor.action('recheckPayrollItem',[batch.itemIds[1]]);
  await processor.action('completeInitialCheckingAndRoute',[batch.id]); await processor.action('completeInitialCheckingAndRoute',[batch.id],409);
  groups=processor.state.workGroups.filter(g=>g.batchId===batch.id); assert.equal(groups.length,2);
  const resumedGroup=groups.find(group=>group.status==='In_Progress');
  await processor.action('processWorkGroupItems',[resumedGroup.id,resumedGroup.itemIds,'complete']);
  await releaser.action('releasePayrollBatch',[batch.id,{releasedTo:'Payroll liaison',releaseMode:'In-Person Pick-up'}]);
  assert.equal(releaser.state.payrollBatches.find(b=>b.id===batch.id).status,'COMPLETED');

  // A partial release must not lock a held item in Stage 2.  The four released
  // items remain released while the repaired item is routed and released later.
  const partial=(await admin.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'BATCH-PARTIAL-001',items:[1,2,3,4,5].map(n=>({title:`Partial payroll ${n}`,barcode:`PARTIAL-PAY-${n}`})),files:[]}])).result;
  for (const [index, classification] of ['JOW/COS','JOW/COS','Regular','Casual'].entries()) await admin.action('updatePayrollItemClassification',[partial.itemIds[index],classification]);
  await admin.action('updatePayrollItemClassification',[partial.itemIds[4],'Casual']);
  await admin.action('markPayrollItemException',[partial.itemIds[4],'Missing DTR']);
  await admin.action('completeInitialCheckingAndRoute',[partial.id]);
  const partialGroups=admin.state.workGroups.filter(group=>group.batchId===partial.id && group.status==='In_Progress');
  assert.equal(partialGroups.length,3);
  for (const partialGroup of partialGroups) await processor.action('processWorkGroupItems',[partialGroup.id,partialGroup.itemIds,'complete']);
  let partialState=processor.state.payrollBatches.find(item=>item.id===partial.id);
  assert.equal(partialState.currentStage,'release'); // compatibility summary: four siblings are ready.
  assert.equal(partialState.progress.release.ready,4);
  assert.equal(partialState.progress.onHoldTotal,1);
  assert.equal(processor.state.payrollItems.find(item=>item.id===partial.itemIds[4]).status,'On_Hold');

  // The parent compatibility stage is Release, but the held child remains eligible
  // for its own Initial Checking recovery and must not be rejected as batch-level work.
  await admin.action('recordPayrollItemCompliance',[partial.itemIds[4],'Missing DTR submitted by liaison.']);
  assert.equal(admin.state.payrollItems.find(item=>item.id===partial.itemIds[4]).status,'Ready_For_Recheck');
  assert.equal(admin.state.payrollItems.find(item=>item.id===partial.itemIds[4]).verificationStatus,'Pending');
  await admin.action('recheckPayrollItem',[partial.itemIds[4]]);
  assert.equal(admin.state.payrollBatches.find(item=>item.id===partial.id).currentStage,'release');
  await admin.action('completeInitialCheckingAndRoute',[partial.id]);
  const recoveredGroup=admin.state.workGroups.find(group=>group.batchId===partial.id && group.status==='In_Progress');
  assert.equal(recoveredGroup.itemIds.includes(partial.itemIds[4]),true);
  assert.equal(recoveredGroup.isSupplemental,true);
  assert.equal(admin.state.payrollItems.filter(item=>item.batchId===partial.id && item.status==='Ready_For_Release').length,4);
  assert.equal(admin.state.payrollItems.find(item=>item.id===partial.itemIds[4]).currentStage,'verification_signing');
  await releaser.action('releasePayrollBatch',[partial.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  assert.equal(releaser.state.payrollItems.filter(item=>item.batchId===partial.id && item.status==='Released').length,4);
  await processor.action('processWorkGroupItems',[recoveredGroup.id,[partial.itemIds[4]],'complete']);
  await releaser.action('releasePayrollBatch',[partial.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  assert.equal(releaser.state.payrollBatches.find(item=>item.id===partial.id).status,'COMPLETED');
  await admin.action('deletePayrollBatch',[partial.id]);
  assert.equal(admin.state.payrollBatches.some(item=>item.id===partial.id),false);
  assert.equal(admin.state.workGroups.some(item=>item.batchId===partial.id),false);
  await admin.action('deleteUser',[processingUser.id],422);
});
test('a held payroll item supports repeated compliance cycles after all siblings are released',async()=>{
  const held=(await admin.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'BATCH-HOLD-CYCLES-001',items:[1,2,3].map(n=>({title:`Hold-cycle payroll ${n}`,barcode:`HOLD-CYCLE-PAY-${n}`})),files:[]}])).result;
  await admin.action('updatePayrollItemClassification',[held.itemIds[0],'Regular']);
  await admin.action('updatePayrollItemClassification',[held.itemIds[1],'Regular']);
  await admin.action('updatePayrollItemClassification',[held.itemIds[2],'Casual']);
  await admin.action('markPayrollItemException',[held.itemIds[2],'Missing DTR','Original DTR was not attached.']);
  await admin.action('completeInitialCheckingAndRoute',[held.id]);
  for (const group of admin.state.workGroups.filter(group=>group.batchId===held.id && group.status==='In_Progress')) await processor.action('processWorkGroupItems',[group.id,group.itemIds,'complete']);
  await releaser.action('releasePayrollBatch',[held.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  assert.equal(releaser.state.payrollItems.filter(item=>item.batchId===held.id && item.status==='Released').length,2);
  assert.equal(releaser.state.payrollItems.some(item=>item.id===held.itemIds[2]),false);

  await admin.action('recordPayrollItemCompliance',[held.itemIds[2],'DTR supplied by liaison.']);
  await admin.action('recheckPayrollItem',[held.itemIds[2]]);
  await admin.action('markPayrollItemException',[held.itemIds[2],'Missing Signature','DTR was supplied but the certification is unsigned.']);
  await admin.action('recordPayrollItemCompliance',[held.itemIds[2],'Signed certification supplied by liaison.']);
  await admin.action('recheckPayrollItem',[held.itemIds[2]]);
  await admin.action('completePayrollItemInitialCheckingAndRoute',[held.itemIds[2]]);
  const resumed=admin.state.payrollItems.find(item=>item.id===held.itemIds[2]);
  assert.equal(resumed.currentStage,'verification_signing');
  assert.equal(releaser.state.payrollItems.filter(item=>item.batchId===held.id && item.status==='Released').length,2);
  assert.deepEqual(resumed.auditHistory.filter(event=>event.action==='PAYROLL_ITEM_PLACED_ON_HOLD' || event.action==='PAYROLL_HOLD_REOPENED').map(event=>event.details.includes('Missing DTR')?'Missing DTR':'Missing Signature'),['Missing DTR','Missing Signature']);
  assert.equal(resumed.auditHistory.filter(event=>event.action==='PAYROLL_COMPLIANCE_RECEIVED').length,2);
  const resumedGroup=admin.state.workGroups.find(group=>group.batchId===held.id && group.status==='In_Progress');
  await processor.action('processWorkGroupItems',[resumedGroup.id,resumedGroup.itemIds,'complete']);
  await releaser.action('releasePayrollBatch',[held.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  assert.equal(releaser.state.payrollItems.filter(item=>item.batchId===held.id && item.status==='Released').length,3);
});

test('batch progress is a child-item aggregate for mixed release, processing, and holds',async()=>{
  const aggregate=(await admin.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'BATCH-AGGREGATE-001',items:[1,2,3,4,5].map(n=>({title:`Aggregate payroll ${n}`,barcode:`AGGREGATE-PAY-${n}`})),files:[]}])).result;
  for (const [index, classification] of ['JOW/COS','JOW/COS','Regular','Casual','Casual'].entries()) await admin.action('updatePayrollItemClassification',[aggregate.itemIds[index],classification]);
  await admin.action('markPayrollItemException',[aggregate.itemIds[4],'Missing DTR']);
  await admin.action('completeInitialCheckingAndRoute',[aggregate.id]);
  const groups=admin.state.workGroups.filter(group=>group.batchId===aggregate.id && group.status==='In_Progress');
  const jow=groups.find(group=>group.classification==='JOW/COS'); const regular=groups.find(group=>group.classification==='Regular');
  await processor.action('processWorkGroupItems',[jow.id,[aggregate.itemIds[0]],'complete']);
  await releaser.action('releasePayrollBatch',[aggregate.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  await processor.action('processWorkGroupItems',[regular.id,[aggregate.itemIds[2]],'complete']);
  const summary=processor.state.payrollBatches.find(batch=>batch.id===aggregate.id).progress;
  assert.equal(summary.totalItems,5); assert.equal(summary.stage1Completed,5);
  assert.deepEqual(summary.initialChecking,{active:1,completed:4,onHold:1});
  assert.deepEqual(summary.management,{reached:4,active:2,completed:2,onHold:0,notReached:1});
  assert.deepEqual(summary.release,{ready:1,released:1,notReached:3});
  assert.equal(summary.onHoldTotal,1); assert.equal(summary.derivedStatus,'PROCESSING_WITH_HOLDS');
});

test('record-level payroll views expose only a processor’s assigned work group and scoped batch context',async()=>{
  const scopedUser=(await admin.action('addUser',[{...userData('processor'),name:'Scoped JOW Processor',email:'scoped-jow@example.test'}])).result;
  const scopedProcessor=await new Client(fixture.base).login('scoped-jow@example.test');
  const jowRule=admin.state.employmentRoutingRules.find(rule=>rule.classification==='JOW/COS');
  await admin.action('updateEmploymentRoutingRule',[{...jowRule,primaryProcessorId:scopedUser.id}]);
  const attachmentForm=new FormData(); attachmentForm.append('file',new Blob(['%PDF-1.4\nScoped batch transmittal\n%%EOF'],{type:'application/pdf'}),'scoped-batch.pdf');
  const batchAttachment=(await admin.request('files.php','POST',attachmentForm,201)).file;
  const scopedBatch=(await admin.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'BATCH-SCOPED-001',payrollPeriod:'September 2026',receivedFromLiaison:'Private liaison',remarks:'Private batch remarks',items:[
    {title:'JOW confidential payroll',barcode:'SCOPED-JOW-001'},
    {title:'Regular confidential payroll',barcode:'SCOPED-REG-001'},
  ],files:[batchAttachment]}])).result;
  await admin.action('updatePayrollItemClassification',[scopedBatch.itemIds[0],'JOW/COS']);
  await admin.action('updatePayrollItemClassification',[scopedBatch.itemIds[1],'Regular']);
  await admin.action('completeInitialCheckingAndRoute',[scopedBatch.id]);

  await scopedProcessor.refresh();
  const visibleBatch=scopedProcessor.state.payrollBatches.find(batch=>batch.id===scopedBatch.id);
  assert(visibleBatch); assert.deepEqual(visibleBatch.itemIds,[scopedBatch.itemIds[0]]);
  assert.equal(visibleBatch.remarks,''); assert.equal(visibleBatch.receivedFromLiaison,''); assert.deepEqual(visibleBatch.attachments,[]);
  assert.deepEqual(scopedProcessor.state.payrollItems.filter(item=>item.batchId===scopedBatch.id).map(item=>item.id),[scopedBatch.itemIds[0]]);
  assert.deepEqual(scopedProcessor.state.workGroups.filter(group=>group.batchId===scopedBatch.id).map(group=>group.itemIds),[[scopedBatch.itemIds[0]]]);
  assert.equal(JSON.stringify(scopedProcessor.state).includes('SCOPED-REG-001'),false);
  assert.equal((await fetch(`${fixture.base}/api/files.php?id=${batchAttachment.id}`,{headers:{Cookie:scopedProcessor.cookie}})).status,404);

  await employee.refresh();
  assert.equal(employee.state.payrollBatches.some(batch=>batch.id===scopedBatch.id),false);
  assert.equal(employee.state.payrollItems.some(item=>item.batchId===scopedBatch.id),false);
});

test('unrouted payroll batches can be edited and deleted from payroll management',async()=>{
  const batch=(await admin.action('registerPayrollBatch',[{office:'HRMDO',payrollType:'Salary',batchBarcode:'EDITABLE-BATCH-001',payrollPeriod:'First period',receivedFromLiaison:'Original liaison',remarks:'Original remarks',items:[{title:'Original payroll',barcode:'EDITABLE-PAY-001',office:'HRMDO',classificationType:'Salary'}],files:[]}])).result;
  const updated=(await admin.action('updatePayrollBatch',[{id:batch.id,batchBarcode:'EDITABLE-BATCH-002',office:'CMO',payrollType:'Voucher',payrollPeriod:'September 2026',receivedFromLiaison:'Updated liaison',remarks:'Updated remarks',items:[{id:batch.itemIds[0],barcode:'EDITABLE-PAY-002',title:'Corrected payroll',office:'CMO',classificationType:'Voucher'}]}])).result;
  assert.equal(updated.batchNumber,'EDITABLE-BATCH-002');
  assert.equal(admin.state.payrollItems.find(item=>item.id===batch.itemIds[0]).title,'Corrected payroll');
  assert.equal(admin.state.payrollItems.find(item=>item.id===batch.itemIds[0]).barcode,'EDITABLE-PAY-002');
  await admin.action('deletePayrollBatch',[batch.id]);
  assert.equal(admin.state.payrollBatches.some(item=>item.id===batch.id),false);
  assert.equal(admin.state.payrollItems.some(item=>item.batchId===batch.id),false);
});
test('single payroll follows configured workflow and synchronizes its item on release',async()=>{
  await admin.action('updateWorkflowTemplate',[{...payrollWorkflow,isActive:false}]);
  const template=(await admin.action('createWorkflowTemplate',[{title:'Single payroll release',description:'Test',classification:'Payroll',documentType:'Salary',employmentClassification:'Job Order (JOW)',isActive:true,steps:[step(1,'processor','Verify & Process'),step(2,'releasing_officer','Release & Archive')]}])).result;
  const single=(await admin.action('registerSinglePayroll',[{office:'HRMDO',payrollType:'Salary',classificationType:'Salary',title:'Single salary',barcode:'SINGLE-001',files:[]}])).result;
  assert.equal(single.workflowTemplateId,template.id);
  const item=admin.state.payrollItems.find(i=>i.documentId===single.id);
  assert.equal(item.employmentClassification,null);
  await processor.refresh();
  const phaseBeforeHold=processor.state.documents.find(d=>d.id===single.id).currentStepIndex;
  await processor.action('placeDocumentHold',[single.id,{reason:'Needs payroll clarification',remarks:'Confirm period',files:[]}]);
  assert.equal(processor.state.documents.find(d=>d.id===single.id).currentStepIndex,phaseBeforeHold);
  await processor.action('submitDocumentCompliance',[single.id,{remarks:'Unauthorized',files:[]}],403);
  await processor.action('recheckDocumentHold',[single.id,{remarks:'Required payroll clarification was provided',files:[]}]);
  let resumed=processor.state.documents.find(d=>d.id===single.id);
  assert.equal(resumed.status,'In_Progress'); assert.equal(resumed.workflowSteps[0].status,'In_Progress'); assert.equal(resumed.currentStepIndex,phaseBeforeHold); assert.equal(resumed.complianceRemarks,'Required payroll clarification was provided');
  await processor.action('placeDocumentHold',[single.id,{reason:'Needs final confirmation',remarks:'Confirm period again',files:[]}]);
  await admin.action('submitDocumentCompliance',[single.id,{remarks:'Payroll period confirmed',files:[]}]);
  await processor.action('recheckDocumentHold',[single.id]);
  assert.equal(processor.state.documents.find(d=>d.id===single.id).currentStepIndex,phaseBeforeHold);
  await processor.action('completeStep',[single.id,'Checked without classification'],422);
  await processor.action('updatePayrollItemClassification',[item.id,'Regular']);
  assert.equal(processor.state.documents.find(d=>d.id===single.id).employmentClassification,'Regular');
  await processor.action('completeStep',[single.id,'Classified and verified']);
  await releaser.refresh();
  await releaser.action('releaseDocument',[single.id,{releasedTo:'Payroll liaison',releaseMode:'Electronic Copy'}]);
  assert.equal(releaser.state.payrollItems.find(i=>i.documentId===single.id).status,'Completed');
  await admin.action('deleteDocument',[single.id]);
  assert.equal(admin.state.documents.some(record=>record.id===single.id),false);
  assert.equal(admin.state.payrollItems.some(record=>record.documentId===single.id),false);
});
test('only the system administrator can delete an ordinary document',async()=>{
  const record=(await admin.action('registerDocument',[documentData('DELETE-DOCUMENT-001')])).result;
  await employee.action('deleteDocument',[record.id],403);
  await admin.action('deleteDocument',[record.id]);
  assert.equal(admin.state.documents.some(document=>document.id===record.id),false);
});
test('HRMDO leave registry separates applicant and encoder, validates barcodes, and audits registration',async()=>{
  const applicant=admin.state.users.find(user=>user.role==='employee');
  const dateRanges=[{startDate:'2026-09-14',endDate:'2026-09-14',dayType:'WHOLE_DAY'},{startDate:'2026-09-16',endDate:'2026-09-17',dayType:'WHOLE_DAY'},{startDate:'2026-09-21',endDate:'2026-09-21',dayType:'AM_HALF_DAY'}];
  const data={employeeId:applicant.id,office:'City Engineering Office',barcode:'LEAVE-TEST-0001',leaveType:'Vacation Leave',leaveSubtype:'ABROAD',leaveDetails:'Japan',dateRanges,calculatedLeaveDays:99,workingDaysNumber:99,commutation:'Not Requested',remarks:'Official application received'};
  await receiver.action('fileLeaveApplication',[{...data,dateRanges:[{startDate:'2026-09-18',endDate:'2026-09-14',dayType:'WHOLE_DAY'}]}],422);
  await receiver.action('fileLeaveApplication',[{...data,dateRanges:[{startDate:'2026-09-14',endDate:'2026-09-16',dayType:'WHOLE_DAY'},{startDate:'2026-09-16',endDate:'2026-09-18',dayType:'WHOLE_DAY'}]}],422);
  await receiver.action('fileLeaveApplication',[{...data,dateRanges:[{startDate:'2026-09-14',endDate:'2026-09-14',dayType:'AM_HALF_DAY'},{startDate:'2026-09-14',endDate:'2026-09-14',dayType:'PM_HALF_DAY'}]}],422);
  await receiver.action('fileLeaveApplication',[{...data,dateRanges:[dateRanges[0],{startDate:'2026-09-22',endDate:'',dayType:'WHOLE_DAY'}]}],422);
  await receiver.action('fileLeaveApplication',[{...data,dateRanges:[{startDate:'2026-09-14',endDate:'2026-09-16',dayType:'AM_HALF_DAY'}]}],422);
  const leave=(await receiver.action('fileLeaveApplication',[data])).result;
  const encoder=receiver.state.users.find(user=>user.role==='receiving_officer');
  assert.equal(leave.employeeId,applicant.id); assert.equal(leave.employeeName,applicant.name); assert.equal(leave.createdByUserId,encoder.id); assert.notEqual(leave.employeeId,leave.createdByUserId);
  assert.equal(leave.office,'City Engineering Office'); assert.equal(leave.barcode,'LEAVE-TEST-0001'); assert.equal(leave.trackingNumber,'LEAVE-TEST-0001'); assert.equal(leave.status,'For_Computation');
  assert.equal(leave.leaveSubtype,'ABROAD'); assert.equal(leave.leaveDetails,'Japan');
  assert.equal(leave.dateRanges.length,3); assert.equal(leave.totalLeaveDays,3.5); assert.equal(leave.workingDaysNumber,3.5);
  const manualApplicant=(await receiver.action('fileLeaveApplication',[{...data,employeeId:'',employeeName:'Maria Dela Cruz',barcode:'',office:"CEO - City Engineer's Office"}])).result;
  assert.equal(manualApplicant.employeeId,''); assert.equal(manualApplicant.employeeName,'Maria Dela Cruz'); assert.equal(manualApplicant.barcode,'N/A'); assert.equal(manualApplicant.trackingNumber,'N/A'); assert.equal(manualApplicant.commutation,'Not Requested');
  const secondUntracked=(await receiver.action('fileLeaveApplication',[{...data,employeeId:'',employeeName:'Jose Dela Cruz',barcode:'N/A',office:"CEO - City Engineer's Office"}])).result;
  assert.equal(secondUntracked.barcode,'N/A');
  await employee.action('deleteLeaveApplication',[secondUntracked.id],403);
  await receiver.action('deleteLeaveApplication',[secondUntracked.id]); assert.equal(receiver.state.leaveApplications.some(entry=>entry.id===secondUntracked.id),false);
  await employee.action('changeLeaveApplicationStatus',[manualApplicant.id,{status:'For_Signature',remarks:''}],403);
  const manuallySigned=(await processor.action('changeLeaveApplicationStatus',[manualApplicant.id,{status:'For_Signature',remarks:'Ready for signature'}])).result;
  assert.equal(manuallySigned.status,'For_Signature'); assert.equal(manuallySigned.statusRemarks,'Ready for signature');
  const manuallyReleased=(await releaser.action('changeLeaveApplicationStatus',[manualApplicant.id,{status:'Released',remarks:''}])).result;
  assert.equal(manuallyReleased.status,'Released'); assert(manuallyReleased.releasedAt); assert.equal(manuallyReleased.releaseRemarks,'');
  const am=(await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-AM',dateRanges:[{startDate:'2026-09-24',endDate:'2026-09-24',dayType:'AM_HALF_DAY'}]}])).result; assert.equal(am.totalLeaveDays,0.5);
  const pm=(await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-PM',dateRanges:[{startDate:'2026-09-25',endDate:'2026-09-25',dayType:'PM_HALF_DAY'}]}])).result; assert.equal(pm.totalLeaveDays,0.5);
  const updated=(await receiver.action('updateLeaveApplication',[{...leave,dateRanges:[leave.dateRanges[0],{startDate:'2026-09-22',endDate:'2026-09-22',dayType:'PM_HALF_DAY'}],calculatedLeaveDays:99}])).result;
  assert.equal(updated.dateRanges.length,2); assert.equal(updated.totalLeaveDays,1.5); assert.equal(updated.workingDaysNumber,1.5);
  await receiver.action('fileLeaveApplication',[data],409);
  await receiver.refresh(); assert(receiver.state.auditLogs.some(event=>event.actionType==='LEAVE_APPLICATION_REGISTERED' && event.documentId===leave.id && event.details.includes('3.5 day(s)'))); assert(receiver.state.auditLogs.some(event=>event.actionType==='LEAVE_APPLICATION_UPDATED' && event.documentId===leave.id && event.details.includes('1.5 day(s)')));
  await approver.action('approveLeaveApplication',[leave.id],409);
  await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-STALE-DATA',leaveType:'Sick Leave'}],422);
  const sick=(await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-SICK',leaveType:'Sick Leave',leaveSubtype:'OUT_PATIENT',leaveDetails:'Flu'}])).result;
  assert.equal(sick.leaveSubtype,'OUT_PATIENT'); assert.equal(sick.leaveDetails,'Flu');
  const study=(await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-STUDY',leaveType:'Study Leave',leaveSubtype:'MASTERS_COMPLETION',leaveDetails:null}])).result;
  assert.equal(study.leaveSubtype,'MASTERS_COMPLETION'); assert.equal(study.leaveDetails,null);
  await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-OTHER-MISSING',leaveType:'Others',leaveSubtype:'OTHER',leaveDetails:''}],422);
  const other=(await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-OTHER',leaveType:'Others',leaveSubtype:'OTHER',leaveDetails:'Special Personnel Leave'}])).result;
  assert.equal(other.leaveDetails,'Special Personnel Leave');
  const commonTypes=['COC','Mandatory / Forced Leave','Wellness Leave','Maternity Leave','Paternity Leave','Solo Parent Leave','10-Day VAWC Leave','Rehabilitation Privilege','Special Leave Benefits for Women','Special Emergency / Calamity Leave','Adoption Leave'];
  for (const [index,leaveType] of commonTypes.entries()) await receiver.action('fileLeaveApplication',[{...data,barcode:`LEAVE-TYPE-${index}`,leaveType,leaveSubtype:null,leaveDetails:null}]);
  await receiver.action('fileLeaveApplication',[{...data,barcode:'LEAVE-SPL',leaveType:'Special Privilege Leave',leaveSubtype:'WITHIN_PHILIPPINES',leaveDetails:'Cebu City'}]);
  await admin.action('releaseLeaveApplication',[leave.id,{remarks:'Invalid jump'}],409);
  await receiver.action('completeLeaveComputation',[leave.id,{remarks:'Unauthorized'}],403);
  let transitioned=(await processor.action('completeLeaveComputation',[leave.id,{remarks:'Dates and total verified'}])).result;
  assert.equal(transitioned.status,'For_Processing'); assert.equal(transitioned.computationRemarks,'Dates and total verified');
  transitioned=(await processor.action('sendLeaveForSignature',[leave.id,{remarks:'Ready for signature'}])).result; assert.equal(transitioned.status,'For_Signature');
  await processor.action('releaseLeaveApplication',[leave.id,{remarks:'Unauthorized release'}],403);
  transitioned=(await releaser.action('releaseLeaveApplication',[leave.id,{remarks:'Released to records'}])).result;
  assert.equal(transitioned.status,'Released'); assert(transitioned.releasedAt); assert(transitioned.releasedByUserId); assert.equal(transitioned.releaseRemarks,'Released to records');
  await receiver.action('updateLeaveApplication',[{...transitioned,barcode:'LEAVE-RELEASED-EDIT'}],409);
  await admin.action('completeLeaveComputation',[leave.id,{remarks:'Reverse released record'}],409);
  let held=(await processor.action('placeLeaveOnHold',[am.id,{reason:'Missing medical certificate',remarks:'Provide original'}])).result;
  assert.equal(held.status,'On_Hold'); assert.equal(held.heldFromStatus,'For_Computation');
  await processor.action('resumeLeaveProcessing',[am.id,{}],409);
  held=(await processor.action('recordLeaveCompliance',[am.id,{remarks:'Medical certificate received'}])).result; assert(held.complianceReceivedAt);
  held=(await processor.action('resumeLeaveProcessing',[am.id,{}])).result; assert.equal(held.status,'For_Computation');
  await processor.action('completeLeaveComputation',[sick.id,{remarks:'Computed'}]); await processor.action('sendLeaveForSignature',[sick.id,{remarks:'Signature packet prepared'}]);
  held=(await approver.action('placeLeaveOnHold',[sick.id,{reason:'Missing signature'}])).result; assert.equal(held.heldFromStatus,'For_Signature');
  await approver.action('recordLeaveCompliance',[sick.id,{remarks:'Signed form received'}]);
  held=(await approver.action('resumeLeaveProcessing',[sick.id,{}])).result; assert.equal(held.status,'For_Signature');
  await approver.action('releaseLeaveApplication',[sick.id,{}],403);
  const cancelled=(await admin.action('cancelLeaveApplication',[pm.id,{reason:'Duplicate filing'}])).result;
  assert.equal(cancelled.status,'Cancelled'); assert(cancelled.cancelledAt); assert.equal(cancelled.cancellationReason,'Duplicate filing');
  await admin.action('cancelLeaveApplication',[other.id,{reason:''}],422);
  for(let index=0;index<20;index++) await receiver.action('fileLeaveApplication',[{...data,barcode:`LEAVE-PAGE-${String(index).padStart(2,'0')}`,leaveType:index%2?'Vacation Leave':'COC',leaveSubtype:index%2?'WITHIN_PHILIPPINES':null,leaveDetails:index%2?'Cebu':null}]);
  await admin.refresh();
  for (const event of ['LEAVE_COMPUTATION_COMPLETED','LEAVE_SENT_FOR_SIGNATURE','LEAVE_PLACED_ON_HOLD','LEAVE_COMPLIANCE_RECEIVED','LEAVE_PROCESSING_RESUMED','LEAVE_RELEASED','LEAVE_CANCELLED']) assert(admin.state.auditLogs.some(entry=>entry.actionType===event));
  assert.equal(admin.state.leaveApplications.filter(entry=>!entry.isLegacyV1).length,0); // active records use the paginated endpoint
  const firstPage=await admin.request('leave.php?page=1&pageSize=10','GET'); assert.equal(firstPage.items.length,10); assert(firstPage.pagination.totalRecords>=35); assert(firstPage.pagination.totalPages>=4);
  const fourthPage=await admin.request('leave.php?page=4&pageSize=10','GET'); assert(fourthPage.items.length>=1); assert.equal(fourthPage.summary.total,firstPage.summary.total);
  const exact=await admin.request('leave.php?q=LEAVE-TEST-0001&page=1&pageSize=10','GET'); assert.equal(exact.pagination.totalRecords,1); assert.equal(exact.items[0].id,leave.id);
  const combined=await admin.request('leave.php?status=For_Computation&leaveType=Vacation%20Leave&sort=employee_asc&page=1&pageSize=10','GET'); assert(combined.items.every(entry=>entry.status==='For_Computation'&&entry.leaveType==='Vacation Leave'));
  const filed=await admin.request('leave.php?filedFrom=2026-09-01&filedTo=2026-09-30&page=1&pageSize=10','GET'); assert(filed.items.every(entry=>entry.filingDate.slice(0,10)>='2026-09-01'&&entry.filingDate.slice(0,10)<='2026-09-30'));
  const leaveDay=await admin.request('leave.php?q=LEAVE-TEST-0001&leaveDate=2026-09-14&page=1&pageSize=10','GET'); assert.equal(leaveDay.items[0].id,leave.id);
  const cancelledQuery=await admin.request('leave.php?status=Cancelled&page=1&pageSize=10','GET'); assert(cancelledQuery.items.some(entry=>entry.id===pm.id));
  const processorAccount=admin.state.users.find(user=>user.email==='processor@example.test');
  await admin.action('updateUser',[{...processorAccount,password:'',sidebarModules:['dashboard']}]); await processor.refresh();
  assert.deepEqual(processor.state.users.find(user=>user.id===processorAccount.id).sidebarModules,['dashboard']);
  await processor.action('fileLeaveApplication',[{...data,barcode:'LEAVE-NO-ACCESS'}],403);
  const hiddenLeaveQuery=await processor.request('leave.php?q=LEAVE-TEST-0001&page=1&pageSize=10');
  assert.equal(hiddenLeaveQuery.items.length,0); assert.equal(hiddenLeaveQuery.pagination.totalRecords,0); assert.equal(hiddenLeaveQuery.taskCount,0);
});
test('role and designation management, migration checks and password revocation',async()=>{
  const role=(await admin.action('addSystemRole',[{id:'custom_role',name:'Custom role',code:'CUSTOM',description:'Test',badgeClass:'bg-blue-100',canProcess:true}])).result;
  await admin.action('updateSystemRole',[{...role,name:'Updated role'}]);
  const designation=(await admin.action('addAssigneeDesignation',[{category:'Role',title:'Custom desk',baseRole:role.id}])).result;
  const reconciled=(await admin.action('updateSystemRole',[{...role,id:'renamed_role_key',name:'Reconciled role'},{id:role.id,code:role.code,name:'Updated role'}])).result;
  assert.equal(reconciled.id,'renamed_role_key'); assert.equal(reconciled.name,'Reconciled role');
  assert.equal(admin.state.assigneeDesignations.find(item=>item.id===designation.id).baseRole,reconciled.id);
  await admin.action('deleteSystemRole',['admin'],422);
  await admin.action('deleteSystemRole',['processor'],422);
  await admin.action('deleteSystemRole',[reconciled.id]);
  assert(!admin.state.systemRoles.some(item=>item.id===reconciled.id));
  assert(!admin.state.assigneeDesignations.some(item=>item.id===designation.id));
  const migration=(await admin.action('runMigrationCheck',[])).result; assert.equal(migration.totalV1Records,0); assert.equal(migration.status,'Not Required');
  const oldSession=await new Client(fixture.base).login('employee@example.test');
  await employee.action('changePassword',[{currentPassword:testPassword,newPassword:'Another-Password-2026!'}]);
  await oldSession.request('state.php','GET',undefined,401);
  assert(!JSON.stringify(employee.state.auditLogs).includes('Another-Password'));
  await employee.request('auth.php','DELETE'); await employee.request('state.php','GET',undefined,401);
});
test('Office uploads are real ZIP documents and database backup restores intact',async()=>{
  const officePath=path.resolve(fixture.env.HRMDO_UPLOAD_DIRECTORY,'test-office.zip');
  fixture.run(['tests/office-fixture.php',officePath]);
  const form=new FormData(); form.append('file',new Blob([fs.readFileSync(officePath)]),'test.docx');
  const uploaded=await admin.request('files.php','POST',form,201); assert.equal(uploaded.file.name,'test.docx');
  const output=fixture.run(['scripts/backup.php']); const backup=output.match(/Database backup: (.+)/)[1].trim();
  const recovery=`hrmdo_test_${Date.now()}_abcdef`;
  try {
    fixture.run(['scripts/restore.php',backup],{HRMDO_DATABASE:recovery});
    const count=fixture.run(['-r',"require 'api/db.php'; echo database()->query('SELECT COUNT(*) FROM app_records')->fetchColumn();"],{HRMDO_DATABASE:recovery}); assert(Number(count)>10);
  } finally {
    fixture.run(['-r',"require 'api/db.php'; $name=app_config()['database']; if (!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',$name)) exit(2); database(false)->exec('DROP DATABASE IF EXISTS `'.$name.'`');"],{HRMDO_DATABASE:recovery});
    assert(path.resolve(backup).startsWith(path.resolve('storage/backups')+path.sep)); fs.unlinkSync(backup);
  }
});
test('release after a terminal approval preserves the approving officer',async()=>{
  await admin.action('createWorkflowTemplate',[{title:'Terminal approval',description:'Test',classification:'Request',documentType:'Certification',isActive:true,steps:[step(1,'approver','Approve & Sign')]}]);
  const record=(await admin.action('registerDocument',[{...documentData('TERMINAL-APPROVAL'),classification:'Request',documentType:'Certification'}])).result;
  await approver.action('approveDocument',[record.id,'Approved for release']);
  const approval=approver.state.documents.find(d=>d.id===record.id).workflowSteps[0].completedBy;
  await releaser.action('releaseDocument',[record.id,{releasedTo:'Records recipient',releaseMode:'Electronic Copy'}]);
  assert.deepEqual(releaser.state.documents.find(d=>d.id===record.id).workflowSteps[0].completedBy,approval);
});
test('external handoff preserves custody, waits for return, and activates the next internal stage',async()=>{
  const externalWorkflow=(await admin.action('createWorkflowTemplate',[{title:'External service record review',description:'Send service records outside HRMDO and continue on return',classification:'Request',documentType:'Service Record',isActive:true,steps:[
    step(1,'receiving_officer','Receive'),
    {stepNumber:2,name:'City Mayor external approval',description:'Await the Mayor Office action.',stageType:'EXTERNAL_HANDOFF_REVIEW',assigneeType:'System',assigneeName:'System / awaiting HRMDO handoff',slaHours:48,requiredAction:'External Handoff',allowReturn:false,requiresAttachment:false,externalPurpose:'Approval',externalDestinationMode:'FIXED_DESTINATION',externalDestinationOffice:"City Mayor's Office",returnReceiverType:'Role',returnReceiverRole:'receiving_officer',returnReceiverName:'Receiving Officer',expectedTurnaroundHours:48,requiresReturnedAttachment:false,requiresExternalResult:true},
    step(3,'processor','Verify & Process')
  ]}])).result;
  const record=(await admin.action('registerDocument',[{...documentData('EXTERNAL-RETURN-001'),classification:'Request',documentType:'Service Record'}])).result;
  assert.equal(record.workflowTemplateId,externalWorkflow.id); assert.equal(record.currentLocation,'HRMDO');
  let active=admin.state.documents.find(d=>d.id===record.id); assert.equal(active.status,'Awaiting_External_Handoff'); assert.equal(active.currentStepNumber,2); assert.equal(active.workflowSteps[0].status,'Completed'); assert.equal(active.workflowSteps[1].externalStatus,'PENDING_HANDOFF');
  await admin.action('completeStep',[record.id,'Attempt to bypass return','Verify & Process'],409);
  await admin.action('recordExternalHandoff',[record.id,{destinationOffice:"City Mayor's Office",purpose:'Approval',handedTo:'Office Records Clerk',representative:'Mayor Office liaison',expectedReturn:'2026-09-12T10:00',remarks:'For approval',files:[]}]);
  active=admin.state.documents.find(d=>d.id===record.id); assert.equal(active.status,'Awaiting_External_Return'); assert.equal(active.currentLocation,"City Mayor's Office"); assert.equal(active.workflowSteps[1].externalStatus,'OUTSIDE_HRMDO');
  await processor.action('recordExternalReturn',[record.id,{returnedFrom:"City Mayor's Office",result:'Approved',files:[]}],404);
  await admin.action('recordExternalReturn',[record.id,{returnedFrom:"City Mayor's Office",returnedBy:'Mayor Office liaison',result:'Approved',remarks:'Approved and returned',files:[]}]);
  active=admin.state.documents.find(d=>d.id===record.id); assert.equal(active.id,record.id); assert.equal(active.trackingNumber,'EXTERNAL-RETURN-001'); assert.equal(active.currentLocation,'HRMDO'); assert.equal(active.workflowSteps[1].externalStatus,'COMPLETED'); assert.equal(active.currentStepNumber,3); assert.equal(active.workflowSteps[2].status,'In_Progress'); assert.equal(active.custodyHistory.filter(event=>event.movementType==='EXTERNAL_HANDOFF' || event.movementType==='RETURN_TO_HRMDO').length,2);

  await admin.action('updateWorkflowTemplate',[{...externalWorkflow,isActive:false}]);
  const consecutiveOwnerWorkflow=(await admin.action('createWorkflowTemplate',[{title:'Processor to external handoff',description:'The same officer completes processing and records the handoff.',classification:'Request',documentType:'Service Record',isActive:true,steps:[
    step(1,'processor','Verify & Process'),
    {stepNumber:2,name:'Outbound handoff',description:'Record custody transfer.',stageType:'EXTERNAL_HANDOFF_REVIEW',assigneeType:'System',assigneeName:'System / awaiting HRMDO handoff',slaHours:24,requiredAction:'External Handoff',allowReturn:false,requiresAttachment:false,externalPurpose:'Review',externalDestinationMode:'FIXED_DESTINATION',externalDestinationOffice:"City Mayor's Office",returnReceiverType:'Role',returnReceiverRole:'receiving_officer',returnReceiverName:'Receiving Officer'},
    step(3,'processor','Verify & Process')
  ]}])).result;
  const consecutive=(await admin.action('registerDocument',[{...documentData('CONSECUTIVE-HANDOFF-001'),classification:'Request',documentType:'Service Record'}])).result;
  await processor.action('completeStep',[consecutive.id,'Prepared for outbound custody']);
  active=processor.state.documents.find(d=>d.id===consecutive.id);
  assert.equal(active.currentStepNumber,2); assert.equal(active.workflowSteps[1].externalStatus,'PENDING_HANDOFF'); assert.equal(active.workflowSteps[1].handoffOwner.userId,processor.state.users.find(user=>user.email==='processor@example.test').id);
  await processor.action('recordExternalHandoff',[consecutive.id,{destinationOffice:"City Mayor's Office",purpose:'Review',handedTo:'Office Records Clerk',files:[]}]);
  await receiver.refresh(); active=receiver.state.documents.find(d=>d.id===consecutive.id);
  assert.equal(active.workflowSteps[1].externalStatus,'OUTSIDE_HRMDO');
  await receiver.action('recordExternalReturn',[consecutive.id,{returnedFrom:"City Mayor's Office",returnedBy:'Office Records Clerk',files:[]}]);

  const disapproved=(await admin.action('registerDocument',[{...documentData('EXTERNAL-DISAPPROVED-001'),classification:'Request',documentType:'Service Record'}])).result;
  await processor.action('completeStep',[disapproved.id,'Prepared for external review']);
  await processor.action('recordExternalHandoff',[disapproved.id,{destinationOffice:"City Mayor's Office",purpose:'Review',handedTo:'Office Records Clerk',files:[]}]);
  await receiver.action('recordExternalReturn',[disapproved.id,{returnedFrom:"City Mayor's Office",returnedBy:'Office Records Clerk',result:'Disapproved',remarks:'External office declined the request',files:[]}]);
  await admin.refresh();
  const stopped=admin.state.documents.find(d=>d.id===disapproved.id);
  assert.equal(stopped.status,'Disapproved');
  assert.equal(stopped.currentStepNumber,2);
  assert.equal(stopped.workflowSteps[1].status,'Completed');
  assert.equal(stopped.workflowSteps[1].externalReturn.result,'Disapproved');
  assert.equal(stopped.workflowSteps[2].status,'Skipped');
  assert.equal(stopped.workflowSteps[2].isCurrent,false);
  assert(admin.state.auditLogs.some(event=>event.documentId===disapproved.id && event.actionType==='DOCUMENT_DISAPPROVED'));
  await processor.action('completeStep',[disapproved.id,'Must not resume'],409);
});
test('renaming a catalogue type updates future routing while preserving document history',async()=>{
  await admin.refresh();
  const category=admin.state.classifications.find(c=>c.classification==='Communication'); const type=category.types.find(t=>t.name==='Office Order');
  await admin.action('updateClassificationType',[category.id,{...type,name:'Office Instruction'}]);
  assert.equal(admin.state.workflowTemplates.find(w=>w.id===workflow.id).documentType,'Office Instruction');
  assert.equal(admin.state.documents.find(d=>d.id===doc.id).documentType,'Office Order');
  const record=(await admin.action('registerDocument',[{...documentData('RENAMED-TYPE'),documentType:'Office Instruction'}])).result;
  assert.equal(record.workflowTemplateId,workflow.id);
});
test('successful sign-ins do not exhaust the shared-office failure limit',async()=>{
  for (let i=0;i<22;i++) await new Client(fixture.base).login();
});
