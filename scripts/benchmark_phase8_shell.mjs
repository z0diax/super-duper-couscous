import { startFixture, Client } from '../tests/support.mjs';
import { isDocumentActionableForUser } from '../src/services/documentTaskAssignment.ts';

const fixture=await startFixture(18781,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',PHASE7_PHP_MEMORY_LIMIT:'512M'});
try {
  const admin=await new Client(fixture.base).login();
  const processor=(await admin.action('addUser',[{name:'Load Processor',email:'load-processor@example.test',password:'Integration-Password-2026!',role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
  const worker=await new Client(fixture.base).login('load-processor@example.test');
  const measure=async file=>{
    const times=[];let bytes=0;let result;
    for(let n=0;n<3;n++){
      const start=performance.now();
      const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:worker.cookie}});
      const body=await response.arrayBuffer();
      if(!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      bytes=body.byteLength;times.push(performance.now()-start);
      if(n===2) result=JSON.parse(new TextDecoder().decode(body));
    }
    times.sort((a,b)=>a-b);
    const metric={bytes,medianMs:Number(times[1].toFixed(2)),matches:result?.total,sidebarCount:result?.sidebarDocumentTaskCount};
    if(file==='state.php'){
      const samples=[];let count=0,notifications=0;
      for(let n=0;n<3;n++){
        const start=performance.now();
        const attention=result.state.documents.filter(document=>!['Released','Archived','Disapproved'].includes(document.status)&&((document.status==='On_Hold'&&document.encodedBy.userId===processor.id)||isDocumentActionableForUser(document,worker.state.users.find(user=>user.id===processor.id),true)));
        count=attention.length;
        notifications=attention.filter(document=>!document.isLegacyV1).map(document=>({id:document.id,timestamp:document.heldAt||document.workflowSteps.find(step=>step.stepNumber===document.currentStepNumber)?.startedAt||document.dateEncoded})).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,25).length;
        samples.push(performance.now()-start);
      }
      samples.sort((a,b)=>a-b);metric.legacyDerivationMs=Number(samples[1].toFixed(2));metric.legacyCount=count;metric.legacyNotifications=notifications;
    }
    return metric;
  };
  const max=Number(process.env.PHASE8_MAX_DOCS||10000);
  for(const target of [100,1000,10000].filter(value=>value<=max)){
    const seeded=JSON.parse(fixture.run(['tests/phase7-load-probe.php'],{PHASE7_TARGET:String(target),PHASE7_USER:processor.id}));
    const paths={state:'state.php',summary:'document_shell_summary.php',exactTracking:'document_search.php?q=LOAD-00042',exactBarcode:'document_search.php?q=LOADBAR-42',commonPartial:'document_search.php?q=Representative',uncommonPartial:'document_search.php?q=LOAD-00042'};
    // Use a term that matches one record without taking the exact branch.
    paths.uncommonPartial='document_search.php?q=00042';
    const http={};for(const [key,file] of Object.entries(paths)) http[key]=await measure(file);
    const plans=JSON.parse(fixture.run(['tests/phase8-query-plans.php'],{PHASE8_USER:processor.id}));
    console.log(JSON.stringify({target,seedSeconds:seeded.seedSeconds,http,plans}));
  }
} finally {await fixture.stop();}
