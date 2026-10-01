<?php
declare(strict_types=1);
require_once __DIR__.'/../api/db.php';
if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database']))throw new RuntimeException('Disposable fixture only.');
$target=(int)(getenv('PHASE10_TARGET')?:0);if(!in_array($target,[100,1000,10000],true))throw new RuntimeException('Invalid target.');
$pdo=database();$existing=(int)$pdo->query("SELECT COUNT(*) FROM app_records WHERE collection='leaveApplications' AND id LIKE 'phase10-leave-%'")->fetchColumn();
$put=$pdo->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)');
$audit=$pdo->prepare('INSERT INTO app_audit (id,record_json) VALUES (?,?)');$started=microtime(true);
for($start=$existing+1;$start<=$target;$start+=250){$pdo->beginTransaction();for($i=$start;$i<=min($target,$start+249);$i++){
    $id='phase10-leave-'.str_pad((string)$i,5,'0',STR_PAD_LEFT);
    $row=['id'=>$id,'barcode'=>'P10-LEAVE-'.$i,'trackingNumber'=>'P10-LEAVE-'.$i,'employeeName'=>'Representative Employee '.$i,'office'=>$i%3===0?'Finance':'HRMDO','leaveType'=>'Vacation Leave','status'=>$i%4===0?'Released':'For_Computation','isLegacyV1'=>false,'createdAt'=>sprintf('2026-09-%02dT00:00:00Z',($i%28)+1),'createdByUserId'=>'seed-owner','dateRanges'=>[]];
    $put->execute(['leaveApplications',$id,json_encode($row,JSON_THROW_ON_ERROR)]);
    $eventId='phase10-audit-'.str_pad((string)$i,5,'0',STR_PAD_LEFT);
    $event=['id'=>$eventId,'documentId'=>$i%10===0?'phase10-leave-00001':'phase10-hidden-'.$i,'trackingNumber'=>'P10-LEAVE-'.$i,'timestamp'=>sprintf('2026-10-01T00:%02d:%02dZ',intdiv($i%3600,60),$i%60),'actorId'=>'seed-owner','actorName'=>'Seed Owner','actorRole'=>'processor','actionType'=>'LEAVE_FILED','summary'=>'Representative leave event','details'=>'Load fixture'];
    $audit->execute([$eventId,json_encode($event,JSON_THROW_ON_ERROR)]);
} $pdo->commit();}
echo json_encode(['target'=>$target,'seedSeconds'=>round(microtime(true)-$started,3)]),PHP_EOL;
