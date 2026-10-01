<?php
declare(strict_types=1);
require_once __DIR__.'/document_read_http.php';
[$pdo,$user]=document_read_context();
$params=document_read_params(['id','trackingNumber','barcode','page','limit','status','classification','documentType','priority','workflowTemplateId','assignedUser','assignedRole','assignedTeam','dateFrom','dateTo','registry','isLegacyV1']);
$identifiers=array_intersect(['id','trackingNumber','barcode'],array_keys($params));
try {
    if ($identifiers) {
        fail_unless(count($identifiers)===1 && count($params)===1,'Supply one document identifier.',400);
        $field=reset($identifiers); $value=$params[$field];
        $found=match($field) {
            'id'=>document_repository_by_id($pdo,$user,$value),
            'trackingNumber'=>document_repository_by_tracking($pdo,$user,$value),
            'barcode'=>document_repository_by_barcode($pdo,$user,$value),
        };
        fail_unless($found!==null,'Record not found.',404);
        $detail=document_repository_detail($pdo,$user,$found['id']);
        fail_unless($detail!==null,'Record not found.',404);
        $singlePayrollItem=null;
        if (($detail['classification']??'')==='Payroll') {
            $linked=$pdo->prepare("SELECT r.record_json FROM payroll_read_items i JOIN app_records r ON r.collection='payrollItems' AND r.id=i.id WHERE i.document_id=? AND i.batch_id='SINGLE_ENTRY' LIMIT 1");
            $linked->execute([$detail['id']]);$rawItem=$linked->fetchColumn();
            if ($rawItem!==false)$singlePayrollItem=json_decode($rawItem,true,64,JSON_THROW_ON_ERROR);
        }
        respond(['data'=>$detail,'auditEvents'=>document_repository_audit($pdo,$detail['id']),'payrollItem'=>$singlePayrollItem]);
    }
    $page=document_read_number($params,'page',1);
    $limit=document_read_number($params,'limit',25);
    unset($params['page'],$params['limit']);
    if (isset($params['assignedUser'])) { $params['assignedUserId']=$params['assignedUser']; unset($params['assignedUser']); }
    document_read_page(document_repository_list($pdo,$user,$params,$page,$limit));
} catch (InvalidArgumentException $e) { throw new ApiError($e->getMessage(),400); }
