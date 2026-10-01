import {startFixture,Client} from '../tests/support.mjs';
const fixture=await startFixture(18789,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1',PHASE7_PHP_MEMORY_LIMIT:'512M'});
try{
  const admin=await new Client(fixture.base).login();
  const worker=(await admin.action('addUser',[{name:'Phase 10 Processor',email:'p10-processor@example.test',password:'Integration-Password-2026!',role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
  const client=await new Client(fixture.base).login('p10-processor@example.test');
  const measure=async(file)=>{const times=[];let bytes=0,status=0;for(let n=0;n<3;n++){const start=performance.now();const response=await fetch(`${fixture.base}/api/${file}`,{headers:{Cookie:client.cookie}});const body=await response.arrayBuffer();status=response.status;bytes=body.byteLength;times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {status,bytes,medianMs:Number(times[1].toFixed(2))};};
  for(const target of [100,1000,10000].filter(value=>value<=Number(process.env.PHASE10_MAX_ITEMS||10000))){
    fixture.run(['tests/phase7-load-probe.php'],{PHASE7_TARGET:String(target),PHASE7_USER:worker.id});
    fixture.run(['tests/phase10-ewp-load-probe.php'],{PHASE10_TARGET:String(target)});
    fixture.run(['tests/phase10-leave-audit-load-probe.php'],{PHASE10_TARGET:String(target)});
    fixture.run(['tests/phase9-payroll-load-probe.php'],{PHASE9_TARGET:String(Math.min(target,1000)),PHASE9_USER:worker.id});
    const result={target,payrollItems:Math.min(target,1000),state:await measure('state.php'),dashboard:await measure('dashboard.php'),ewpPage:await measure('ewp.php?page=1&limit=10'),ewpSearch:await measure('ewp.php?q=Representative%20Employee%209&page=1&limit=10'),leave:await measure('leave.php?page=1&pageSize=10'),leaveDetail:await measure('leave_detail.php?id=phase10-leave-00001'),leaveAudit:await measure('leave_audit.php?id=phase10-leave-00001&page=1&limit=10')};
    console.log(JSON.stringify(result));
    if(target===10000){
      const scenario={};for(const [name,path] of Object.entries({documentShell:'document_shell_summary.php',payrollShell:'payroll_shell_summary.php',documentTasks:'document_tasks.php?queue=my_tasks&page=1&limit=25',payrollTasks:'payroll_tasks.php?page=1&limit=25',registry:'documents.php?registry=1&page=1&limit=25',detail:'documents.php?id=phase7load-00001',dashboard:'dashboard.php'}))scenario[name]=await measure(path);
      console.log(JSON.stringify({scenario,requests:Object.keys(scenario).length,bytes:Object.values(scenario).reduce((sum,row)=>sum+row.bytes,0),medianMsSum:Object.values(scenario).reduce((sum,row)=>sum+row.medianMs,0)}));
    }
  }
  console.log(fixture.run(['scripts/phase10_query_plans.php']).trim());
}finally{await fixture.stop();}
