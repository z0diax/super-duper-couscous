import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

test('targeted document repository preserves visibility, history, filters and pagination', async () => {
  const fixture = await startFixture(18767);
  try {
    const admin = await new Client(fixture.base).login();
    const users = [
      ['alice','processor','Team A'], ['bob','reviewer','Team B'],
      ['carol','employee','Team A'], ['dave','employee','Team X'],
      ['erin','releasing_officer','Team X'], ['frank','receiving_officer','Team X'],
      ['sue','supervisor','Team X'],
    ];
    for (const [name,role,division] of users) await admin.action('addUser',[{name,email:`${name}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division,position:'Officer'}]);
    const byName = Object.fromEntries(admin.state.users.map(user => [user.name,user]));
    const [alice,bob,carol,dave] = ['alice','bob','carol','dave'].map(name => byName[name]);
    const template = {
      id:'phase3-template',version:3,classification:'Request',documentType:'Service Record',documentTypes:['Service Record'],
      employmentClassification:'All',title:'Current template',description:'New version',isActive:true,
      steps:[{stepNumber:1,name:'Current template step',description:'New step',stageType:'INTERNAL_PROCESSING',
        assigneeType:'Role',assigneeRole:'processor',assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',
        allowReturn:false,allowHold:true,requiresAttachment:false}],
    };
    const base = (id,status,assignedTo,encoder=carol,extras={}) => ({
      id,trackingNumber:`TRACK-${id}`,barcode:`BAR-${id}`,title:`Document ${id}`,subject:'Subject',
      sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Request',documentType:'Service Record',
      priority:'Routine',dateReceived:`2026-09-${String(10+Number(id.split('-').at(-1))).padStart(2,'0')}T00:00:00Z`,
      dateEncoded:'2026-09-10T00:00:00Z',description:'Test',status,currentStepNumber:1,totalSteps:1,
      workflowTemplateId:template.id,workflowVersion:1,currentLocation:'HRMDO',
      encodedBy:{userId:encoder.id,userName:encoder.name},
      workflowSteps:[{stepNumber:1,name:'Historical instance step',stageType:'INTERNAL_PROCESSING',requiredAction:'Verify & Process',
        status:'In_Progress',assignedTo,slaHours:24,isCurrent:true,allowHold:true,requiresAttachment:false}],
      attachments:[],custodyHistory:[],...extras,
    });
    const docs = [
      base('doc-1','In_Progress',{type:'Person',userId:alice.id,displayName:'Alice'},dave),
      base('doc-2','Under_Review',{type:'Role',role:'processor',displayName:'Processor'},dave),
      base('doc-3','In_Progress',{type:'Team',team:'Team A',displayName:'Team A'},dave),
      base('doc-4','In_Progress',{type:'Person',userId:dave.id,displayName:'Dave'},dave),
      base('doc-5','Awaiting_External_Return',{type:'System',displayName:'System'},dave,{
        currentLocation:'Outside office',
        workflowSteps:[{stepNumber:1,name:'Old external handoff',stageType:'EXTERNAL_HANDOFF_REVIEW',requiredAction:'External Handoff',
          status:'In_Progress',assignedTo:{type:'System',displayName:'System'},slaHours:48,isCurrent:true,
          externalStatus:'OUTSIDE_HRMDO',handoffOwner:{userId:alice.id,userName:alice.name,userRole:'processor'},
          returnReceiver:{type:'Role',role:'reviewer',displayName:'Reviewer'},
          externalHandoff:{destinationOffice:'Outside office',purpose:'Review',handedTo:'Clerk',sentAt:'2026-09-15T00:00:00Z'}}],
        attachments:[{id:'file-123456789012345678901234',name:'letter.txt',sizeBytes:4,mimeType:'text/plain',uploadedBy:'Dave',uploadedAt:'2026-09-15T00:00:00Z',stepNumber:1}],
        complianceAttachments:[{id:'file-123456789012345678901234',name:'letter.txt',sizeBytes:4,mimeType:'text/plain',uploadedBy:'Dave',uploadedAt:'2026-09-15T00:00:00Z',stepNumber:1}],
        custodyHistory:[{id:'custody-3',movementType:'EXTERNAL_HANDOFF',fromLocation:'HRMDO',toLocation:'Outside office',timestamp:'2026-09-15T00:00:00Z',stageNumber:1,actorId:dave.id,actorName:'Dave'}],
      }),
      base('doc-6','On_Hold',{type:'Person',userId:alice.id,displayName:'Alice'},carol,{holdReason:'Need compliance'}),
      base('doc-7','Released',{type:'Person',userId:dave.id,displayName:'Dave'},dave),
    ];
    const records=[{collection:'workflowTemplates',id:template.id,value:template},...docs.map(value=>({collection:'documents',id:value.id,value}))];
    fixture.run(['-r', `require 'api/db.php'; $p=database(); $rows=json_decode(getenv('PHASE3_ROWS'),true); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach ($rows as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]); $p->prepare('INSERT INTO app_files (id,original_name,mime_type,size_bytes,sha256,uploaded_by,owner_id) VALUES (?,?,?,?,?,?,?)')->execute(['file-123456789012345678901234','letter.txt','text/plain',4,str_repeat('0',64),getenv('PHASE3_OWNER'),'doc-5']);`],
      {PHASE3_ROWS:JSON.stringify(records),PHASE3_OWNER:dave.id});
    const applied=JSON.parse(fixture.run(['scripts/backfill_documents_workflow.php','--apply']));
    assert.equal(applied.status,'ok');
    const php = `require 'api/document_repository.php'; $p=database(); $s=json_decode(getenv('PHASE3_QUERY'),true); $q=$p->prepare('SELECT * FROM app_users WHERE email=?'); $q->execute([$s['email']]); $u=public_user($q->fetch()); try { $a=$s['args']; $r=match($s['op']) { 'id'=>document_repository_by_id($p,$u,$a[0]), 'tracking'=>document_repository_by_tracking($p,$u,$a[0]), 'barcode'=>document_repository_by_barcode($p,$u,$a[0]), 'detail'=>document_repository_detail($p,$u,$a[0]), 'steps'=>document_repository_steps($p,$u,$a[0]), 'attachments'=>document_repository_attachments($p,$u,$a[0]), 'custody'=>document_repository_custody($p,$u,$a[0]), 'list'=>document_repository_list($p,$u,$a[0]??[],$a[1]??1,$a[2]??25), 'tasks'=>document_repository_tasks($p,$u,$a[0]??1,$a[1]??25), 'template'=>document_repository_template($p,$a[0],$a[1]??null) }; echo json_encode($r,JSON_THROW_ON_ERROR); } catch (InvalidArgumentException $e) { echo json_encode(['error'=>$e->getMessage()]); }`;
    const read = (email,op,...args) => JSON.parse(fixture.run(['-r',php],{PHASE3_QUERY:JSON.stringify({email:`${email}@example.test`,op,args})}));
    assert.equal(read('alice','id','doc-1').id,'doc-1');
    assert.equal(read('alice','id','missing'),null);
    assert.equal(read('alice','id','doc-4'),null);
    assert.equal(read('alice','tracking','TRACK-doc-1').id,'doc-1');
    assert.equal(read('alice','barcode','BAR-doc-1').id,'doc-1');
    assert.equal(read('alice','tracking','TRACK-doc-4'),null);
    assert.equal(read('alice','barcode','BAR-doc-4'),null);
    const visible=read('alice','list');
    assert.deepEqual(visible.items.map(row=>row.id).sort(),['doc-1','doc-2','doc-3','doc-5','doc-6']);
    assert(!Object.hasOwn(visible.items[0],'source_json'));
    assert.deepEqual(read('carol','list').items.map(row=>row.id).sort(),['doc-3','doc-6']);
    assert.equal(read('bob','id','doc-5').id,'doc-5');
    assert.equal(read('bob','id','doc-1'),null);
    assert.equal(read('erin','id','doc-7').id,'doc-7');
    assert.equal(read('frank','id','doc-5').id,'doc-5');
    assert.equal(read('sue','list').total,7);
    assert.equal(read('alice','list',{status:'Under_Review'}).items[0].id,'doc-2');
    assert.equal(read('alice','list',{classification:'Request',documentType:'Service Record'}).total,5);
    assert.equal(read('alice','list',{assignedUserId:alice.id}).total,2);
    assert.equal(read('alice','list',{assignedRole:'processor'}).total,1);
    assert.equal(read('alice','list',{assignedTeam:'Team A'}).total,1);
    assert.equal(read('alice','list',{priority:'Routine',workflowTemplateId:template.id}).total,5);
    assert.equal(read('alice','list',{dateFrom:'2026-09-15T00:00:00Z'}).total,2);
    const first=read('admin','list',{},1,2), second=read('admin','list',{},2,2);
    assert.equal(first.total,7); assert.equal(first.totalPages,4);
    assert.equal(first.items.length,2); assert.equal(second.items.length,2);
    assert.notEqual(first.items[0].id,second.items[0].id);
    assert.match(read('admin','list',{},0,2).error,/Page/);
    assert.match(read('admin','list',{},1,101).error,/Limit/);
    const tasks=read('alice','tasks');
    assert.deepEqual(tasks.items.map(row=>row.id).sort(),['doc-1','doc-2','doc-3','doc-6']);
    assert.deepEqual(read('bob','tasks').items.map(row=>row.id),['doc-5']);
    assert.deepEqual(read('carol','tasks').items.map(row=>row.id).sort(),['doc-3','doc-6']);
    assert.equal(read('frank','tasks').total,0);
    const detail=read('alice','detail','doc-5');
    assert.equal(detail.workflowVersion,1);
    assert.equal(detail.workflowSteps[0].name,'Old external handoff');
    assert.equal(detail.workflowSteps[0].externalStatus,'OUTSIDE_HRMDO');
    assert.equal(detail.workflowSteps[0].isCurrent,true);
    assert.equal(detail.attachments.length,1);
    assert.equal(detail.complianceAttachments.length,1);
    assert.equal(detail.custodyHistory[0].id,'custody-3');
    assert.equal(read('alice','steps','doc-5').length,1);
    assert.equal(read('alice','attachments','doc-5').normal.length,1);
    assert.equal(read('alice','custody','doc-5').length,1);
    assert.equal(read('bob','detail','doc-1'),null);
    assert.equal(read('bob','steps','doc-1'),null);
    const current=read('admin','template',template.id);
    assert.equal(current.version,3);
    assert.equal(read('admin','template',template.id,3).version,3);
    assert.equal(current.steps[0].name,'Current template step');
    assert.deepEqual(current.documentTypes,['Service Record']);
    assert.equal(read('admin','template',template.id,1),null);
    assert.equal(read('alice','detail','doc-1').workflowSteps[0].name,'Historical instance step');
  } finally { await fixture.stop(); }
});
