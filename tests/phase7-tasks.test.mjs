import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

const queues=['my_tasks','team_queue','returned','waiting','ready_for_release','completed'];
const current=doc=>doc.workflowSteps.find(step=>step.stepNumber===doc.currentStepNumber);
const assigned=(entry,user,team=false)=>!!entry && (entry.userId ? entry.userId===user.id : entry.type==='Role' ? entry.role===user.role : team && entry.type==='Team' && !!entry.team && [user.division,user.office].includes(entry.team));
const actionable=(doc,user,team=false)=>{
  if(['Released','Archived','Disapproved'].includes(doc.status)) return false;
  const step=current(doc); if(!step) return false;
  if(step.stageType!=='EXTERNAL_HANDOFF_REVIEW') return assigned(step.assignedTo,user,team);
  if(step.externalStatus==='PENDING_HANDOFF') return step.handoffOwner?.userId===user.id;
  if(step.externalStatus==='OUTSIDE_HRMDO') return assigned(step.returnReceiver,user,team);
  return false;
};
const legacy=(docs,user,queue)=>docs.filter(doc=>{
  if(doc.isLegacyV1) return false;
  const step=current(doc),active=!['Released','Archived','Disapproved'].includes(doc.status);
  switch(queue){
    case 'my_tasks': return active && !!step && ((doc.status==='On_Hold' && doc.encodedBy.userId===user.id)||actionable(doc,user));
    case 'team_queue': return active && !!step && (step.stageType==='EXTERNAL_HANDOFF_REVIEW' ? step.externalStatus==='OUTSIDE_HRMDO' && step.returnReceiver?.type==='Team' : step.assignedTo.type==='Team') && actionable(doc,user,true);
    case 'returned': return doc.status==='Returned';
    case 'waiting': return active && (doc.encodedBy.userId===user.id || doc.workflowSteps.some(s=>s.stepNumber<doc.currentStepNumber && s.completedBy?.userId===user.id)) && !actionable(doc,user,true);
    case 'ready_for_release': return doc.status==='Ready_For_Release';
    case 'completed': return ['Released','Disapproved'].includes(doc.status);
  }
}).map(doc=>doc.id);

