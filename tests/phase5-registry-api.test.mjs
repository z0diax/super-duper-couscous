import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client, testPassword } from './support.mjs';

const step=(type,assignment)=>({stepNumber:1,name:'Review',description:'Registry parity',assigneeType:assignment,assigneeRole:'processor',assigneeTeam:'Operations',assigneeUserId:type,assigneeName:'Processor',slaHours:24,requiredAction:'Verify & Process',allowReturn:false,allowHold:true,requiresAttachment:false});
const record=(barcode,type)=>({title:`Registry ${barcode}`,subject:'Subject',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Sender',classification:'Communication',documentType:type,priority:'Routine',description:'Registry parity',barcode,files:[]});

test('registry pages, filters, counts, export and visibility match legacy state',async t=>{
  const fixture=await startFixture(18771,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  try {
    const admin=await new Client(fixture.base).login();
    const processor=(await admin.action('addUser',[{name:'Registry Processor',email:'registry-processor@example.test',password:testPassword,role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
    await admin.action('addUser',[{name:'Registry Outsider',email:'registry-outsider@example.test',password:testPassword,role:'employee',roleTitle:'Employee',office:'Elsewhere',division:'Elsewhere',position:'Employee'}]);
    const modes=[['Office Order','Person'],['Memorandum','Role'],['Letter','Team']];
    for (const [type,assignment] of modes) {
      await admin.action('createWorkflowTemplate',[{title:`${type} registry`,description:'Parity',classification:'Communication',documentType:type,isActive:true,steps:[step(processor.id,assignment)]}]);
      await admin.action('registerDocument',[record(`REG-${type.replaceAll(' ','-')}`,type)]);
    }
    const users=[admin,await new Client(fixture.base).login('registry-processor@example.test'),await new Client(fixture.base).login('registry-outsider@example.test')];
    for (const client of users) {
      const legacy=(await client.refresh()).state.documents.filter(doc=>doc.classification!=='Payroll');
      const first=await client.request('documents.php?registry=1&page=1&limit=2');
      const ids=[...first.data.map(row=>row.id)];
      for(let page=2;page<=first.pagination.totalPages;page++) ids.push(...(await client.request(`documents.php?registry=1&page=${page}&limit=2`)).data.map(row=>row.id));
      assert.deepEqual(ids,legacy.map(doc=>doc.id));
      assert.equal(first.registryCounts.all,legacy.length);
      const filtered=await client.request('documents.php?registry=1&classification=Communication&status=In_Progress&priority=Routine&isLegacyV1=0');
      assert.deepEqual(filtered.data.map(row=>row.id).sort(),legacy.filter(doc=>doc.classification==='Communication'&&doc.status==='In_Progress'&&doc.priority==='Routine'&&!doc.isLegacyV1).map(doc=>doc.id).sort());
    }
    assert.equal((await users[1].request('documents.php?registry=1')).pagination.total,3);
    assert.equal((await users[2].request('documents.php?registry=1')).pagination.total,0);
    await admin.request('documents.php?registry=0','GET',undefined,400);
    await admin.request('documents.php?isLegacyV1=wrong','GET',undefined,400);
    const exported=await fetch(`${fixture.base}/api/document_registry_export.php?registry=1&classification=Communication`,{headers:{Cookie:admin.cookie}});
    assert.equal(exported.status,200); assert.match(exported.headers.get('content-type'),/text\/csv/);
    assert.equal((await exported.text()).trim().split(/\r?\n/).length,4);
    const denied=await fetch(`${fixture.base}/api/document_registry_export.php?registry=1`,{headers:{Cookie:users[2].cookie}});
    assert.equal(denied.status,200); assert.equal((await denied.text()).trim().split(/\r?\n/).length,1);
    const measure=async file=>{
      const timings=[]; let bytes=0,records=0;
      for(let i=0;i<5;i++) {
        const start=performance.now(); const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:admin.cookie}});
        const body=await response.text(); assert.equal(response.status,200);
        timings.push(performance.now()-start); bytes=Buffer.byteLength(body); records=file.startsWith('state')?JSON.parse(body).state.documents.length:JSON.parse(body).data.length;
      }
      timings.sort((a,b)=>a-b); return {bytes,records,medianMs:Number(timings[2].toFixed(2))};
    };
    t.diagnostic(`registry HTTP sample ${JSON.stringify({legacy:await measure('state.php'),targeted:await measure('documents.php?registry=1&page=1&limit=25')})}`);
  } finally { await fixture.stop(); }
});
