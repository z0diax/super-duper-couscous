<?php
declare(strict_types=1);
require_once __DIR__.'/store.php';
function required(array $data,string $key,int $max=190): string {
    fail_unless(isset($data[$key]) && is_string($data[$key]), "$key is required.");
    $v=trim($data[$key]); fail_unless($v!=='' && mb_strlen($v)<=$max,"$key must contain 1–$max characters."); return $v;
}
function choice($value,array $values,string $label): string {
    fail_unless(is_string($value) && in_array($value,$values,true),"Invalid $label."); return $value;
}
function positive($value,string $label,int $max=8760): float {
    fail_unless(is_numeric($value) && $value>0 && $value<=$max,"$label must be greater than zero and at most $max."); return (float)$value;
}
function index_of(array $items,string $id): int {
    foreach ($items as $i=>$item) if ($item['id']===$id) return $i;
    throw new ApiError('Record no longer exists. Refresh and try again.',404);
}
function has_cap(array $s,array $u,string $cap): bool {
    foreach ($s['systemRoles'] as $r) if ($r['id']===$u['role']) return $u['role']==='admin' || !empty($r['canAdmin']) || !empty($r[$cap]);
    return $u['role']==='admin';
}
function require_cap(array $s,array $u,string $cap): void { fail_unless(has_cap($s,$u,$cap),'Your account is not authorized for this action.',403); }
function assignment_matches(array $u,array $assignment): bool {
    if (!empty($assignment['userId'])) return $assignment['userId']===$u['id'];
    if (($assignment['type']??'')==='Role') return ($assignment['role']??null)===$u['role'];
    return ($assignment['type']??'')==='Team' && !empty($assignment['team']) && in_array($assignment['team'],[$u['division'],$u['office']],true);
}
function can_assign(array $s,array $u,array $assignment): bool { return has_cap($s,$u,'canSupervise') || assignment_matches($u,$assignment); }
function can_view_all_operational_records(array $s,array $u): bool { return has_cap($s,$u,'canSupervise') || has_cap($s,$u,'canAdmin'); }
function payroll_desk_allows_view(array $s,array $u,array $desk): bool {
    if (can_view_all_operational_records($s,$u)) return true;
    if (!empty($desk['userId'])) return $desk['userId']===$u['id'];
    if (($desk['assignmentType']??'')==='Role') return ($desk['roleId']??null)===$u['role'];
    return ($desk['assignmentType']??'')==='Team' && !empty($desk['team']) && in_array($desk['team'],[$u['division'],$u['office']],true);
}
function can_view_document(array $s,array $u,array $doc): bool {
    if (can_view_all_operational_records($s,$u)) return true;
    if (($doc['encodedBy']['userId']??null)===$u['id']) return true;
    foreach ($doc['workflowSteps']??[] as $step) {
        if (($step['completedBy']['userId']??null)===$u['id'] || ($step['handoffOwner']['userId']??null)===$u['id']) return true;
        if (($step['stepNumber']??0)===($doc['currentStepNumber']??0)) {
            if (can_assign($s,$u,$step['assignedTo']??[])) return true;
            if (($step['stageType']??'')==='EXTERNAL_HANDOFF_REVIEW') {
                if (($step['externalStatus']??null)==='PENDING_HANDOFF' && (($step['handoffOwner']['userId']??null)===$u['id'] || has_cap($s,$u,'canIntake'))) return true;
                if (($step['externalStatus']??null)==='OUTSIDE_HRMDO' && (can_assign($s,$u,$step['returnReceiver']??[]) || has_cap($s,$u,'canIntake'))) return true;
            }
        }
    }
    return in_array(($doc['status']??''),['Ready_For_Release','Released'],true) && has_cap($s,$u,'canRelease');
}
function can_view_work_group(array $s,array $u,array $group): bool {
    $team=$group['assignedTeam']??'';
    return can_view_all_operational_records($s,$u) || ($group['assignedProcessorId']??null)===$u['id'] || ($team!=='' && in_array($team,[$u['division'],$u['office']],true));
}
function can_view_payroll_item(array $s,array $u,array $item): bool {
    if (can_view_all_operational_records($s,$u)) return true;
    if (($item['batchId']??null)==='SINGLE_ENTRY') {
        foreach ($s['documents'] as $doc) if (($doc['id']??null)===($item['documentId']??null)) return can_view_document($s,$u,$doc);
        return false;
    }
    $batch=null; foreach ($s['payrollBatches'] as $record) if ($record['id']===$item['batchId']) { $batch=$record; break; }
    if (!$batch) return false;
    if (($batch['encodedBy']['userId']??null)===$u['id']) return true;
    $stage=$item['currentStage']??(empty($item['workGroupId'])?'initial_checking':'verification_signing');
    if ($stage==='initial_checking' && payroll_desk_allows_view($s,$u,$batch['initialCheckingDesk']??$batch['assignedDesk']??[])) return true;
    if ($stage==='release') {
        foreach ($batch['workflowStages']??[] as $workflowStage) {
            if (($workflowStage['stageNumber']??0)===4 && payroll_desk_allows_view($s,$u,$workflowStage['assignedTo']??[])) return true;
        }
    }
    if (($item['assignedToUserId']??null)===$u['id']) return true;
    foreach ($s['workGroups'] as $group) if (in_array($item['id'],$group['itemIds']??[],true) && can_view_work_group($s,$u,$group)) return true;
    return in_array(($item['status']??''),['Ready_For_Release','Released'],true) && has_cap($s,$u,'canRelease');
}
function can_view_payroll_batch(array $s,array $u,array $batch): bool {
    if (can_view_full_payroll_batch($s,$u,$batch)) return true;
    foreach ($s['payrollItems'] as $item) if (($item['batchId']??null)===$batch['id'] && can_view_payroll_item($s,$u,$item)) return true;
    return false;
}
function can_view_full_payroll_batch(array $s,array $u,array $batch): bool {
    return can_view_all_operational_records($s,$u)
        || ($batch['encodedBy']['userId']??null)===$u['id']
        || payroll_desk_allows_view($s,$u,$batch['initialCheckingDesk']??$batch['assignedDesk']??[]);
}
function can_view_leave_application(array $s,array $u,array $leave): bool {
    $modules=$u['sidebarModules']??null;
    return can_view_all_operational_records($s,$u)
        || ($modules===null || in_array('leave',$modules,true));
}
function can_view_attachment_owner(array $s,array $u,?string $ownerId,?string $uploadedBy=null): bool {
    if ($ownerId===null || $ownerId==='') return $uploadedBy===$u['id'];
    foreach ($s['documents'] as $doc) if ($doc['id']===$ownerId) return can_view_document($s,$u,$doc);
    foreach ($s['payrollItems'] as $item) if ($item['id']===$ownerId) return can_view_payroll_item($s,$u,$item);
    // Work-group processors receive a deliberately scoped batch representation;
    // batch attachments remain available only to full-batch viewers.
    foreach ($s['payrollBatches'] as $batch) if ($batch['id']===$ownerId) return can_view_full_payroll_batch($s,$u,$batch);
    foreach ($s['leaveApplications'] as $leave) if (($leave['id']??null)===$ownerId) return can_view_leave_application($s,$u,$leave);
    return false;
}
function scoped_payroll_batch(array $s,array $u,array $batch,array $visibleItems): array {
    if (can_view_full_payroll_batch($s,$u,$batch)) return $batch;
    // A Stage 3 processor receives only the context needed for the assigned work group.
    $batch['itemIds']=array_values(array_intersect($batch['itemIds']??[],array_column($visibleItems,'id')));
    $batch['attachments']=[]; $batch['remarks']=''; $batch['receivedFromLiaison']='';
    unset($batch['workflowHistory'],$batch['workflowStages'],$batch['releaseDetails']);
    return $batch;
}
function filter_state_for_view(array $s,array $u): array {
    $visibleDocuments=array_values(array_filter($s['documents'],fn($doc)=>can_view_document($s,$u,$doc)));
    $visibleItems=array_values(array_filter($s['payrollItems'],fn($item)=>can_view_payroll_item($s,$u,$item)));
    $visibleGroups=array_values(array_filter($s['workGroups'],fn($group)=>can_view_work_group($s,$u,$group)));
    $visibleBatches=[];
    foreach ($s['payrollBatches'] as $batch) if (can_view_payroll_batch($s,$u,$batch)) $visibleBatches[]=scoped_payroll_batch($s,$u,$batch,$visibleItems);
    $visibleBatchIds=array_column($visibleBatches,'id');
    $visibleItems=array_values(array_filter($visibleItems,fn($item)=>($item['batchId']??'')==='SINGLE_ENTRY' || in_array($item['batchId'],$visibleBatchIds,true)));
    $visibleGroups=array_values(array_filter($visibleGroups,fn($group)=>in_array($group['batchId']??'', $visibleBatchIds,true)));
    // A limited work-group viewer may see parent metadata but not its batch-wide
    // audit timeline. Their item and work-group histories remain available.
    $fullBatchIds=array_column(array_values(array_filter($visibleBatches,fn($batch)=>can_view_full_payroll_batch($s,$u,$batch))),'id');
    $authorizedLeaves=array_values(array_filter($s['leaveApplications'],fn($leave)=>can_view_leave_application($s,$u,$leave)));
    $visibleLeaves=array_values(array_filter($authorizedLeaves,fn($leave)=>!empty($leave['isLegacyV1'])));
    $visibleIds=array_merge(array_column($visibleDocuments,'id'),$fullBatchIds,array_column($visibleItems,'id'),array_column($visibleGroups,'id'),array_column($authorizedLeaves,'id'));
    $s['documents']=$visibleDocuments; $s['payrollItems']=$visibleItems; $s['workGroups']=$visibleGroups; $s['payrollBatches']=$visibleBatches;
    $s['leaveApplications']=$visibleLeaves;
    $s['auditLogs']=array_values(array_filter($s['auditLogs'],fn($event)=>($event['actorId']??null)===$u['id'] || in_array($event['documentId']??'', $visibleIds,true)));
    return $s;
}
function assert_barcode(array $s,string $barcode,array $additional=[],string $excludeLeaveId=''): void {
    fail_unless(strlen($barcode)<=190 && $barcode!=='','Barcode is required and must be at most 190 characters.');
    $codes=$additional;
    foreach ($s['documents'] as $r) { $codes[]=$r['barcode']??''; $codes[]=$r['trackingNumber']; }
    foreach ($s['payrollBatches'] as $r) { $codes[]=$r['batchBarcode']??''; $codes[]=$r['batchNumber']; }
    foreach ($s['payrollItems'] as $r) $codes[]=$r['barcode'];
    foreach ($s['leaveApplications'] as $r) if (($r['id']??'')!==$excludeLeaveId) { $codes[]=$r['barcode']??''; $codes[]=$r['trackingNumber']??''; }
    fail_unless(!in_array(strtolower($barcode),array_map('strtolower',$codes),true),'Barcode is already in use.',409);
}
function validated_leave_date_ranges($submitted): array {
    fail_unless(is_array($submitted) && count($submitted)>0 && count($submitted)<=50,'Add between 1 and 50 complete Leave Date Ranges.');
    $ranges=[]; $halfDayUnits=0;
    foreach ($submitted as $index=>$range) {
        fail_unless(is_array($range),'Complete or remove Leave Date Range '.($index+1).'.');
        $start=required($range,'startDate',10); $end=required($range,'endDate',10);
        foreach ([$start,$end] as $date) { $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date); fail_unless($parsed!==false && $parsed->format('Y-m-d')===$date,'Enter valid dates for Leave Date Range '.($index+1).'.'); }
        fail_unless($start<=$end,'Leave Date Range '.($index+1).' must start on or before its end date.');
        $dayType=choice($range['dayType']??null,['WHOLE_DAY','AM_HALF_DAY','PM_HALF_DAY'],'duration type');
        if ($dayType!=='WHOLE_DAY') fail_unless($start===$end,'AM and PM Half-Day entries must use a single date.');
        $units=$dayType==='WHOLE_DAY'?(((int)((strtotime($end)-strtotime($start))/86400)+1)*2):1;
        $ranges[]=['id'=>(isset($range['id']) && is_string($range['id']) && trim($range['id'])!=='')?trim($range['id']):uid('leave-range'),'startDate'=>$start,'endDate'=>$end,'dayType'=>$dayType,'leaveDayUnits'=>$units];
        $halfDayUnits+=$units;
    }
    usort($ranges,fn($a,$b)=>[$a['startDate'],$a['endDate']]<=>[$b['startDate'],$b['endDate']]);
    for ($i=1;$i<count($ranges);$i++) fail_unless($ranges[$i]['startDate']>$ranges[$i-1]['endDate'],'Leave date ranges cannot overlap or contain duplicate dates.');
    return ['ranges'=>$ranges,'total'=>$halfDayUnits/2];
}
function validated_leave_application(array $s,array $d,string $excludeLeaveId=''): array {
    $submittedRanges=$d['dateRanges']??null;
    if ($submittedRanges===null) $submittedRanges=[['startDate'=>required($d,'startDate',10),'endDate'=>required($d,'endDate',10),'dayType'=>'WHOLE_DAY']];
    $dateResult=validated_leave_date_ranges($submittedRanges); $ranges=$dateResult['ranges'];
    $leaveType=choice($d['leaveType']??null,['COC','Vacation Leave','Mandatory / Forced Leave','Sick Leave','Wellness Leave','Maternity Leave','Paternity Leave','Special Privilege Leave','Solo Parent Leave','Study Leave','10-Day VAWC Leave','Rehabilitation Privilege','Special Leave Benefits for Women','Special Emergency / Calamity Leave','Adoption Leave','Others','Terminal Leave'],'leave type');
    $commutation=choice($d['commutation']??'Not Requested',['Requested','Not Requested'],'commutation');
    fail_unless(!isset($d['leaveSubtype']) || $d['leaveSubtype']===null || is_string($d['leaveSubtype']),'Invalid Leave Type details.');
    fail_unless(!isset($d['leaveDetails']) || $d['leaveDetails']===null || is_string($d['leaveDetails']),'Invalid Leave Type details.');
    $leaveSubtype=trim((string)($d['leaveSubtype']??'')); $leaveDetails=trim((string)($d['leaveDetails']??''));
    fail_unless(mb_strlen($leaveDetails)<=2000,'Leave Type details must be at most 2000 characters.');
    if (in_array($leaveType,['Vacation Leave','Special Privilege Leave'],true)) $leaveSubtype=choice($leaveSubtype,['WITHIN_PHILIPPINES','ABROAD'],'location type');
    elseif ($leaveType==='Sick Leave') { $leaveSubtype=choice($leaveSubtype,['IN_HOSPITAL','OUT_PATIENT'],'medical setting'); fail_unless($leaveDetails!=='','Illness / Medical Details are required.'); }
    elseif ($leaveType==='Study Leave') $leaveSubtype=choice($leaveSubtype,['MASTERS_COMPLETION','BOARD_BAR_REVIEW'],'study leave purpose');
    elseif ($leaveType==='Others') { $leaveSubtype=choice($leaveSubtype,['MONETIZATION','TERMINAL_LEAVE','OTHER'],'other leave purpose'); if ($leaveSubtype==='OTHER') fail_unless($leaveDetails!=='','Specify the other Leave purpose.'); }
    else fail_unless($leaveSubtype==='','This Leave Type does not accept a subtype.');
    fail_unless(!isset($d['employeeId']) || is_string($d['employeeId']),'Invalid employee reference.');
    $employeeId=trim((string)($d['employeeId']??'')); fail_unless(mb_strlen($employeeId)<=64,'Employee reference must be at most 64 characters.'); $applicant=null;
    foreach ($s['users'] as $candidate) if ($employeeId!=='' && $candidate['id']===$employeeId) { $applicant=$candidate; break; }
    fail_unless(!isset($d['employeeName']) || is_string($d['employeeName']),'Invalid employee or applicant name.');
    $employeeName=trim((string)($d['employeeName']??($applicant['name']??''))); fail_unless($employeeName!=='' && mb_strlen($employeeName)<=190,'Enter an employee or applicant name with at most 190 characters.');
    $office=required($d,'office',190); fail_unless(!isset($d['barcode']) || is_string($d['barcode']),'Invalid barcode or tracking number.');
    $barcode=trim((string)($d['barcode']??'')); $barcode=$barcode==='' || strtoupper($barcode)==='N/A'?'N/A':$barcode;
    fail_unless(mb_strlen($barcode)<=190,'Barcode or tracking number must be at most 190 characters.'); if ($barcode!=='N/A') assert_barcode($s,$barcode,[],$excludeLeaveId);
    fail_unless(!isset($d['remarks']) || is_string($d['remarks']),'Invalid remarks.');
    $remarks=trim($d['remarks']??''); fail_unless(mb_strlen($remarks)<=2000,'Remarks must be at most 2000 characters.');
    return ['trackingNumber'=>$barcode,'barcode'=>$barcode,'employeeId'=>$applicant['id']??'','employeeName'=>$employeeName,'office'=>$office,'department'=>$office,'position'=>$applicant['position']??'Not recorded','leaveType'=>$leaveType,'leaveSubtype'=>$leaveSubtype!==''?$leaveSubtype:null,'leaveDetails'=>$leaveDetails!==''?$leaveDetails:null,'startDate'=>$ranges[0]['startDate'],'endDate'=>$ranges[count($ranges)-1]['endDate'],'dateRanges'=>$ranges,'workingDaysNumber'=>$dateResult['total'],'totalLeaveDays'=>$dateResult['total'],'commutation'=>$commutation,'remarks'=>$remarks];
}
function leave_stage_capability(string $status): string {
    return match ($status) {
        'For_Computation', 'For_Processing' => 'canProcess',
        'For_Signature' => 'canApprove',
        default => '',
    };
}
function require_leave_stage_authority(array $s,array $u,string $status): void {
    $cap=leave_stage_capability($status);
    fail_unless($cap!=='' && (has_cap($s,$u,$cap) || has_cap($s,$u,'canSupervise')),'Your account is not authorized for this Leave processing stage.',403);
}
function transition_leave_application(array &$s,array $u,string $action,array $args): array {
    $id=(string)($args[0]??''); $i=index_of($s['leaveApplications'],$id); $leave=&$s['leaveApplications'][$i];
    fail_unless(empty($leave['isLegacyV1']),'Historical Leave records cannot enter the V2 workflow.',409);
    $before=(string)($leave['status']??''); $data=is_array($args[1]??null)?$args[1]:[]; $at=now();
    $event=''; $summary=''; $remarks='';
    if ($action==='changeLeaveApplicationStatus') {
        $next=choice($data['status']??null,['For_Computation','On_Hold','For_Signature','Released'],'Leave status');
        fail_unless($next!==$before,'Choose a status different from the current status.',409);
        fail_unless(!isset($data['remarks']) || is_string($data['remarks']),'Invalid status remarks.');
        $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'Status remarks must be at most 2000 characters.');
        if ($next==='Released') fail_unless(has_cap($s,$u,'canRelease') || has_cap($s,$u,'canSupervise'),'Leave release permission is required.',403);
        elseif ($next==='For_Computation') fail_unless(has_cap($s,$u,'canIntake') || has_cap($s,$u,'canProcess') || has_cap($s,$u,'canSupervise'),'Leave intake or processing permission is required.',403);
        else fail_unless(has_cap($s,$u,'canProcess') || has_cap($s,$u,'canApprove') || has_cap($s,$u,'canSupervise'),'Leave processing or approval permission is required.',403);
        $leave['status']=$next; $leave['statusRemarks']=$remarks; $leave['statusChangedAt']=$at; $leave['statusChangedByUserId']=$u['id']; $leave['statusChangedByName']=$u['name'];
        if ($next==='On_Hold') { $leave['heldFromStatus']=in_array($before,['For_Computation','For_Processing','For_Signature'],true)?$before:'For_Computation'; $leave['holdReason']=$remarks!==''?$remarks:'No remarks provided.'; $leave['holdRemarks']=$remarks; $leave['heldAt']=$at; $leave['heldByUserId']=$u['id']; $leave['heldByName']=$u['name']; }
        else unset($leave['heldFromStatus'],$leave['holdReason'],$leave['holdRemarks'],$leave['heldAt'],$leave['heldByUserId'],$leave['heldByName'],$leave['complianceRemarks'],$leave['complianceReceivedAt'],$leave['complianceReceivedByUserId'],$leave['complianceReceivedByName']);
        if ($next==='Released') { $leave['releasedAt']=$at; $leave['releasedByUserId']=$u['id']; $leave['releasedByName']=$u['name']; $leave['releaseRemarks']=$remarks; }
        else { $leave['releasedAt']=null; unset($leave['releasedByUserId'],$leave['releasedByName'],$leave['releaseRemarks']); }
        $event='LEAVE_STATUS_CHANGED'; $summary='Leave status changed to '.str_replace('_',' ',$next);
    } elseif ($action==='completeLeaveComputation') {
        fail_unless($before==='For_Computation','Only a Leave Application For Computation can complete computation.',409); require_leave_stage_authority($s,$u,$before);
        validated_leave_application($s,$leave,$id);
        $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'Computation remarks must be at most 2000 characters.');
        $leave['status']='For_Processing'; $leave['computationRemarks']=$remarks; $event='LEAVE_COMPUTATION_COMPLETED'; $summary='Leave computation completed';
    } elseif ($action==='sendLeaveForSignature') {
        fail_unless($before==='For_Processing','Only a Leave Application in Processing can be sent for signature.',409); require_leave_stage_authority($s,$u,$before);
        $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'Processing remarks must be at most 2000 characters.');
        $leave['status']='For_Signature'; $event='LEAVE_SENT_FOR_SIGNATURE'; $summary='Leave sent for signature';
    } elseif ($action==='releaseLeaveApplication') {
        fail_unless(has_cap($s,$u,'canRelease') || has_cap($s,$u,'canSupervise'),'Leave release permission is required.',403);
        fail_unless($before==='For_Signature','Only a Leave Application For Signature can be released.',409);
        $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'Release remarks must be at most 2000 characters.');
        $leave['status']='Released'; $leave['releasedAt']=$at; $leave['releasedByUserId']=$u['id']; $leave['releasedByName']=$u['name']; $leave['releaseRemarks']=$remarks; $event='LEAVE_RELEASED'; $summary='Leave application released';
    } elseif ($action==='placeLeaveOnHold') {
        fail_unless(in_array($before,['For_Computation','For_Processing','For_Signature'],true),'Only an active Leave Application can be placed on hold.',409); require_leave_stage_authority($s,$u,$before);
        $reason=required($data,'reason',500); $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'Hold remarks must be at most 2000 characters.');
        $leave['heldFromStatus']=$before; $leave['status']='On_Hold'; $leave['holdReason']=$reason; $leave['holdRemarks']=$remarks; $leave['heldAt']=$at; $leave['heldByUserId']=$u['id']; $leave['heldByName']=$u['name']; unset($leave['complianceReceivedAt'],$leave['complianceReceivedByUserId'],$leave['complianceReceivedByName'],$leave['complianceRemarks']);
        $event='LEAVE_PLACED_ON_HOLD'; $summary='Leave placed on hold'; $remarks=$reason.($remarks!==''?' — '.$remarks:'');
    } elseif ($action==='recordLeaveCompliance') {
        fail_unless($before==='On_Hold','Compliance can only be recorded for a Leave Application On Hold.',409); $heldFrom=(string)($leave['heldFromStatus']??''); require_leave_stage_authority($s,$u,$heldFrom);
        $remarks=required($data,'remarks',2000); $leave['complianceRemarks']=$remarks; $leave['complianceReceivedAt']=$at; $leave['complianceReceivedByUserId']=$u['id']; $leave['complianceReceivedByName']=$u['name']; $event='LEAVE_COMPLIANCE_RECEIVED'; $summary='Leave compliance received';
    } elseif ($action==='resumeLeaveProcessing') {
        fail_unless($before==='On_Hold','Only a Leave Application On Hold can resume processing.',409); fail_unless(!empty($leave['complianceReceivedAt']),'Record compliance received before resuming processing.',409);
        $resume=(string)($leave['heldFromStatus']??''); fail_unless(in_array($resume,['For_Computation','For_Processing','For_Signature'],true),'The held processing stage is unavailable.',409); require_leave_stage_authority($s,$u,$resume);
        $leave['status']=$resume; $event='LEAVE_PROCESSING_RESUMED'; $summary='Leave processing resumed'; $remarks='Returned to '.str_replace('_',' ',$resume).'.';
    } elseif ($action==='cancelLeaveApplication') {
        fail_unless(has_cap($s,$u,'canSupervise'),'Leave cancellation requires supervisor authority.',403); fail_unless(in_array($before,['For_Computation','For_Processing','For_Signature','On_Hold'],true),'Only an active Leave Application can be cancelled.',409);
        $remarks=required($data,'reason',2000); $leave['status']='Cancelled'; $leave['cancelledAt']=$at; $leave['cancelledByUserId']=$u['id']; $leave['cancelledByName']=$u['name']; $leave['cancellationReason']=$remarks; $event='LEAVE_CANCELLED'; $summary='Leave application cancelled';
    } else throw new ApiError('Unsupported Leave workflow action.',404);
    $leave['updatedAt']=$at;
    return ['record'=>$leave,'event'=>$event,'summary'=>$summary,'details'=>'Previous status: '.str_replace('_',' ',$before).'. New status: '.str_replace('_',' ',$leave['status']).'.'.($remarks!==''?' Remarks/reason: '.$remarks:'')];
}
function validated_workflow(array $s,array $d): array {
    $d['title']=required($d,'title',160);
    $types=$d['documentTypes']??[$d['documentType']??null];
    fail_unless(is_array($types) && count($types)>0 && count($types)<=100,'Choose between 1 and 100 document types.');
    $types=array_values(array_unique(array_map(fn($type)=>required(['type'=>$type],'type'),$types)));
    fail_unless(!in_array('All',$types,true) || count($types)===1,'All Documents cannot be combined with individual document types.');
    $d['documentTypes']=$types; $d['documentType']=$types[0];
    choice($d['classification']??null,['Communication','Payroll','Request','Others'],'classification');
    fail_unless(is_array($d['steps']??null) && count($d['steps'])>0 && count($d['steps'])<=50,'A workflow needs between 1 and 50 steps.');
    foreach ($d['steps'] as $i=>&$step) {
        $step['stepNumber']=$i+1; $step['name']=required($step,'name',160);
        $step['slaHours']=positive($step['slaHours']??0,'SLA hours');
        // Legacy templates did not have a stage type. Preserve them as internal steps,
        // except for their existing terminal release stage.
        $stageType=choice($step['stageType']??(($step['requiredAction']??'')==='Release & Archive'?'FINAL_RELEASE':'INTERNAL_PROCESSING'),['INTERNAL_PROCESSING','EXTERNAL_HANDOFF_REVIEW','FINAL_RELEASE'],'stage type');
        $step['stageType']=$stageType;
        if ($stageType==='EXTERNAL_HANDOFF_REVIEW') {
            fail_unless($i<count($d['steps'])-1,'An external handoff must be followed by an internal workflow stage.');
            $step['requiredAction']='External Handoff'; $step['assigneeType']='System'; $step['assigneeName']='System / awaiting HRMDO handoff';
            $step['externalPurpose']=choice($step['externalPurpose']??null,['Approval','Comments','Signature','Review','Recommendation','Certification','Other'],'external purpose');
            $step['externalDestinationMode']=choice($step['externalDestinationMode']??'SELECT_AT_HANDOFF',['FIXED_DESTINATION','SELECT_AT_HANDOFF'],'external destination mode');
            if ($step['externalDestinationMode']==='FIXED_DESTINATION') $step['externalDestinationOffice']=required($step,'externalDestinationOffice',190);
            else unset($step['externalDestinationOffice']);
            $receiverType=choice($step['returnReceiverType']??null,['Person','Role','Team'],'return receiver type'); $step['returnReceiverType']=$receiverType;
            if ($receiverType==='Person') {
                $receiver=$s['users'][index_of($s['users'],required($step,'returnReceiverUserId'))]; $step['returnReceiverName']=$receiver['name'];
            } elseif ($receiverType==='Role') {
                $roleId=required($step,'returnReceiverRole'); $matches=array_values(array_filter($s['systemRoles'],fn($role)=>$role['id']===$roleId));
                fail_unless(count($matches)>0,'Stage '.($i+1).' uses a return receiver role that no longer exists.'); $step['returnReceiverName']=$matches[0]['name'];
            } else {
                $team=required($step,'returnReceiverTeam'); fail_unless(count(array_filter($s['users'],fn($u)=>in_array($team,[$u['division'],$u['office']],true)))>0,'The return receiver team must match an existing user division or office.'); $step['returnReceiverName']=$team;
            }
            $turnaround=$step['expectedTurnaroundHours']??null;
            if ($turnaround!==null && $turnaround!=='') $step['expectedTurnaroundHours']=positive($turnaround,'Expected turnaround hours'); else unset($step['expectedTurnaroundHours']);
            $step['requiresReturnedAttachment']=(bool)($step['requiresReturnedAttachment']??false); $step['requiresExternalResult']=(bool)($step['requiresExternalResult']??false);
            $step['allowReturn']=false; $step['allowHold']=false; $step['requiresAttachment']=false;
            continue;
        }
        $step['requiredAction']=choice($step['requiredAction']??null,['Receive','Verify & Process','Review & Recommend','Approve & Sign','Release & Archive'],'required action');
        if ($stageType==='FINAL_RELEASE') {
            fail_unless($i===count($d['steps'])-1,'Final Release must be the final workflow step.'); $step['requiredAction']='Release & Archive';
        } else fail_unless($step['requiredAction']!=='Release & Archive','Use the Final Release stage type for Release & Archive.');
        choice($step['assigneeType']??null,['Person','Role','Team'],'assignee type');
        if ($step['assigneeType']==='Person') {
            $u=$s['users'][index_of($s['users'],required($step,'assigneeUserId'))]; $step['assigneeName']=$u['name'];
        } elseif ($step['assigneeType']==='Role') {
            $roleId=required($step,'assigneeRole');
            $matches=array_values(array_filter($s['systemRoles'],fn($role)=>$role['id']===$roleId));
            fail_unless(count($matches)>0,'Stage '.($i+1).' uses a role that no longer exists. Choose another assignee.');
            $step['assigneeName']=$matches[0]['name'];
        } else {
            $team=required($step,'assigneeTeam');
            fail_unless(count(array_filter($s['users'],fn($u)=>in_array($team,[$u['division'],$u['office']],true)))>0,'A team must match an existing user division or office.');
            $step['assigneeName']=$team;
        }
        $step['allowReturn']=(bool)($step['allowReturn']??false); $step['allowHold']=(bool)($step['allowHold']??false); $step['requiresAttachment']=(bool)($step['requiresAttachment']??false);
    } unset($step);
    $d['isActive']=(bool)($d['isActive']??false); return $d;
}
function resolve_workflow(array $s,array $d): array {
    $matches=[]; $payrollIntakeWithoutEmployment=($d['classification']??null)==='Payroll' && empty($d['employmentClassification']);
    foreach ($s['workflowTemplates'] as $wf) {
        if (empty($wf['isActive']) || empty($wf['steps']) || $wf['classification']!==$d['classification']) continue;
        $types=$wf['documentTypes']??[$wf['documentType']];
        $exact=count(array_filter($types,fn($type)=>strcasecmp($type,$d['documentType'])===0))>0;
        if (!$exact && count(array_filter($types,fn($type)=>in_array(strtolower($type),['all','default'],true)))===0) continue;
        $employment=$wf['employmentClassification']??'All';
        // Payroll employment classification is deliberately assigned in Phase 2.
        // At intake, select the matching document-type workflow first; prefer an
        // All-employment template, otherwise allow one unambiguous configured
        // employment template to provide the initial routing snapshot.
        if (!$payrollIntakeWithoutEmployment && $employment!=='All' && $employment!==($d['employmentClassification']??null)) continue;
        $matches[]=['workflow'=>$wf,'typeScore'=>$exact?2:0,'employmentScore'=>$payrollIntakeWithoutEmployment ? ($employment==='All'?1:0) : ($employment!=='All'?1:0)];
    }
    usort($matches,fn($a,$b)=>($b['typeScore']<=>$a['typeScore']) ?: ($b['employmentScore']<=>$a['employmentScore']));
    fail_unless(count($matches)>0,'Configure an active workflow for this classification and document type first.');
    fail_unless(count($matches)<2 || $matches[0]['typeScore']!==$matches[1]['typeScore'] || $matches[0]['employmentScore']!==$matches[1]['employmentScore'],'Multiple workflows match. Deactivate the duplicate routing configuration.');
    return $matches[0]['workflow'];
}
function attach_files(PDO $pdo,array $u,array $files,string $owner,int $step=1): array {
    fail_unless(count($files)<=20,'At most 20 attachments are allowed per operation.'); $result=[];
    foreach ($files as $file) {
        $id=required($file,'id',64); $q=$pdo->prepare('SELECT * FROM app_files WHERE id=? FOR UPDATE'); $q->execute([$id]); $r=$q->fetch();
        fail_unless((bool)$r && $r['uploaded_by']===$u['id'] && ($r['owner_id']===null || $r['owner_id']===$owner),'Attachment is unavailable or belongs to another record.');
        $pdo->prepare('UPDATE app_files SET owner_id=? WHERE id=?')->execute([$owner,$id]);
        $result[]=['id'=>$id,'name'=>$r['original_name'],'sizeBytes'=>(int)$r['size_bytes'],'mimeType'=>$r['mime_type'],'uploadedBy'=>$u['name'],'uploadedAt'=>$r['created_at'],'stepNumber'=>$step,'url'=>'files.php?id='.$id];
    }
    return $result;
}
function register_document(PDO $pdo,array &$s,array $u,array $d): array {
    require_cap($s,$u,'canIntake');
    $title=required($d,'title',300); $office=required($d,'sourceOffice'); $type=required($d,'documentType');
    $category=null; foreach ($s['classifications'] as $c) if ($c['classification']===($d['classification']??'')) $category=$c;
    fail_unless($category!==null,'Choose a configured classification.');
    fail_unless(count(array_filter($category['types'],fn($t)=>!empty($t['isActive']) && strcasecmp($t['name'],$type)===0))>0,'Choose an active document type from the catalogue.');
    $wf=resolve_workflow($s,$d); $id=uid('doc'); $barcode=trim($d['barcode']??'') ?: 'HRMDO-'.date('Y').'-'.strtoupper(bin2hex(random_bytes(5)));
    assert_barcode($s,$barcode); $steps=[]; $registeredAt=now();
    foreach ($wf['steps'] as $i=>$st) {
        $stageType=$st['stageType']??(($st['requiredAction']??'')==='Release & Archive'?'FINAL_RELEASE':'INTERNAL_PROCESSING');
        $isExternal=$stageType==='EXTERNAL_HANDOFF_REVIEW';
        $instance=['stepNumber'=>$i+1,'name'=>$st['name'],'stageType'=>$stageType,'assignedTo'=>$isExternal?['type'=>'System','displayName'=>'System / awaiting HRMDO handoff']:['type'=>$st['assigneeType'],'role'=>$st['assigneeRole']??null,'team'=>$st['assigneeTeam']??null,'userId'=>$st['assigneeType']==='Person'?($st['assigneeUserId']??null):null,'displayName'=>$st['assigneeName']], 'requiredAction'=>$st['requiredAction'],'allowReturn'=>$st['allowReturn'],'allowHold'=>$st['allowHold']??false,'requiresAttachment'=>$st['requiresAttachment'],'status'=>$i===0?'In_Progress':'Pending','slaHours'=>$st['slaHours'],'startedAt'=>$i===0?$registeredAt:null,'isCurrent'=>$i===0];
        if ($isExternal) {
            $instance=array_merge($instance,['externalPurpose'=>$st['externalPurpose'],'externalDestinationMode'=>$st['externalDestinationMode'],'externalDestinationOffice'=>$st['externalDestinationOffice']??null,'returnReceiver'=>['type'=>$st['returnReceiverType'],'role'=>$st['returnReceiverRole']??null,'team'=>$st['returnReceiverTeam']??null,'userId'=>$st['returnReceiverType']==='Person'?($st['returnReceiverUserId']??null):null,'displayName'=>$st['returnReceiverName']],'expectedTurnaroundHours'=>$st['expectedTurnaroundHours']??null,'requiresReturnedAttachment'=>(bool)($st['requiresReturnedAttachment']??false),'requiresExternalResult'=>(bool)($st['requiresExternalResult']??false),'externalStatus'=>$i===0?'PENDING_HANDOFF':null]);
            if ($i===0) $instance['handoffOwner']=['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']];
        }
        $steps[]=$instance;
    }
    $senderName=trim((string)($d['senderName']??$u['name']));
    if (strcasecmp($senderName,$office.' Signatory')===0) $senderName=$office;
    $doc=['id'=>$id,'trackingNumber'=>$barcode,'barcode'=>$barcode,'title'=>$title,'subject'=>$d['subject']??$title,'sourceType'=>choice($d['sourceType']??'Internal',['Internal','External'],'source type'),'sourceOffice'=>$office,'senderName'=>$senderName,'classification'=>$category['classification'],'documentType'=>$type,'employmentClassification'=>$d['employmentClassification']??null,'priority'=>choice($d['priority']??'Routine',['Routine','Priority','Urgent'],'priority'),'dateReceived'=>$registeredAt,'dateEncoded'=>$registeredAt,'description'=>$d['description']??'','status'=>'In_Progress','currentStepNumber'=>1,'totalSteps'=>count($steps),'workflowTemplateId'=>$wf['id'],'workflowVersion'=>$wf['version'],'workflowSteps'=>$steps,'attachments'=>attach_files($pdo,$u,$d['files']??[],$id),'currentLocation'=>'HRMDO','custodyHistory'=>[['id'=>uid('custody'),'movementType'=>'INTAKE','fromLocation'=>$office,'toLocation'=>'HRMDO','timestamp'=>$registeredAt,'actorId'=>$u['id'],'actorName'=>$u['name']]],'encodedBy'=>['userId'=>$u['id'],'userName'=>$u['name']]];
    $doc['status']=($steps[0]['stageType']??'')==='EXTERNAL_HANDOFF_REVIEW'?'Awaiting_External_Handoff':match($steps[0]['requiredAction']) { 'Approve & Sign'=>'Pending_Approval','Review & Recommend'=>'Under_Review','Release & Archive'=>'Ready_For_Release',default=>'In_Progress' };
    // Registration is the Receive action itself.  A workflow that begins with an
    // intake phase therefore starts its operational work at the next phase.
    if (count($steps)>1 && ($steps[0]['stageType']??'INTERNAL_PROCESSING')==='INTERNAL_PROCESSING' && ($steps[0]['requiredAction']??'')==='Receive') {
        $doc['workflowSteps'][0]['status']='Completed';
        $doc['workflowSteps'][0]['isCurrent']=false;
        $doc['workflowSteps'][0]['completedAt']=$registeredAt;
        $doc['workflowSteps'][0]['completedBy']=['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']];
        $doc['workflowSteps'][0]['actionTaken']='Document intake and initial docketing completed during registration.';
        activate_document_step($doc,1,['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']]);
    }
    $s['documents'][]=$doc; return $doc;
}
function delete_document(PDO $pdo,array &$s,array $u,string $documentId): bool {
    require_cap($s,$u,'canAdmin'); $i=index_of($s['documents'],$documentId); $doc=$s['documents'][$i];
    $s['documents']=array_values(array_filter($s['documents'],fn($record)=>$record['id']!==$doc['id']));
    // A single payroll voucher has a document-backed payroll item.  Removing the
    // document must also remove that dependent item so it cannot remain in a queue.
    $s['payrollItems']=array_values(array_filter($s['payrollItems'],fn($item)=>($item['documentId']??null)!==$doc['id']));
    $pdo->prepare('DELETE FROM app_files WHERE owner_id=?')->execute([$doc['id']]);
    return true;
}
function activate_document_step(array &$doc,int $nextIndex,array $actor): void {
    $next=&$doc['workflowSteps'][$nextIndex];
    $next['status']='In_Progress'; $next['isCurrent']=true; $next['startedAt']=now(); $doc['currentStepNumber']=$nextIndex+1;
    if (($next['stageType']??'INTERNAL_PROCESSING')==='EXTERNAL_HANDOFF_REVIEW') {
        $next['assignedTo']=['type'=>'System','displayName'=>'System / awaiting HRMDO handoff'];
        $next['externalStatus']='PENDING_HANDOFF'; $next['handoffOwner']=$actor; unset($next['externalHandoff'],$next['externalReturn']);
        $doc['status']='Awaiting_External_Handoff';
    } else $doc['status']=match($next['requiredAction']??'') { 'Approve & Sign'=>'Pending_Approval','Review & Recommend'=>'Under_Review','Release & Archive'=>'Ready_For_Release',default=>'In_Progress' };
    unset($next);
}
function document_action(PDO $pdo,array &$s,array $u,string $action,array $args): array {
    $i=index_of($s['documents'],(string)($args[0]??'')); $doc=&$s['documents'][$i];
    // A direct action request must not disclose a record merely because its ID is
    // known. Processing authorization remains more restrictive below.
    fail_unless(can_view_document($s,$u,$doc),'Record not found.',404);
    fail_unless(empty($doc['isLegacyV1']),'Historical documents are read only.');
    fail_unless(!in_array($doc['status'],['Released','Archived','Disapproved'],true),'This document workflow has already concluded.',409);
    $n=$doc['currentStepNumber']-1; $step=&$doc['workflowSteps'][$n];
    fail_unless(is_array($step),'The document has no current workflow step.');
    $isExternal=($step['stageType']??'INTERNAL_PROCESSING')==='EXTERNAL_HANDOFF_REVIEW';
    if ($action==='recordExternalHandoff') {
        fail_unless($isExternal && ($step['externalStatus']??null)==='PENDING_HANDOFF','This document is not awaiting an external handoff.',409);
        $owner=$step['handoffOwner']['userId']??null;
        fail_unless($owner===$u['id'],'Only the assigned outbound handoff officer can send this document outside HRMDO.',403);
        $handoff=$args[1]??[]; fail_unless(is_array($handoff),'External handoff details are required.');
        $destination=required($handoff,'destinationOffice');
        if (($step['externalDestinationMode']??'')==='FIXED_DESTINATION') fail_unless(strcasecmp($destination,(string)$step['externalDestinationOffice'])===0,'Use the fixed destination configured for this workflow stage.');
        $purpose=choice($handoff['purpose']??($step['externalPurpose']??null),['Approval','Comments','Signature','Review','Recommendation','Certification','Other'],'external purpose');
        $sentAt=now(); $files=$handoff['files']??[]; fail_unless(is_array($files),'Invalid handoff attachments.');
        if ($files) $doc['attachments']=array_merge($doc['attachments'],attach_files($pdo,$u,$files,$doc['id'],$n+1));
        $expectedReturn=isset($handoff['expectedReturn'])?trim((string)$handoff['expectedReturn']):'';
        if ($expectedReturn==='' && !empty($step['expectedTurnaroundHours'])) $expectedReturn=gmdate('Y-m-d\\TH:i:s\\Z',time()+(int)round($step['expectedTurnaroundHours']*3600));
        $step['externalStatus']='OUTSIDE_HRMDO'; $step['externalHandoff']=['destinationOffice'=>$destination,'purpose'=>$purpose,'handedTo'=>required($handoff,'handedTo'),'representative'=>isset($handoff['representative'])?trim((string)$handoff['representative']):'','remarks'=>isset($handoff['remarks'])?trim((string)$handoff['remarks']):'','expectedReturn'=>$expectedReturn,'sentAt'=>$sentAt,'sentBy'=>['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']]];
        $doc['currentLocation']=$destination; $doc['status']='Awaiting_External_Return';
        $doc['custodyHistory'][]=['id'=>uid('custody'),'movementType'=>'EXTERNAL_HANDOFF','fromLocation'=>'HRMDO','toLocation'=>$destination,'timestamp'=>$sentAt,'stageNumber'=>$n+1,'purpose'=>$purpose,'remarks'=>$step['externalHandoff']['remarks'],'actorId'=>$u['id'],'actorName'=>$u['name'],'representative'=>$step['externalHandoff']['handedTo']];
        return $doc;
    }
    if ($action==='recordExternalReturn') {
        fail_unless($isExternal && ($step['externalStatus']??null)==='OUTSIDE_HRMDO','This document is not currently outside HRMDO.',409);
        $receiver=$step['returnReceiver']??[];
        fail_unless(assignment_matches($u,$receiver),'Only the configured return receiver can record this return.',403);
        $return=$args[1]??[]; fail_unless(is_array($return),'External return details are required.');
        $returnedFrom=required($return,'returnedFrom'); $sentTo=$step['externalHandoff']['destinationOffice']??'';
        fail_unless($sentTo==='' || strcasecmp($returnedFrom,$sentTo)===0,'The return office must match the recorded external destination.');
        $result=$return['result']??'';
        if (!empty($step['requiresExternalResult'])) $result=choice($result,['Approved','Approved with Comments','Returned with Comments','Signed','Reviewed','Disapproved','No Action','Other'],'external result');
        elseif ($result!=='') $result=choice($result,['Approved','Approved with Comments','Returned with Comments','Signed','Reviewed','Disapproved','No Action','Other'],'external result');
        $files=$return['files']??[]; fail_unless(is_array($files),'Invalid return attachments.');
        fail_unless(empty($step['requiresReturnedAttachment']) || count($files)>0,'Attach the returned or signed document before confirming its return.');
        if ($files) $doc['attachments']=array_merge($doc['attachments'],attach_files($pdo,$u,$files,$doc['id'],$n+1));
        $returnedAt=now(); $step['externalStatus']='COMPLETED'; $step['status']='Completed'; $step['isCurrent']=false; $step['completedAt']=$returnedAt;
        $step['completedBy']=['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']]; $step['actionTaken']='External return recorded'.($result?': '.$result:'');
        $step['externalReturn']=['returnedFrom'=>$returnedFrom,'returnedBy'=>isset($return['returnedBy'])?trim((string)$return['returnedBy']):'','result'=>$result?:null,'remarks'=>isset($return['remarks'])?trim((string)$return['remarks']):'','returnedAt'=>$returnedAt,'receivedBy'=>['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']]];
        $doc['currentLocation']='HRMDO'; $doc['custodyHistory'][]=['id'=>uid('custody'),'movementType'=>'RETURN_TO_HRMDO','fromLocation'=>$returnedFrom,'toLocation'=>'HRMDO','timestamp'=>$returnedAt,'stageNumber'=>$n+1,'purpose'=>$step['externalHandoff']['purpose']??$step['externalPurpose']??'','remarks'=>$step['externalReturn']['remarks'],'actorId'=>$u['id'],'actorName'=>$u['name'],'representative'=>$step['externalReturn']['returnedBy']];
        if ($result==='Disapproved') {
            $doc['status']='Disapproved';
            for ($future=$n+1;$future<count($doc['workflowSteps']);$future++) {
                $doc['workflowSteps'][$future]['status']='Skipped';
                $doc['workflowSteps'][$future]['isCurrent']=false;
                $doc['workflowSteps'][$future]['actionTaken']='Skipped because the external review disapproved the document.';
            }
        } elseif ($n+1<count($doc['workflowSteps'])) activate_document_step($doc,$n+1,$step['completedBy']);
        else $doc['status']='Ready_For_Release';
        return $doc;
    }
    fail_unless(!$isExternal,'Use the external handoff and return actions for this workflow stage.',409);
    if ($action==='submitDocumentCompliance') {
        fail_unless(($doc['status']??'')==='On_Hold','This document is not awaiting compliance.',409);
        fail_unless(assignment_matches($u,$step['assignedTo']),'Only the assigned phase processor can submit compliance.',403);
        $submission=$args[1]??[]; fail_unless(is_array($submission),'Compliance details are required.');
        $files=$submission['files']??[]; fail_unless(is_array($files),'Invalid compliance attachments.');
        if ($files) { $added=attach_files($pdo,$u,$files,$doc['id'],$n+1); $doc['attachments']=array_merge($doc['attachments'],$added); $doc['complianceAttachments']=$added; }
        $doc['complianceRemarks']=required(['remarks'=>$submission['remarks']??''],'remarks',4000); $doc['complianceSubmittedAt']=now(); $doc['status']='Ready_For_Recheck'; $step['status']='Ready_For_Recheck';
        return $doc;
    }
    if ($action==='recheckDocumentHold') {
        $resumeFrom=$doc['status']??'';
        fail_unless(in_array($resumeFrom,['On_Hold','Ready_For_Recheck'],true),'This document is not in an active hold cycle.',409);
        fail_unless(assignment_matches($u,$step['assignedTo']),'Only the assigned phase processor can resume this document.',403);
        $submission=$args[1]??[]; fail_unless(is_array($submission),'Compliance details are invalid.');
        if ($resumeFrom==='On_Hold') {
            $files=$submission['files']??[]; fail_unless(is_array($files),'Invalid compliance attachments.');
            if ($files) { $added=attach_files($pdo,$u,$files,$doc['id'],$n+1); $doc['attachments']=array_merge($doc['attachments'],$added); $doc['complianceAttachments']=$added; }
            $doc['complianceRemarks']=required(['remarks'=>$submission['remarks']??''],'remarks',4000); $doc['complianceSubmittedAt']=now();
            $doc['complianceSubmittedByUserId']=$u['id']; $doc['complianceSubmittedByName']=$u['name'];
        }
        $doc['status']=$doc['preHoldStatus']??'In_Progress'; $step['status']='In_Progress'; $doc['holdResolvedAt']=now(); $doc['holdResolvedByUserId']=$u['id']; $doc['holdResolvedByName']=$u['name'];
        unset($doc['preHoldStatus']); return $doc;
    }
    fail_unless(!in_array($doc['status'],['On_Hold','Ready_For_Recheck'],true) || in_array($action,['addDocumentRemark','uploadSupportingFile'],true),'Resolve the current hold before processing this phase.',409);
    if ($action==='reassignTask') require_cap($s,$u,'canSupervise');
    elseif (!in_array($action,['addDocumentRemark','uploadSupportingFile'],true)) fail_unless(assignment_matches($u,$step['assignedTo']) || ($action==='releaseDocument' && $doc['status']==='Ready_For_Release' && $step['status']==='Completed' && has_cap($s,$u,'canRelease')),'This task is assigned to another officer.',403);
    else fail_unless(assignment_matches($u,$step['assignedTo']),'Only the assigned phase processor can add supporting information.',403);
    if ($action==='placeDocumentHold') {
        fail_unless(!empty($step['allowHold']),'Holding is disabled for this workflow phase.',409);
        fail_unless(!in_array($doc['status'],['On_Hold','Ready_For_Recheck'],true),'This document is already in a hold cycle.',409);
        $hold=$args[1]??[]; fail_unless(is_array($hold),'Hold details are required.'); $reason=required($hold,'reason',2000); $notes=trim((string)($hold['remarks']??''));
        $files=$hold['files']??[]; fail_unless(is_array($files),'Invalid hold attachments.'); if ($files) $doc['attachments']=array_merge($doc['attachments'],attach_files($pdo,$u,$files,$doc['id'],$n+1));
        $doc['preHoldStatus']=$doc['status']; $doc['status']='On_Hold'; $doc['holdReason']=$reason; $doc['holdRemarks']=$notes; $doc['holdPhaseNumber']=$n+1; $doc['heldAt']=now(); $doc['heldByUserId']=$u['id']; $doc['heldByName']=$u['name']; $step['status']='On_Hold';
        unset($doc['holdResolvedAt'],$doc['holdResolvedByUserId'],$doc['holdResolvedByName'],$doc['complianceSubmittedAt'],$doc['complianceSubmittedByUserId'],$doc['complianceSubmittedByName'],$doc['complianceRemarks'],$doc['complianceAttachments']);
    } elseif ($action==='claimTask') {
        fail_unless(empty($step['assignedTo']['userId']) || $step['assignedTo']['userId']===$u['id'],'Task has already been claimed.',409);
        $step['assignedTo']['userId']=$u['id']; $step['assignedTo']['displayName']=$u['name'];
    } elseif ($action==='reassignTask') {
        required(['reason'=>$args[3]??''],'reason',2000); $target=$s['users'][index_of($s['users'],(string)$args[1])];
        $step['assignedTo']=['type'=>'Person','userId'=>$target['id'],'displayName'=>$target['name']];
    } elseif ($action==='addDocumentRemark') {
        $remark=required(['remark'=>$args[1]??''],'remark',4000);
        $doc['remarks'][]=['id'=>uid('remark'),'text'=>$remark,'authorId'=>$u['id'],'authorName'=>$u['name'],'timestamp'=>now()];
    } elseif ($action==='uploadSupportingFile') {
        $doc['attachments']=array_merge($doc['attachments'],attach_files($pdo,$u,[$args[1]],$doc['id'],$n+1));
    } elseif ($action==='returnStep') {
        fail_unless($n>0 && !empty($step['allowReturn']),'This step cannot be returned.');
        $reason=required(['reason'=>$args[1]??''],'reason',4000);
        for ($j=$n-1;$j<count($doc['workflowSteps']);$j++) {
            $st=&$doc['workflowSteps'][$j]; $st['status']=$j===$n-1?'In_Progress':'Pending'; $st['isCurrent']=$j===$n-1;
            unset($st['completedAt'],$st['completedBy'],$st['actionTaken']); $st['startedAt']=$j===$n-1?now():null;
        } unset($st);
        $doc['currentStepNumber']=$n; $doc['status']='Returned'; $doc['workflowSteps'][$n-1]['remarks']=$reason;
    } elseif (in_array($action,['completeStep','approveDocument','releaseDocument'],true)) {
        $required=$step['requiredAction']??'Verify & Process';
        if ($action==='completeStep' && $doc['classification']==='Payroll' && $required==='Verify & Process') {
            $singleItems=array_values(array_filter($s['payrollItems'],fn($item)=>($item['documentId']??null)===$doc['id'] && ($item['batchId']??null)==='SINGLE_ENTRY'));
            if (count($singleItems)>0) fail_unless(payroll_item_is_ready($singleItems[0]),'Choose the employment classification before completing Initial Checking.');
        }
        fail_unless($step['status']!=='Completed' || ($action==='releaseDocument' && $doc['status']==='Ready_For_Release'),'Step was already completed.',409);
        if ($required==='Approve & Sign' && $step['status']!=='Completed') { require_cap($s,$u,'canApprove'); fail_unless($action==='approveDocument','Use the approval action for this step.'); }
        if ($action==='approveDocument') { require_cap($s,$u,'canApprove'); fail_unless($required==='Approve & Sign','The current step is not an approval step.'); }
        if ($required==='Release & Archive') fail_unless($action==='releaseDocument','Use the release action and supply receipt details.');
        if ($action==='releaseDocument') { require_cap($s,$u,'canRelease'); fail_unless($n===count($doc['workflowSteps'])-1,'Complete all preceding steps before release.'); }
        if ($action==='completeStep' && !empty($args[3])) $doc['attachments']=array_merge($doc['attachments'],attach_files($pdo,$u,$args[3],$doc['id'],$n+1));
        fail_unless(empty($step['requiresAttachment']) || count(array_filter($doc['attachments'],fn($f)=>($f['stepNumber']??0)===$n+1 && !empty($f['url'])))>0,'Upload a supporting file for this step before completing it.');
        if ($step['status']!=='Completed') {
            $step['status']='Completed'; $step['isCurrent']=false; $step['completedAt']=now();
            $step['completedBy']=['userId'=>$u['id'],'userName'=>$u['name'],'userRole'=>$u['roleTitle']];
            $step['remarks']=is_string($args[1]??null)?$args[1]:''; $step['actionTaken']=$args[2]??$required;
        }
        if ($action==='releaseDocument') {
            $details=$args[1]; required($details,'releasedTo'); $releaseMode=choice($details['releaseMode']??null,['HRMDO Liaison','External Liaison','In-Person Pickup','Others'],'release mode');
            if ($releaseMode==='Others') $details['otherReleaseMode']=required($details,'otherReleaseMode'); else unset($details['otherReleaseMode']);
            $releasedAt=now(); $doc['releasedDetails']=array_merge($details,['releaseNumber'=>uid('release'),'releasedAt'=>$releasedAt,'releasedBy'=>$u['name']]); $doc['status']='Released';
            $doc['custodyHistory'][]=['id'=>uid('custody'),'movementType'=>'FINAL_RELEASE','fromLocation'=>$doc['currentLocation']??'HRMDO','toLocation'=>$details['releasedTo'],'timestamp'=>$releasedAt,'stageNumber'=>$n+1,'remarks'=>$details['receiptRemarks']??'','actorId'=>$u['id'],'actorName'=>$u['name']];
        } elseif ($n+1<count($doc['workflowSteps'])) {
            activate_document_step($doc,$n+1,$step['completedBy']);
        } else $doc['status']='Ready_For_Release';
        foreach ($s['payrollItems'] as &$item) if (($item['documentId']??null)===$doc['id']) { $item['status']=$doc['status']==='Released'?'Completed':'In_Progress'; if ($required==='Verify & Process') $item['currentStage']='verification_signing'; if ($doc['status']==='Released') $item['currentStage']='completed'; $item['updatedAt']=now(); } unset($item);
    }
    return $doc;
}
