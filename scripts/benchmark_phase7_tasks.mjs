import { startFixture, Client } from '../tests/support.mjs';

const fixture=await startFixture(18779,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',PHASE7_PHP_MEMORY_LIMIT:'512M'});
try {
  const admin=await new Client(fixture.base).login();
  const processor=(await admin.action('addUser',[{name:'Load Processor',email:'load-processor@example.test',password:'Integration-Password-2026!',role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
  const worker=await new Client(fixture.base).login('load-processor@example.test');
  const measure=async(file,client)=>{
    const times=[]; let bytes=0;
    for(let n=0;n<3;n++){
      const start=performance.now();
      const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:client.cookie}});
      const body=await response.arrayBuffer();
      if(!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      bytes=body.byteLength; times.push(performance.now()-start);
    }
    times.sort((a,b)=>a-b); return {bytes,medianMs:Number(times[1].toFixed(2))};
  };
  const max=Number(process.env.PHASE7_MAX_DOCS||10000);
  for(const target of [100,1000,10000].filter(value=>value<=max)){
    const result=JSON.parse(fixture.run(['tests/phase7-load-probe.php'],{PHASE7_TARGET:String(target),PHASE7_USER:processor.id}));
    result.http={state:await measure('state.php',worker),tasks:await measure('document_tasks.php?queue=my_tasks&page=1&limit=25',worker)};
    console.log(JSON.stringify(result));
  }
} finally { await fixture.stop(); }
