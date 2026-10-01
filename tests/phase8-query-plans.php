<?php
declare(strict_types=1);
require_once __DIR__.'/../api/document_repository.php';
if (!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database'])) throw new RuntimeException('Isolated fixture only.');
$pdo=database();
$id=getenv('PHASE8_USER')?:'';
$q=$pdo->prepare('SELECT * FROM app_users WHERE id=?');$q->execute([$id]);$user=public_user($q->fetch());
$roleState=document_repository_role_state($pdo,$user);
[$scope,$scopeParams]=document_repository_visibility($roleState,$user);
[$actionable,$actionParams]=document_repository_task_actionable($user,true);
$plans=[];
foreach (['tracking_number'=>'LOAD-00042','barcode'=>'LOADBAR-42','legacy_id'=>'LEGACY-42'] as $field=>$value) {
    $q=$pdo->prepare("EXPLAIN SELECT d.id FROM documents d WHERE d.$field=? AND $scope LIMIT 1");
    document_repository_bind($q,[$value,...$scopeParams]);$q->execute();$plans[$field]=$q->fetchAll();
}
$q=$pdo->prepare("EXPLAIN SELECT COUNT(*) FROM documents d WHERE $scope AND LOWER(d.title) LIKE ?");
document_repository_bind($q,[...$scopeParams,'%representative%']);$q->execute();$plans['partial']=$q->fetchAll();
$q=$pdo->prepare("EXPLAIN SELECT COUNT(*) FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number WHERE $scope AND (((d.status NOT IN ('Released','Archived','Disapproved') AND d.status='On_Hold' AND d.encoded_by_user_id=?) OR (d.status NOT IN ('Released','Archived','Disapproved') AND $actionable)))");
document_repository_bind($q,[...$scopeParams,$id,...$actionParams]);$q->execute();$plans['summary']=$q->fetchAll();
echo json_encode($plans,JSON_THROW_ON_ERROR);
