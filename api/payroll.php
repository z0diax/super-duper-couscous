<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
function payroll_rule(array $s,string $classification): array {
    if ($classification==='Job Order (JOW)') $classification='JOW/COS';
    foreach ($s['employmentRoutingRules'] as $r) if ($r['classification']===$classification && $r['primaryProcessorId']!=='') {
        index_of($s['users'],$r['primaryProcessorId']); return $r;
    }
    throw new ApiError('Assign a payroll processor for '.$classification.' in Employment Routing Rules.');
}
function payroll_item_audit(array &$item,array $u,string $action,string $details): void {
    $item['auditHistory'][]=['id'=>uid('event'),'timestamp'=>now(),'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>$action,'details'=>$details]; $item['updatedAt']=now();
}
function payroll_item_is_held(array $item): bool { return ($item['status']??'')==='On_Hold' || ($item['verificationStatus']??'')==='Exception'; }
function payroll_item_is_ready(array $item): bool {
    return !payroll_item_is_held($item) && ($item['verificationStatus']??'')==='Passed' && in_array($item['employmentClassification']??null,['JOW/COS','Job Order (JOW)','Casual','Regular'],true);
}
function editable_payroll_batch(array $s,array $u,array $batch): void {
    fail_unless($batch['encodedBy']['userId']===$u['id'] || has_cap($s,$u,'canSupervise'),'This batch is assigned to another officer.',403);
    $items=array_values(array_filter($s['payrollItems'],fn($item)=>$item['batchId']===$batch['id']));
    $hasStarted=array_filter($items,fn($item)=>($item['currentStage']??(empty($item['workGroupId'])?'initial_checking':'verification_signing'))!=='initial_checking');
    $hasWorkGroups=count(array_filter($s['workGroups'],fn($group)=>$group['batchId']===$batch['id']))>0;
    fail_unless($batch['status']==='Active' && !$hasStarted && !$hasWorkGroups,'Only a batch that is still in Initial Checking can be edited or deleted.',409);
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
        $barcode=trim($d['batchBarcode']??'') ?: 'PB-'.date('Y').'-'.strtoupper(bin2hex(random_bytes(5))); assert_barcode($s,$barcode);
        $id=uid('batch'); $itemIds=[]; $codes=[$barcode];
        foreach ($d['items'] as $n=>$entry) {
            $code=required($entry,'barcode'); assert_barcode($s,$code,$codes); $codes[]=$code;
            $item=['id'=>uid('payroll'),'batchId'=>$id,'batchNumber'=>$barcode,'itemNumber'=>$n+1,'barcode'=>$code,'title'=>required($entry,'title',300),'office'=>$entry['office']??$office,'classificationType'=>$entry['classificationType']??$type,'employmentClassification'=>null,'currentStage'=>'initial_checking','verificationStatus'=>'Pending','status'=>'Pending','auditHistory'=>[],'createdAt'=>now(),'updatedAt'=>now()];
            payroll_item_audit($item,$u,'PAYROLL_ITEM_CREATED','Registered in '.$barcode); $itemIds[]=$item['id']; $s['payrollItems'][]=$item;
        }
        $batch=['id'=>$id,'batchNumber'=>$barcode,'batchBarcode'=>$barcode,'classification'=>'Payroll','payrollType'=>$type,'office'=>$office,'payrollPeriod'=>$d['payrollPeriod']??'','receivedFromLiaison'=>$d['receivedFromLiaison']??'','remarks'=>$d['remarks']??'','dateReceived'=>now(),'dateEncoded'=>now(),'encodedBy'=>['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']],'currentStage'=>'initial_checking','currentStageName'=>'Initial Checking','assignedDesk'=>['stage'=>'initial_checking','userId'=>$u['id'],'userName'=>$u['name'],'roleTitle'=>$u['roleTitle']],'totalItemsCount'=>count($itemIds),'itemIds'=>$itemIds,'workGroupIds'=>[],'attachments'=>attach_files($pdo,$u,$d['files']??[],$id),'status'=>'Active','createdAt'=>now(),'updatedAt'=>now()];
        $s['payrollBatches'][]=$batch; return $batch;
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
    if (in_array($action,['updatePayrollItemClassification','bulkClassifyPayrollItems','markPayrollItemException','clearPayrollItemException'],true)) {
        $ids=$action==='bulkClassifyPayrollItems'?$d:[$d]; fail_unless(is_array($ids) && count($ids)>0,'Select at least one item.');
        foreach ($ids as $id) {
            $i=index_of($s['payrollItems'],(string)$id); $item=&$s['payrollItems'][$i];
            fail_unless(($item['currentStage']??(empty($item['workGroupId'])?'initial_checking':'verification_signing'))==='initial_checking','This payroll item has already left Initial Checking.',409);
            if (($item['batchId']??'')==='SINGLE_ENTRY') {
                fail_unless($action==='updatePayrollItemClassification','Use the document workflow to process a single payroll.',422);
                $docIndex=index_of($s['documents'],(string)($item['documentId']??'')); $singleDoc=&$s['documents'][$docIndex];
                $singleStep=$singleDoc['workflowSteps'][$singleDoc['currentStepNumber']-1]??null;
                fail_unless(is_array($singleStep) && ($singleStep['requiredAction']??'')==='Verify & Process','Employment classification is assigned during the Verify & Process step.',409);
                fail_unless(can_assign($s,$u,$singleStep['assignedTo']),'This task is assigned to another officer.',403);
            } else {
                $b=$s['payrollBatches'][index_of($s['payrollBatches'],$item['batchId'])];
                fail_unless($b['encodedBy']['userId']===$u['id'] || has_cap($s,$u,'canSupervise'),'This batch is assigned to another officer.',403);
            }
            if ($action==='markPayrollItemException') { $item['verificationStatus']='Exception'; $item['status']='On_Hold'; $item['exceptionReason']=required(['reason'=>$args[1]??''],'reason',2000); $item['exceptionNotes']=$args[2]??''; }
            elseif ($action==='clearPayrollItemException') {
                unset($item['exceptionReason'],$item['exceptionNotes']);
                // A hold can be cleared after the supporting record is corrected.  Preserve an
                // already-selected classification so the officer can route this item without
                // having to select the same classification again.
                if (in_array($item['employmentClassification']??null,['JOW/COS','Job Order (JOW)','Regular','Casual'],true)) {
                    $item['verificationStatus']='Passed'; $item['status']='Ready';
                } else { $item['verificationStatus']='Pending'; $item['status']='Pending'; }
            }
            else { $item['employmentClassification']=choice($args[1]??null,['JOW/COS','Job Order (JOW)','Regular','Casual'],'employment classification'); if (!payroll_item_is_held($item)) { $item['verificationStatus']=($args[2]??true)===false?'Pending':'Passed'; $item['status']=$item['verificationStatus']==='Passed'?'Ready':'Pending'; } if (isset($singleDoc)) { $singleDoc['employmentClassification']=$item['employmentClassification']==='JOW/COS'?'Job Order (JOW)':$item['employmentClassification']; } }
            payroll_item_audit($item,$u,$action,'Initial checking updated.'); unset($item);
        }
        return true;
    }
    if ($action==='completeInitialCheckingAndRoute') {
        $i=index_of($s['payrollBatches'],(string)$d); $batch=&$s['payrollBatches'][$i];
        fail_unless(!in_array($batch['currentStage'],['release','completed'],true),'Batch can no longer accept Initial Checking items.',409);
        fail_unless($batch['encodedBy']['userId']===$u['id'] || has_cap($s,$u,'canSupervise'),'This batch is assigned to another officer.',403);
        $initialItems=array_values(array_filter($s['payrollItems'],fn($item)=>in_array($item['id'],$batch['itemIds'],true) && ($item['currentStage']??(empty($item['workGroupId'])?'initial_checking':'verification_signing'))==='initial_checking'));
        $unresolved=array_values(array_filter($initialItems,fn($item)=>!payroll_item_is_held($item) && !payroll_item_is_ready($item)));
        fail_unless(count($unresolved)===0,count($unresolved).' payroll item'.(count($unresolved)===1?' is':'s are').' still pending verification or classification.');
        $readyItems=array_values(array_filter($initialItems,'payroll_item_is_ready')); $heldItems=array_values(array_filter($initialItems,'payroll_item_is_held'));
        fail_unless(count($readyItems)>0,'No newly verified payroll items are ready to route.',409);
        foreach ($readyItems as $ready) payroll_rule($s,$ready['employmentClassification']);
        $groups=[];
        foreach (array_column($readyItems,'id') as $id) {
            $j=index_of($s['payrollItems'],$id); $item=&$s['payrollItems'][$j];
            $rule=payroll_rule($s,$item['employmentClassification']); $class=$rule['classification'];
            if (!isset($groups[$class])) {
                $existing=null; foreach ($s['workGroups'] as $groupIndex=>$group) if ($group['batchId']===$batch['id'] && $group['classification']===$class) { $existing=$groupIndex; break; }
                if ($existing!==null) { $groups[$class]=$s['workGroups'][$existing]; $groups[$class]['_index']=$existing; $groups[$class]['status']='In_Progress'; unset($groups[$class]['completedAt'],$groups[$class]['completedBy']); }
                else $groups[$class]=['id'=>uid('group'),'batchId'=>$batch['id'],'batchNumber'=>$batch['batchNumber'],'code'=>$batch['batchNumber'].'-'.$class,'classification'=>$class,'assignedProcessorId'=>$rule['primaryProcessorId'],'assignedProcessorName'=>$rule['primaryProcessorName'],'assignedProcessorRoleTitle'=>$rule['primaryProcessorRoleTitle'],'itemIds'=>[],'status'=>'In_Progress','auditHistory'=>[],'startedAt'=>now(),'createdAt'=>now(),'updatedAt'=>now()];
            }
            if (!in_array($id,$groups[$class]['itemIds'],true)) $groups[$class]['itemIds'][]=$id;
            $item['currentStage']='verification_signing'; $item['workGroupId']=$groups[$class]['id']; $item['assignedToUserId']=$rule['primaryProcessorId']; $item['assignedToName']=$rule['primaryProcessorName']; $item['status']='In_Progress'; payroll_item_audit($item,$u,'PAYROLL_ITEM_AUTO_ROUTED','Assigned to '.$rule['primaryProcessorName'].(count($heldItems)?'; '.count($heldItems).' held payroll(s) remained in Initial Checking.':'')); unset($item);
        }
        foreach ($heldItems as $held) { $j=index_of($s['payrollItems'],$held['id']); payroll_item_audit($s['payrollItems'][$j],$u,'PAYROLL_ITEM_RETAINED_ON_HOLD',count($readyItems).' other payroll(s) routed; this item remains in Initial Checking.'); }
        foreach ($groups as $group) { $existing=$group['_index']??null; unset($group['_index']); $group['updatedAt']=now(); if ($existing===null) { $s['workGroups'][]=$group; $batch['workGroupIds'][]=$group['id']; } else $s['workGroups'][$existing]=$group; }
        $batch['currentStage']='verification_signing'; $batch['currentStageName']=count($heldItems)?'Processing with Initial Holds':'Verification & Signing'; $batch['assignedDesk']=['stage'=>'verification_signing','userName'=>'Assigned work groups','roleTitle'=>'Payroll processors']; $batch['updatedAt']=now(); return true;
    }
    if ($action==='processWorkGroupItems') {
        $g=index_of($s['workGroups'],(string)$d); $group=&$s['workGroups'][$g];
        fail_unless($group['status']!=='Completed','Work group is complete.',409);
        fail_unless($group['assignedProcessorId']===$u['id'] || has_cap($s,$u,'canSupervise'),'This work group is assigned to another officer.',403);
        choice($args[2]??null,['complete','exception'],'work group action');
        fail_unless(is_array($args[1]??null) && count($args[1])>0,'Select at least one item.');
        foreach ($args[1] as $id) {
            fail_unless(in_array($id,$group['itemIds'],true),'Item does not belong to this work group.');
            $j=index_of($s['payrollItems'],$id); $item=&$s['payrollItems'][$j]; fail_unless(!in_array($item['status'],['Ready_For_Release','Released'],true),'Item has already completed Stage 3.',409);
            if ($args[2]==='exception') { $item['currentStage']='initial_checking'; $item['status']='On_Hold'; $item['verificationStatus']='Exception'; $item['exceptionReason']=required(['reason'=>$args[3]??''],'reason',2000); unset($item['workGroupId'],$item['assignedToUserId'],$item['assignedToName']); }
            else {
                $item['currentStage']='release'; $item['status']='Ready_For_Release'; $item['verificationStatus']='Passed'; unset($item['exceptionReason'],$item['exceptionNotes']);
                payroll_item_audit($item,$u,'STAGE_3_COMPLETED','Stage 3 completed in work group '.$group['code'].'.');
                payroll_item_audit($item,$u,'PAYROLL_READY_FOR_RELEASE','Payroll is ready for official release.');
                payroll_item_audit($item,$u,'PAYROLL_AUTO_ROUTED_TO_RELEASE','System routed payroll from Stage 3 to the Release Desk.');
            }
            $item['remarks']=$args[4]??''; if ($args[2]==='exception') payroll_item_audit($item,$u,'PAYROLL_ITEM_EXCEPTION',$item['remarks']); unset($item);
        }
        $group['itemIds']=array_values(array_filter($group['itemIds'],fn($id)=>isset($s['payrollItems'][index_of($s['payrollItems'],$id)]['workGroupId'])));
        $pending=array_filter($s['payrollItems'],fn($it)=>in_array($it['id'],$group['itemIds'],true) && !in_array($it['status'],['Ready_For_Release','Released'],true));
        if (!$pending) {
            $group['status']='Completed'; $group['completedAt']=now(); $group['completedBy']=['userId'=>$u['id'],'userName'=>$u['name']];
            $group['auditHistory'][]=['id'=>uid('event'),'timestamp'=>now(),'actorId'=>$u['id'],'actorName'=>$u['name'],'actorRole'=>$u['roleTitle'],'action'=>'WORK_GROUP_COMPLETED','details'=>count($group['itemIds']).' payroll(s) automatically forwarded to the Release Desk.'];
        }
        $group['updatedAt']=now(); $b=index_of($s['payrollBatches'],$group['batchId']); $batch=&$s['payrollBatches'][$b];
        if (array_filter($s['payrollItems'],fn($it)=>$it['batchId']===$batch['id'] && $it['status']==='Ready_For_Release')) { $batch['currentStage']='release'; $batch['currentStageName']='Payrolls Ready for Release'; $batch['assignedDesk']=['stage'=>'release','userName'=>'Releasing Officer','roleTitle'=>'Releasing Officer']; }
        $batch['updatedAt']=now(); return true;
    }
    if ($action==='releasePayrollBatch') {
        require_cap($s,$u,'canRelease'); $i=index_of($s['payrollBatches'],(string)$d); $batch=&$s['payrollBatches'][$i];
        $ready=array_values(array_filter($s['payrollItems'],fn($item)=>$item['batchId']===$batch['id'] && $item['status']==='Ready_For_Release'));
        fail_unless(count($ready)>0,'No payroll items are ready for release.',409);
        $details=$args[1]; required($details,'releasedTo'); choice($details['releaseMode']??null,['In-Person Pick-up','Official Courier','Electronic Copy','Internal Messenger'],'release mode');
        $release=array_merge($details,['releasedAt'=>now(),'releasedBy'=>$u['name']]);
        foreach ($ready as $record) { $j=index_of($s['payrollItems'],$record['id']); $item=&$s['payrollItems'][$j]; $item['currentStage']='completed'; $item['status']='Released'; $item['releaseDetails']=$release; payroll_item_audit($item,$u,'PAYROLL_RELEASED','Officially released to '.$details['releasedTo'].'.'); unset($item); }
        $batch['releaseDetails']=$release;
        $remaining=array_values(array_filter($s['payrollItems'],fn($item)=>$item['batchId']===$batch['id'] && $item['status']!=='Released'));
        if (!$remaining) { $batch['currentStage']='completed'; $batch['currentStageName']='Completed'; $batch['status']='Completed'; }
        elseif (array_filter($remaining,fn($item)=>$item['status']==='In_Progress')) { $batch['currentStage']='verification_signing'; $batch['currentStageName']='Processing with Partial Release'; }
        else { $batch['currentStage']='initial_checking'; $batch['currentStageName']='Released with Initial Holds'; $batch['assignedDesk']=['stage'=>'initial_checking','userId'=>$batch['encodedBy']['userId'],'userName'=>$batch['encodedBy']['userName'],'roleTitle'=>$batch['encodedBy']['userRole']]; }
        $batch['updatedAt']=now(); return $batch;
    }
    throw new ApiError('Unknown payroll operation.',404);
}
