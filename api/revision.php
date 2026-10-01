<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
fail_unless(($_SERVER['REQUEST_METHOD']??'')==='GET','Method not allowed.',405);
fail_unless(!$_GET,'Invalid query parameter.',400);
$pdo=database();$user=authenticated_user($pdo);
$meta=$pdo->query('SELECT revision,config_revision FROM app_meta WHERE id=1')->fetch();
respond(['revision'=>(int)$meta['revision'],'configRevision'=>(int)$meta['config_revision'],'user'=>$user]);
