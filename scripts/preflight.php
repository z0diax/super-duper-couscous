<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
$errors=[];
foreach (['pdo_mysql','mbstring','fileinfo','Phar'] as $extension) if (!extension_loaded($extension)) $errors[]='Enable PHP extension: '.$extension;
if (PHP_VERSION_ID<80200) $errors[]='PHP 8.2 or later is required.';
try {
    $pdo=database();
    if ((int)$pdo->query('SELECT schema_version FROM app_meta WHERE id=1')->fetchColumn()!==4) $errors[]='Run the database installer.';
    if (!$pdo->query("SHOW COLUMNS FROM app_users LIKE 'sidebar_modules'")->fetch()) $errors[]='Run the database installer.';
    if (!$pdo->query("SHOW TABLES LIKE 'application_settings'")->fetch()) $errors[]='Run the database installer.';
}
catch (Throwable $e) { $errors[]='Database is unavailable or not installed.'; }
$directory=app_config()['upload_directory']; if (!is_dir($directory)) mkdir($directory,0700,true);
if (!is_writable($directory)) $errors[]='Upload directory is not writable.';
if (!is_file(dirname(__DIR__).'/dist/index.html')) $errors[]='Run npm run build.';
foreach ($errors as $error) echo "FAIL: $error\n";
if (!$errors) echo "Preflight passed. Verify Apache access rules and HTTPS on the deployment host.\n";
exit($errors?1:0);
