import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

const current=doc=>doc.workflowSteps.find(step=>step.stepNumber===doc.currentStepNumber);
const assigned=(entry,user,team=true)=>!!entry && (entry.userId?entry.userId===user.id:entry.type==='Role'?entry.role===user.role:team&&entry.type==='Team'&&!!entry.team&&[user.division,user.office].includes(entry.team));
const actionable=(doc,user)=>{
  if(['Released','Archived','Disapproved'].includes(doc.status))return false;
  const step=current(doc); if(!step)return false;
  if(step.stageType!=='EXTERNAL_HANDOFF_REVIEW')return assigned(step.assignedTo,user);
  if(step.externalStatus==='PENDING_HANDOFF')return step.handoffOwner?.userId===user.id;
  if(step.externalStatus==='OUTSIDE_HRMDO')return assigned(step.returnReceiver,user);
  return false;
};
const legacySummary=(docs,user)=>{
  const active=docs.filter(doc=>!['Released','Archived','Disapproved'].includes(doc.status)&&((doc.status==='On_Hold'&&doc.encodedBy.userId===user.id)||actionable(doc,user)));
  const notifications=active.filter(doc=>!doc.isLegacyV1).map(doc=>{
    const compliance=doc.status==='On_Hold'&&doc.encodedBy.userId===user.id,step=current(doc);
    return {id:`document-${doc.id}-${doc.status}-${doc.currentStepNumber}`,documentId:doc.id,title:compliance?'Document needs compliance':'Document assigned to you',timestamp:doc.heldAt||step?.startedAt||doc.dateEncoded,tone:compliance?'amber':'blue',message:`${doc.trackingNumber} · ${compliance?(doc.holdReason||'Submit the requested compliance'):(step?.name||doc.title)}`};
  }).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,25);
  return {count:active.length,notifications};
};
const fields=doc=>[doc.trackingNumber,doc.barcode,doc.legacyId,doc.title,doc.subject,doc.sourceOffice,doc.senderName,doc.classification,doc.documentType];
const legacySearch=(docs,term)=>{
  const q=term.trim().toLowerCase();
  const exact=docs.find(doc=>[doc.trackingNumber,doc.barcode,doc.legacyId].some(value=>value?.toLowerCase()===q));
  if(exact)return {exact:exact.id,ids:[]};
  const matches=docs.filter(doc=>fields(doc).some(value=>value?.toLowerCase().includes(q))).sort((a,b)=>a.trackingNumber.localeCompare(b.trackingNumber));
  return {exact:null,ids:matches.map(doc=>doc.id)};
};

