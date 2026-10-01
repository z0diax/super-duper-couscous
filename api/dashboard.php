<?php
declare(strict_types=1);
require_once __DIR__.'/document_repository.php';
require_once __DIR__.'/payroll_repository.php';
fail_unless(($_SERVER['REQUEST_METHOD']??'')==='GET','Method not allowed.',405);
$pdo=database();$user=authenticated_user($pdo);
fail_unless(getenv('HRMDO_DASHBOARD_TARGETED_READS_ENABLED')==='1','Targeted Dashboard reads are disabled.',503);
fail_unless(!$_GET,'Invalid query parameter.',400);
$roleState=document_repository_role_state($pdo,$user);
[$scope,$scopeParams]=document_repository_visibility($roleState,$user);
[$actionable,$actionParams]=document_repository_task_actionable($user,true);
$active="d.status NOT IN ('Released','Archived','Disapproved')";
$current="(d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1)";
$from=' FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number';
$counts=$pdo->prepare("SELECT COUNT(*) total,COALESCE(SUM($active),0) in_flight,COALESCE(SUM(d.status='Pending_Approval'),0) pending,COALESCE(SUM(d.status IN ('Released','Disapproved')),0) concluded,COALESCE(SUM(d.status='Awaiting_External_Return'),0) outside,COALESCE(SUM($active AND $actionable),0) actionable$from WHERE $current AND $scope");
document_repository_bind($counts,[...$actionParams,...$scopeParams]);$counts->execute();$metrics=array_map('intval',$counts->fetch(PDO::FETCH_ASSOC));
$tasks=$pdo->prepare("SELECT d.id,d.tracking_number,d.title,d.document_type,d.source_office,d.status,d.current_step_number,d.total_steps,s.name AS current_step_name$from WHERE $current AND $scope AND $active AND $actionable ORDER BY d.id ASC LIMIT 25");
document_repository_bind($tasks,[...$scopeParams,...$actionParams]);$tasks->execute();
$outside=$pdo->prepare("SELECT d.id,d.tracking_number,d.document_type,d.current_location,d.source_json$from WHERE $current AND $scope AND d.status='Awaiting_External_Return' ORDER BY d.id ASC LIMIT 5");
document_repository_bind($outside,$scopeParams);$outside->execute();$outsideRows=[];
foreach($outside as $row){$source=json_decode($row['source_json'],true,64,JSON_THROW_ON_ERROR);$step=null;foreach($source['workflowSteps']??[] as $candidate)if(($candidate['stepNumber']??null)===$source['currentStepNumber']){$step=$candidate;break;}
    $outsideRows[]=['id'=>$row['id'],'trackingNumber'=>$row['tracking_number'],'documentType'=>$row['document_type'],'currentLocation'=>$row['current_location'],'destinationOffice'=>$step['externalHandoff']['destinationOffice']??null];}
// Scan audit rows in sequence order, emitting only actor-owned or currently visible subjects.
// The stream and response remain bounded even when other users generated recent events.
$subject=[];$subject['document']=$pdo->prepare("SELECT 1 FROM documents d WHERE d.id=? AND $scope LIMIT 1");
$payrollCaps=payroll_read_caps($pdo,$user);[$batchScope,$batchParams]=payroll_full_batch_sql($user,$payrollCaps);[$itemScope,$itemParams]=payroll_item_sql($user,$payrollCaps);
$subject['batch']=$pdo->prepare("SELECT 1 FROM payroll_read_batches b WHERE b.id=? AND $batchScope LIMIT 1");
$subject['item']=$pdo->prepare("SELECT 1 FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id WHERE i.id=? AND $itemScope LIMIT 1");
$subject['single']=$pdo->prepare("SELECT 1 FROM payroll_read_items i JOIN documents d ON d.id=i.document_id WHERE i.id=? AND i.batch_id='SINGLE_ENTRY' AND $scope LIMIT 1");
[$visibleBatch,$visibleBatchParams]=payroll_batch_sql($user,$payrollCaps);
$subject['group']=$pdo->prepare("SELECT 1 FROM payroll_read_groups g JOIN payroll_read_batches b ON b.id=g.batch_id WHERE g.id=? AND (g.processor_id=? OR (g.assigned_team<>'' AND g.assigned_team IN (?,?))) AND $visibleBatch LIMIT 1");
$subject['leave']=$pdo->prepare("SELECT 1 FROM app_records WHERE collection='leaveApplications' AND id=? LIMIT 1");
$subject['ewp']=$pdo->prepare("SELECT 1 FROM app_records WHERE collection='ewpRecords' AND id=? LIMIT 1");
$leaveVisible=can_view_leave_application($roleState,$user,[]);$ewpVisible=can_view_ewp_records($user);
$audits=[];$cursor=PHP_INT_MAX;
while(count($audits)<4){
    $chunk=$pdo->prepare('SELECT sequence,record_json FROM app_audit WHERE sequence<? ORDER BY sequence DESC LIMIT 100');$chunk->bindValue(1,$cursor,PDO::PARAM_INT);$chunk->execute();$rows=$chunk->fetchAll(PDO::FETCH_ASSOC);if(!$rows)break;
    foreach($rows as $row){$cursor=(int)$row['sequence'];$event=json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR);$id=(string)($event['documentId']??'');$visible=($event['actorId']??null)===$user['id'];
        if(!$visible&&$id!==''){
            $checks=[['document',[$id,...$scopeParams]],['batch',[$id,...$batchParams]],['item',[$id,...$itemParams]],['single',[$id,...$scopeParams]],['group',[$id,$user['id'],$user['division'],$user['office'],...$visibleBatchParams]]];
            if($leaveVisible)$checks[]=['leave',[$id]];if($ewpVisible)$checks[]=['ewp',[$id]];
            foreach($checks as [$kind,$bind]){$query=$subject[$kind];document_repository_bind($query,$bind);$query->execute();if($query->fetchColumn()){$visible=true;break;}}
        }
        if($visible)$audits[]=['id'=>$event['id'],'summary'=>$event['summary'],'actorName'=>$event['actorName'],'timestamp'=>$event['timestamp']];
        if(count($audits)===4)break;
    }
    if(count($rows)<100)break;
}
respond(['metrics'=>$metrics,'tasks'=>$tasks->fetchAll(PDO::FETCH_ASSOC),'outside'=>$outsideRows,'activity'=>$audits]);
