import { test, expect } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

test('targeted Dashboard, Leave history and EWP registry use their read endpoints',async({page})=>{
  const fixture=await startFixture(18791,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1',HRMDO_PAYROLL_TARGETED_READS_ENABLED:'1',HRMDO_DASHBOARD_TARGETED_READS_ENABLED:'1',HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED:'1'});
  try{
    const admin=await new Client(fixture.base).login();
    const record={id:'p10-browser-leave',barcode:'P10-BROWSER-LEAVE',trackingNumber:'P10-BROWSER-LEAVE',employeeName:'Browser Employee',office:'HRMDO',leaveType:'Vacation Leave',status:'For_Computation',isLegacyV1:false,createdAt:'2026-10-01T00:00:00Z',startDate:'2026-10-01',endDate:'2026-10-01',totalLeaveDays:1,dateRanges:[]};
    const ewp={id:'p10-browser-ewp',barcode:'P10-BROWSER-EWP',employeeName:'Browser Employee',office:'HRMDO',amount:125,purpose:'Assistance',remarks:'',status:'Recorded',createdAt:'2026-10-01T00:00:00Z',createdByUserId:admin.state.users[0].id};
    fixture.run(['-r',"require 'api/db.php'; $p=database(); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('PHASE10_ROWS'),true) as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]);"],{PHASE10_ROWS:JSON.stringify([{collection:'leaveApplications',id:record.id,value:record},{collection:'ewpRecords',id:ewp.id,value:ewp}])});
    const seen:string[]=[];page.on('response',response=>{if(response.url().includes('/api/'))seen.push(new URL(response.url()).pathname.split('/').pop()||'');});
    await page.goto(`${fixture.base}/`);
    await page.getByLabel('Email address').fill('admin@example.test');
    await page.getByLabel('Password',{exact:true}).fill(testPassword);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
    await expect.poll(()=>seen.includes('dashboard.php')).toBe(true);
    await page.getByRole('button',{name:'Leave Records',exact:true}).click();
    await expect(page.getByText('P10-BROWSER-LEAVE')).toBeVisible();
    await page.getByRole('button',{name:'View Leave Application'}).click();
    await expect.poll(()=>seen.includes('leave_detail.php')&&seen.includes('leave_audit.php')).toBe(true);
    await page.getByRole('button',{name:'Close Leave Record'}).click();
    await page.getByRole('tab',{name:/EWP Records/}).click();
    await expect(page.getByText('P10-BROWSER-EWP')).toBeVisible();
    expect(seen).toContain('ewp.php');
  }finally{await fixture.stop();}
});