test('Phase 7 task queues match visible legacy documents on every page and reject identity overrides',async()=>{
  const fixture=await startFixture(18776,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    for(const [name,role,division] of [['alice','processor','Team A'],['bob','reviewer','Team B'],['carol','employee','Team A'],['dave','employee','Team X']])
      await admin.action('addUser',[{name,email:`${name}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division,position:'Officer'}]);
    const people=Object.fromEntries(admin.state.users.map(user=>[user.name,user]));
    people.admin=admin.state.users.find(user=>user.email==='admin@example.test');
    const step=(n,assignment,extra={})=>({stepNumber:n,name:`Step ${n}`,stageType:'INTERNAL_PROCESSING',requiredAction:'Verify & Process',status:'In_Progress',assignedTo:assignment,slaHours:24,isCurrent:n===1,allowHold:true,requiresAttachment:false,...extra});
    const doc=(id,status,assignee,encoder=people.dave,extra={})=>({
      id,trackingNumber:`P7-${id}`,barcode:`P7BAR-${id}`,title:`Phase 7 ${id}`,subject:'Subject',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',
      classification:'Request',documentType:'Service Record',priority:'Routine',dateReceived:'2026-09-15T00:00:00Z',dateEncoded:'2026-09-15T00:00:00Z',
      description:'Parity',status,currentStepNumber:1,totalSteps:1,workflowTemplateId:'p7-template',workflowVersion:1,currentLocation:'HRMDO',
      encodedBy:{userId:encoder.id,userName:encoder.name},workflowSteps:[step(1,assignee)],attachments:[],custodyHistory:[],...extra,
    });
    const person={type:'Person',userId:people.alice.id,displayName:'Alice'};
    const role={type:'Role',role:'processor',displayName:'Processor'};
    const team={type:'Team',team:'Team A',displayName:'Team A'};
    const externalHandoff={destinationOffice:'Outside office',purpose:'Review',handedTo:'Clerk',sentAt:'2026-09-15T00:00:00Z'};
    const docs=[
      doc('01','Pending_Approval',person),doc('02','In_Progress',role),doc('03','In_Progress',team),
      doc('04','Returned',person),doc('05','On_Hold',person,people.carol),doc('06','Ready_For_Recheck',role),
      doc('07','Ready_For_Release',role),doc('08','Released',person),doc('09','Disapproved',team),
      doc('10','Awaiting_External_Return',{type:'System',displayName:'System'},people.dave,{workflowSteps:[step(1,{type:'System',displayName:'System'},{stageType:'EXTERNAL_HANDOFF_REVIEW',externalStatus:'PENDING_HANDOFF',handoffOwner:{userId:people.alice.id,userName:'alice'},returnReceiver:{type:'Role',role:'reviewer',displayName:'Reviewer'}})]}),
      doc('11','Awaiting_External_Return',{type:'System',displayName:'System'},people.dave,{workflowSteps:[step(1,{type:'System',displayName:'System'},{stageType:'EXTERNAL_HANDOFF_REVIEW',externalStatus:'OUTSIDE_HRMDO',handoffOwner:{userId:people.alice.id,userName:'alice'},returnReceiver:{type:'Role',role:'reviewer',displayName:'Reviewer'},externalHandoff})]}),
      doc('12','Awaiting_External_Return',{type:'System',displayName:'System'},people.dave,{workflowSteps:[step(1,{type:'System',displayName:'System'},{stageType:'EXTERNAL_HANDOFF_REVIEW',externalStatus:'OUTSIDE_HRMDO',handoffOwner:{userId:people.alice.id,userName:'alice'},returnReceiver:team,externalHandoff})]}),
      doc('13','In_Progress',{type:'System',displayName:'System'},people.carol),
      doc('14','In_Progress',person,people.dave,{classification:'Payroll'}),
      doc('15','In_Progress',person,people.dave,{isLegacyV1:true}),
      doc('16','In_Progress',person,people.dave,{workflowSteps:[step(1,person,{isCurrent:false,completedBy:{userId:people.alice.id,userName:'alice'}}),step(2,{type:'Person',userId:people.bob.id,displayName:'Bob'},{isCurrent:true})],currentStepNumber:2,totalSteps:2}),
    ];
    const template={id:'p7-template',version:1,classification:'Request',documentType:'Service Record',documentTypes:['Service Record'],employmentClassification:'All',title:'Phase 7',description:'Parity',isActive:true,steps:[]};
    const rows=[{collection:'workflowTemplates',id:template.id,value:template},...docs.map(value=>({collection:'documents',id:value.id,value}))];
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE7_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE7_ROWS:JSON.stringify(rows)});
    assert.equal(JSON.parse(fixture.run(['scripts/backfill_documents_workflow.php','--apply'])).status,'ok');
    for(const name of ['admin','alice','bob','carol','dave']){
      const client=name==='admin'?admin:await new Client(fixture.base).login(`${name}@example.test`);
      await client.refresh();
      for(const queue of queues){
        const expected=legacy(client.state.documents,people[name],queue);
        const actual=[]; let total=0,counts;
        for(let page=1;;page++){
          const response=await client.request(`document_tasks.php?queue=${queue}&page=${page}&limit=2`);
          total=response.pagination.total; counts=response.queueCounts;
          actual.push(...response.data.map(row=>row.id));
          if(page>=response.pagination.totalPages) break;
        }
        assert.deepEqual(actual,expected,`${name} ${queue}`);
        assert.equal(total,expected.length,`${name} ${queue} total`);
        assert.equal(counts[queue],expected.length,`${name} ${queue} badge`);
      }
    }
    const alice=await new Client(fixture.base).login('alice@example.test');
    assert.deepEqual((await alice.request('document_tasks.php?queue=my_tasks&classification=Payroll')).data.map(row=>row.id),legacy(alice.state.documents,people.alice,'my_tasks').filter(id=>alice.state.documents.find(doc=>doc.id===id)?.classification==='Payroll'));
    assert.deepEqual((await alice.request('document_tasks.php?queue=my_tasks&search=P7-01')).data.map(row=>row.id),['01']);
    const filtered=await alice.request('document_tasks.php?queue=my_tasks&search=P7-01');
    assert.equal(filtered.pagination.total,1); assert(filtered.queueCounts.my_tasks>1);
    await alice.request(`document_tasks.php?queue=my_tasks&userId=${people.bob.id}`,'GET',undefined,400);
    await alice.request('document_tasks.php?queue=bogus','GET',undefined,400);
    await alice.request('document_tasks.php?queue=my_tasks&limit=101','GET',undefined,400);
    const noSession=await fetch(`${fixture.base}/api/document_tasks.php?queue=my_tasks`); assert.equal(noSession.status,401);
  } finally { await fixture.stop(); }
});

test('legacy mutations immediately change targeted task membership after their committed revision',async()=>{
  const fixture=await startFixture(18777,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    for(const [name,role] of [['Worker','processor'],['Reviewer','reviewer']])
      await admin.action('addUser',[{name,email:`${name.toLowerCase()}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division:'Operations',position:'Officer'}]);
    const worker=await new Client(fixture.base).login('worker@example.test');
    const reviewer=await new Client(fixture.base).login('reviewer@example.test');
    const step=(n,role,extra={})=>({stepNumber:n,name:`Phase ${n}`,description:'Mutation parity',assigneeType:'Role',assigneeRole:role,assigneeName:role,slaHours:24,requiredAction:n===1?'Verify & Process':'Review & Recommend',allowReturn:n>1,allowHold:true,requiresAttachment:false,...extra});
    await admin.action('createWorkflowTemplate',[{title:'Phase 7 mutations',description:'Mutation parity',classification:'Communication',documentType:'Office Order',isActive:true,steps:[step(1,'processor'),step(2,'reviewer')]}]);
    const record=barcode=>({title:`Phase 7 ${barcode}`,subject:'Mutation parity',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'Mutation parity',barcode,files:[]});
    const first=(await admin.action('registerDocument',[record('P7-COMPLETE')])).result;
    const second=(await admin.action('registerDocument',[record('P7-REASSIGN')])).result;
    const third=(await admin.action('registerDocument',[record('P7-HOLD')])).result;
    const ids=async(client,queue='my_tasks')=>(await client.request(`document_tasks.php?queue=${queue}`)).data.map(row=>row.id);
    assert((await ids(worker)).includes(first.id));
    await worker.action('completeStep',[first.id,'Processed']);
    assert(!(await ids(worker)).includes(first.id));
    assert((await ids(reviewer)).includes(first.id));
    const reviewerId=admin.state.users.find(user=>user.name==='Reviewer').id;
    await admin.action('reassignTask',[second.id,reviewerId,'', 'Transferred for review']);
    assert(!(await ids(worker)).includes(second.id));
    assert((await ids(reviewer)).includes(second.id));
    await worker.action('placeDocumentHold',[third.id,{reason:'Need evidence',remarks:'Please provide evidence',files:[]}]);
    assert((await ids(worker)).includes(third.id));
    await worker.action('submitDocumentCompliance',[third.id,{remarks:'Evidence supplied',files:[]}]);
    assert((await ids(worker)).includes(third.id));
    await worker.action('recheckDocumentHold',[third.id,{}]);
    assert((await ids(worker)).includes(third.id));
    await admin.action('createWorkflowTemplate',[{title:'Phase 7 external',description:'External transition',classification:'Request',documentType:'Certification',isActive:true,steps:[step(1,'processor'),{stepNumber:2,name:'Outside review',description:'External',stageType:'EXTERNAL_HANDOFF_REVIEW',assigneeType:'System',assigneeName:'System',slaHours:48,requiredAction:'External Handoff',allowReturn:false,requiresAttachment:false,externalPurpose:'Review',externalDestinationMode:'FIXED_DESTINATION',externalDestinationOffice:'Outside office',returnReceiverType:'Role',returnReceiverRole:'reviewer',returnReceiverName:'Reviewer'},step(3,'processor')]}]);
    const external=(await admin.action('registerDocument',[{...record('P7-EXTERNAL'),classification:'Request',documentType:'Certification'}])).result;
    await worker.action('completeStep',[external.id,'Ready for outside review']);
    assert((await ids(worker)).includes(external.id));
    await worker.action('recordExternalHandoff',[external.id,{destinationOffice:'Outside office',purpose:'Review',handedTo:'Clerk',files:[]}]);
    assert(!(await ids(worker)).includes(external.id));
    assert((await ids(reviewer)).includes(external.id));
    await reviewer.action('recordExternalReturn',[external.id,{returnedFrom:'Outside office',returnedBy:'Clerk',result:'Reviewed',files:[]}]);
    assert(!(await ids(reviewer)).includes(external.id));
    assert((await ids(worker)).includes(external.id));
  } finally { await fixture.stop(); }
});
