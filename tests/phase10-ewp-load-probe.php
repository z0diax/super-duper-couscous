<?php
declare(strict_types=1);
require_once __DIR__.'/../api/db.php';
if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database']))throw new RuntimeException('Disposable fixture only.');
$target=(int)(getenv('PHASE10_TARGET')?:0);if(!in_array($target,[100,1000,10000],true))throw new RuntimeException('Invalid target.');
$pdo=database();$existing=(int)$pdo->query("SELECT COUNT(*) FROM app_records WHERE collection='ewpRecords' AND id LIKE 'phase10-ewp-%'")->fetchColumn();
$put=$pdo->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)');$started=microtime(true);
for($start=$existing+1;$start<=$target;$start+=250){$pdo->beginTransaction();for($i=$start;$i<=min($target,$start+249);$i++){
    $id='phase10-ewp-'.str_pad((string)$i,5,'0',STR_PAD_LEFT);
    $row=['id'=>$id,'barcode'=>'P10-EWP-'.$i,'employeeName'=>'Representative Employee '.$i,'office'=>$i%3===0?'Finance':'HRMDO','amount'=>($i%500)+1.25,'purpose'=>'Employee assistance','remarks'=>'Representative welfare record','status'=>'Recorded','createdAt'=>sprintf('2026-09-%02dT00:00:00Z',($i%28)+1),'updatedAt'=>'2026-10-01T00:00:00Z','createdByUserId'=>'seed-owner'];
    $put->execute(['ewpRecords',$id,json_encode($row,JSON_THROW_ON_ERROR)]);
} $pdo->commit();}
echo json_encode(['target'=>$target,'seedSeconds'=>round(microtime(true)-$started,3)]),PHP_EOL;
