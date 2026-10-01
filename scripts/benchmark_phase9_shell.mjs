import {startFixture,Client} from '../tests/support.mjs';
const fixture=await startFixture(18785,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',PHASE7_PHP_MEMORY_LIMIT:'512M'});
try{
  const admin=await new Client(fixture.base).login();
  const worker=(await admin.action('addUser',[{name:'Shell Probe',email:'shell-probe@example.test',password:'Integration-Password-2026!',role:'processor',roleTitle:'Processor',office:'HRMDO',division:'Operations',position:'Officer'}])).result;
  for(const target of [100,1000,10000].filter(value=>value<=Number(process.env.PHASE9_MAX_DOCS||10000))){
    fixture.run(['tests/phase7-load-probe.php'],{PHASE7_TARGET:String(target),PHASE7_USER:worker.id});
    const result=JSON.parse(fixture.run(['tests/phase9-shell-probe.php'],{PHASE9_USER:worker.id}));
    console.log(JSON.stringify({target,...result}));
  }
}finally{await fixture.stop();}
