<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once __DIR__.'/../api/domain.php';
require_once __DIR__.'/../api/payroll.php';
$pdo=database();
$row=$pdo->query("SELECT * FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")->fetch();
if (!$row) throw new RuntimeException('No administrator is configured.');
$user=public_user($row);
$load=[]; $full=[]; $response=''; $state=[];
for($i=0;$i<5;$i++) {
    $start=microtime(true);
    $state=load_state($pdo);
    $load[]=round((microtime(true)-$start)*1000,2);
    payroll_attach_batch_progress($state);
    $state=filter_state_for_view($state,$user);
    $response=json_encode(['state'=>$state,'revision'=>(int)$pdo->query('SELECT revision FROM app_meta WHERE id=1')->fetchColumn(),'result'=>null],JSON_THROW_ON_ERROR);
    $full[]=round((microtime(true)-$start)*1000,2);
}
sort($load);sort($full);
echo json_encode(['scope'=>'local administrator, read-only PHP approximation of GET state.php','documents'=>count($state['documents']),'rows'=>['app_records'=>(int)$pdo->query('SELECT COUNT(*) FROM app_records')->fetchColumn(),'app_audit'=>(int)$pdo->query('SELECT COUNT(*) FROM app_audit')->fetchColumn(),'app_users'=>(int)$pdo->query('SELECT COUNT(*) FROM app_users')->fetchColumn(),'document_workflow_steps'=>(int)$pdo->query('SELECT COUNT(*) FROM document_workflow_steps')->fetchColumn()],'visibleCollectionEntries'=>array_sum(array_map('count',array_filter($state,'is_array'))),'responseBytes'=>strlen($response),'medianLoadMs'=>$load[2],'medianProcessAndSerializeMs'=>$full[2],'peakBytes'=>memory_get_peak_usage(true)],JSON_THROW_ON_ERROR),"\n";
