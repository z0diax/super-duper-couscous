<?php
declare(strict_types=1);
require_once __DIR__.'/document_routing_repository.php';
$pdo=database();$user=authenticated_user($pdo);$method=$_SERVER['REQUEST_METHOD'];
fail_unless(getenv('HRMDO_DOCUMENT_TARGETED_READS_ENABLED')==='1','Targeted document routing is disabled.',503);
if ($method==='GET') { fail_unless(!$_GET,'Invalid query parameter.',400);respond(['data'=>routing_people($pdo)]); }
fail_unless($method==='POST','Method not allowed.',405);csrf_check();$data=request_json();
$pdo->beginTransaction();
try {
    // Match existing write ordering, including barcode/configuration changes.
    $pdo->query('SELECT revision FROM app_meta WHERE id=1 FOR UPDATE')->fetchColumn();
    $user=authenticated_user($pdo);
    $doc=match($data['action']??'') {
        'register'=>routing_register($pdo,$user,$data),
        'delete'=>routing_delete($pdo,$user,$data),
        default=>routing_action($pdo,$user,$data),
    };
    $pdo->exec('UPDATE app_meta SET revision=revision+1 WHERE id=1');$pdo->commit();respond(['data'=>$doc]);
} catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
