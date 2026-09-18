<?php
declare(strict_types=1);
require_once __DIR__.'/management.php';
require_once __DIR__.'/payroll.php';
$pdo=database(); $user=authenticated_user($pdo); $method=$_SERVER['REQUEST_METHOD'];
fail_unless(in_array($method,['GET','POST'],true),'Use GET to read or POST an operation.',405);
$body=[];
if ($method==='POST') { csrf_check(); $body=request_json(); }
$pdo->beginTransaction();
try {
    // One revision lock serializes related entity changes and prevents stale UI actions.
    $revision=(int)$pdo->query('SELECT revision FROM app_meta WHERE id=1 FOR UPDATE')->fetchColumn();
    $user=authenticated_user($pdo);
    $state=load_state($pdo); payroll_attach_batch_progress($state); $result=null;
    if ($method==='POST') {
        fail_unless(isset($body['revision']) && $body['revision']===$revision,'Another officer changed the records. Refresh, review the latest data, and submit again.',409);
        $action=required($body,'action',80); $args=$body['args']??[]; fail_unless(is_array($args),'Operation arguments are required.'); $before=$state;
        if ($action==='registerDocument') $result=register_document($pdo,$state,$user,$args[0]??[]);
        elseif ($action==='deleteDocument') $result=delete_document($pdo,$state,$user,(string)($args[0]??''));
        elseif (in_array($action,['claimTask','completeStep','returnStep','reassignTask','approveDocument','releaseDocument','addDocumentRemark','uploadSupportingFile','placeDocumentHold','submitDocumentCompliance','recheckDocumentHold','recordExternalHandoff','recordExternalReturn'],true)) $result=document_action($pdo,$state,$user,$action,$args);
        elseif (in_array($action,['registerSinglePayroll','registerPayrollBatch','updatePayrollBatch','deletePayrollBatch','updatePayrollItemClassification','bulkClassifyPayrollItems','markPayrollItemException','clearPayrollItemException','recordPayrollItemCompliance','recheckPayrollItem','placePayrollItemHold','submitPayrollItemCompliance','resumePayrollItemHold','completeInitialCheckingAndRoute','completePayrollItemInitialCheckingAndRoute','processWorkGroupItems','releasePayrollBatch'],true)) $result=payroll_action($pdo,$state,$user,$action,$args);
        elseif ($action==='fileLeaveApplication') {
            $modules=$user['sidebarModules']??null;
            fail_unless(has_cap($state,$user,'canIntake') && ($modules===null || in_array('leave',$modules,true)),'Your account is not authorized to register Leave Applications.',403);
            $createdAt=now(); $validated=validated_leave_application($state,$args[0]??[]);
            $result=array_merge($validated,['id'=>uid('leave'),'isLegacyV1'=>false,'filingDate'=>$createdAt,'status'=>'For_Computation','createdByUserId'=>$user['id'],'createdByName'=>$user['name'],'createdAt'=>$createdAt,'updatedAt'=>$createdAt,'releasedAt'=>null]);
            foreach ($result['dateRanges'] as &$range) { $range['leaveApplicationId']=$result['id']; $range['createdAt']=$createdAt; } unset($range);
            $state['leaveApplications'][]=$result;
        } elseif ($action==='registerEwpRecord') {
            $modules=$user['sidebarModules']??null;
            fail_unless(has_cap($state,$user,'canIntake') && ($modules===null || in_array('leave',$modules,true)),'Your account is not authorized to register EWP records.',403);
            $data=$args[0]??[]; fail_unless(is_array($data),'EWP record details are required.');
            $barcode=required($data,'barcode',190); assert_barcode($state,$barcode);
            $employeeName=required($data,'employeeName',190); $office=required($data,'office',190); $purpose=required($data,'purpose',2000);
            fail_unless(isset($data['amount']) && is_numeric($data['amount']),'Enter a valid EWP amount.');
            $amount=round((float)$data['amount'],2); fail_unless($amount>0 && $amount<=9999999999.99,'EWP amount must be greater than zero.');
            fail_unless(!isset($data['remarks']) || is_string($data['remarks']),'Invalid EWP remarks.');
            $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'EWP remarks must be at most 2000 characters.');
            $createdAt=now(); $result=['id'=>uid('ewp'),'barcode'=>$barcode,'employeeName'=>$employeeName,'office'=>$office,'amount'=>$amount,'purpose'=>$purpose,'remarks'=>$remarks,'status'=>'Recorded','createdByUserId'=>$user['id'],'createdByName'=>$user['name'],'createdAt'=>$createdAt,'updatedAt'=>$createdAt];
            $state['ewpRecords'][]=$result;
        } elseif ($action==='updateEwpRecord') {
            $modules=$user['sidebarModules']??null;
            fail_unless(has_cap($state,$user,'canIntake') && ($modules===null || in_array('leave',$modules,true)),'Your account is not authorized to edit EWP records.',403);
            $data=$args[0]??[]; fail_unless(is_array($data),'EWP record details are required.');
            $id=required($data,'id',64); $i=index_of($state['ewpRecords'],$id); $ewp=&$state['ewpRecords'][$i];
            fail_unless(($ewp['createdByUserId']??'')===$user['id'] || has_cap($state,$user,'canSupervise') || has_cap($state,$user,'canAdmin'),'Only the encoder or an authorized administrator can edit this EWP record.',403);
            $barcode=required($data,'barcode',190); assert_barcode($state,$barcode,[],$id);
            $employeeName=required($data,'employeeName',190); $office=required($data,'office',190); $purpose=required($data,'purpose',2000);
            fail_unless(isset($data['amount']) && is_numeric($data['amount']),'Enter a valid EWP amount.');
            $amount=round((float)$data['amount'],2); fail_unless($amount>0 && $amount<=9999999999.99,'EWP amount must be greater than zero.');
            fail_unless(!isset($data['remarks']) || is_string($data['remarks']),'Invalid EWP remarks.');
            $remarks=trim((string)($data['remarks']??'')); fail_unless(mb_strlen($remarks)<=2000,'EWP remarks must be at most 2000 characters.');
            $ewp=array_merge($ewp,['barcode'=>$barcode,'employeeName'=>$employeeName,'office'=>$office,'amount'=>$amount,'purpose'=>$purpose,'remarks'=>$remarks,'updatedAt'=>now()]);
            $result=$ewp;
        } elseif ($action==='deleteEwpRecord') {
            $modules=$user['sidebarModules']??null;
            fail_unless(has_cap($state,$user,'canIntake') && ($modules===null || in_array('leave',$modules,true)),'Your account is not authorized to delete EWP records.',403);
            $id=(string)($args[0]??''); $i=index_of($state['ewpRecords'],$id); $ewp=$state['ewpRecords'][$i];
            fail_unless(($ewp['createdByUserId']??'')===$user['id'] || has_cap($state,$user,'canSupervise') || has_cap($state,$user,'canAdmin'),'Only the encoder or an authorized administrator can delete this EWP record.',403);
            array_splice($state['ewpRecords'],$i,1); $result=['id'=>$id,'barcode'=>$ewp['barcode']??'','employeeName'=>$ewp['employeeName']??''];
        } elseif ($action==='updateLeaveApplication') {
            $modules=$user['sidebarModules']??null;
            fail_unless(has_cap($state,$user,'canIntake') && ($modules===null || in_array('leave',$modules,true)),'Your account is not authorized to edit Leave Applications.',403);
            $id=required($args[0]??[],'id',64); $i=index_of($state['leaveApplications'],$id); $leave=&$state['leaveApplications'][$i];
            fail_unless(empty($leave['isLegacyV1']),'Historical Leave records cannot be edited.',409);
            fail_unless(($leave['status']??'')==='For_Computation','Only Leave Applications For Computation can be edited.',409);
            fail_unless(($leave['createdByUserId']??'')===$user['id'] || has_cap($state,$user,'canSupervise') || has_cap($state,$user,'canAdmin'),'Only the encoder or an authorized administrator can edit this Leave Application.',403);
            $validated=validated_leave_application($state,$args[0],$id); $updatedAt=now();
            $oldRanges=[]; foreach ($leave['dateRanges']??[] as $range) if (!empty($range['id'])) $oldRanges[$range['id']]=$range;
            foreach ($validated['dateRanges'] as &$range) { $old=$oldRanges[$range['id']]??[]; $range['leaveApplicationId']=$id; $range['createdAt']=$old['createdAt']??$updatedAt; } unset($range);
            $leave=array_merge($leave,$validated,['updatedAt'=>$updatedAt]); $result=$leave;
        } elseif ($action==='deleteLeaveApplication') {
            $modules=$user['sidebarModules']??null;
            fail_unless($modules===null || in_array('leave',$modules,true),'Your account is not authorized to delete Leave Applications.',403);
            $id=(string)($args[0]??''); $i=index_of($state['leaveApplications'],$id); $leave=$state['leaveApplications'][$i];
            fail_unless(empty($leave['isLegacyV1']),'Historical Leave records cannot be deleted.',409);
            fail_unless(($leave['status']??'')==='For_Computation','Only Leave Applications For Computation can be deleted.',409);
            fail_unless(($leave['createdByUserId']??'')===$user['id'] || has_cap($state,$user,'canSupervise') || has_cap($state,$user,'canAdmin'),'Only the encoder or an authorized administrator can delete this Leave Application.',403);
            array_splice($state['leaveApplications'],$i,1); $result=['id'=>$id,'trackingNumber'=>$leave['trackingNumber']??$leave['barcode']??'','employeeName'=>$leave['employeeName']??''];
        } elseif (in_array($action,['changeLeaveApplicationStatus','completeLeaveComputation','sendLeaveForSignature','releaseLeaveApplication','placeLeaveOnHold','recordLeaveCompliance','resumeLeaveProcessing','cancelLeaveApplication'],true)) {
            $transition=transition_leave_application($state,$user,$action,$args); $result=$transition['record'];
        } elseif ($action==='approveLeaveApplication') {
            fail_unless(has_cap($state,$user,'canApprove') || has_cap($state,$user,'canSupervise'),'Leave approval permission is required.',403);
            $i=index_of($state['leaveApplications'],(string)($args[0]??'')); $leave=&$state['leaveApplications'][$i];
            fail_unless(empty($leave['isLegacyV1']) && $leave['status']==='Pending','Only pending current leave may be approved.',409);
            fail_unless($leave['employeeId']!==$user['id'],'An officer cannot approve their own leave.');
            $leave['status']='Approved'; $leave['approvalDate']=now(); $leave['approvedBy']=$user['name']; $result=$leave;
        } elseif ($action==='runMigrationCheck') {
            require_cap($state,$user,'canAdmin'); $count=0; $missing=0;
            foreach ($state['documents'] as $doc) if (!empty($doc['isLegacyV1'])) { $count++; foreach ($doc['attachments'] as $file) {
                $q=$pdo->prepare('SELECT sha256 FROM app_files WHERE id=?'); $q->execute([$file['id']]); $hash=$q->fetchColumn(); $path=app_config()['upload_directory'].'/'.$file['id'];
                if (!$hash || !is_file($path) || !hash_equals($hash,hash_file('sha256',$path))) $missing++;
            } }
            $result=['datasetName'=>'Historical documents','priority'=>'High','totalV1Records'=>$count,'successfullyMigrated'=>$count,'exceptionsCount'=>$missing,'status'=>$count===0?'Not Required':'Dry-Run Validated','v2Destination'=>'Document Registry','lastReconciledAt'=>now()];
            $state['migrationSummaries']=[$result];
        } elseif ($action==='changePassword') {
            $d=$args[0]??[]; $q=$pdo->prepare('SELECT password_hash FROM app_users WHERE id=?'); $q->execute([$user['id']]);
            fail_unless(password_verify(required($d,'currentPassword',72),$q->fetchColumn()),'Current password is incorrect.',403);
            $password=required($d,'newPassword',72); fail_unless(mb_strlen($password)>=3 && strlen($password)<=72,'Use a password with at least 3 characters and at most 72 bytes.');
            $hash=password_hash($password,PASSWORD_DEFAULT); $pdo->prepare('UPDATE app_users SET password_hash=? WHERE id=?')->execute([$hash,$user['id']]); $_SESSION['credential']=hash('sha256',$hash); $result=true;
        } else $result=management_action($pdo,$state,$user,$action,$args);
        persist_state($pdo,$before,$state);
        $id=is_array($result)?($result['id']??'system'):(is_string($args[0]??null)?$args[0]:'system');
        $details='';
        if (in_array($action,['addUser','updateUser','changePassword'],true)) $details='Account credentials or profile updated.';
        elseif ($action==='recordExternalHandoff') { $handoff=$args[1]??[]; $details='Destination: '.($handoff['destinationOffice']??'').' Purpose: '.($handoff['purpose']??'').' Handed to: '.($handoff['handedTo']??'').' Expected return: '.($handoff['expectedReturn']??'Not specified').'.'; }
        elseif ($action==='recordExternalReturn') { $return=$args[1]??[]; $details='Returned from: '.($return['returnedFrom']??'').' External result: '.($return['result']??'Not specified').'.'; }
        elseif ($action==='registerPayrollBatch' && is_array($result)) {
            $stages=$result['workflowStages']??[]; $initial=$result['initialCheckingDesk']??[];
            $details='Docketed by '.($result['encodedBy']['userName']??$user['name']).'. Stage 1 - '.($stages[0]['name']??'Docketing').' completed. Stage 2 - '.($stages[1]['name']??'Initial Checking').' assigned to '.($initial['userName']??'configured desk').'.';
        }
        elseif (isset($transition)) $details=$transition['details'];
        elseif (in_array($action,['registerEwpRecord','updateEwpRecord'],true) && is_array($result)) $details='Employee: '.$result['employeeName'].'. Office: '.$result['office'].'. Amount: PHP '.number_format((float)$result['amount'],2).'. Purpose: '.$result['purpose'].'. Barcode: '.$result['barcode'].'.';
        elseif (in_array($action,['fileLeaveApplication','updateLeaveApplication'],true) && is_array($result)) {
            $dates=implode(', ',array_map(fn($range)=>$range['startDate'].($range['endDate']!==$range['startDate']?' to '.$range['endDate']:'').' ('.$range['dayType'].')',$result['dateRanges']??[]));
            $details='Applicant: '.$result['employeeName'].'. Office: '.$result['office'].'. Leave type: '.$result['leaveType'].'.'.(!empty($result['leaveSubtype'])?' Structured subtype: '.$result['leaveSubtype'].'.':'').' Dates: '.$dates.'. Calculated total: '.$result['totalLeaveDays'].' day(s). Encoded by: '.($result['createdByName']??$user['name']).'. Barcode: '.$result['barcode'].'.';
        }
        elseif (in_array($action,['deleteLeaveApplication','deleteEwpRecord'],true) && is_array($result)) $details='Deleted '.($action==='deleteEwpRecord'?'EWP record':'Leave Application').' for '.($result['employeeName']??'unknown applicant').'.';
        elseif (is_array($args[0]??null)) {
            $parts=[];
            foreach (['title','name','classification','documentType','office','sourceOffice','leaveType','startDate','endDate','remarks','description'] as $field) if (isset($args[0][$field]) && is_string($args[0][$field]) && $args[0][$field]!=='') $parts[]=ucfirst($field).': '.$args[0][$field];
            $details=implode('. ',$parts);
        } else {
            $parts=[]; foreach (array_slice($args,1) as $value) {
                if (is_string($value)) $parts[]=$value;
                elseif (is_array($value)) foreach (['releasedTo','releaseMode','otherReleaseMode','receiptRemarks','name','description'] as $field) if (!empty($value[$field]) && is_string($value[$field])) $parts[]=ucfirst($field).': '.$value[$field];
            }
            $details=implode('. ',$parts);
        }
        $auditAction=['registerDocument'=>'DOCUMENT_REGISTERED','registerSinglePayroll'=>'DOCUMENT_REGISTERED','registerPayrollBatch'=>'PAYROLL_BATCH_DOCKETED','deleteDocument'=>'DOCUMENT_DELETED','completeStep'=>'STEP_COMPLETED','returnStep'=>'STEP_RETURNED','approveDocument'=>'DOCUMENT_APPROVED','releaseDocument'=>'DOCUMENT_RELEASED','claimTask'=>'TASK_CLAIMED','reassignTask'=>'TASK_REASSIGNED','addDocumentRemark'=>'REMARK_ADDED','uploadSupportingFile'=>'ATTACHMENT_UPLOADED','placeDocumentHold'=>'DOCUMENT_PLACED_ON_HOLD','submitDocumentCompliance'=>'DOCUMENT_COMPLIANCE_SUBMITTED','recheckDocumentHold'=>'DOCUMENT_HOLD_RESOLVED','runMigrationCheck'=>'MIGRATION_VERIFIED'][$action]??'WORKFLOW_CONFIG_UPDATED';
        $auditAction=['updatePayrollBatch'=>'PAYROLL_BATCH_UPDATED','deletePayrollBatch'=>'PAYROLL_BATCH_DELETED','updatePayrollItemClassification'=>'EMPLOYMENT_CLASSIFICATION_SET','bulkClassifyPayrollItems'=>'BULK_CLASSIFICATION_SET','markPayrollItemException'=>'PAYROLL_ITEM_PLACED_ON_HOLD','clearPayrollItemException'=>'PAYROLL_COMPLIANCE_RECEIVED','recordPayrollItemCompliance'=>'PAYROLL_COMPLIANCE_RECEIVED','recheckPayrollItem'=>'PAYROLL_ITEM_RECHECK_COMPLETED','placePayrollItemHold'=>'PAYROLL_ITEM_PLACED_ON_HOLD','submitPayrollItemCompliance'=>'PAYROLL_COMPLIANCE_RECEIVED','resumePayrollItemHold'=>'PAYROLL_HOLD_RESOLVED','completeInitialCheckingAndRoute'=>'INITIAL_CHECK_COMPLETED','completePayrollItemInitialCheckingAndRoute'=>'INITIAL_CHECK_ITEM_COMPLETED','processWorkGroupItems'=>($args[2]??'')==='exception'?'PAYROLL_ITEM_PLACED_ON_HOLD':'PAYROLL_ITEM_COMPLETED','releasePayrollBatch'=>'PAYROLL_RELEASED','fileLeaveApplication'=>'LEAVE_APPLICATION_REGISTERED','registerEwpRecord'=>'EWP_RECORD_REGISTERED','updateEwpRecord'=>'EWP_RECORD_UPDATED','deleteEwpRecord'=>'EWP_RECORD_DELETED','updateLeaveApplication'=>'LEAVE_APPLICATION_UPDATED','deleteLeaveApplication'=>'LEAVE_APPLICATION_DELETED','approveLeaveApplication'=>'LEAVE_APPROVED','addUser'=>'USER_CREATED','updateUser'=>'USER_UPDATED','deleteUser'=>'USER_DELETED','deleteClassificationType'=>'CLASSIFICATION_TYPE_DELETED','recordExternalHandoff'=>'DOCUMENT_SENT_OUTSIDE_HRMDO','recordExternalReturn'=>'DOCUMENT_RETURNED_TO_HRMDO','changePassword'=>'PASSWORD_CHANGED'][$action]??$auditAction;
        if (isset($transition)) $auditAction=$transition['event'];
        if (isset($transition)) $auditSummary=$transition['summary'];
        elseif ($action==='fileLeaveApplication') $auditSummary='Register leave application';
        elseif ($action==='registerEwpRecord') $auditSummary='Register EWP record';
        elseif ($action==='updateEwpRecord') $auditSummary='Update EWP record';
        elseif ($action==='deleteEwpRecord') $auditSummary='Delete EWP record';
        elseif ($action==='updateLeaveApplication') $auditSummary='Update leave application';
        elseif ($action==='deleteLeaveApplication') $auditSummary='Delete leave application';
        else $auditSummary=ucfirst(strtolower(preg_replace('/(?<!^)[A-Z]/',' $0',$action)));
        if ($action==='recordExternalReturn' && (($args[1]['result']??'')==='Disapproved')) {
            $auditAction='DOCUMENT_DISAPPROVED';
            $auditSummary='External review disapproved document';
        }
        audit($pdo,$user,$auditAction,$id,$auditSummary,$details,is_array($result)?($result['trackingNumber']??$result['batchNumber']??$result['barcode']??''):'');
        $pdo->exec('UPDATE app_meta SET revision=revision+1 WHERE id=1'); $revision++;
        $state=load_state($pdo); payroll_attach_batch_progress($state);
    }
    // Build the response from the authenticated user's record-level scope.  Actions
    // above always use the full state, so permission checks and routing rules are
    // evaluated against complete operational data before any records are hidden.
    $state=filter_state_for_view($state,$user);
    $pdo->commit(); respond(['state'=>$state,'revision'=>$revision,'result'=>$result]);
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
