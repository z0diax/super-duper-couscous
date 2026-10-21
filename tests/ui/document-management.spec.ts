import { test, expect, type Page } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
let owner: Client, worker: Client, admin: Client;
let workerId='';
test.beforeAll(async()=>{
  fixture=await startFixture(18810,{HRMDO_DOCUMENT_TARGETED_READS_ENABLED:'1'});
  admin=await new Client(fixture.base).login();
  for(const [name,role] of [['UI Creator','receiving_officer'],['UI Worker','processor']]){
    await admin.action('addUser',[{name,email:`${role}@example.test`,password:testPassword,role,roleTitle:role,office:'HRMDO',division:'Operations',position:'Officer'}]);
  }
  workerId=admin.state.users.find(user=>user.role==='processor').id;
  owner=await new Client(fixture.base).login('receiving_officer@example.test');
  worker=await new Client(fixture.base).login('processor@example.test');
  await admin.action('createWorkflowTemplate',[{title:'UI document management',classification:'Communication',documentType:'Office Order',isActive:true,steps:[{stepNumber:1,name:'Review',assigneeType:'Person',assigneeUserId:workerId,assigneeName:'UI Worker',slaHours:24,requiredAction:'Verify & Process',allowHold:true,allowReturn:false,requiresAttachment:false}]}]);
});
test.afterAll(async()=>{await fixture?.stop();});
async function login(page:Page,email:string){
  await page.context().clearCookies();await page.goto(fixture.base+'/');
  await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('#sidebar-link-registry').click();
}
const createNormal=async(barcode:string)=>(await owner.action('registerDocument',[{title:'Original '+barcode,subject:'Subject',description:'Original description',classification:'Communication',documentType:'Office Order',sourceOffice:'HRMDO',sourceType:'Internal',senderName:'Sender',priority:'Routine',barcode,files:[]}])).result;

