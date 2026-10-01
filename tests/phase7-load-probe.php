<?php
declare(strict_types=1);
require_once __DIR__.'/../api/store.php';
require_once __DIR__.'/../api/document_repository.php';
$name=app_config()['database'];
if (!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',$name)) throw new RuntimeException('Load probe requires an isolated test database.');
$pdo=database();
$target=(int)(getenv('PHASE7_TARGET')?:0);
$userId=getenv('PHASE7_USER')?:'';
if (!in_array($target,[100,1000,10000],true) || $userId==='') throw new RuntimeException('Invalid probe parameters.');
$userQuery=$pdo->prepare('SELECT * FROM app_users WHERE id=?'); $userQuery->execute([$userId]);
$user=public_user($userQuery->fetch());
$existing=(int)$pdo->query("SELECT COUNT(*) FROM documents WHERE id LIKE 'phase7load-%'")->fetchColumn();
$insert=$pdo->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)');
$seedStart=microtime(true);
for ($start=$existing+1;$start<=$target;$start+=100) {
    $source=['documents'=>[]];
    $pdo->beginTransaction();
    for ($i=$start;$i<=min($target,$start+99);$i++) {
        $id='phase7load-'.str_pad((string)$i,5,'0',STR_PAD_LEFT);
        $kind=$i%3;
        $assignment=$kind===0?['type'=>'Person','userId'=>$userId,'displayName'=>'Processor']:($kind===1?['type'=>'Role','role'=>'processor','displayName'=>'Processor']:['type'=>'Team','team'=>'Operations','displayName'=>'Operations']);
        $steps=[];
        for ($s=1;$s<=3;$s++) $steps[]=['stepNumber'=>$s,'name'=>"Processing phase $s",'stageType'=>'INTERNAL_PROCESSING','requiredAction'=>'Verify & Process','status'=>$s===1?'In_Progress':'Pending','assignedTo'=>$s===1?$assignment:['type'=>'Role','role'=>'reviewer','displayName'=>'Reviewer'],'slaHours'=>24,'isCurrent'=>$s===1,'allowHold'=>true,'requiresAttachment'=>false];
        $doc=['id'=>$id,'trackingNumber'=>'LOAD-'.str_pad((string)$i,5,'0',STR_PAD_LEFT),'barcode'=>'LOADBAR-'.$i,'title'=>'Representative document '.$i,'subject'=>'Routing and verification','sourceType'=>'Internal','sourceOffice'=>'HRMDO','senderName'=>'Sender','classification'=>'Request','documentType'=>'Service Record','priority'=>'Routine','dateReceived'=>'2026-09-15T00:00:00Z','dateEncoded'=>'2026-09-15T00:00:00Z','description'=>'Representative three-step document','status'=>'In_Progress','currentStepNumber'=>1,'totalSteps'=>3,'workflowTemplateId'=>'phase7-load-template','workflowVersion'=>1,'currentLocation'=>'HRMDO','encodedBy'=>['userId'=>'seed-owner','userName'=>'Seed owner'],'workflowSteps'=>$steps,'attachments'=>[],'custodyHistory'=>[]];
        $raw=json_encode($doc,JSON_THROW_ON_ERROR);
        $insert->execute(['documents',$id,$raw]);
        $source['documents'][$id]=['value'=>$doc,'raw'=>$raw];
    }
    p2_write_project($pdo,p2_project($source,[]));
    $pdo->commit();
}
$seedSeconds=round(microtime(true)-$seedStart,3);
$measure=function(callable $work): array {
    $times=[]; $result=null; $before=memory_get_usage(true);
    for($n=0;$n<3;$n++){ $start=microtime(true); $result=$work(); $times[]=round((microtime(true)-$start)*1000,2); }
    sort($times);
    return ['medianMs'=>$times[1],'memoryBeforeBytes'=>$before,'memoryAfterBytes'=>memory_get_usage(true),'peakBytes'=>memory_get_peak_usage(true),'result'=>$result];
};
$tasks=$measure(fn()=>document_repository_task_queue($pdo,$user,'my_tasks',[],1,25));
$taskValue=$tasks['result']; unset($tasks['result']);
$tasks['matched']=$taskValue['total']; $tasks['returned']=count($taskValue['items']);
$tasks['jsonBytes']=strlen(json_encode(['data'=>$taskValue['items'],'pagination'=>['page'=>1,'limit'=>25,'total'=>$taskValue['total'],'totalPages'=>$taskValue['totalPages']],'queueCounts'=>$taskValue['queueCounts']],JSON_THROW_ON_ERROR));
unset($taskValue);
$state=$measure(fn()=>load_state($pdo));
$stateValue=$state['result']; unset($state['result']);
$state['records']=array_sum(array_map('count',array_filter($stateValue,'is_array')));
$state['documents']=count($stateValue['documents']);
$state['jsonBytes']=strlen(json_encode(['state'=>$stateValue],JSON_THROW_ON_ERROR));
unset($stateValue);
$plans=[];
foreach (['Person'=>['assigned_user_id',$userId],'Role'=>['assigned_role','processor'],'Team'=>['assigned_team','Operations']] as $kind=>[$column,$value]) {
    $q=$pdo->prepare("EXPLAIN SELECT document_id FROM document_workflow_steps WHERE assignment_type=? AND $column=? AND is_current=1"); $q->execute([$kind,$value]);
    $plans[$kind]=$q->fetchAll();
}
$roleState=document_repository_role_state($pdo,$user);
[$scope,$scopeParams]=document_repository_visibility($roleState,$user);
[$condition,$conditionParams]=document_repository_task_queue_condition('my_tasks',$user);
$q=$pdo->prepare("EXPLAIN SELECT d.id FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number WHERE (d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1) AND $scope AND $condition ORDER BY d.id ASC LIMIT 25");
document_repository_bind($q,[...$scopeParams,...$conditionParams]); $q->execute();
$plans['fullQueue']=$q->fetchAll();
echo json_encode(['target'=>$target,'seedSeconds'=>$seedSeconds,'state'=>$state,'tasks'=>$tasks,'plans'=>$plans],JSON_THROW_ON_ERROR);
