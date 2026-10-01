import test from 'node:test';
import assert from 'node:assert/strict';
import {startFixture,Client,testPassword} from './support.mjs';

test('Phase 10 Dashboard, Leave detail and EWP pages are scoped and bounded',async()=>{
  const fixture=await startFixture(18788,{HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1'});
  try{
    const admin=await new Client(fixture.base).login();
    const ewp=[];for(let n=0;n<31;n++)ewp.push({collection:'ewpRecords',id:`ewp-${n}`,value:{id:`ewp-${n}`,barcode:`EWP-${n}`,employeeName:`Employee ${n}`,office:n%2?'HRMDO':'Finance',amount:n+1,purpose:'Assistance',remarks:'',status:'Recorded',createdByUserId:admin.state.users[0].id,createdAt:`2026-10-01T00:00:${String(n).padStart(2,'0')}Z`}});
    const leave={id:'phase10-leave',barcode:'LEAVE-P10',trackingNumber:'LEAVE-P10',employeeName:'Employee',office:'HRMDO',leaveType:'Vacation Leave',status:'For_Computation',isLegacyV1:false,createdAt:'2026-10-01T00:00:00Z',dateRanges:[]};
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE10_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE10_ROWS:JSON.stringify([...ewp,{collection:'leaveApplications',id:leave.id,value:leave}])});
    const dashboard=await admin.request('dashboard.php');assert.equal(dashboard.metrics.total,0);assert.ok(dashboard.activity.length<=4);
    const first=await admin.request('ewp.php?page=1&limit=10');assert.equal(first.data.length,10);assert.equal(first.summary.total,31);assert.equal(first.summary.amount,496);assert.equal(first.pagination.totalPages,4);
    const filtered=await admin.request('ewp.php?q=Employee%2030&page=1&limit=10');assert.equal(filtered.pagination.total,1);assert.equal(filtered.data[0].id,'ewp-30');
    const detail=await admin.request('leave_detail.php?id=phase10-leave');assert.equal(detail.record.id,leave.id);
    const history=await admin.request('leave_audit.php?id=phase10-leave&page=1&limit=10');assert.equal(history.pagination.total,0);
    await admin.request('ewp.php?page=0','GET',undefined,400);await admin.request('leave_detail.php?id=missing','GET',undefined,404);
    const anonymous=await fetch(`${fixture.base}/api/dashboard.php`);assert.equal(anonymous.status,401);
    const restricted=(await admin.action('addUser',[{name:'Restricted',email:'restricted-p10@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'Other',division:'Other',position:'Officer',sidebarModules:['dashboard']}])).result;
    assert.ok(restricted.id);
    const user=await new Client(fixture.base).login('restricted-p10@example.test');
    await user.request('ewp.php','GET',undefined,403);await user.request('leave_detail.php?id=phase10-leave','GET',undefined,403);await user.request('leave_audit.php?id=phase10-leave','GET',undefined,403);
    await admin.action('addUser',[{name:'Leave Processor',email:'leave-processor-p10@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'Other',division:'Other',position:'Officer',sidebarModules:['leave']}]);
    const leaveProcessor=await new Client(fixture.base).login('leave-processor-p10@example.test');
    assert.equal((await leaveProcessor.request('leave_detail.php?id=phase10-leave')).record.id,leave.id);
    assert.equal((await leaveProcessor.request('ewp.php')).summary.total,31);
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_audit (id,record_json) VALUES (?,?)'); foreach(json_decode(getenv('PHASE10_AUDIT'),true) as $r) $q->execute([$r['id'],json_encode($r)]);"],{PHASE10_AUDIT:JSON.stringify([
      {id:'p10-visible-audit',documentId:leave.id,actorId:admin.state.users.find(row=>row.role==='admin').id,actorName:'Administrator',summary:'Visible Leave activity',timestamp:'2026-10-01T01:00:00Z'},
      {id:'p10-hidden-audit',documentId:'hidden-document',actorId:admin.state.users.find(row=>row.role==='admin').id,actorName:'Administrator',summary:'Hidden subject activity',timestamp:'2026-10-01T02:00:00Z'}
    ])});
    const adminActivity=(await admin.request('dashboard.php')).activity;assert.ok(adminActivity.some(event=>event.id==='p10-visible-audit'));
    const restrictedActivity=(await user.request('dashboard.php')).activity;assert.ok(!restrictedActivity.some(event=>event.id==='p10-visible-audit'||event.id==='p10-hidden-audit'));
    const leaveHistory=await admin.request('leave_audit.php?id=phase10-leave');assert.equal(leaveHistory.pagination.total,1);
  }finally{await fixture.stop();}
});

test('Dashboard document aggregates and task rows match the filtered state for a processor',async()=>{
  const fixture=await startFixture(18790,{HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try{
    const admin=await new Client(fixture.base).login();
    const worker=(await admin.action('addUser',[{name:'Dashboard Processor',email:'dashboard-processor@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
    fixture.run(['tests/phase7-load-probe.php'],{PHASE7_TARGET:'100',PHASE7_USER:worker.id});
    const processor=await new Client(fixture.base).login('dashboard-processor@example.test');
    const state=processor.state;const result=await processor.request('dashboard.php');
    const active=state.documents.filter(doc=>!doc.isLegacyV1&&!['Released','Archived','Disapproved'].includes(doc.status));
    assert.equal(result.metrics.total,state.documents.filter(doc=>!doc.isLegacyV1).length);
    assert.equal(result.metrics.in_flight,active.length);
    assert.equal(result.metrics.pending,0);assert.equal(result.metrics.concluded,0);assert.equal(result.metrics.outside,0);
    assert.equal(result.metrics.actionable,100);assert.equal(result.tasks.length,25);
    assert.deepEqual(result.tasks.map(row=>row.id),active.slice(0,25).map(doc=>doc.id));
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare(\"SELECT record_json FROM app_records WHERE collection='documents' AND id=?\");$source=$p->prepare(\"UPDATE app_records SET record_json=? WHERE collection='documents' AND id=?\");$projection=$p->prepare(\"UPDATE documents SET status=?,source_json=? WHERE id=?\");foreach(['Pending_Approval','Released','Archived','Disapproved','Awaiting_External_Return'] as $n=>$status){$id='phase7load-'.str_pad((string)($n+1),5,'0',STR_PAD_LEFT);$q->execute([$id]);$doc=json_decode($q->fetchColumn(),true);$doc['status']=$status;$raw=json_encode($doc);$source->execute([$raw,$id]);$projection->execute([$status,$raw,$id]);}"],{});
    await processor.refresh();const changed=await processor.request('dashboard.php');const visible=processor.state.documents.filter(doc=>!doc.isLegacyV1);
    assert.equal(changed.metrics.total,visible.length);
    assert.equal(changed.metrics.in_flight,visible.filter(doc=>!['Released','Archived','Disapproved'].includes(doc.status)).length);
    assert.equal(changed.metrics.pending,visible.filter(doc=>doc.status==='Pending_Approval').length);
    assert.equal(changed.metrics.concluded,visible.filter(doc=>['Released','Disapproved'].includes(doc.status)).length);
    assert.equal(changed.metrics.outside,visible.filter(doc=>doc.status==='Awaiting_External_Return').length);
    assert.equal(changed.metrics.actionable,visible.filter(doc=>!['Released','Archived','Disapproved'].includes(doc.status)).length);
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $id='phase7load-00001'; $q=$p->prepare(\"SELECT record_json FROM app_records WHERE collection='documents' AND id=?\");$q->execute([$id]);$doc=json_decode($q->fetchColumn(),true);$doc['classification']='Payroll';$p->prepare(\"UPDATE app_records SET record_json=? WHERE collection='documents' AND id=?\")->execute([json_encode($doc),$id]);$p->prepare(\"UPDATE documents SET classification='Payroll',source_json=? WHERE id=?\")->execute([json_encode($doc),$id]);$item=['id'=>'p10-single-item','batchId'=>'SINGLE_ENTRY','documentId'=>$id,'employmentClassification'=>'Regular','status'=>'In_Progress'];$raw=json_encode($item);$p->prepare(\"INSERT INTO app_records (collection,id,record_json) VALUES ('payrollItems',?,?)\")->execute([$item['id'],$raw]);$p->prepare(\"INSERT INTO payroll_read_items (id,batch_id,document_id,source_sha256) VALUES (?,?,?,?)\")->execute([$item['id'],'SINGLE_ENTRY',$id,hash('sha256',$raw)]);"],{});
    const single=await processor.request('documents.php?id=phase7load-00001');assert.equal(single.payrollItem.id,'p10-single-item');
  }finally{await fixture.stop();}
});
