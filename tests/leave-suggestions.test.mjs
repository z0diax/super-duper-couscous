import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startFixture, Client, testPassword } from './support.mjs';

test('Apache exposes the suggestion endpoint while denying internal PHP helpers', () => {
  const config = readFileSync(new URL('../api/.htaccess', import.meta.url), 'utf8');
  const match = config.match(/<FilesMatch "([^"]+)">/);
  assert.ok(match, 'API must retain its deny-by-default file rule');
  const denied = new RegExp(match[1]);
  assert.equal(denied.test('leave_suggestions.php'), false);
  for (const internal of ['db.php','config.php','bootstrap.php','domain.php','store.php','leave_suggestion_history.php','unknown.php','leave_suggestions.php.bak']) {
    assert.equal(denied.test(internal), true, `${internal} must remain blocked`);
  }
});

test('existing leave entries seed suggestions and new application saves keep them current', async () => {
  const fixture=await startFixture(18814);
  try {
    const admin=await new Client(fixture.base).login();
    const adminId=admin.state.users.find(user=>user.role==='admin').id;
    const other=(await admin.action('addUser',[{name:'History user',email:'history@example.test',password:testPassword,role:'receiving_officer',roleTitle:'Intake',office:'HRMDO',division:'HRMDO',position:'Officer',sidebarModules:['leave']}])).result;
    const entries=[
      {id:'old-cebu',leaveType:'Vacation Leave',leaveSubtype:'WITHIN_PHILIPPINES',leaveDetails:'Cebu'},
      {id:'old-cebu-duplicate',leaveType:'Special Privilege Leave',leaveDetails:'  CEBU  '},
      {id:'old-other',leaveType:'Special Privilege Leave',leaveDetails:'Calbayog City'},
      {id:'old-empty',leaveType:'Vacation Leave',leaveDetails:' '},
      {id:'old-contact',leaveType:'Vacation Leave',leaveDetails:'person@example.test'},
      {id:'old-narrative',leaveType:'Vacation Leave',leaveDetails:'Cebu\nContact a person'},
      {id:'old-long',leaveType:'Vacation Leave',leaveDetails:'x'.repeat(191)},
      {id:'old-unrelated',leaveType:'Maternity Leave',leaveDetails:'Not a destination'},
      {id:'old-private-admin',leaveType:'Sick Leave',leaveDetails:'Own historical medical detail',employeeId:adminId,createdByUserId:other.id},
      {id:'old-private-other',leaveType:'Sick Leave',leaveDetails:'Other historical medical detail',employeeId:other.id,createdByUserId:adminId},
      {id:'old-unlinked',leaveType:'Sick Leave',leaveDetails:'Unlinked confidential detail',createdByUserId:adminId},
      {id:'old-no-owner',leaveType:'Sick Leave',leaveDetails:'No ownership confidential detail'},
    ];
    fixture.run(['-r',"require 'api/db.php'; $q=database()->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach(json_decode(getenv('HISTORY_ROWS'),true) as $r) $q->execute(['leaveApplications',$r['id'],json_encode($r)]);"],{HISTORY_ROWS:JSON.stringify(entries)});
    const first=fixture.run(['scripts/backfill_leave_suggestions.php']);
    assert.match(first,/Added 6 suggestions/);
    assert.match(fixture.run(['scripts/backfill_leave_suggestions.php']),/Added 0 suggestions/);
    const search=(client,category,q)=>client.request(`leave_suggestions.php?${new URLSearchParams({category,q})}`);
    const destinations=(await search(admin,'destination','CEB')).items;
    assert.equal(destinations.length,1); assert.equal(destinations[0].value,'Cebu');
    const historyUser=await new Client(fixture.base).login('history@example.test');
    assert.deepEqual((await search(historyUser,'destination','Ceb')).items,destinations);
    assert.deepEqual((await search(admin,'destination','')).items.map(item=>item.value).sort(),['Calbayog City','Cebu']);
    assert.equal((await search(admin,'medical','Own historical')).items.length,1);
    assert.equal((await search(admin,'medical','Other historical')).items.length,1);
    assert.equal((await search(historyUser,'medical','Own historical')).items.length,1);
    assert.equal((await search(historyUser,'medical','Other historical')).items.length,1);
    assert.equal((await search(admin,'medical','Unlinked')).items.length,1);
    assert.equal((await search(historyUser,'medical','Unlinked')).items.length,1);
    assert.equal((await search(admin,'medical','No ownership')).items.length,1);
    fixture.run(['-r',"require 'api/db.php'; database()->prepare('INSERT INTO leave_suggestions (id,category,scope_key,display_value,normalized_value,value_hash) VALUES (?,?,?,?,?,?)')->execute(['old-enter-medical','medical','old-encoder','Previously entered medical term','previously entered medical term',hash('sha256','previously entered medical term')]);"]);
    assert.match(fixture.run(['scripts/backfill_leave_suggestions.php']),/Added 1 suggestions/);
    assert.equal((await search(historyUser,'medical','Previously entered')).items.length,1);
    assert.match(fixture.run(['scripts/backfill_leave_suggestions.php']),/Added 0 suggestions/);
    const application={employeeName:'Future applicant',office:'HRMDO',leaveType:'Vacation Leave',leaveSubtype:'WITHIN_PHILIPPINES',leaveDetails:'Iloilo City',dateRanges:[{startDate:'2026-10-14',endDate:'2026-10-14',dayType:'WHOLE_DAY'}]};
    const saved=(await admin.action('fileLeaveApplication',[application])).result;
    assert.equal((await search(historyUser,'destination','ILO')).items[0].value,'Iloilo City');
    await admin.action('updateLeaveApplication',[{...application,id:saved.id,leaveDetails:'Singapore',leaveSubtype:'ABROAD'}]);
    assert.equal((await search(historyUser,'destination','SING')).items[0].value,'Singapore');
    const sick=(await historyUser.action('fileLeaveApplication',[{...application,leaveType:'Sick Leave',leaveSubtype:'OUT_PATIENT',leaveDetails:'Conjunctivitis history fixture'}])).result;
    assert.equal((await search(historyUser,'medical','CONJ')).items[0].value,'Conjunctivitis history fixture');
    assert.equal((await search(admin,'medical','CONJ')).items.length,1);
    await historyUser.action('updateLeaveApplication',[{...application,id:sick.id,leaveType:'Sick Leave',leaveSubtype:'IN_HOSPITAL',leaveDetails:'Updated private medical fixture'}]);
    assert.equal((await search(historyUser,'medical','Updated private')).items.length,1);
    assert.equal((await search(admin,'medical','Updated private')).items.length,1);
    const preserved=fixture.run(['-r',"require 'api/db.php'; echo database()->query(\"SELECT COUNT(*) FROM app_records WHERE collection='leaveApplications' AND id LIKE 'old-%'\")->fetchColumn();"]);
    assert.equal(preserved,'12');
  } finally { await fixture.stop(); }
});

