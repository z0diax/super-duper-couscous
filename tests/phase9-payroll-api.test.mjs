import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

const progress=(total,initial)=>({totalItems:total,docketed:total,stage1Completed:total,initialChecking:{active:initial,completed:total-initial,onHold:0},management:{reached:total-initial,active:total-initial,completed:0,onHold:0,notReached:initial},release:{ready:0,released:0,notReached:total},onHoldTotal:0,exceptionCount:0,completedCount:0,derivedStatus:initial?'INITIAL_CHECKING':'IN_PROCESS',displayStatus:initial?'Initial Checking':'In Process'});
const desk=user=>({stage:'initial_checking',assignmentType:'Person',userId:user.id,userName:user.name,roleTitle:user.roleTitle});
const batch=(id,owner,title)=>({id,batchNumber:`P9-${id}`,batchBarcode:`P9BAR-${id}`,classification:'Payroll',payrollType:title,office:'HRMDO',payrollPeriod:'October',receivedFromLiaison:'Liaison',remarks:'Phase nine',dateReceived:'2026-10-01T00:00:00Z',dateEncoded:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',encodedBy:{userId:owner.id,userName:owner.name,userRole:owner.roleTitle},currentStage:'initial_checking',currentStageName:'Initial Checking',assignedDesk:desk(owner),initialCheckingDesk:desk(owner),workflowStages:[{stageNumber:4,name:'Release',status:'Pending',assignedTo:{...desk(owner),stage:'release'}}],workflowHistory:[],totalItemsCount:id==='one'?2:1,itemIds:id==='one'?['item-one','item-two']:['item-three'],workGroupIds:id==='one'?['group-one']:[],attachments:[],status:'INITIAL_CHECKING',createdAt:'2026-10-01T00:00:00Z',progress:progress(id==='one'?2:1,id==='one'?1:1)});
const item=(id,batchId,stage='initial_checking',groupId='')=>({id,batchId,batchNumber:`P9-${batchId}`,itemNumber:id==='item-two'?2:1,barcode:`P9BAR-${id}`,title:`Payroll ${id}`,office:'HRMDO',classificationType:'Salary',employmentClassification:'Regular',verificationStatus:'Passed',status:'In_Progress',currentStage:stage,workGroupId:groupId||undefined,assignedToUserId:'',auditHistory:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'});
test('Phase 9 Payroll projection and targeted reads preserve scoped batch, task, search, and shell behavior',async()=>{
  const fixture=await startFixture(18784,{HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1'});
  try{
    const admin=await new Client(fixture.base).login();
    const people={};
    for(const name of ['alice','bob','carol'])people[name]=(await admin.action('addUser',[{name,email:`${name}@example.test`,password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:name==='bob'?'Operations':'Other',position:'Officer'}])).result;
    const rows=[
      {collection:'payrollBatches',id:'one',value:batch('one',people.alice,'Salary')},
      {collection:'payrollBatches',id:'two',value:batch('two',people.carol,'Secret allowance')},
      {collection:'payrollItems',id:'item-one',value:item('item-one','one')},
      {collection:'payrollItems',id:'item-two',value:item('item-two','one','verification_signing','group-one')},
      {collection:'payrollItems',id:'item-three',value:item('item-three','two')},
      {collection:'workGroups',id:'group-one',value:{id:'group-one',batchId:'one',batchNumber:'P9-one',code:'GROUP-ONE',classification:'Regular',assignedProcessorId:people.bob.id,assignedProcessorName:'bob',assignedProcessorRoleTitle:'Processor',assignedTeam:'',itemIds:['item-two'],status:'In_Progress',auditHistory:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'}},
    ];
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE9_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE9_ROWS:JSON.stringify(rows)});
    assert.equal(JSON.parse(fixture.run(['scripts/backfill_payroll_reads.php','--apply'])).status,'ok');
    assert.equal(JSON.parse(fixture.run(['scripts/backfill_payroll_reads.php','--verify'])).status,'ok');
    for(const name of ['admin','alice','bob','carol']){
      const client=name==='admin'?admin:await new Client(fixture.base).login(`${name}@example.test`);
      await client.refresh();
      const legacyIds=client.state.payrollBatches.map(value=>value.id).sort();
      const list=await client.request('payroll_batches.php?page=1&limit=25');
      assert.deepEqual(list.data.map(value=>value.id).sort(),legacyIds,`${name} visible batches`);
      const ownedList=await client.request('payroll_batches.php?owned=1&stage=completed');
      assert.equal(ownedList.pagination.total,0);
      assert.equal(ownedList.metrics.total,name==='admin'?2:name==='alice'||name==='carol'?1:0,`${name} unfiltered batch count`);
      const shell=await client.request('payroll_shell_summary.php');
      const tasks=await client.request('payroll_tasks.php?page=1&limit=25');
      assert.equal(shell.sidebarPayrollTaskCount,tasks.allTaskCount,`${name} task count`);
      const visibleItems=client.state.payrollItems;
      const visibleGroups=client.state.workGroups;
      const viewer=name==='admin'?client.state.users.find(value=>value.role==='admin'):people[name];
      const assigned=desk=>!!desk&&(desk.userId?desk.userId===viewer.id:desk.assignmentType==='Role'?desk.roleId===viewer.role:desk.assignmentType==='Team'&&[viewer.division,viewer.office].includes(desk.team));
      const expectedNotifications=client.state.payrollBatches.filter(batch=>{
        if(batch.progress.derivedStatus==='COMPLETED')return false;
        const children=visibleItems.filter(item=>item.batchId===batch.id);
        return batch.encodedBy.userId===viewer.id&&children.some(item=>item.status==='On_Hold')
          ||children.some(item=>item.currentStage==='initial_checking')&&assigned(batch.initialCheckingDesk||batch.assignedDesk)
          ||visibleGroups.some(group=>group.batchId===batch.id&&group.status==='In_Progress'&&(group.assignedProcessorId===viewer.id||group.assignedTeam&&[viewer.division,viewer.office].includes(group.assignedTeam)))
          ||children.some(item=>item.currentStage==='release'&&['Ready_For_Release','On_Hold','Ready_For_Recheck'].includes(item.status))&&assigned(batch.workflowStages?.find(stage=>stage.stageNumber===4)?.assignedTo);
      }).map(batch=>`payroll-${batch.id}-${batch.progress.derivedStatus}-${batch.progress.onHoldTotal}`);
      assert.deepEqual(shell.payrollNotifications.map(value=>value.id).sort(),expectedNotifications.sort(),`${name} notifications`);
      const search=await client.request('payroll_search.php?q=Secret');
      assert.equal(search.total,name==='admin'||name==='carol'?1:0,`${name} hidden partial`);
      const exact=await client.request('payroll_search.php?q=P9BAR-two');
      assert.equal(!!exact.exact,name==='admin'||name==='carol',`${name} hidden exact`);
    }
    const bob=await new Client(fixture.base).login('bob@example.test');
    const detail=await bob.request('payroll_batch.php?id=one');
    assert.deepEqual(detail.items.map(value=>value.id),['item-two']);
    assert.equal(detail.batch.remarks,'');assert.deepEqual(detail.batch.attachments,[]);
    const names=['ZAMORA, TEST','badoria, jannelyn','FERNANDEZ, MA. IMELDA ET. AL','ABETO, RICHARD ET. AL','CRUZ, TEST'];
    const sortedRows=names.map((title,index)=>({collection:'payrollItems',id:`sort-${index}`,value:{...item(`sort-${index}`,'one'),itemNumber:index+3,title}}));
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE9_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE9_ROWS:JSON.stringify(sortedRows)});
    fixture.run(['scripts/backfill_payroll_reads.php','--apply']);
    const defaultPage=await admin.request('payroll_batch.php?id=one&itemPage=1&limit=2');
    assert.deepEqual(defaultPage.items.map(value=>value.id),['item-one','item-two']);
    const orderedPages=await Promise.all([1,2,3,4].map(page=>admin.request(`payroll_batch.php?id=one&itemPage=${page}&limit=2&itemOrder=name`)));
    assert.deepEqual(orderedPages.flatMap(page=>page.items.map(value=>value.title)),[
      'ABETO, RICHARD ET. AL','badoria, jannelyn','CRUZ, TEST','FERNANDEZ, MA. IMELDA ET. AL',
      'Payroll item-one','Payroll item-two','ZAMORA, TEST',
    ]);
    await bob.request('payroll_batch.php?id=two','GET',undefined,404);
    await bob.request('payroll_search.php?q=P9BAR-item-three');
    await bob.request('payroll_batches.php?page=0','GET',undefined,400);
    await bob.request('payroll_search.php?q=x&userId=carol','GET',undefined,400);
    fixture.run(['-r',"require 'api/db.php'; database()->exec(\"UPDATE payroll_read_items SET status='On_Hold' WHERE id IN ('item-one','item-two')\");"]);
    assert.equal((await admin.request('payroll_batches.php?owned=1')).metrics.hold,1);
    const aliceClient=await new Client(fixture.base).login('alice@example.test');
    assert.equal((await aliceClient.request('payroll_batches.php?owned=1')).metrics.hold,1);
    const anonymous=await fetch(`${fixture.base}/api/payroll_tasks.php`);assert.equal(anonymous.status,401);
  }finally{await fixture.stop();}
});

test('single payroll metrics stay unfiltered and respect entry ownership',async()=>{
  const fixture=await startFixture(18785,{HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1'});
  try{
    const admin=await new Client(fixture.base).login();
    const owner=(await admin.action('addUser',[{name:'Payroll owner',email:'payroll-owner@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'HRMDO',position:'Officer'}])).result;
    const records=[
      {id:'owned-initial',classification:'Payroll',status:'In_Progress',currentStepNumber:2,encodedBy:{userId:owner.id}},
      {id:'owned-released',classification:'Payroll',status:'Released',currentStepNumber:4,encodedBy:{userId:owner.id}},
      {id:'owned-held',classification:'Payroll',status:'On_Hold',currentStepNumber:2,encodedBy:{userId:owner.id}},
      {id:'owned-recheck',classification:'Payroll',status:'Ready_For_Recheck',currentStepNumber:3,encodedBy:{userId:owner.id}},
      {id:'other-initial',classification:'Payroll',status:'In_Progress',currentStepNumber:1,encodedBy:{userId:'another-user'}},
      {id:'non-payroll',classification:'Communication',status:'Released',currentStepNumber:4,encodedBy:{userId:owner.id}},
    ];
    fixture.run(['-r',"require 'api/db.php'; $p=database(); foreach(json_decode(getenv('PAYROLL_METRIC_DOCS'),true) as $d){$raw=json_encode($d);$p->prepare(\"INSERT INTO app_records (collection,id,record_json) VALUES ('documents',?,?)\")->execute([$d['id'],$raw]);$p->prepare('INSERT INTO documents (id,classification,status,current_step_number,encoded_by_user_id,source_json,source_sha256) VALUES (?,?,?,?,?,?,?)')->execute([$d['id'],$d['classification'],$d['status'],$d['currentStepNumber'],$d['encodedBy']['userId'],$raw,hash('sha256',$raw)]);}"],{PAYROLL_METRIC_DOCS:JSON.stringify(records)});
    const all=await admin.request('payroll_single.php?stage=completed');
    assert.equal(all.pagination.total,1);
    assert.deepEqual(all.metrics,{total:5,hold:2,initial:3,released:1});
    const user=await new Client(fixture.base).login('payroll-owner@example.test');
    const owned=await user.request('payroll_single.php?stage=completed');
    assert.equal(owned.pagination.total,1);
    assert.deepEqual(owned.metrics,{total:4,hold:2,initial:2,released:1});
  }finally{await fixture.stop();}
});
