<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
if (empty($argv[1]) || !is_file($argv[1])) { fwrite(STDERR,"Usage: php scripts/restore.php <trusted-backup.json>\nRestores only into an empty configured database.\n"); exit(1); }
$data=json_decode(file_get_contents($argv[1]),true,64,JSON_THROW_ON_ERROR);
if (($data['format']??0)!==1 || !is_array($data['tables']??null)) throw new RuntimeException('Invalid backup.');
$pdo=database(false); $name=app_config()['database'];
$pdo->exec('CREATE DATABASE IF NOT EXISTS `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); $pdo->exec('USE `'.$name.'`');
if ($pdo->query('SHOW TABLES')->fetch()) throw new RuntimeException('Refusing to restore over an existing database. Configure an empty recovery database.');
foreach ($data['tables'] as $table=>$content) {
    if (!preg_match('/^app_[a-z_]+$/',$table)) throw new RuntimeException('Invalid table name.');
    $pdo->exec($content['schema']);
    foreach ($content['rows'] as $row) {
        foreach (array_keys($row) as $col) if (!preg_match('/^[a-z_][a-z0-9_]*$/',$col)) throw new RuntimeException('Invalid column.');
        $sql='INSERT INTO `'.$table.'` (`'.implode('`,`',array_keys($row)).'`) VALUES ('.implode(',',array_fill(0,count($row),'?')).')';
        $pdo->prepare($sql)->execute(array_values($row));
    }
}
echo "Restored database. Restore its matching upload directory before opening the application.\n";
