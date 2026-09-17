<?php
declare(strict_types=1);
function app_config(): array {
    static $config;
    if ($config !== null) return $config;
    $config = array_merge([
        'host'=>'127.0.0.1', 'port'=>3306, 'database'=>'hrmdo_document_tracking', 'archive_database'=>'document_tracking',
        'username'=>'root', 'password'=>'', 'session_timeout'=>1800,
        'upload_max_bytes'=>10 * 1024 * 1024, 'upload_directory'=>dirname(__DIR__).'/storage/uploads',
    ], is_file(__DIR__.'/config.php') ? require __DIR__.'/config.php' : []);
    foreach (['host','port','database','archive_database','username','password','upload_directory'] as $key) {
        $value = getenv('HRMDO_'.strtoupper($key));
        if ($value !== false) $config[$key] = $value;
    }
    return $config;
}
function database(bool $select = true): PDO {
    $c = app_config();
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $c['database'])) throw new RuntimeException('Invalid database name.');
    return new PDO(sprintf('mysql:host=%s;port=%d;%scharset=utf8mb4', $c['host'], $c['port'], $select ? 'dbname='.$c['database'].';' : ''), $c['username'], $c['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
}
