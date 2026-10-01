<?php
declare(strict_types=1);
require_once __DIR__.'/../api/db.php';
if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database']))throw new RuntimeException('Disposable fixture only.');
$pdo=database();$plans=[];
$sql=[
    'dashboard_metrics'=>"SELECT COUNT(*) FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number WHERE d.is_legacy_v1=0",
    'dashboard_activity'=>"SELECT sequence,record_json FROM app_audit WHERE sequence<9223372036854775807 ORDER BY sequence DESC LIMIT 100",
    'ewp_page'=>"SELECT record_json FROM app_records WHERE collection='ewpRecords' ORDER BY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.createdAt')) DESC,id ASC LIMIT 10",
    'ewp_search'=>"SELECT COUNT(*) FROM app_records WHERE collection='ewpRecords' AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.employeeName'))) LIKE '%employee%'",
    'leave_page'=>"SELECT record_json FROM app_records WHERE collection='leaveApplications' AND COALESCE(JSON_EXTRACT(record_json,'$.isLegacyV1'),false)=false ORDER BY id LIMIT 10",
    'leave_detail'=>"SELECT record_json FROM app_records WHERE collection='leaveApplications' AND id='phase10-leave-00001'",
    'leave_audit'=>"SELECT record_json FROM app_audit WHERE JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.documentId'))='phase10-leave-00001' ORDER BY sequence DESC LIMIT 10",
];
foreach($sql as $name=>$query)$plans[$name]=$pdo->query('EXPLAIN '.$query)->fetchAll();
echo json_encode($plans,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT),PHP_EOL;
