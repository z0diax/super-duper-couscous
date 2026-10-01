import {startFixture,Client} from '../tests/support.mjs';
const fixture=await startFixture(18786,{HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',PHASE7_PHP_MEMORY_LIMIT:'512M'});
try{
  const admin=await new Client(fixture.base).login();
  const worker=(await admin.action('addUser',[{name:'Load Processor',email:'load-processor@example.test',password:'Integration-Password-2026!',role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
  const client=await new Client(fixture.base).login('load-processor@example.test');
  const measure=async file=>{const times=[];let bytes=0,rows;
    for(let n=0;n<3;n++){const start=performance.now();const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:client.cookie}});const body=await response.arrayBuffer();if(!response.ok)throw new Error(`${file}: ${response.status}`);bytes=body.byteLength;times.push(performance.now()-start);if(n===2){const parsed=JSON.parse(new TextDecoder().decode(body));rows=parsed.pagination?.total??parsed.sidebarPayrollTaskCount??parsed.total??null;}}
    times.sort((a,b)=>a-b);return {bytes,medianMs:Number(times[1].toFixed(2)),rows};};
  for(const target of [100,1000,10000].filter(value=>value<=Number(process.env.PHASE9_MAX_ITEMS||10000))){
    const seed=JSON.parse(fixture.run(['tests/phase9-payroll-load-probe.php'],{PHASE9_TARGET:String(target),PHASE9_USER:worker.id}));
    const urls={state:'state.php',list:'payroll_batches.php?page=1&limit=10',tasks:'payroll_tasks.php?page=1&limit=25',summary:'payroll_shell_summary.php',exact:'payroll_search.php?q=P9BAR-42',common:'payroll_search.php?q=Representative',rare:'payroll_search.php?q=payroll%20item%2042',detail:'payroll_batch.php?id=phase9batch-00005'};
    const http={};for(const [key,url] of Object.entries(urls))http[key]=await measure(url);
    console.log(JSON.stringify({target,...seed,http}));
  }
}finally{await fixture.stop();}
