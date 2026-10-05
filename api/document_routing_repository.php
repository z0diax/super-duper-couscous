<?php
declare(strict_types=1);
require_once __DIR__.'/document_repository.php';

function routing_reference(PDO $pdo): array {
    $state=['systemRoles'=>[],'classifications'=>[],'workflowTemplates'=>[]];
    $q=$pdo->query("SELECT collection,record_json FROM app_records WHERE collection IN ('systemRoles','classifications','workflowTemplates') ORDER BY id");
    foreach ($q as $row) $state[$row['collection']][]=json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR);
    return $state;
}
function routing_people(PDO $pdo): array {
    // Accounts have no inactive flag. Existing person tasks accept any current
    // account with a configured role, including the Employee role.
    return array_map('public_user',$pdo->query("SELECT u.* FROM app_users u JOIN app_records r ON r.collection='systemRoles' AND r.id=u.role ORDER BY u.name,u.id")->fetchAll());
}
function routing_person(PDO $pdo,string $id): array {
    $q=$pdo->prepare("SELECT u.* FROM app_users u JOIN app_records r ON r.collection='systemRoles' AND r.id=u.role WHERE u.id=? FOR UPDATE");
    $q->execute([$id]); $row=$q->fetch();
    fail_unless((bool)$row,'Choose an eligible current employee.');
    return public_user($row);
}
function routing_step(array $person,int $number,string $time): array {
    return ['stepNumber'=>$number,'name'=>'Assigned to '.$person['name'],'stageType'=>'INTERNAL_PROCESSING','assignmentSource'=>'dynamic','assignedTo'=>['type'=>'Person','userId'=>$person['id'],'displayName'=>$person['name']],'requiredAction'=>'Complete','status'=>'In_Progress','startedAt'=>$time,'isCurrent'=>true,'slaHours'=>48,'allowReturn'=>false,'allowHold'=>false,'requiresAttachment'=>false];
}
function routing_event(array $actor,array $target,string $action,string $time,string $remarks): array {
    return ['id'=>uid('custody'),'movementType'=>$action,'fromUserId'=>$actor['id'],'toUserId'=>$target['id'],'fromLocation'=>$actor['name'],'toLocation'=>$target['name'],'timestamp'=>$time,'remarks'=>$remarks,'actorId'=>$actor['id'],'actorName'=>$actor['name']];
}
function routing_save(PDO $pdo,array $doc,bool $existing=false): void {
    $files=array_fill_keys(array_column($doc['attachments'],'id'),true);
    $project=p2_project(['documents'=>[$doc['id']=>['value'=>$doc,'raw'=>p2_json($doc)]],'workflowTemplates'=>[]],$files);
    if (!$existing) { p2_write_project($pdo,$project);return; }
    p2_put($pdo,'documents',$project['documents'][0]);
    // Update the ended assignment and insert its successor. Custody is append
    // only; attachments and earlier transfers stay untouched.
    foreach (array_slice($project['document_workflow_steps'],-2) as $step) p2_put($pdo,'document_workflow_steps',$step);
    p2_put($pdo,'document_custody_history',end($project['document_custody_history']));
}
function routing_register(PDO $pdo,array $user,array $data): array {
    $state=routing_reference($pdo); require_cap($state,$user,'canIntake');
    fail_unless(($data['classification']??'')==='Others','Dynamic routing is available only for Others documents.');
    fail_unless((bool)array_filter($state['classifications'],fn($c)=>$c['classification']==='Others'),'Choose a configured classification.');
    $type=required($data,'documentType');
    $data['documentType']=$type;
    // Missing matches alone permit dynamic routing; ambiguity remains an error.
    fail_unless(resolve_workflow($state,$data,true)===null,'This document has a predefined workflow. Use normal registration.',409);
    $person=routing_person($pdo,required($data,'initialAssigneeId',64));
    $title=required($data,'title',300); $office=required($data,'sourceOffice'); $barcode=required($data,'barcode');
    $q=$pdo->prepare('SELECT id FROM documents WHERE barcode=? OR tracking_number=? LIMIT 1'); $q->execute([$barcode,$barcode]);
    fail_unless(!$q->fetch(),'This barcode is already registered.',409);
    $q=$pdo->prepare("SELECT id FROM app_records WHERE collection IN ('leaveApplications','ewpRecords','payrollItems','payrollBatches') AND (JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.barcode'))=? OR JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.trackingNumber'))=? OR JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.batchBarcode'))=? OR JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.batchNumber'))=?) LIMIT 1");$q->execute([$barcode,$barcode,$barcode,$barcode]);
    fail_unless(!$q->fetch(),'This barcode is already registered.',409);
    $id=uid('doc');$time=now();
    $doc=['id'=>$id,'trackingNumber'=>$barcode,'barcode'=>$barcode,'title'=>$title,'subject'=>$data['subject']??$title,'sourceType'=>choice($data['sourceType']??'Internal',['Internal','External'],'source type'),'sourceOffice'=>$office,'senderName'=>$data['senderName']??$user['name'],'classification'=>'Others','documentType'=>$type,'priority'=>choice($data['priority']??'Routine',['Routine','Priority','Urgent'],'priority'),'description'=>$data['description']??'','dateReceived'=>$time,'dateEncoded'=>$time,'status'=>'In_Progress','routingMode'=>'dynamic','routingRevision'=>1,'workflowTemplateId'=>null,'workflowVersion'=>null,'currentStepNumber'=>1,'totalSteps'=>1,'currentLocation'=>$person['name'],'workflowSteps'=>[routing_step($person,1,$time)],'attachments'=>attach_files($pdo,$user,$data['files']??[],$id),'encodedBy'=>['userId'=>$user['id'],'userName'=>$user['name']],'custodyHistory'=>[routing_event($user,$person,'DOCKETED_SENT',$time,(string)($data['description']??''))]];
    routing_save($pdo,$doc); audit($pdo,$user,'DOCUMENT_REGISTERED',$id,'Docketed and sent to '.$person['name'],'',$barcode);
    return $doc;
}
function routing_action(PDO $pdo,array $user,array $data): array {
    $id=required($data,'documentId');
    $q=$pdo->prepare('SELECT source_json FROM documents WHERE id=? FOR UPDATE');$q->execute([$id]);$json=$q->fetchColumn();
    fail_unless($json!==false,'Record not found.',404);$doc=json_decode($json,true,64,JSON_THROW_ON_ERROR);
    fail_unless(($doc['routingMode']??'')==='dynamic','Use the predefined workflow actions for this document.',409);
    fail_unless($doc['status']==='In_Progress','This document has already been completed.',409);
    $n=$doc['currentStepNumber']-1;$step=&$doc['workflowSteps'][$n];
    fail_unless(($step['assignedTo']['userId']??'')===$user['id'],'Only the active assignee may forward or complete this document.',403);
    fail_unless(isset($data['routingRevision']) && $data['routingRevision']===$doc['routingRevision'],'The assignment changed. Refresh and review the document.',409);
    $action=choice($data['action']??'', ['forward','complete'],'routing action');$remarks=required($data,'remarks',10000);$time=now();
    $target=$action==='forward'?routing_person($pdo,required($data,'targetUserId',64)):$user;
    fail_unless($action!=='forward' || $target['id']!==$user['id'],'Choose another employee to forward to.');
    $step['status']='Completed';$step['isCurrent']=false;$step['completedAt']=$time;$step['completedBy']=['userId'=>$user['id'],'userName'=>$user['name'],'userRole'=>$user['roleTitle']];$step['actionTaken']=$action==='forward'?'Forwarded':'Completed';$step['remarks']=$remarks;unset($step);
    if ($action==='forward') {
        $doc['currentStepNumber']++;$doc['totalSteps']++;$doc['workflowSteps'][]=routing_step($target,$doc['currentStepNumber'],$time);$doc['currentLocation']=$target['name'];
    } else {
        $doc['status']='Archived';$doc['completedAt']=$time;$doc['completedBy']=['userId'=>$user['id'],'userName'=>$user['name']];
    }
    $doc['routingRevision']++;$doc['custodyHistory'][]=routing_event($user,$target,$action==='forward'?'FORWARDED':'COMPLETED',$time,$remarks);
    routing_save($pdo,$doc,true);audit($pdo,$user,$action==='forward'?'DOCUMENT_FORWARDED':'DOCUMENT_COMPLETED',$id,$action==='forward'?'Forwarded to '.$target['name']:'Document completed',$remarks,$doc['trackingNumber']);
    return $doc;
}

