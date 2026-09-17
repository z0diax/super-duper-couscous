import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => {
  fixture=await startFixture(18775);
  const admin=await new Client(fixture.base).login();
  const user=admin.state.users.find((item:any)=>item.role==='admin');
  const phase=(stepNumber:number,name:string)=>({stepNumber,name,description:`${name} instructions`,assigneeType:'Person',assigneeUserId:user.id,assigneeName:user.name,slaHours:24,requiredAction:'Verify & Process',allowReturn:true,requiresAttachment:false});
  await admin.action('createWorkflowTemplate',[{title:'Notification workflow',description:'Header notification fixture',classification:'Communication',documentType:'Office Order',isActive:true,steps:[phase(1,'Intake Review'),phase(2,'Records Processing')]}]);
  await admin.action('registerDocument',[{title:'Notification center document',subject:'Assigned work',sourceType:'Internal',sourceOffice:'HRMDO',senderName:'Records Unit',classification:'Communication',documentType:'Office Order',priority:'Routine',description:'',barcode:'NOTIFY-DOC-001',files:[]}]);
});
test.afterAll(async()=>{await fixture?.stop();});

test('notification bell opens actionable notifications and tracks read state',async({page})=>{
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const bell=page.locator('#btn-header-notifications');
  await expect(bell).toHaveAttribute('aria-label',/unread/);
  await bell.click();
  const panel=page.getByRole('dialog',{name:'Notifications'});
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Document assigned to you/)).toBeVisible();
  await expect(panel.getByText(/NOTIFY-DOC-001/)).toBeVisible();
  await page.screenshot({path:'test-results/header-notifications.png'});
  await panel.getByRole('button',{name:'Mark all read'}).click();
  await expect(bell).toHaveAttribute('aria-label','Notifications');
  await panel.getByRole('button',{name:/Document assigned to you/}).click();
  await expect(page.locator('#btn-close-detail-modal')).toBeVisible();
});
