<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../api/payroll.php';
require_once __DIR__.'/../api/payroll_projection.php';
$mode=$argv[1]??'--verify';
if(!in_array($mode,['--apply','--verify'],true)){fwrite(STDERR,"Use --apply or --verify.\n");exit(2);}
$pdo=database();$sources=['payrollBatches'=>[],'payrollItems'=>[],'workGroups'=>[]];
foreach($pdo->query("SELECT collection,id,record_json FROM app_records WHERE collection IN ('payrollBatches','payrollItems','workGroups')") as $row){
    $sources[$row['collection']][$row['id']]=['value'=>json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR),'raw'=>$row['record_json']];
}
$state=['payrollBatches'=>array_column($sources['payrollBatches'],'value'),'payrollItems'=>array_column($sources['payrollItems'],'value')];
payroll_attach_batch_progress($state);
foreach($state['payrollBatches'] as $batch) $sources['payrollBatches'][$batch['id']]['value']=$batch;
if($mode==='--apply'){
    $pdo->beginTransaction();
    try {payroll_write_projection($pdo,$sources,[]);$pdo->commit();}
    catch(Throwable $error){$pdo->rollBack();throw $error;}
}
$checks=[];$issues=[];
foreach(['payrollBatches'=>'payroll_read_batches','payrollItems'=>'payroll_read_items','workGroups'=>'payroll_read_groups'] as $collection=>$table){
    $rows=$pdo->query("SELECT id,source_sha256 FROM $table")->fetchAll();
    $hashes=array_column($rows,'source_sha256','id');
    $checks[$collection]=['source'=>count($sources[$collection]),'projected'=>count($hashes)];
    foreach($sources[$collection] as $id=>$entry) if(($hashes[$id]??null)!==hash('sha256',$entry['raw'])) $issues[]="$collection:$id";
    foreach($hashes as $id=>$hash) if(!isset($sources[$collection][$id]))$issues[]="$collection:orphan:$id";
}
$memberCount=(int)$pdo->query('SELECT COUNT(*) FROM payroll_read_group_items')->fetchColumn();
$sourceMembers=array_sum(array_map(fn($entry)=>count(array_unique($entry['value']['itemIds']??[])),$sources['workGroups']));
$checks['groupItems']=['source'=>$sourceMembers,'projected'=>$memberCount];
if($memberCount!==$sourceMembers)$issues[]='groupItems:count';
echo json_encode(['mode'=>$mode,'counts'=>$checks,'issues'=>$issues,'status'=>$issues?'drift':'ok'],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),PHP_EOL;
if($issues)exit(1);
