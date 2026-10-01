import {startFixture,Client} from '../tests/support.mjs';
const fixture=await startFixture(18795,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1',PHASE7_PHP_MEMORY_LIMIT:'512M'});
try{
  const admin=await new Client(fixture.base).login();
  const worker=(await admin.action('addUser',[{name:'Phase 11 Processor',email:'p11-processor@example.test',password:'Integration-Password-2026!',role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
  const client=await new Client(fixture.base).login('p11-processor@example.test');
  const measure=async(file)=>{let bytes=0,status=0;const times=[];for(let n=0;n<3;n++){const start=performance.now();const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:client.cookie}});const body=await response.arrayBuffer();bytes=body.byteLength;status=response.status;times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {status,bytes,medianMs:Number(times[1].toFixed(2))};};
  for(const target of [100,1000,10000].filter(value=>value<=Number(process.env.PHASE11_MAX_ITEMS||10000))){
    fixture.run(['tests/phase7-load-probe.php'],{PHASE7_TARGET:String(target),PHASE7_USER:worker.id});
    fixture.run(['tests/phase10-ewp-load-probe.php'],{PHASE10_TARGET:String(target)});
    fixture.run(['tests/phase10-leave-audit-load-probe.php'],{PHASE10_TARGET:String(target)});
    fixture.run(['tests/phase9-payroll-load-probe.php'],{PHASE9_TARGET:String(Math.min(target,1000)),PHASE9_USER:worker.id});
    const state=await measure('state.php'),revision=await measure('revision.php'),reference=await measure('reference.php');
    const memory={};for(const mode of ['state','revision','reference'])memory[mode]=JSON.parse(fixture.run(['tests/phase11-memory-probe.php'],{PHASE11_MODE:mode}));
    console.log(JSON.stringify({target,payrollItems:Math.min(target,1000),state,revision,reference,memory}));
  }
}finally{await fixture.stop();}
