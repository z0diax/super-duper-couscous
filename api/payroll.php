<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
function payroll_rule(array $s,string $classification): array {
    if ($classification==='Job Order (JOW)') $classification='JOW/COS';
    foreach ($s['employmentRoutingRules'] as $r) if ($r['classification']===$classification) {
        $mode=$r['assignmentMode']??'fixed';
        if ($mode==='fixed' && ($r['primaryProcessorId']??'')!=='') index_of($s['users'],$r['primaryProcessorId']);
        elseif ($mode==='pool') fail_unless(count($r['eligibleProcessorIds']??[])>0,'Choose eligible personnel for '.$classification.' in Employment Routing Rules.');
        elseif ($mode==='team') fail_unless(trim((string)($r['assignedTeam']??''))!=='','Choose a team for '.$classification.' in Employment Routing Rules.');
        else if ($mode!=='fixed') throw new ApiError('The '.$classification.' routing rule is invalid.');
        else throw new ApiError('Assign a payroll processor for '.$classification.' in Employment Routing Rules.');
        return $r;
    }
    throw new ApiError('Assign a payroll processor for '.$classification.' in Employment Routing Rules.');
}
function payroll_route_target(array $s,array $rule,?string $selectedId): array {
    $mode=$rule['assignmentMode']??'fixed';
    if ($mode==='team') return ['id'=>'','name'=>$rule['assignedTeam'],'roleTitle'=>'Team queue','team'=>$rule['assignedTeam']];
    $id=$mode==='pool'?(string)$selectedId:(string)$rule['primaryProcessorId'];
    if ($mode==='pool') fail_unless($id!=='' && in_array($id,$rule['eligibleProcessorIds']??[],true),'Choose an eligible processor for '.$rule['classification'].'.');
    $target=$s['users'][index_of($s['users'],$id)]; return ['id'=>$target['id'],'name'=>$target['name'],'roleTitle'=>$target['roleTitle'],'team'=>''];
}
function payroll_item_audit(array &$item,array $u,string $action,string $details,?string $previousState=null,?string $newState=null): void {
    $event=['id'=>uid('event'),'timestamp'=>now(),'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>$action,'details'=>$details];
    if ($previousState!==null) $event['previousState']=$previousState;
    if ($newState!==null) $event['newState']=$newState;
    $item['auditHistory'][]=$event; $item['updatedAt']=now();
}
function payroll_item_is_held(array $item): bool { return ($item['status']??'')==='On_Hold' || ($item['verificationStatus']??'')==='Exception'; }
function payroll_item_is_ready(array $item): bool {
    return !payroll_item_is_held($item) && ($item['verificationStatus']??'')==='Passed' && in_array($item['employmentClassification']??null,['JOW/COS','Job Order (JOW)','Casual','Regular'],true);
}
function payroll_item_stage(array $item): string {
    return $item['currentStage']??(empty($item['workGroupId'])?'initial_checking':'verification_signing');
}
function calculate_payroll_batch_progress(array $batch,array $items): array {
    // Payroll items are the operational source of truth. This summary is only for display.
    $total=count($items); $initialActive=0; $initialOnHold=0; $managementActive=0; $managementOnHold=0;
    $ready=0; $released=0; $onHold=0;
    foreach ($items as $item) {
        $stage=payroll_item_stage($item); $held=payroll_item_is_held($item);
        if ($stage==='initial_checking') { $initialActive++; if ($held) $initialOnHold++; }
        if ($stage==='verification_signing') { if ($held) $managementOnHold++; else $managementActive++; }
        if (($item['status']??'')==='Ready_For_Release') $ready++;
        if (($item['status']??'')==='Released') $released++;
        if ($held) $onHold++;
    }
    $managementReached=$total-$initialActive;
    if ($total>0 && $released===$total) { $derived='COMPLETED'; $label='Completed'; }
    elseif ($onHold>0 && ($managementReached>0 || $ready>0 || $released>0)) { $derived='PROCESSING_WITH_HOLDS'; $label='Processing with Holds'; }
    elseif ($onHold>0 && $initialActive===$onHold) { $derived='ON_HOLD'; $label='On Hold'; }
    elseif (($ready>0 || $released>0) && ($initialActive>0 || $managementActive>0 || $managementOnHold>0)) { $derived='PARTIALLY_READY_FOR_RELEASE'; $label='Partially Ready for Release'; }
    elseif ($ready>0 || $released>0) { $derived='READY_FOR_RELEASE'; $label='Ready for Release'; }
    elseif ($managementActive>0 || $managementOnHold>0) { $derived='IN_PROCESS'; $label='In Process'; }
    else { $derived='INITIAL_CHECKING'; $label='Initial Checking'; }
    return [
        'totalItems'=>$total, 'docketed'=>$total, 'stage1Completed'=>$total,
        'initialChecking'=>['active'=>$initialActive,'completed'=>$total-$initialActive,'onHold'=>$initialOnHold],
        'management'=>['reached'=>$managementReached,'active'=>$managementActive,'completed'=>$ready+$released,'onHold'=>$managementOnHold,'notReached'=>$initialActive],
        'release'=>['ready'=>$ready,'released'=>$released,'notReached'=>$total-$ready-$released],
        'onHoldTotal'=>$onHold,'exceptionCount'=>$onHold,'completedCount'=>$released,
        'derivedStatus'=>$derived,'displayStatus'=>$label,
    ];
}
function payroll_refresh_batch_aggregate(array &$s,array &$batch): array {
    $items=array_values(array_filter($s['payrollItems'],fn($item)=>$item['batchId']===$batch['id']));
    $progress=calculate_payroll_batch_progress($batch,$items); $batch['progress']=$progress;
    // Deprecated compatibility fields. They are derived only and are never routing gates.
    $batch['status']=$progress['derivedStatus']; $batch['currentStageName']=$progress['displayStatus'];
    $batch['currentStage']=$progress['derivedStatus']==='COMPLETED'?'completed':($progress['release']['ready']>0||$progress['release']['released']>0?'release':($progress['management']['reached']>0?'verification_signing':'initial_checking'));
    $batch['updatedAt']=now(); return $progress;
}
function payroll_attach_batch_progress(array &$s): void {
    foreach ($s['payrollBatches'] as &$batch) payroll_refresh_batch_aggregate($s,$batch);
    unset($batch);
}
function payroll_batch_workflow(array $s,string $documentType): array {
    // A batch is docketed before its items are classified. Select the configured
    // Payroll template by document type without requiring an employment value that
    // does not exist yet. Prefer an All-employment template when it has the same
    // document-type match; a unique JOW/COS, Casual, or Regular template remains
    // valid for batch intake.
    $matches=[];
    foreach ($s['workflowTemplates'] as $workflow) {
        if (empty($workflow['isActive']) || empty($workflow['steps']) || ($workflow['classification']??null)!=='Payroll') continue;
        $types=$workflow['documentTypes']??[$workflow['documentType']??''];
        $exact=count(array_filter($types,fn($type)=>strcasecmp((string)$type,$documentType)===0))>0;
        $all=count(array_filter($types,fn($type)=>in_array(strtolower((string)$type),['all','default'],true)))>0;
        if (!$exact && !$all) continue;
        $matches[]=['workflow'=>$workflow,'typeScore'=>$exact?2:1,'generalEmployment'=>($workflow['employmentClassification']??'All')==='All'?1:0];
    }
    usort($matches,fn($a,$b)=>($b['typeScore']<=>$a['typeScore']) ?: ($b['generalEmployment']<=>$a['generalEmployment']));
    fail_unless(count($matches)>0,'Configure an active Payroll workflow for '.$documentType.'.',422);
    fail_unless(count($matches)<2 || $matches[0]['typeScore']!==$matches[1]['typeScore'] || $matches[0]['generalEmployment']!==$matches[1]['generalEmployment'],'Multiple active Payroll workflows match '.$documentType.'. Keep one matching workflow or configure an All-employment batch workflow.',422);
    $workflow=$matches[0]['workflow'];
    fail_unless(count($workflow['steps']??[])>=2,'The selected Payroll workflow needs at least two configured internal phases.',422);
    $docketing=$workflow['steps'][0]; $initialChecking=$workflow['steps'][1];
    // Payroll registration completes the first configured internal phase. The
    // second configured internal phase supplies the Initial Checking assignment.
    // Names and action labels remain entirely template-defined.
    fail_unless(($docketing['stageType']??'INTERNAL_PROCESSING')==='INTERNAL_PROCESSING','Phase 1 of the selected Payroll workflow must be an internal phase.',422);
    fail_unless(($initialChecking['stageType']??'INTERNAL_PROCESSING')==='INTERNAL_PROCESSING','Phase 2 of the selected Payroll workflow must be an internal phase.',422);
    return $workflow;
}
function payroll_desk_from_workflow_step(array $s,array $step,string $stage): array {
    $type=$step['assigneeType']??'';
    fail_unless(in_array($type,['Person','Role','Team'],true),'The configured Payroll Initial Checking assignee is invalid.',422);
    $desk=['stage'=>$stage,'assignmentType'=>$type,'userName'=>$step['assigneeName']??'','roleTitle'=>$step['assigneeName']??''];
    if ($type==='Person') {
        $user=$s['users'][index_of($s['users'],(string)($step['assigneeUserId']??''))];
        $desk['userId']=$user['id']; $desk['userName']=$user['name']; $desk['roleTitle']=$user['roleTitle'];
    } elseif ($type==='Role') {
        $roleId=(string)($step['assigneeRole']??''); index_of($s['systemRoles'],$roleId);
        $desk['roleId']=$roleId;
    } else {
        $desk['team']=(string)($step['assigneeTeam']??'');
    }
    return $desk;
}
function payroll_desk_matches_user(array $s,array $u,array $desk): bool {
    if (has_cap($s,$u,'canSupervise')) return true;
    if (!empty($desk['userId'])) return $desk['userId']===$u['id'];
    if (($desk['assignmentType']??'')==='Role') return ($desk['roleId']??null)===$u['role'];
    return ($desk['assignmentType']??'')==='Team' && !empty($desk['team']) && in_array($desk['team'],[$u['division'],$u['office']],true);
}
function payroll_initial_check_authorized(array $s,array $u,array $batch): bool {
    // initialCheckingDesk is retained even while some items are in later parallel groups.
    $desk=$batch['initialCheckingDesk']??$batch['assignedDesk']??[];
    return payroll_desk_matches_user($s,$u,$desk);
}
function payroll_item_stage_authorized(array $s,array $u,array $batch,array $item): bool {
    $stage=payroll_item_stage($item);
    if ($stage==='initial_checking') return payroll_initial_check_authorized($s,$u,$batch);
    if ($stage==='verification_signing') return ($item['assignedToUserId']??null)===$u['id'] || has_cap($s,$u,'canSupervise');
    if ($stage==='release') { foreach ($batch['workflowStages']??[] as $configured) if (($configured['stageNumber']??0)===4) return payroll_desk_matches_user($s,$u,$configured['assignedTo']??[]); }
    return false;
}
function payroll_batch_stage_history(array $s,array $u,array $workflow,array $initialDesk): array {
    $now=now(); $releaseStep=null;
    foreach (array_slice($workflow['steps'],2) as $step) if (($step['requiredAction']??'')==='Release & Archive') { $releaseStep=$step; break; }
    $releaseDesk=$releaseStep ? payroll_desk_from_workflow_step($s,$releaseStep,'release') : ['stage'=>'release','assignmentType'=>'Role','userName'=>'Releasing Officer','roleTitle'=>'Releasing Officer'];
    return [
        ['stageNumber'=>1,'name'=>$workflow['steps'][0]['name'],'status'=>'Completed','assignedTo'=>payroll_desk_from_workflow_step($s,$workflow['steps'][0],'receiving'),'completedBy'=>['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']],'completedAt'=>$now],
        ['stageNumber'=>2,'name'=>$workflow['steps'][1]['name'],'status'=>'In_Progress','assignedTo'=>$initialDesk,'allowHold'=>$workflow['steps'][1]['allowHold']??false],
        ['stageNumber'=>3,'name'=>$workflow['steps'][2]['name']??'Parallel Groups','status'=>'Pending','assignedTo'=>['stage'=>'verification_signing','assignmentType'=>'Dynamic','userName'=>'Dynamic routing by employment classification','roleTitle'=>'Payroll processors'],'dynamic'=>true,'allowHold'=>$workflow['steps'][2]['allowHold']??false],
        ['stageNumber'=>4,'name'=>$releaseStep['name']??'Release','status'=>'Pending','assignedTo'=>$releaseDesk,'allowHold'=>$releaseStep['allowHold']??false],
    ];
}
function editable_payroll_batch(array $s,array $u,array $batch): void {
    fail_unless(($batch['encodedBy']['userId']??null)===$u['id'],'Only the employee who registered this payroll batch can edit it.',403);
    $items=array_values(array_filter($s['payrollItems'],fn($item)=>$item['batchId']===$batch['id']));
    $hasStarted=array_filter($items,fn($item)=>payroll_item_stage($item)!=='initial_checking');
    $hasWorkGroups=count(array_filter($s['workGroups'],fn($group)=>$group['batchId']===$batch['id']))>0;
    fail_unless(!$hasStarted && !$hasWorkGroups,'Only a batch that is still in Initial Checking can be edited or deleted.',409);
}
function assert_editable_batch_barcodes(array $s,array $batch,array $entries,string $batchBarcode): void {
    $codes=[];
    foreach ($s['documents'] as $record) { $codes[]=$record['barcode']??''; $codes[]=$record['trackingNumber']; }
    foreach ($s['payrollBatches'] as $record) if ($record['id']!==$batch['id']) { $codes[]=$record['batchBarcode']??''; $codes[]=$record['batchNumber']; }
    foreach ($s['payrollItems'] as $record) if ($record['batchId']!==$batch['id']) $codes[]=$record['barcode'];
    $normalized=array_map('strtolower',$codes); $incoming=[];
    foreach (array_merge([$batchBarcode],array_map(fn($entry)=>$entry['barcode'],$entries)) as $barcode) {
        $key=strtolower($barcode);
        fail_unless(!in_array($key,$normalized,true) && !in_array($key,$incoming,true),'Barcode is already in use.',409);
        $incoming[]=$key;
    }
}
function payroll_action(PDO $pdo,array &$s,array $u,string $action,array $args): mixed {
    $d=$args[0]??[];
    if ($action==='registerSinglePayroll') {
        $doc=register_document($pdo,$s,$u,['title'=>required($d,'title',300),'sourceOffice'=>required($d,'office'),'classification'=>'Payroll','documentType'=>required($d,'payrollType'),'barcode'=>$d['barcode']??'','description'=>$d['remarks']??'','files'=>$d['files']??[]]);
        $s['payrollItems'][]=['id'=>uid('payroll'),'documentId'=>$doc['id'],'batchId'=>'SINGLE_ENTRY','batchNumber'=>$doc['trackingNumber'],'itemNumber'=>1,'barcode'=>$doc['barcode'],'title'=>$doc['title'],'office'=>$d['office'],'classificationType'=>$d['classificationType']??$d['payrollType'],'employmentClassification'=>null,'currentStage'=>'initial_checking','verificationStatus'=>'Pending','status'=>'Pending','auditHistory'=>[],'createdAt'=>now(),'updatedAt'=>now()];
        return $doc;
    }
    if ($action==='registerPayrollBatch') {
        require_cap($s,$u,'canIntake'); $office=required($d,'office'); $type=required($d,'payrollType');
        fail_unless(is_array($d['items']??null) && count($d['items'])>0 && count($d['items'])<=500,'A batch needs between 1 and 500 items.');
        $documentTypes=array_values(array_unique(array_map(fn($item)=>trim((string)($item['classificationType']??$type)),$d['items'])));
        $workflow=payroll_batch_workflow($s,count($documentTypes)===1?$documentTypes[0]:'All');
        $initialDesk=payroll_desk_from_workflow_step($s,$workflow['steps'][1],'initial_checking');
        $barcode=trim($d['batchBarcode']??'') ?: 'PB-'.date('Y').'-'.strtoupper(bin2hex(random_bytes(5))); assert_barcode($s,$barcode);
        $id=uid('batch'); $itemIds=[]; $codes=[$barcode];
        foreach ($d['items'] as $n=>$entry) {
            $code=required($entry,'barcode'); assert_barcode($s,$code,$codes); $codes[]=$code;
            $item=['id'=>uid('payroll'),'batchId'=>$id,'batchNumber'=>$barcode,'itemNumber'=>$n+1,'barcode'=>$code,'title'=>required($entry,'title',300),'office'=>$entry['office']??$office,'classificationType'=>$entry['classificationType']??$type,'employmentClassification'=>null,'currentStage'=>'initial_checking','verificationStatus'=>'Pending','status'=>'Pending','auditHistory'=>[],'createdAt'=>now(),'updatedAt'=>now()];
            payroll_item_audit($item,$u,'PAYROLL_ITEM_CREATED','Registered in '.$barcode); $itemIds[]=$item['id']; $s['payrollItems'][]=$item;
        }
        $timestamp=now();
        $batch=['id'=>$id,'batchNumber'=>$barcode,'batchBarcode'=>$barcode,'classification'=>'Payroll','payrollType'=>$type,'office'=>$office,'payrollPeriod'=>$d['payrollPeriod']??'','receivedFromLiaison'=>$d['receivedFromLiaison']??'','remarks'=>$d['remarks']??'','dateReceived'=>$timestamp,'dateEncoded'=>$timestamp,'encodedBy'=>['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']],'workflowTemplateId'=>$workflow['id'],'workflowVersion'=>$workflow['version'],'currentStage'=>'initial_checking','currentStageName'=>'Initial Checking','assignedDesk'=>$initialDesk,'initialCheckingDesk'=>$initialDesk,'workflowStages'=>payroll_batch_stage_history($s,$u,$workflow,$initialDesk),'workflowHistory'=>[
            ['id'=>uid('event'),'timestamp'=>$timestamp,'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'PAYROLL_BATCH_DOCKETED','details'=>'Payroll batch docketed by '.$u['name'].'.'],
            ['id'=>uid('event'),'timestamp'=>$timestamp,'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'WORKFLOW_STAGE_COMPLETED','details'=>'Stage 1 - '.$workflow['steps'][0]['name'].' completed by '.$u['name'].'.'],
            ['id'=>uid('event'),'timestamp'=>$timestamp,'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'WORKFLOW_STAGE_ASSIGNED','details'=>'Stage 2 - '.$workflow['steps'][1]['name'].' assigned to '.$initialDesk['userName'].'.'],
        ],'totalItemsCount'=>count($itemIds),'itemIds'=>$itemIds,'workGroupIds'=>[],'attachments'=>attach_files($pdo,$u,$d['files']??[],$id),'status'=>'Active','createdAt'=>$timestamp,'updatedAt'=>$timestamp];
        $s['payrollBatches'][]=$batch;
        $batchIndex=count($s['payrollBatches'])-1;
        payroll_refresh_batch_aggregate($s,$s['payrollBatches'][$batchIndex]);
        return $s['payrollBatches'][$batchIndex];
    }
    if ($action==='updatePayrollBatch') {
        $d=$args[0]??[]; $i=index_of($s['payrollBatches'],required($d,'id')); $batch=&$s['payrollBatches'][$i]; editable_payroll_batch($s,$u,$batch);
        $entries=$d['items']??[]; fail_unless(is_array($entries) && count($entries)===count($batch['itemIds']),'Every registered payroll item must be included when editing a batch.');
        $existing=array_flip($batch['itemIds']); $received=[]; $clean=[];
        foreach ($entries as $entry) {
            $itemId=required($entry,'id'); fail_unless(isset($existing[$itemId]) && !isset($received[$itemId]),'Invalid payroll item in this batch.'); $received[$itemId]=true;
            $clean[]=['id'=>$itemId,'barcode'=>required($entry,'barcode'),'title'=>required($entry,'title',300),'office'=>required($entry,'office'),'classificationType'=>required($entry,'classificationType')];
        }
        $batchBarcode=required($d,'batchBarcode'); assert_editable_batch_barcodes($s,$batch,$clean,$batchBarcode);
        foreach ($clean as $entry) { $itemIndex=index_of($s['payrollItems'],$entry['id']); $item=&$s['payrollItems'][$itemIndex]; $item['barcode']=$entry['barcode']; $item['title']=$entry['title']; $item['office']=$entry['office']; $item['classificationType']=$entry['classificationType']; $item['updatedAt']=now(); unset($item); }
        $batch['batchBarcode']=$batchBarcode; $batch['batchNumber']=$batchBarcode; $batch['office']=required($d,'office'); $batch['payrollType']=required($d,'payrollType');
        $batch['payrollPeriod']=is_string($d['payrollPeriod']??null)?trim($d['payrollPeriod']):''; $batch['receivedFromLiaison']=is_string($d['receivedFromLiaison']??null)?trim($d['receivedFromLiaison']):''; $batch['remarks']=is_string($d['remarks']??null)?trim($d['remarks']):''; $batch['updatedAt']=now();
        return $batch;
    }
    if ($action==='deletePayrollBatch') {
        require_cap($s,$u,'canAdmin'); $i=index_of($s['payrollBatches'],(string)($args[0]??'')); $batch=$s['payrollBatches'][$i];
        $itemIds=$batch['itemIds']; $s['payrollBatches']=array_values(array_filter($s['payrollBatches'],fn($record)=>$record['id']!==$batch['id']));
        $s['payrollItems']=array_values(array_filter($s['payrollItems'],fn($record)=>!in_array($record['id'],$itemIds,true)));
        $s['workGroups']=array_values(array_filter($s['workGroups'],fn($record)=>$record['batchId']!==$batch['id']));
        $pdo->prepare('DELETE FROM app_files WHERE owner_id=?')->execute([$batch['id']]);
        return true;
    }
    if (in_array($action,['placePayrollItemHold','submitPayrollItemCompliance','resumePayrollItemHold'],true)) {
        $i=index_of($s['payrollItems'],(string)$d); $item=&$s['payrollItems'][$i]; fail_unless(($item['batchId']??'')!=='SINGLE_ENTRY','Use the document workflow hold action for a single payroll.',422);
        $batchIndex=index_of($s['payrollBatches'],$item['batchId']); $batch=&$s['payrollBatches'][$batchIndex]; $stage=payroll_item_stage($item); $stageNumber=['initial_checking'=>2,'verification_signing'=>3,'release'=>4][$stage]??0;
        $configured=null; foreach ($batch['workflowStages']??[] as $candidate) if (($candidate['stageNumber']??0)===$stageNumber) { $configured=$candidate; break; }
        if ($action==='placePayrollItemHold') {
            fail_unless(payroll_item_stage_authorized($s,$u,$batch,$item),'This payroll item is assigned to another officer.',403); fail_unless(!empty($configured['allowHold']),'Holding is disabled for this payroll phase.',409); fail_unless(($item['status']??'')!=='On_Hold','This payroll item is already on hold.',409);
            $hold=$args[1]??[]; fail_unless(is_array($hold),'Invalid hold details.'); $previous=$item['status']??'In_Progress'; $item['holdReason']=required($hold,'reason',2000); $item['holdRemarks']=trim((string)($hold['remarks']??'')); $item['holdStage']=$stage; $item['heldAt']=now(); $item['heldByUserId']=$u['id']; $item['heldByName']=$u['name']; $item['status']='On_Hold'; $item['verificationStatus']='Exception'; unset($item['holdResolvedAt'],$item['complianceRemarks'],$item['complianceAttachments']); payroll_item_audit($item,$u,'PAYROLL_ITEM_PLACED_ON_HOLD','Phase '.$stageNumber.' hold: '.$item['holdReason'],$previous,'On_Hold');
        } elseif ($action==='submitPayrollItemCompliance') {
            fail_unless(($item['status']??'')==='On_Hold','This payroll item is not awaiting compliance.',409); fail_unless(($batch['encodedBy']['userId']??null)===$u['id'] || has_cap($s,$u,'canAdmin'),'Only the batch creator can submit compliance.',403);
            $submission=$args[1]??[]; fail_unless(is_array($submission),'Invalid compliance details.'); $item['complianceRemarks']=required($submission,'remarks',4000); $attachments=attach_files($pdo,$u,$submission['files']??[],$item['id']); if ($attachments) $item['complianceAttachments']=$attachments; $item['status']='Ready_For_Recheck'; payroll_item_audit($item,$u,'PAYROLL_COMPLIANCE_RECEIVED','Compliance submitted for Phase '.$stageNumber,'On_Hold','Ready_For_Recheck');
        } else {
            $resumeFrom=$item['status']??''; fail_unless(in_array($resumeFrom,['On_Hold','Ready_For_Recheck'],true),'This payroll item is not in an active hold cycle.',409); fail_unless(payroll_item_stage_authorized($s,$u,$batch,$item),'Only the assigned phase processor can resume this item.',403);
            $item['status']=$stage==='initial_checking'?'Ready':($stage==='release'?'Ready_For_Release':'In_Progress'); $item['verificationStatus']=$stage==='initial_checking'?'Passed':'Pending'; $item['holdResolvedAt']=now(); $item['holdResolvedByUserId']=$u['id']; $item['holdResolvedByName']=$u['name']; payroll_item_audit($item,$u,'PAYROLL_HOLD_RESOLVED',$resumeFrom==='On_Hold'?'Hold cleared and resumed in Phase '.$stageNumber:'Compliance rechecked and resumed in Phase '.$stageNumber,$resumeFrom,$item['status']);
        }
        payroll_refresh_batch_aggregate($s,$batch); return true;
    }
    if (in_array($action,['updatePayrollItemClassification','bulkClassifyPayrollItems','markPayrollItemException','clearPayrollItemException','recordPayrollItemCompliance','recheckPayrollItem'],true)) {
        $ids=$action==='bulkClassifyPayrollItems'?$d:[$d]; fail_unless(is_array($ids) && count($ids)>0,'Select at least one item.');
        foreach ($ids as $id) {
            $i=index_of($s['payrollItems'],(string)$id); $item=&$s['payrollItems'][$i];
            fail_unless(payroll_item_stage($item)==='initial_checking','This payroll item has already left Initial Checking.',409);
            if (($item['batchId']??'')==='SINGLE_ENTRY') {
                fail_unless($action==='updatePayrollItemClassification','Use the document workflow to process a single payroll.',422);
                $docIndex=index_of($s['documents'],(string)($item['documentId']??'')); $singleDoc=&$s['documents'][$docIndex];
                $singleStep=$singleDoc['workflowSteps'][$singleDoc['currentStepNumber']-1]??null;
                fail_unless(is_array($singleStep) && ($singleStep['requiredAction']??'')==='Verify & Process','Employment classification is assigned during the Verify & Process step.',409);
                fail_unless(can_assign($s,$u,$singleStep['assignedTo']),'This task is assigned to another officer.',403);
            } else {
                $b=$s['payrollBatches'][index_of($s['payrollBatches'],$item['batchId'])];
                fail_unless(payroll_initial_check_authorized($s,$u,$b),'This batch is assigned to another officer.',403);
            }
            if ($action==='markPayrollItemException') {
                $reason=required(['reason'=>$args[1]??''],'reason',2000);
                $allowedReasons=['Missing DTR','Missing Signature','Incomplete Attachments','Missing Certification','Incorrect Supporting Document','For Clarification','Other'];
                // Existing records and integrations can retain their detailed legacy reason text.
                $notes=trim((string)($args[2]??''));
                fail_unless(in_array($reason,$allowedReasons,true) || strlen($reason)<=2000,'Select a valid hold reason.',422);
                if ($reason==='Other') fail_unless($notes!=='','Remarks are required when the hold reason is Other.',422);
                $previous=$item['status']??'Pending'; $isReopened=!empty($item['holdResolvedAt']);
                $item['verificationStatus']='Exception'; $item['status']='On_Hold';
                $item['exceptionReason']=$reason; $item['exceptionNotes']=$notes;
                $item['holdReason']=$reason; $item['holdRemarks']=$notes; $item['holdStage']='initial_checking';
                $item['heldAt']=now(); $item['heldByUserId']=$u['id']; $item['heldByName']=$u['name'];
                unset($item['holdResolvedAt'],$item['holdResolvedByUserId'],$item['holdResolvedByName'],$item['complianceRemarks'],$item['complianceAttachments']);
                payroll_item_audit($item,$u,$isReopened?'PAYROLL_HOLD_REOPENED':'PAYROLL_ITEM_PLACED_ON_HOLD','Initial Checking hold: '.$reason.($notes!==''?' — '.$notes:''),$previous,'On_Hold');
            } elseif (in_array($action,['clearPayrollItemException','recordPayrollItemCompliance'],true)) {
                fail_unless(($item['status']??'')==='On_Hold','Only an item currently on hold can receive compliance.',409);
                $remarks=trim((string)($args[1]??'')); $previous=$item['status'];
                $item['verificationStatus']='Pending'; $item['status']='Ready_For_Recheck';
                $item['holdResolvedAt']=now(); $item['holdResolvedByUserId']=$u['id']; $item['holdResolvedByName']=$u['name']; $item['complianceRemarks']=$remarks;
                $attachments=attach_files($pdo,$u,$args[2]??[],$item['id']); if ($attachments) $item['complianceAttachments']=$attachments;
                payroll_item_audit($item,$u,'PAYROLL_COMPLIANCE_RECEIVED','Compliance received for '.($item['holdReason']??$item['exceptionReason']??'the hold').($remarks!==''?' — '.$remarks:''),$previous,'Ready_For_Recheck');
            } elseif ($action==='recheckPayrollItem') {
                fail_unless(($item['status']??'')==='Ready_For_Recheck','Record compliance before rechecking this payroll item.',409);
                fail_unless(in_array($item['employmentClassification']??null,['JOW/COS','Job Order (JOW)','Regular','Casual'],true),'Assign an employment classification before completing the recheck.',422);
                $previous=$item['status']; $item['verificationStatus']='Passed'; $item['status']='Ready'; $item['recheckedAt']=now(); $item['recheckedByUserId']=$u['id'];
                payroll_item_audit($item,$u,'PAYROLL_ITEM_RECHECK_STARTED','Initial Checking recheck started.',$previous,$previous);
                payroll_item_audit($item,$u,'PAYROLL_ITEM_RECHECK_COMPLETED','Initial Checking recheck completed.',$previous,'Ready');
            } else {
                $item['employmentClassification']=choice($args[1]??null,['JOW/COS','Job Order (JOW)','Regular','Casual'],'employment classification');
                if (!payroll_item_is_held($item) && ($item['status']??'')!=='Ready_For_Recheck') { $item['verificationStatus']=($args[2]??true)===false?'Pending':'Passed'; $item['status']=$item['verificationStatus']==='Passed'?'Ready':'Pending'; }
                if (isset($singleDoc)) { $singleDoc['employmentClassification']=$item['employmentClassification']==='JOW/COS'?'Job Order (JOW)':$item['employmentClassification']; }
                payroll_item_audit($item,$u,$action,'Initial checking classification updated.');
            }
            unset($item);
        }
        foreach (array_unique(array_filter(array_map(fn($id)=>$s['payrollItems'][index_of($s['payrollItems'],(string)$id)]['batchId']??null,$ids),fn($batchId)=>$batchId!=='SINGLE_ENTRY')) as $batchId) {
            $batchIndex=index_of($s['payrollBatches'],$batchId); payroll_refresh_batch_aggregate($s,$s['payrollBatches'][$batchIndex]);
        }
        return true;
    }
    if (in_array($action,['completeInitialCheckingAndRoute','completePayrollItemInitialCheckingAndRoute'],true)) {
        $routeOne=$action==='completePayrollItemInitialCheckingAndRoute';
        if ($routeOne) {
            $targetId=(string)$d; $targetIndex=index_of($s['payrollItems'],$targetId); $targetItem=$s['payrollItems'][$targetIndex];
            fail_unless(($targetItem['batchId']??'')!=='SINGLE_ENTRY','Use the document workflow to process a single payroll.',422);
            $i=index_of($s['payrollBatches'],$targetItem['batchId']);
        } else $i=index_of($s['payrollBatches'],(string)$d);
        $batch=&$s['payrollBatches'][$i]; $routeSelections=is_array($args[1]??null)?$args[1]:[];
        fail_unless(payroll_initial_check_authorized($s,$u,$batch),'This batch is assigned to another officer.',403);
        $initialItems=array_values(array_filter($s['payrollItems'],fn($item)=>in_array($item['id'],$batch['itemIds'],true) && payroll_item_stage($item)==='initial_checking'));
        if ($routeOne) $initialItems=array_values(array_filter($initialItems,fn($item)=>$item['id']===$targetId));
        fail_unless(count($initialItems)>0,'This payroll item is no longer in Initial Checking.',409);
        $unresolved=array_values(array_filter($initialItems,fn($item)=>!payroll_item_is_held($item) && !payroll_item_is_ready($item)));
        fail_unless(count($unresolved)===0,count($unresolved).' payroll item'.(count($unresolved)===1?' is':'s are').' still pending verification or classification.');
        $readyItems=array_values(array_filter($initialItems,'payroll_item_is_ready')); $heldItems=array_values(array_filter($initialItems,'payroll_item_is_held'));
        fail_unless(count($readyItems)>0,'No newly verified payroll items are ready to route.',409);
        $groups=[];
        foreach (array_column($readyItems,'id') as $id) {
            $j=index_of($s['payrollItems'],$id); $item=&$s['payrollItems'][$j];
            $rule=payroll_rule($s,$item['employmentClassification']); $class=$rule['classification'];
            $target=payroll_route_target($s,$rule,$routeSelections[$id]??$routeSelections[$class]??null);
            $groupKey=$class.'|'.($target['team']!==''?'team:'.$target['team']:'user:'.$target['id']);
            if (!isset($groups[$groupKey])) {
                $existing=null; $sameClassCount=0; $hasCompletedMatch=false;
                foreach ($s['workGroups'] as $groupIndex=>$group) if ($group['batchId']===$batch['id'] && $group['classification']===$class) {
                    $sameClassCount++; $sameTarget=($group['assignedProcessorId']??'')===$target['id'] && ($group['assignedTeam']??'')===$target['team'];
                    if ($sameTarget && $group['status']!=='Completed') $existing=$groupIndex; if ($sameTarget && $group['status']==='Completed') $hasCompletedMatch=true;
                }
                if ($existing!==null) { $groups[$groupKey]=$s['workGroups'][$existing]; $groups[$groupKey]['_index']=$existing; }
                else {
                    $isSupplemental=$hasCompletedMatch; $suffix=$sameClassCount>0?'-'.($sameClassCount+1):'';
                    $groups[$groupKey]=['id'=>uid('group'),'batchId'=>$batch['id'],'batchNumber'=>$batch['batchNumber'],'code'=>$batch['batchNumber'].'-'.$class.$suffix,'classification'=>$class,'assignedProcessorId'=>$target['id'],'assignedProcessorName'=>$target['name'],'assignedProcessorRoleTitle'=>$target['roleTitle'],'assignedTeam'=>$target['team'],'itemIds'=>[],'status'=>'In_Progress','auditHistory'=>[],'startedAt'=>now(),'createdAt'=>now(),'updatedAt'=>now(),'isSupplemental'=>$isSupplemental];
                    if ($isSupplemental) $groups[$groupKey]['auditHistory'][]=['id'=>uid('event'),'timestamp'=>now(),'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'SUPPLEMENTAL_WORK_GROUP_CREATED','details'=>'Supplemental '.$class.' work group created for resumed payroll item(s).'];
                }
            }
            if (!in_array($id,$groups[$groupKey]['itemIds'],true)) $groups[$groupKey]['itemIds'][]=$id;
            $wasResumed=!empty($item['holdResolvedAt']);
            $item['currentStage']='verification_signing'; $item['workGroupId']=$groups[$groupKey]['id']; $item['assignedToUserId']=$target['id']; $item['assignedToName']=$target['name']; $item['status']='In_Progress'; payroll_item_audit($item,$u,'PAYROLL_ITEM_AUTO_ROUTED','Assigned to '.$target['name'].(count($heldItems)?'; '.count($heldItems).' held payroll(s) remained in Initial Checking.':''));
            if ($wasResumed) payroll_item_audit($item,$u,'PAYROLL_ITEM_ROUTED_AFTER_HOLD','Rechecked payroll routed to '.$target['name'].' after compliance was received.');
            if (($groups[$groupKey]['isSupplemental']??false)===true) payroll_item_audit($item,$u,'SUPPLEMENTAL_WORK_GROUP_CREATED','Assigned to supplemental '.$class.' work group '.$groups[$groupKey]['code'].'.');
            unset($item);
        }
        foreach ($heldItems as $held) { $j=index_of($s['payrollItems'],$held['id']); payroll_item_audit($s['payrollItems'][$j],$u,'PAYROLL_ITEM_RETAINED_ON_HOLD',count($readyItems).' other payroll(s) routed; this item remains in Initial Checking.'); }
        foreach ($groups as $group) { $existing=$group['_index']??null; unset($group['_index']); $group['updatedAt']=now(); if ($existing===null) { $s['workGroups'][]=$group; $batch['workGroupIds'][]=$group['id']; } else $s['workGroups'][$existing]=$group; }
        $routedAt=now();
        if (empty($heldItems)) {
            foreach ($batch['workflowStages']??[] as &$stage) if (($stage['stageNumber']??0)===2) { $stage['status']='Completed'; $stage['completedAt']=$routedAt; $stage['completedBy']=['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']]; } elseif (($stage['stageNumber']??0)===3) $stage['status']='In_Progress'; unset($stage);
            $batch['workflowHistory'][]=['id'=>uid('event'),'timestamp'=>$routedAt,'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'WORKFLOW_STAGE_COMPLETED','details'=>'Stage 2 - Initial Checking completed by '.$u['name'].'. Eligible payroll items were routed to Parallel Groups.'];
        } else foreach ($batch['workflowStages']??[] as &$stage) if (($stage['stageNumber']??0)===3) $stage['status']='In_Progress'; unset($stage);
        payroll_refresh_batch_aggregate($s,$batch); return true;
    }
    if ($action==='processWorkGroupItems') {
        $g=index_of($s['workGroups'],(string)$d); $group=&$s['workGroups'][$g];
        fail_unless($group['status']!=='Completed','Work group is complete.',409);
        $teamMatch=($group['assignedTeam']??'')!=='' && in_array($group['assignedTeam'],[$u['division'],$u['office']],true);
        fail_unless($group['assignedProcessorId']===$u['id'] || $teamMatch || has_cap($s,$u,'canSupervise'),'This work group is assigned to another officer.',403);
        choice($args[2]??null,['complete','exception'],'work group action');
        fail_unless(is_array($args[1]??null) && count($args[1])>0,'Select at least one item.');
        foreach ($args[1] as $id) {
            fail_unless(in_array($id,$group['itemIds'],true),'Item does not belong to this work group.');
            $j=index_of($s['payrollItems'],$id); $item=&$s['payrollItems'][$j]; fail_unless(payroll_item_stage($item)==='verification_signing' && ($item['status']??'')==='In_Progress','This payroll item is no longer in Stage 3 processing.',409);
            if ($args[2]==='exception') {
                $item['currentStage']='verification_signing'; $item['status']='On_Hold'; $item['verificationStatus']='Exception';
                $item['holdReason']=required(['reason'=>$args[3]??''],'reason',2000); $item['holdRemarks']=trim((string)($args[4]??'')); $item['holdStage']='verification_signing';
                $item['heldAt']=now(); $item['heldByUserId']=$u['id']; $item['heldByName']=$u['name'];
            }
            else {
                $item['currentStage']='release'; $item['status']='Ready_For_Release'; $item['verificationStatus']='Passed'; unset($item['exceptionReason'],$item['exceptionNotes']);
                payroll_item_audit($item,$u,'STAGE_3_COMPLETED','Stage 3 completed in work group '.$group['code'].'.');
                payroll_item_audit($item,$u,'PAYROLL_READY_FOR_RELEASE','Payroll is ready for official release.');
                payroll_item_audit($item,$u,'PAYROLL_AUTO_ROUTED_TO_RELEASE','System routed payroll from Stage 3 to the Release Desk.');
            }
            $item['remarks']=$args[4]??''; if ($args[2]==='exception') payroll_item_audit($item,$u,'PAYROLL_ITEM_PLACED_ON_HOLD','Phase 3 hold: '.$item['holdReason'].($item['holdRemarks']!==''?' — '.$item['holdRemarks']:''),'In_Progress','On_Hold'); unset($item);
        }
        $group['itemIds']=array_values(array_filter($group['itemIds'],fn($id)=>isset($s['payrollItems'][index_of($s['payrollItems'],$id)]['workGroupId'])));
        $pending=array_filter($s['payrollItems'],fn($it)=>in_array($it['id'],$group['itemIds'],true) && !in_array($it['status'],['Ready_For_Release','Released'],true));
        if (!$pending) {
            $group['status']='Completed'; $group['completedAt']=now(); $group['completedBy']=['userId'=>$u['id'],'userName'=>$u['name']];
            $group['auditHistory'][]=['id'=>uid('event'),'timestamp'=>now(),'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'WORK_GROUP_COMPLETED','details'=>count($group['itemIds']).' payroll(s) automatically forwarded to the Release Desk.'];
        }
        $group['updatedAt']=now(); $b=index_of($s['payrollBatches'],$group['batchId']); $batch=&$s['payrollBatches'][$b];
        payroll_refresh_batch_aggregate($s,$batch); return true;
    }
    if ($action==='releasePayrollBatch') {
        $i=index_of($s['payrollBatches'],(string)$d); $batch=&$s['payrollBatches'][$i];
        $releaseDesk=null; foreach ($batch['workflowStages']??[] as $stage) if (($stage['stageNumber']??0)===4) { $releaseDesk=$stage['assignedTo']??null; break; }
        fail_unless(is_array($releaseDesk) && payroll_desk_matches_user($s,$u,$releaseDesk),'This batch is assigned to another officer.',403);
        $ready=array_values(array_filter($s['payrollItems'],fn($item)=>$item['batchId']===$batch['id'] && $item['status']==='Ready_For_Release'));
        fail_unless(count($ready)>0,'No payroll items are ready for release.',409);
        $details=$args[1]; required($details,'releasedTo'); choice($details['releaseMode']??null,['In-Person Pick-up','Official Courier','Electronic Copy','Internal Messenger'],'release mode');
        $release=array_merge($details,['releasedAt'=>now(),'releasedBy'=>$u['name']]);
        foreach ($ready as $record) { $j=index_of($s['payrollItems'],$record['id']); $item=&$s['payrollItems'][$j]; $item['currentStage']='completed'; $item['status']='Released'; $item['releaseDetails']=$release; payroll_item_audit($item,$u,'PAYROLL_RELEASED','Officially released to '.$details['releasedTo'].'.'); unset($item); }
        $batch['releaseDetails']=$release;
        payroll_refresh_batch_aggregate($s,$batch); return $batch;
    }
    throw new ApiError('Unknown payroll operation.',404);
}
