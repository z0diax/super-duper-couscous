import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { startFixture, Client } from './support.mjs';

test('Phase 2 backfill is additive, lossless, rerunnable, and verifies drift', async () => {
  const fixture = await startFixture(18766);
  try {
    const admin = await new Client(fixture.base).login();
    const adminId = admin.state.users.find(user => user.role === 'admin').id;
    const template = {
      id: 'phase2-template', version: 2, classification: 'Request', documentType: 'Service Record',
      documentTypes: ['Service Record', 'Certification'], employmentClassification: 'All',
      title: 'External review', description: 'Test snapshot', isActive: true,
      steps: [{ stepNumber: 1, name: 'External review', description: 'Route outside', stageType: 'EXTERNAL_HANDOFF_REVIEW',
        assigneeType: 'System', assigneeName: 'System', slaHours: 48, requiredAction: 'External Handoff',
        allowReturn: false, allowHold: true, requiresAttachment: true, assignmentSource: 'workflow',
        externalPurpose: 'Review', externalDestinationMode: 'FIXED_DESTINATION', externalDestinationOffice: 'Other office',
        returnReceiverType: 'Role', returnReceiverRole: 'receiving_officer', expectedTurnaroundHours: 72,
        requiresReturnedAttachment: true, requiresExternalResult: true }],
    };
    const document = {
      id: 'phase2-document', trackingNumber: 'PHASE2-001', barcode: 'PHASE2-001', title: 'Historical external review',
      subject: 'Subject', sourceType: 'External', sourceOffice: 'Outside', senderName: 'Sender', classification: 'Request',
      documentType: 'Service Record', priority: 'Urgent', dateReceived: '2026-09-20T00:00:00Z',
      dateEncoded: '2026-09-20T00:00:01Z', description: 'Preserve verbatim', status: 'Awaiting_External_Return',
      currentStepNumber: 1, totalSteps: 1, workflowTemplateId: template.id, workflowVersion: 1,
      currentLocation: 'Other office', encodedBy: { userId: adminId, userName: 'System Administrator' },
      workflowSteps: [{ stepNumber: 1, name: 'External review snapshot', stageType: 'EXTERNAL_HANDOFF_REVIEW',
        requiredAction: 'External Handoff', status: 'In_Progress', assignedTo: { type: 'System', displayName: 'System' },
        slaHours: 48, isCurrent: true, allowHold: true, requiresAttachment: true, externalStatus: 'OUTSIDE_HRMDO',
        externalHandoff: { destinationOffice: 'Other office', purpose: 'Review', handedTo: 'Clerk', sentAt: '2026-09-20T00:00:02Z' },
        returnReceiver: { type: 'Role', role: 'receiving_officer', displayName: 'Receiving Officer' },
        expectedTurnaroundHours: 72 }],
      attachments: [{ id: 'file-123456789012345678901234', name: 'test.txt', sizeBytes: 4, mimeType: 'text/plain',
        uploadedBy: 'System Administrator', uploadedAt: '2026-09-20T00:00:00Z', stepNumber: 1 }],
      complianceAttachments: [{ id: 'file-123456789012345678901234', name: 'test.txt', sizeBytes: 4,
        mimeType: 'text/plain', uploadedBy: 'System Administrator', uploadedAt: '2026-09-20T00:00:00Z', stepNumber: 1 }],
      custodyHistory: [{ id: 'custody-phase2', movementType: 'EXTERNAL_HANDOFF', fromLocation: 'HRMDO',
        toLocation: 'Other office', timestamp: '2026-09-20T00:00:02Z', stageNumber: 1, actorId: adminId,
        actorName: 'System Administrator', representative: 'Clerk' }],
      holdReason: 'Prior compliance', heldAt: '2026-09-19T00:00:00Z', heldByUserId: adminId,
      complianceRemarks: 'Received', releasedDetails: { releaseNumber: 'old-release', releasedAt: '2026-09-21T00:00:00Z', releasedTo: 'Liaison', releaseMode: 'HRMDO Liaison' },
    };
    const records = [{ collection: 'workflowTemplates', id: template.id, value: template },
      { collection: 'documents', id: document.id, value: document }];
    fixture.run(['-r', `require 'api/db.php'; $p=database(); $rows=json_decode(getenv('PHASE2_ROWS'),true); $q=$p->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)'); foreach ($rows as $r) $q->execute([$r['collection'],$r['id'],json_encode($r['value'])]); $p->prepare('INSERT INTO app_files (id,original_name,mime_type,size_bytes,sha256,uploaded_by,owner_id) VALUES (?,?,?,?,?,?,?)')->execute(['file-123456789012345678901234','test.txt','text/plain',4,str_repeat('0',64),getenv('PHASE2_ADMIN'), 'phase2-document']);`],
      { PHASE2_ROWS: JSON.stringify(records), PHASE2_ADMIN: adminId });
    const run = mode => JSON.parse(fixture.run(['scripts/backfill_documents_workflow.php', mode]));
    assert.equal(run('--check').status, 'ok');
    const first = run('--apply');
    assert.equal(first.status, 'ok'); assert.deepEqual(first.issues, []);
    assert.deepEqual(first.counts.documents, { source: 1, normalized: 1 });
    assert.deepEqual(first.counts.workflow_template_steps, { source: 1, normalized: 1 });
    assert.deepEqual(first.counts.document_attachments, { source: 2, normalized: 2 });
    assert.deepEqual(first.counts.document_custody_history, { source: 1, normalized: 1 });
    assert.equal(run('--apply').status, 'ok');
    assert.equal(run('--verify').status, 'ok');
    const shadow = JSON.parse(fixture.run(['-r', `require 'api/db.php'; $p=database(); echo json_encode(['source'=>$p->query("SELECT record_json FROM app_records WHERE collection='documents' AND id='phase2-document'")->fetchColumn(),'shadow'=>$p->query("SELECT source_json FROM documents WHERE id='phase2-document'")->fetchColumn(),'step'=>$p->query("SELECT external_status FROM document_workflow_steps WHERE document_id='phase2-document'")->fetchColumn(),'versions'=>$p->query("SELECT version FROM workflow_templates WHERE id='phase2-template'")->fetchAll(PDO::FETCH_COLUMN)]);`]));
    assert.equal(shadow.source, shadow.shadow);
    assert.equal(shadow.step, 'OUTSIDE_HRMDO');
    assert.deepEqual(shadow.versions, [2]);
    const before = JSON.stringify((await admin.refresh()).state);
    assert.equal(run('--verify').status, 'ok');
    assert.equal(JSON.stringify(admin.state), before);
    fixture.run(['-r', `require 'api/db.php'; $p=database(); $q=$p->prepare("UPDATE app_records SET record_json=JSON_SET(record_json,'$.status','Released') WHERE collection='documents' AND id='phase2-document'"); $q->execute();`]);
    const drift = spawnSync(process.env.PHP_BINARY || 'php', ['scripts/backfill_documents_workflow.php', '--verify'], { env: fixture.env, encoding: 'utf8', windowsHide: true });
    assert.equal(drift.status, 1);
    assert(JSON.parse(drift.stdout).issues.some(issue => issue.message.includes('status') || issue.message.includes('source_json')));
    assert.equal(run('--apply').status, 'ok');
    fixture.run(['-r', `require 'api/db.php'; $p=database(); $p->exec("UPDATE app_records SET record_json=JSON_SET(record_json,'$.version',3) WHERE collection='workflowTemplates' AND id='phase2-template'");`]);
    assert.equal(run('--apply').status, 'ok');
    const versions = JSON.parse(fixture.run(['-r', `require 'api/db.php'; $p=database(); echo json_encode($p->query("SELECT version,is_current FROM workflow_templates WHERE id='phase2-template' ORDER BY version")->fetchAll());`]));
    assert.deepEqual(versions.map(row => [Number(row.version), Number(row.is_current)]), [[2, 0], [3, 1]]);
    fixture.run(['-r', `require 'api/db.php'; $p=database(); $p->exec("UPDATE app_records SET record_json=JSON_SET(record_json,'$.workflowSteps[0].stepNumber',2) WHERE collection='documents' AND id='phase2-document'");`]);
    const invalid = spawnSync(process.env.PHP_BINARY || 'php', ['scripts/backfill_documents_workflow.php', '--check'], { env: fixture.env, encoding: 'utf8', windowsHide: true });
    assert.equal(invalid.status, 1);
    assert(JSON.parse(invalid.stdout).issues.some(issue => issue.message.includes('Current step 1 does not exist')));
    fixture.run(['-r', `require 'api/db.php'; $p=database(); $p->exec("UPDATE app_records SET record_json=JSON_SET(record_json,'$.workflowSteps[0].stepNumber',1) WHERE collection='documents' AND id='phase2-document'");`]);
    assert.equal(run('--verify').status, 'ok');
  } finally { await fixture.stop(); }
});
