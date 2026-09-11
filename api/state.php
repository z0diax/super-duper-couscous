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
    $state=load_state($pdo); $result=null;
    if ($method==='POST') {
        fail_unless(isset($body['revision']) && $body['revision']===$revision,'Another officer changed the records. Refresh, review the latest data, and submit again.',409);
        $action=required($body,'action',80); $args=$body['args']??[]; fail_unless(is_array($args),'Operation arguments are required.'); $before=$state;
        if ($action==='registerDocument') $result=register_document($pdo,$state,$user,$args[0]??[]);
        elseif ($action==='deleteDocument') $result=delete_document($pdo,$state,$user,(string)($args[0]??''));
        elseif (in_array($action,['claimTask','completeStep','returnStep','reassignTask','approveDocument','releaseDocument','addDocumentRemark','uploadSupportingFile','recordExternalHandoff','recordExternalReturn'],true)) $result=document_action($pdo,$state,$user,$action,$args);
        elseif (in_array($action,['registerSinglePayroll','registerPayrollBatch','updatePayrollBatch','deletePayrollBatch','updatePayrollItemClassification','bulkClassifyPayrollItems','markPayrollItemException','clearPayrollItemException','completeInitialCheckingAndRoute','processWorkGroupItems','releasePayrollBatch'],true)) $result=payroll_action($pdo,$state,$user,$action,$args);
        elseif ($action==='fileLeaveApplication') {
            $d=$args[0]??[]; $start=required($d,'startDate',10); $end=required($d,'endDate',10);
            foreach ([$start,$end] as $date) { $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date); fail_unless($parsed!==false && $parsed->format('Y-m-d')===$date,'Enter valid leave dates.'); }
            fail_unless($start<=$end,'End date must be on or after start date.');
            $days=positive($d['workingDaysNumber']??0,'Working days',366); fail_unless($days<=(strtotime($end)-strtotime($start))/86400+1,'Working days exceed the date range.');
            choice($d['leaveType']??null,['Vacation Leave','Sick Leave','Maternity Leave','Paternity Leave','Solo Parent Leave','Mandatory / Forced Leave','Special Privilege Leave','Terminal Leave'],'leave type');
            choice($d['commutation']??null,['Requested','Not Requested'],'commutation');
            $result=array_merge($d,['id'=>uid('leave'),'isLegacyV1'=>false,'employeeId'=>$user['id'],'employeeName'=>$user['name'],'department'=>$user['division'],'position'=>$user['position'],'filingDate'=>now(),'status'=>'Pending']); $state['leaveApplications'][]=$result;
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
        elseif (is_array($args[0]??null)) {
            $parts=[];
            foreach (['title','name','classification','documentType','office','sourceOffice','leaveType','startDate','endDate','remarks','description'] as $field) if (isset($args[0][$field]) && is_string($args[0][$field]) && $args[0][$field]!=='') $parts[]=ucfirst($field).': '.$args[0][$field];
            $details=implode('. ',$parts);
        } else {
            $parts=[]; foreach (array_slice($args,1) as $value) {
                if (is_string($value)) $parts[]=$value;
                elseif (is_array($value)) foreach (['releasedTo','releaseMode','receiptRemarks','name','description'] as $field) if (!empty($value[$field]) && is_string($value[$field])) $parts[]=ucfirst($field).': '.$value[$field];
            }
            $details=implode('. ',$parts);
        }
        $auditAction=['registerDocument'=>'DOCUMENT_REGISTERED','registerSinglePayroll'=>'DOCUMENT_REGISTERED','registerPayrollBatch'=>'PAYROLL_BATCH_DOCKETED','deleteDocument'=>'DOCUMENT_DELETED','completeStep'=>'STEP_COMPLETED','returnStep'=>'STEP_RETURNED','approveDocument'=>'DOCUMENT_APPROVED','releaseDocument'=>'DOCUMENT_RELEASED','claimTask'=>'TASK_CLAIMED','reassignTask'=>'TASK_REASSIGNED','addDocumentRemark'=>'REMARK_ADDED','uploadSupportingFile'=>'ATTACHMENT_UPLOADED','runMigrationCheck'=>'MIGRATION_VERIFIED'][$action]??'WORKFLOW_CONFIG_UPDATED';
        $auditAction=['updatePayrollBatch'=>'PAYROLL_BATCH_UPDATED','deletePayrollBatch'=>'PAYROLL_BATCH_DELETED','updatePayrollItemClassification'=>'EMPLOYMENT_CLASSIFICATION_SET','bulkClassifyPayrollItems'=>'BULK_CLASSIFICATION_SET','markPayrollItemException'=>'PAYROLL_ITEM_EXCEPTION','clearPayrollItemException'=>'PAYROLL_ITEM_RETURNED','completeInitialCheckingAndRoute'=>'INITIAL_CHECK_COMPLETED','processWorkGroupItems'=>($args[2]??'')==='exception'?'PAYROLL_ITEM_EXCEPTION':'PAYROLL_ITEM_COMPLETED','releasePayrollBatch'=>'PAYROLL_RELEASED','fileLeaveApplication'=>'LEAVE_FILED','approveLeaveApplication'=>'LEAVE_APPROVED','addUser'=>'USER_CREATED','updateUser'=>'USER_UPDATED','deleteUser'=>'USER_DELETED','deleteClassificationType'=>'CLASSIFICATION_TYPE_DELETED','recordExternalHandoff'=>'DOCUMENT_SENT_OUTSIDE_HRMDO','recordExternalReturn'=>'DOCUMENT_RETURNED_TO_HRMDO','changePassword'=>'PASSWORD_CHANGED'][$action]??$auditAction;
        audit($pdo,$user,$auditAction,$id,ucfirst(strtolower(preg_replace('/(?<!^)[A-Z]/',' $0',$action))),$details,is_array($result)?($result['trackingNumber']??$result['batchNumber']??''):'');
        $pdo->exec('UPDATE app_meta SET revision=revision+1 WHERE id=1'); $revision++;
        $state=load_state($pdo);
    }
    // Staff may view the operational registry, but only their own leave records.
    if (!has_cap($state,$user,'canApprove') && !has_cap($state,$user,'canSupervise')) $state['leaveApplications']=array_values(array_filter($state['leaveApplications'],fn($l)=>$l['employeeId']===$user['id']));
    if (!has_cap($state,$user,'canSupervise')) $state['auditLogs']=array_values(array_filter($state['auditLogs'],fn($e)=>$e['actorId']===$user['id'] || in_array($e['documentId'],array_merge(array_column($state['documents'],'id'),array_column($state['payrollBatches'],'id')),true)));
    $pdo->commit(); respond(['state'=>$state,'revision'=>$revision,'result'=>$result]);
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
