<?php
declare(strict_types=1);
require_once __DIR__.'/../api/store.php';
require_once __DIR__.'/../api/payroll.php';
if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database']))throw new RuntimeException('Disposable fixture only.');
$mode=getenv('PHASE11_MODE')?:'';if(!in_array($mode,['state','revision','reference'],true))throw new RuntimeException('Invalid mode.');
$pdo=database();$before=memory_get_usage(true);
if($mode==='state'){$data=load_state($pdo);payroll_attach_batch_progress($data);}
elseif($mode==='revision'){$meta=$pdo->query('SELECT revision,config_revision FROM app_meta WHERE id=1')->fetch();$data=['revision'=>(int)$meta['revision'],'configRevision'=>(int)$meta['config_revision']];}
else{
    $collections=['assigneeDesignations','systemRoles','classifications','workflowTemplates','employmentRoutingRules'];$data=array_fill_keys($collections,[]);
    foreach($pdo->query("SELECT collection,record_json FROM app_records WHERE collection IN ('assigneeDesignations','systemRoles','classifications','workflowTemplates','employmentRoutingRules') ORDER BY id") as $row)$data[$row['collection']][]=json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR);
    $data['users']=array_map('public_user',$pdo->query('SELECT * FROM app_users ORDER BY name')->fetchAll());
}
$json=json_encode($data,JSON_THROW_ON_ERROR);
echo json_encode(['mode'=>$mode,'bytes'=>strlen($json),'beforeBytes'=>$before,'peakBytes'=>memory_get_peak_usage(true)],JSON_THROW_ON_ERROR),PHP_EOL;