function routing_delete(PDO $pdo,array $user,array $data): array {
    require_cap(document_repository_role_state($pdo,$user),$user,'canAdmin');
    $id=required($data,'documentId');
    $q=$pdo->prepare('SELECT source_json FROM documents WHERE id=? FOR UPDATE');$q->execute([$id]);$json=$q->fetchColumn();
    fail_unless($json!==false,'Record not found.',404);
    $doc=json_decode($json,true,64,JSON_THROW_ON_ERROR);
    fail_unless(($doc['routingMode']??'')==='dynamic' && ($doc['classification']??'')==='Others','Use the existing delete action for predefined workflow documents.',409);
    // Retain a deletion audit, including the custody chain, before removing
    // the normalized record. The endpoint owns the enclosing transaction.
    audit($pdo,$user,'DOCUMENT_DELETED',$id,'Document deleted',p2_json(['routingMode'=>'dynamic','status'=>$doc['status'],'custodyHistory'=>$doc['custodyHistory']??[]]),$doc['trackingNumber']);
    p2_write_project($pdo,[],[$id]);
    // Match ordinary document deletion: revoke attachment metadata/access.
    $pdo->prepare('DELETE FROM app_files WHERE owner_id=?')->execute([$id]);
    return ['id'=>$id,'deleted'=>true];
}