test('Phase 8 shell search and summary preserve scoped legacy IDs, badges and notifications',async()=>{
  const fixture=await startFixture(18781,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    for(const [name,role,division] of [['alice','processor','Team A'],['bob','reviewer','Team B'],['carol','employee','Team A'],['dave','employee','Team X']])
      await admin.action('addUser',[{name,email:`${name}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division,position:'Officer'}]);
    const people=Object.fromEntries(admin.state.users.map(user=>[user.name,user]));
    people.admin=admin.state.users.find(user=>user.email==='admin@example.test');
    const person={type:'Person',userId:people.alice.id,displayName:'Alice'},role={type:'Role',role:'processor',displayName:'Processor'},team={type:'Team',team:'Team A',displayName:'Team A'};
    const step=(assignedTo,extra={})=>({stepNumber:1,name:'Shared review',stageType:'INTERNAL_PROCESSING',requiredAction:'Verify & Process',status:'In_Progress',assignedTo,slaHours:24,isCurrent:true,allowHold:true,requiresAttachment:false,startedAt:'2026-09-20T10:00:00Z',...extra});
    const doc=(id,status,assignment,encoder=people.dave,extra={})=>({id,trackingNumber:`P8-${id}`,barcode:`P8BAR-${id}`,title:`Shared record ${id}`,subject:'Common subject',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Shared sender',classification:'Request',documentType:'Service Record',priority:'Routine',dateReceived:'2026-09-20T00:00:00Z',dateEncoded:'2026-09-20T00:00:00Z',description:'Shell parity',status,currentStepNumber:1,totalSteps:1,workflowTemplateId:'p8-template',workflowVersion:1,currentLocation:'HRMDO',encodedBy:{userId:encoder.id,userName:encoder.name},workflowSteps:[step(assignment)],attachments:[],custodyHistory:[],...extra});
    const externalHandoff={destinationOffice:'Outside office',purpose:'Review',handedTo:'Clerk',sentAt:'2026-09-20T00:00:00Z'};
    const docs=[
      doc('01','In_Progress',person),doc('02','Pending_Approval',role),doc('03','In_Progress',team),
      doc('04','On_Hold',person,people.carol,{holdReason:'Need compliance',heldAt:'2026-09-22T00:00:00Z'}),
      doc('05','Ready_For_Recheck',role),doc('06','Released',person),
      doc('07','In_Progress',person,people.dave,{isLegacyV1:true,legacyId:'LEGACY-42'}),
      doc('08','In_Progress',{type:'System',displayName:'System'},people.dave,{title:'Secret Nebula'}),
      doc('09','Awaiting_External_Handoff',{type:'System',displayName:'System'},people.dave,{workflowSteps:[step({type:'System',displayName:'System'},{stageType:'EXTERNAL_HANDOFF_REVIEW',externalStatus:'PENDING_HANDOFF',handoffOwner:{userId:people.alice.id,userName:'alice'},returnReceiver:{type:'Role',role:'reviewer',displayName:'Reviewer'}})]}),
      doc('10','Awaiting_External_Return',{type:'System',displayName:'System'},people.dave,{workflowSteps:[step({type:'System',displayName:'System'},{stageType:'EXTERNAL_HANDOFF_REVIEW',externalStatus:'OUTSIDE_HRMDO',handoffOwner:{userId:people.alice.id,userName:'alice'},returnReceiver:{type:'Role',role:'reviewer',displayName:'Reviewer'},externalHandoff})]}),
      doc('11','Awaiting_External_Return',{type:'System',displayName:'System'},people.dave,{workflowSteps:[step({type:'System',displayName:'System'},{stageType:'EXTERNAL_HANDOFF_REVIEW',externalStatus:'OUTSIDE_HRMDO',handoffOwner:{userId:people.alice.id,userName:'alice'},returnReceiver:team,externalHandoff})]}),
    ];
    const template={id:'p8-template',version:1,classification:'Request',documentType:'Service Record',documentTypes:['Service Record'],employmentClassification:'All',title:'Phase 8',description:'Shell parity',isActive:true,steps:[]};
    const rows=[{collection:'workflowTemplates',id:template.id,value:template},...docs.map(value=>({collection:'documents',id:value.id,value}))];
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE8_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE8_ROWS:JSON.stringify(rows)});
    assert.equal(JSON.parse(fixture.run(['scripts/backfill_documents_workflow.php','--apply'])).status,'ok');
    for(const name of ['admin','alice','bob','carol','dave']){
      const client=name==='admin'?admin:await new Client(fixture.base).login(`${name}@example.test`);
      await client.refresh();
      const expected=legacySummary(client.state.documents,people[name]);
      const shell=await client.request('document_shell_summary.php');
      assert.equal(shell.sidebarDocumentTaskCount,expected.count,`${name} sidebar count`);
      assert.deepEqual(shell.documentNotifications.map(item=>item.id),expected.notifications.map(item=>item.id),`${name} notification IDs`);
      for(const item of shell.documentNotifications){
        const legacy=expected.notifications.find(value=>value.id===item.id);
        assert.equal(item.title,legacy.title);assert.equal(item.message,legacy.message);assert.equal(item.tone,legacy.tone);assert.equal(item.timestamp,legacy.timestamp);
      }
      for(const term of ['P8-01','P8BAR-02','LEGACY-42','shared','Secret Nebula','not-present']){
        const expectedSearch=legacySearch(client.state.documents,term);
        const result=await client.request(`document_search.php?q=${encodeURIComponent(term)}`);
        assert.equal(result.exact?.id||null,expectedSearch.exact,`${name} exact ${term}`);
        assert.deepEqual(result.items.map(item=>item.id),expectedSearch.ids,`${name} partial ${term}`);
        assert.equal(result.total,expectedSearch.exact?1:expectedSearch.ids.length);
      }
    }
    const alice=await new Client(fixture.base).login('alice@example.test');
    await alice.request('document_search.php?q=Secret%20Nebula');
    await alice.request('document_search.php?q=P8-08');
    for(const query of ['q=%25','q=%5F','q=%27%20OR%201%3D1']){
      const result=await alice.request(`document_search.php?${query}`);
      assert.equal(result.total,0);
    }
    await alice.request('document_search.php?q=','GET',undefined,400);
    await alice.request('document_search.php?q=space%20','GET',undefined,200);
    await alice.request(`document_search.php?q=${'x'.repeat(151)}`,'GET',undefined,400);
    await alice.request('document_search.php?q%5B%5D=bad','GET',undefined,400);
    await alice.request('document_search.php?q=test&userId=admin','GET',undefined,400);
    await alice.request('document_shell_summary.php?userId=admin','GET',undefined,400);
    const anonymous=await fetch(`${fixture.base}/api/document_search.php?q=P8-01`);assert.equal(anonymous.status,401);
    const anonymousSummary=await fetch(`${fixture.base}/api/document_shell_summary.php`);assert.equal(anonymousSummary.status,401);
  } finally { await fixture.stop(); }
});

test('Phase 8 shell reads respect the shared backend rollout gate',async()=>{
  const fixture=await startFixture(18783);
  try {
    const admin=await new Client(fixture.base).login();
    await admin.request('document_search.php?q=known','GET',undefined,503);
    await admin.request('document_shell_summary.php','GET',undefined,503);
  } finally {await fixture.stop();}
});
