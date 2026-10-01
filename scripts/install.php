<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/store.php';
$c=app_config(); $pdo=database(false);
$pdo->exec('CREATE DATABASE IF NOT EXISTS `'.$c['database'].'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$pdo->exec('USE `'.$c['database'].'`');
foreach (explode(';',file_get_contents(dirname(__DIR__).'/database/schema.sql')) as $sql) if (trim($sql)!=='') $pdo->exec($sql);
foreach (explode(';',file_get_contents(dirname(__DIR__).'/database/phase2_documents_workflow.sql')) as $sql) if (trim($sql)!=='') $pdo->exec($sql);
foreach (explode(';',file_get_contents(dirname(__DIR__).'/database/phase9_payroll_reads.sql')) as $sql) if (trim($sql)!=='') $pdo->exec($sql);
$payrollUpdated=$pdo->query("SHOW COLUMNS FROM payroll_read_batches LIKE 'updated_at'")->fetchAll();
if (!$payrollUpdated) $pdo->exec('ALTER TABLE payroll_read_batches ADD COLUMN updated_at VARCHAR(40) NULL AFTER date_encoded, ADD INDEX idx_prb_updated (updated_at)');
$payrollItemNumber=$pdo->query("SHOW COLUMNS FROM payroll_read_items LIKE 'item_number'")->fetchAll();
if (!$payrollItemNumber) $pdo->exec('ALTER TABLE payroll_read_items ADD COLUMN item_number INT NULL AFTER document_id, ADD INDEX idx_pri_batch_number (batch_id,item_number)');
$payrollManagement=$pdo->query("SHOW COLUMNS FROM payroll_read_batches LIKE 'management_active'")->fetchAll();
if (!$payrollManagement) $pdo->exec('ALTER TABLE payroll_read_batches ADD COLUMN management_active INT NOT NULL DEFAULT 0 AFTER initial_active, ADD COLUMN management_on_hold INT NOT NULL DEFAULT 0 AFTER management_active');
$payrollVerification=$pdo->query("SHOW COLUMNS FROM payroll_read_items LIKE 'verification_status'")->fetchAll();
if (!$payrollVerification) $pdo->exec('ALTER TABLE payroll_read_items ADD COLUMN verification_status VARCHAR(64) NULL AFTER status');
$legacyIndex=$pdo->query("SHOW INDEX FROM documents WHERE Key_name='idx_document_legacy_id'")->fetchAll();
if (!$legacyIndex) $pdo->exec('ALTER TABLE documents ADD INDEX idx_document_legacy_id (legacy_id)');
$columns=$pdo->query("SHOW COLUMNS FROM app_users LIKE 'sidebar_modules'")->fetchAll();
if (!$columns) $pdo->exec('ALTER TABLE app_users ADD COLUMN sidebar_modules LONGTEXT NULL AFTER avatar_initials');
$columns=$pdo->query("SHOW COLUMNS FROM app_users LIKE 'avatar_seed'")->fetchAll();
if (!$columns) $pdo->exec('ALTER TABLE app_users ADD COLUMN avatar_seed VARCHAR(190) NULL AFTER avatar_initials');
$pdo->beginTransaction();
try {
    $version=(int)$pdo->query('SELECT schema_version FROM app_meta WHERE id=1 FOR UPDATE')->fetchColumn();
    if ($version<1) {
        $old=$pdo->query("SELECT state_json FROM app_state WHERE state_key='main'")->fetchColumn(); $legacy=$old?json_decode($old,true,64,JSON_THROW_ON_ERROR):[];
        $state=defaults();
        foreach (COLLECTIONS as $key) if (!empty($legacy[$key])) $state[$key]=$legacy[$key];
        foreach ($state['documents'] as &$document) foreach ($document['workflowSteps'] as &$step) {
            foreach ($state['workflowTemplates'] as $template) if ($template['id']===$document['workflowTemplateId']) {
                $definition=$template['steps'][$step['stepNumber']-1]??[];
                foreach (['requiredAction','allowReturn','requiresAttachment'] as $field) if (!array_key_exists($field,$step) && array_key_exists($field,$definition)) $step[$field]=$definition[$field];
            }
        } unset($document,$step);
        // Fill missing baseline categories and roles without replacing configured records.
        foreach (['classifications','systemRoles','employmentRoutingRules','assigneeDesignations'] as $key) foreach (defaults()[$key] as $row) {
            $field=$key==='classifications' || $key==='employmentRoutingRules'?'classification':'id';
            if (!in_array($row[$field],array_column($state[$key],$field),true)) $state[$key][]=$row;
        }
        persist_state($pdo,[],$state);
        $put=$pdo->prepare('INSERT IGNORE INTO app_audit (id,record_json) VALUES (?,?)');
        foreach ($legacy['auditLogs']??[] as $event) $put->execute([$event['id'],json_encode($event,JSON_THROW_ON_ERROR)]);
        $put=$pdo->prepare('INSERT IGNORE INTO app_users (id,email,password_hash,name,role,role_title,office,division,position,avatar_initials) VALUES (?,?,?,?,?,?,?,?,?,?)');
        foreach ($legacy['users']??[] as $u) $put->execute([$u['id'],$u['email'],password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT),$u['name'],$u['role'],$u['roleTitle'],$u['office'],$u['division'],$u['position'],$u['avatarInitials']]);
        $pdo->exec('UPDATE app_meta SET schema_version=1,revision=revision+1 WHERE id=1');
    }
    if ($version<2) {
        $pdo->exec('UPDATE app_meta SET schema_version=2,revision=revision+1 WHERE id=1');
    }
    if ($version<3) {
        $pdo->prepare('INSERT IGNORE INTO application_settings (setting_key,setting_value) VALUES (?,?)')->execute(['system_theme','classic']);
        $pdo->exec('UPDATE app_meta SET schema_version=3,revision=revision+1 WHERE id=1');
    }
    if ($version<4) {
        $pdo->prepare('INSERT IGNORE INTO application_settings (setting_key,setting_value) VALUES (?,?)')->execute(['system_theme_revision','1']);
        $pdo->exec('UPDATE app_meta SET schema_version=4,revision=revision+1 WHERE id=1');
    }
    if ((int)$pdo->query("SELECT COUNT(*) FROM app_users WHERE role='admin'")->fetchColumn()===0) {
        $email=getenv('HRMDO_ADMIN_EMAIL')?:($c['admin_email']??''); $password=getenv('HRMDO_ADMIN_PASSWORD');
        $hash=$password?password_hash($password,PASSWORD_DEFAULT):($c['admin_password_hash']??'');
        fail_unless((bool)filter_var($email,FILTER_VALIDATE_EMAIL) && password_get_info($hash)['algo']!==null,'Set HRMDO_ADMIN_EMAIL and HRMDO_ADMIN_PASSWORD (at least 12 characters), then rerun the installer.');
        if ($password) fail_unless(strlen($password)>=12 && strlen($password)<=72,'Administrator password must be 12–72 bytes.');
        $pdo->prepare('INSERT INTO app_users (id,email,password_hash,name,role,role_title,office,division,position,avatar_initials) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([uid('admin'),strtolower($email),$hash,'System Administrator','admin','Administrator','HRMDO','Administration','Administrator','SA']);
    }
    $pdo->commit(); echo "Database installed/migrated. Existing records and credentials preserved.\n";
} catch (Throwable $e) { $pdo->rollBack(); fwrite(STDERR,$e->getMessage()."\n"); exit(1); }
