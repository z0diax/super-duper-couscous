import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture, Client } from './support.mjs';

test('clean installer creates the complete read and write schema and can be rerun', async () => {
  const fixture = await startFixture(18810);
  try {
    const expected = [
      'app_meta', 'app_records', 'app_users', 'app_files', 'app_audit',
      'app_state', 'app_login_attempts', 'application_settings',
      'documents', 'document_workflow_steps', 'document_attachments',
      'document_custody_history', 'workflow_templates',
      'workflow_template_steps', 'workflow_template_document_types',
      'payroll_read_batches', 'payroll_read_items', 'payroll_read_groups',
      'payroll_read_group_items',
    ];
    const inspect = () => JSON.parse(fixture.run(['-r', `require 'api/db.php'; $p=database(); echo json_encode(['tables'=>$p->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN),'meta'=>$p->query('SELECT revision,config_revision FROM app_meta WHERE id=1')->fetch(),'users'=>$p->query('SELECT COUNT(*) FROM app_users')->fetchColumn(),'indexes'=>$p->query("SHOW INDEX FROM documents WHERE Key_name='idx_document_legacy_id'")->rowCount()]);`]));
    const before = inspect();
    for (const table of expected) assert(before.tables.includes(table), `Missing table: ${table}`);
    assert(Number.isInteger(Number(before.meta.revision)));
    assert(Number.isInteger(Number(before.meta.config_revision)));
    assert.equal(Number(before.users), 1);
    assert(Number(before.indexes) > 0);
    const admin = await new Client(fixture.base).login();
    assert.equal(admin.state.users.length, 1);
    fixture.run(['scripts/install.php']);
    const after = inspect();
    assert.equal(Number(after.users), 1);
    assert.deepEqual(after.meta, before.meta);
    for (const [script, mode] of [
      ['scripts/backfill_documents_workflow.php', '--apply'],
      ['scripts/backfill_documents_workflow.php', '--verify'],
      ['scripts/backfill_payroll_reads.php', '--apply'],
      ['scripts/backfill_payroll_reads.php', '--verify'],
    ]) assert.equal(JSON.parse(fixture.run([script, mode])).status, 'ok');
  } finally { await fixture.stop(); }
});