test('creator edits prefilled metadata, sees field errors, retains failed input and refreshes the registry',async({page})=>{
  const doc=await createNormal('UI-EDIT');
  await login(page,'receiving_officer@example.test');
  await page.getByRole('button',{name:'Edit UI-EDIT',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Edit Document',exact:true});
  await expect(dialog.getByLabel('Tracking number')).toHaveValue('UI-EDIT');
  await expect(dialog.getByLabel('Tracking number')).toHaveAttribute('readonly','');
  await expect(dialog.getByLabel('Title *',{exact:true})).toHaveValue('Original UI-EDIT');
  await expect(page.locator('#btn-toggle-sidebar-collapsed')).toBeHidden();
  await dialog.getByLabel('Title *',{exact:true}).fill('');
  await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();
  await expect(dialog.getByText('Title is required.',{exact:true})).toBeVisible();
  await dialog.getByLabel('Title *',{exact:true}).fill('Updated UI title');
  fixture.run(['-r',"require 'api/db.php';database()->exec(\"CREATE TRIGGER fail_ui_metadata_audit BEFORE INSERT ON app_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Forced UI audit failure'\");"]);
  await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be saved');
  await expect(dialog.getByLabel('Title *',{exact:true})).toHaveValue('Updated UI title');
  fixture.run(['-r',"require 'api/db.php';database()->exec('DROP TRIGGER fail_ui_metadata_audit');"]);
  let writes=0;page.on('request',request=>{if(request.url().endsWith('/api/documents.php')&&request.method()==='POST')writes++;});
  await dialog.locator('form').evaluate(form=>{(form as HTMLFormElement).requestSubmit();(form as HTMLFormElement).requestSubmit();});
  await expect(dialog).toHaveCount(0);expect(writes).toBe(1);
  await expect(page.getByText('Updated UI title',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View UI-EDIT',exact:true}).click();
  await expect(page.getByText('Updated UI title',{exact:true}).last()).toBeVisible();
  await page.locator('#btn-close-detail-modal').click();
  await page.locator('#header-quick-search-input').fill('Updated UI title');
  await page.locator('#btn-header-quick-search').click();
  await expect(page.getByRole('dialog',{name:/Results for/}).getByText('Updated UI title',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close search results',exact:true}).click();
  await page.reload();await page.locator('#sidebar-link-registry').click();
  await expect(page.getByText('Updated UI title',{exact:true})).toBeVisible();
  const saved=(await owner.request(`documents.php?manage=1&id=${doc.id}`)).data;
  expect(saved.workflowSteps).toEqual(doc.workflowSteps);
  expect(saved.custodyHistory).toEqual(doc.custodyHistory);
});

test('processing races reject creator edits; administrators must give a correction reason',async({page})=>{
  const doc=await createNormal('UI-CONFLICT');
  await login(page,'receiving_officer@example.test');
  await page.getByRole('button',{name:'Edit UI-CONFLICT',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit Document',exact:true});
  await expect(edit.getByLabel('Title *',{exact:true})).toHaveValue('Original UI-CONFLICT');
  await edit.getByLabel('Title *',{exact:true}).fill('Stale pending edit');
  await worker.action('completeStep',[doc.id,'Reviewed','Verified',[]]);
  await edit.getByRole('button',{name:'Save Changes',exact:true}).click();
  await expect(edit.getByRole('alert')).toContainText('document changed');
  await expect(edit.getByLabel('Title *',{exact:true})).toHaveValue('Stale pending edit');
  await expect(edit.getByRole('button',{name:'Save Changes',exact:true})).toBeDisabled();
  await edit.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit UI-CONFLICT',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete UI-CONFLICT',exact:true})).toHaveCount(0);
  await login(page,'admin@example.test');
  await page.getByRole('button',{name:'Correct UI-CONFLICT',exact:true}).click();
  const correction=page.getByRole('dialog',{name:'Administrator Correction'});
  await expect(correction.getByLabel('Description',{exact:true})).toHaveValue('Original description');
  await correction.getByLabel('Description',{exact:true}).fill('Corrected description');
  await correction.getByRole('button',{name:'Save Correction',exact:true}).click();
  await expect(correction.getByText('Explain why this correction is needed.',{exact:true})).toBeVisible();
  await correction.getByLabel('Correction reason *',{exact:true}).fill('Correct a transcription error');
  await correction.getByRole('button',{name:'Save Correction',exact:true}).click();
  await expect(correction).toHaveCount(0);
  expect((await admin.request(`documents.php?manage=1&id=${doc.id}`)).data.description).toBe('Corrected description');
  await expect(page.getByRole('button',{name:'Delete UI-CONFLICT',exact:true})).toHaveCount(0);
});

test('dynamic creator deletion confirms identity, removes queues, and preserves the audit',async({page})=>{
  const doc=(await owner.request('document_routing.php','POST',{action:'register',title:'Delete this dynamic record',classification:'Others',documentType:'Hiring',sourceOffice:'HRMDO',barcode:'UI-DELETE',initialAssigneeId:workerId})).data;
  await login(page,'processor@example.test');
  await expect(page.getByRole('button',{name:'Edit UI-DELETE',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete UI-DELETE',exact:true})).toHaveCount(0);
  await login(page,'receiving_officer@example.test');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Delete UI-DELETE',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Delete Document',exact:true});
  await expect(dialog.getByLabel('Tracking number')).toHaveValue('UI-DELETE');
  await expect(dialog.getByText('Delete this dynamic record',{exact:true})).toBeVisible();
  await expect(dialog.getByText(/active queues/)).toBeVisible();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Delete UI-DELETE',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete UI-DELETE',exact:true}).click();
  await page.getByLabel('Deletion reason (optional)').fill('Duplicate entry');
  await page.getByRole('dialog',{name:'Delete Document'}).getByRole('button',{name:'Delete Document',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Delete this dynamic record',{exact:true})).toHaveCount(0);
  expect((await worker.request('document_tasks.php?queue=my_tasks')).data.some(row=>row.id===doc.id)).toBe(false);
  await admin.refresh();
  const audit=admin.state.auditLogs.find(event=>event.documentId===doc.id && event.actionType==='DOCUMENT_DELETED');
  expect(JSON.parse(audit.details).reason).toBe('Duplicate entry');
});
