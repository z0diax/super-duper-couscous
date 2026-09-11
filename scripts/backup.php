<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
$pdo=database(); $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); $pdo->beginTransaction();
$data=['format'=>1,'database'=>app_config()['database'],'createdAt'=>gmdate('c'),'tables'=>[]];
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
    if (!preg_match('/^app_[a-z_]+$/',$table)) continue;
    $schema=$pdo->query('SHOW CREATE TABLE `'.$table.'`')->fetch(PDO::FETCH_NUM)[1];
    $data['tables'][$table]=['schema'=>$schema,'rows'=>$pdo->query('SELECT * FROM `'.$table.'`')->fetchAll()];
}
$pdo->commit(); $dir=dirname(__DIR__).'/storage/backups';
if (!is_dir($dir)) mkdir($dir,0700,true);
$path=$dir.'/'.app_config()['database'].'-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(3)).'.json';
if (file_put_contents($path,json_encode($data,JSON_THROW_ON_ERROR))===false) throw new RuntimeException('Backup write failed.');
echo "Database backup: $path\nAlso back up the configured upload directory: ".app_config()['upload_directory']."\n";