test('Leave suggestion persistence, matching, sharing, authorization and leave compatibility', async () => {
  const fixture = await startFixture(18812);
  try {
    const admin = await new Client(fixture.base).login();
    const endpoint = 'leave_suggestions.php';
    const search = (client, category, q = '', locationType = '') => client.request(`${endpoint}?${new URLSearchParams({category,q,locationType})}`);
    const save = (client, category, value, locationType = '') => client.request(endpoint, 'POST', {category,value,locationType});
    await new Client(fixture.base).request(`${endpoint}?category=medical`, 'GET', undefined, 401);
    await new Client(fixture.base).request(endpoint, 'POST', {category:'medical',value:'Fever'}, 401);
    await admin.request(endpoint, 'PUT', {}, 405);
    await admin.request(endpoint, 'POST', {category:'medical',value:'Fever'}, 403, {'X-CSRF-Token':'invalid'});
    const beforeRevision = (await admin.refresh()).revision;
    const medical = await save(admin, 'medical', 'Fever');
    assert.equal(medical.created, true);
    assert.equal((await save(admin, 'medical', '  FEVEr\n ')).item.id, medical.item.id);
    assert.equal((await save(admin, 'medical', 'fever')).item.value, 'Fever');
    assert.equal((await admin.refresh()).revision, beforeRevision, 'suggestions do not mutate leave state or revision');
    await save(admin, 'medical', 'Fever with headache');
    await save(admin, 'medical', 'After fever');
    assert.equal((await search(admin,'medical','F')).items[0].value,'Fever');
    assert.deepEqual((await search(admin,'medical',' FEV ')).items.map(item=>item.value),['Fever','Fever with headache','After fever']);
    assert.equal((await search(admin,'medical','fever')).items[0].id,medical.item.id);
    for (let n=0;n<10;n++) await save(admin,'medical',`Fever term ${n}`);
    assert.equal((await search(admin,'medical','f')).items.length,8);
    assert.deepEqual((await search(admin,'medical','%')).items,[], 'SQL wildcards are literal');
    assert.deepEqual((await search(admin,'destination','Fever')).items,[]);
    for (const body of [{category:'bad',value:'x'},{category:'medical',value:''},{category:'medical',value:' \n\t '},
      {category:'medical',value:'x'.repeat(2001)},{category:'medical',value:[]},{category:'medical',value:'a\u0000b'},
      {category:'destination',value:'!!!'},{category:'destination',value:'City',locationType:'invented'}]) {
      await admin.request(endpoint,'POST',body,422);
    }
    await admin.request(`${endpoint}?category=medical&q=${'x'.repeat(2001)}`,'GET',undefined,422);
    const long = await save(admin,'medical','x'.repeat(2000)); assert.equal(long.item.value.length,2000);
    const newUser = async (email,role,sidebarModules=['leave']) => admin.action('addUser',[{name:'Test user',email,password:testPassword,role,roleTitle:role,office:'HRMDO',division:'HRMDO',position:'Officer',sidebarModules}]);
    await newUser('intake-suggest@example.test','receiving_officer');
    await newUser('restricted-suggest@example.test','employee',['dashboard']);
    await newUser('reader-suggest@example.test','processor');
    const intake = await new Client(fixture.base).login('intake-suggest@example.test');
    assert.equal((await search(intake,'medical','Fever')).items[0].id,medical.item.id);
    // Caller-supplied scope cannot change the shared vocabulary or create duplicates per account.
    assert.equal((await intake.request(`${endpoint}?category=medical&q=Fever&scope_key=forged`)).items[0].id,medical.item.id);
    const own = await save(intake,'medical','Fever'); assert.equal(own.item.id,medical.item.id); assert.equal(own.created,false);
    await save(intake,'medical','Private unique narrative');
    assert.equal((await search(admin,'medical','Private unique')).items.length,1);
    const destination = await save(admin,'destination','Davao City','WITHIN_PHILIPPINES');
    assert.deepEqual((await search(intake,'destination','DAV')).items,[destination.item]);
    const same = await Promise.all([save(admin,'destination','  DAVAO city '),save(intake,'destination','davao CITY')]);
    assert(same.every(result=>result.item.id===destination.item.id && !result.created));
    const medicalRace=await Promise.all([save(admin,'medical','Shared concurrent medical'),save(intake,'medical','SHARED concurrent MEDICAL')]);
    assert.equal(medicalRace[0].item.id,medicalRace[1].item.id);
    assert.equal(medicalRace.filter(result=>result.created).length,1);
    const simultaneous = await Promise.all([save(admin,'destination','New concurrent city'),save(intake,'destination','New Concurrent City')]);
    assert.equal(simultaneous[0].item.id,simultaneous[1].item.id);
    assert.equal(simultaneous.filter(result=>result.created).length,1);
    await save(admin,'destination','Twin alpha','ABROAD'); await save(admin,'destination','Twin bravo','WITHIN_PHILIPPINES');
    assert.equal((await search(admin,'destination','Twin','WITHIN_PHILIPPINES')).items[0].value,'Twin bravo');
    const reader = await new Client(fixture.base).login('reader-suggest@example.test');
    assert.equal((await search(reader,'destination','dav')).items.length,1);
    assert.equal((await search(reader,'medical','Shared concurrent')).items.length,1);
    await reader.request(endpoint,'POST',{category:'destination',value:'Blocked'},403);
    const restricted = await new Client(fixture.base).login('restricted-suggest@example.test');
    await restricted.request(`${endpoint}?category=destination`,'GET',undefined,403);
    await restricted.request(`${endpoint}?category=medical`,'GET',undefined,403);
    await restricted.request(endpoint,'POST',{category:'medical',value:'Blocked'},403);
    await intake.request('auth.php','DELETE'); await intake.login('intake-suggest@example.test');
    assert.equal((await search(intake,'medical','Fever')).items[0].id,own.item.id,'survives a new session');
    fixture.run(['scripts/migrate_leave_suggestions.php']); fixture.run(['scripts/migrate_leave_suggestions.php']);
    assert.equal((await search(intake,'medical','Fever')).items[0].id,own.item.id,'idempotent additive migration');
    const application = {employeeName:'Suggestion applicant',office:'HRMDO',leaveType:'Sick Leave',leaveSubtype:'OUT_PATIENT',leaveDetails:own.item.value,dateRanges:[{startDate:'2026-10-14',endDate:'2026-10-14',dayType:'WHOLE_DAY'}]};
    const registered=(await intake.action('fileLeaveApplication',[application])).result;
    assert.equal(registered.leaveDetails,'Fever');
    const edited=(await intake.action('updateLeaveApplication',[{...application,id:registered.id,leaveType:'Vacation Leave',leaveSubtype:'WITHIN_PHILIPPINES',leaveDetails:destination.item.value}])).result;
    assert.equal(edited.leaveDetails,'Davao City');
    const payload=await search(admin,'medical','Fever');
    assert(payload.items.every(item=>Object.keys(item).sort().join(',')==='id,value'));
    const audit = fixture.run(['-r',"require 'api/db.php'; foreach(database()->query(\"SELECT record_json FROM app_audit WHERE JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.actionType'))='LEAVE_SUGGESTION_CREATED'\") as $row) echo $row['record_json'];"]);
    assert(!audit.includes('Private unique narrative') && !audit.includes('Fever'));
  } finally { await fixture.stop(); }
});
