<?php
declare(strict_types=1);
require_once __DIR__.'/../api/document_repository.php';
if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database']))throw new RuntimeException('Isolated fixture only.');
$pdo=database();$id=getenv('PHASE9_USER')?:'';$q=$pdo->prepare('SELECT * FROM app_users WHERE id=?');$q->execute([$id]);$user=public_user($q->fetch());
[$scope,$scopeParams]=document_repository_visibility(document_repository_role_state($pdo,$user),$user);
[$actionable,$actionParams]=document_repository_task_actionable($user,true);
$active="d.status NOT IN ('Released','Archived','Disapproved')";
$attention="(($active AND d.status='On_Hold' AND d.encoded_by_user_id=?) OR ($active AND $actionable))";
$from=' FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number';
$timestamp="COALESCE(NULLIF(d.held_at,''),NULLIF(s.started_at,''),d.date_encoded)";
$definitions=[
 'oldCount'=>["SELECT COUNT(*)$from WHERE $scope AND $attention",[...$scopeParams,$id,...$actionParams]],
 'oldList'=>["SELECT d.id$from WHERE $scope AND $attention AND (d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1) ORDER BY $timestamp DESC,d.id ASC LIMIT 25",[...$scopeParams,$id,...$actionParams]],
 'newCount'=>["SELECT COUNT(*)$from WHERE $attention",[$id,...$actionParams]],
 'newList'=>["SELECT d.id$from WHERE $attention AND (d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1) ORDER BY $timestamp DESC,d.id ASC LIMIT 25",[$id,...$actionParams]],
];
$result=[];
foreach($definitions as $name=>[$sql,$params]){
    $times=[];$rows=null;
    for($n=0;$n<5;$n++){$q=$pdo->prepare($sql);document_repository_bind($q,$params);$start=microtime(true);$q->execute();$rows=$q->fetchAll(PDO::FETCH_COLUMN);$times[]=round((microtime(true)-$start)*1000,2);}
    sort($times);$plan=$pdo->prepare('EXPLAIN '.$sql);document_repository_bind($plan,$params);$plan->execute();
    $result[$name]=['medianMs'=>$times[2],'rows'=>$rows,'plan'=>array_map(fn($row)=>['table'=>$row['table'],'type'=>$row['type'],'key'=>$row['key'],'rows'=>$row['rows']],$plan->fetchAll())];
}
echo json_encode($result,JSON_THROW_ON_ERROR);
