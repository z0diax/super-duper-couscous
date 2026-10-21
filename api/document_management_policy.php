<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';

const DOCUMENT_METADATA_FIELDS=['title'=>300,'subject'=>2000,'description'=>10000,'sourceOffice'=>190,'senderName'=>190,'senderContact'=>190,'sourceType'=>32,'priority'=>32];

/** null means an incomplete/unknown snapshot: deny modifications safely. */
function document_processing_started(array $doc,array $events=[]): ?bool {
    if (empty($doc['encodedBy']['userId']) || empty($doc['dateEncoded']) || !is_array($doc['workflowSteps']??null) || !$doc['workflowSteps'] || !is_array($doc['custodyHistory']??null) || !$doc['custodyHistory']) return null;
    $registrationConfirmed=false;
    foreach ($events as $event) {
      if (($event['documentId']??'')!==$doc['id']) continue;
      if (($event['actionType']??'')==='DOCUMENT_REGISTERED' && ($event['actorId']??'')===$doc['encodedBy']['userId']) $registrationConfirmed=true;
      if (in_array($event['actionType']??'',[
        'STEP_COMPLETED','STEP_RETURNED','DOCUMENT_APPROVED','DOCUMENT_RELEASED','DOCUMENT_DISAPPROVED','TASK_CLAIMED','TASK_REASSIGNED','REMARK_ADDED','ATTACHMENT_UPLOADED','DOCUMENT_PLACED_ON_HOLD','DOCUMENT_COMPLIANCE_SUBMITTED','DOCUMENT_HOLD_RESOLVED','DOCUMENT_SENT_OUTSIDE_HRMDO','DOCUMENT_RETURNED_TO_HRMDO','DOCUMENT_FORWARDED','DOCUMENT_COMPLETED',
      ],true)) return true;
      if (!in_array($event['actionType']??'', ['DOCUMENT_REGISTERED','DOCUMENT_EDITED','DOCUMENT_CORRECTED'],true)) return null;
    }
    foreach (['heldAt','heldByUserId','holdReason','complianceSubmittedAt','releasedDetails','completedAt','completedBy'] as $field) if (!empty($doc[$field])) return true;
    $dynamic=($doc['routingMode']??'')==='dynamic';
    $initial=$dynamic?'DOCKETED_SENT':'INTAKE';
    foreach ($doc['custodyHistory'] as $index=>$event) {
        if (!is_array($event) || empty($event['movementType'])) return null;
        if ($index>0 || $event['movementType']!==$initial) return true;
        if (($event['actorId']??'')!==$doc['encodedBy']['userId'] || ($event['timestamp']??'')!==$doc['dateEncoded']) return null;
    }
    $current=(int)($doc['currentStepNumber']??0);
    if ($current<1 || $current>count($doc['workflowSteps']) || (int)($doc['totalSteps']??0)!==count($doc['workflowSteps'])) return null;
    $automaticIntake=false;
    foreach ($doc['workflowSteps'] as $index=>$step) {
        if (!is_array($step) || (int)($step['stepNumber']??0)!==$index+1 || !in_array($step['status']??'',['Pending','In_Progress','Completed'],true)) return null;
        // This exact first Receive completion is produced by registration,
        // not by an officer processing the document after docketing.
        $intake=!$dynamic && $index===0 && count($doc['workflowSteps'])>1 && ($step['stageType']??'INTERNAL_PROCESSING')==='INTERNAL_PROCESSING' && $step['status']==='Completed' &&
            ($step['requiredAction']??'')==='Receive' && ($step['assignmentSource']??'')!=='personnel_pool' &&
            ($step['actionTaken']??'')==='Document intake and initial docketing completed during registration.' &&
            ($step['completedAt']??'')===$doc['dateEncoded'] && ($step['completedBy']['userId']??'')===$doc['encodedBy']['userId'];
        if ($intake) { $automaticIntake=true; continue; }
        foreach (['completedAt','completedBy','actionTaken','remarks','externalHandoff','externalReturn'] as $field) if (!empty($step[$field])) return true;
        if ($step['status']==='Completed') return true;
    }
    if ($dynamic && ($current!==1 || count($doc['workflowSteps'])!==1 || empty($doc['workflowSteps'][0]['assignedTo']['userId']))) return null;
    if (!$dynamic && $current!==($automaticIntake?2:1)) return null;
    $active=$doc['workflowSteps'][$current-1];
    if ($active['status']!=='In_Progress' || empty($active['isCurrent']) || empty($active['startedAt']) || !in_array($active['assignedTo']['type']??'',['Person','Role','Team','System'],true)) return null;
    foreach (array_slice($doc['workflowSteps'],$current) as $future) if ($future['status']!=='Pending' || !empty($future['isCurrent'])) return null;
    if (in_array($doc['status']??'',['On_Hold','Returned','Awaiting_External_Return','Released','Archived','Disapproved'],true)) return true;
    if (!in_array($doc['status']??'',['In_Progress','Under_Review','Pending_Approval','Ready_For_Release','Awaiting_External_Handoff'],true)) return null;
    if (!$registrationConfirmed) return null;
    return false;
}

function document_management_permissions(array $doc,array $user,array $roles,array $events=[]): array {
    unset($doc['management']);
    $started=document_processing_started($doc,$events);
    $protected=!empty($doc['isLegacyV1']) || ($doc['classification']??'')==='Payroll' || in_array($doc['status']??'',['Released','Archived','Disapproved','Completed','Cancelled'],true);
    $admin=has_cap($roles,$user,'canAdmin');
    $creator=($doc['encodedBy']['userId']??'')===$user['id'];
    $editable=!$protected && $started!==null && ($admin || ($creator && !$started));
    return ['canEdit'=>$editable,'canDelete'=>!$protected && $started===false && ($admin || $creator),
        'mode'=>$editable?($started?'correction':'edit'):null,'processingStarted'=>$started,
        'version'=>hash('sha256',p2_json($doc).':'.json_encode($started)),
        'restriction'=>$protected?'Historical, concluded and Payroll records are protected.':($started===null?'Processing state could not be verified.':($started?'Processing has begun. Only an administrator may correct descriptive metadata.':null))];
}

function document_management_assert_delete(array $doc,array $user,array $roles,array $events=[]): void {
    $policy=document_management_permissions($doc,$user,$roles,$events);
    fail_unless(($doc['encodedBy']['userId']??'')===$user['id'] || has_cap($roles,$user,'canAdmin'),'Only the creator or an administrator may delete this document.',403);
    fail_unless($policy['canDelete'],$policy['restriction']??'Processing has begun. This document cannot be deleted.',409);
}
