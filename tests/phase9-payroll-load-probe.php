<?php
declare(strict_types=1);
require_once __DIR__.'/../api/payroll.php';
require_once __DIR__.'/../api/payroll_projection.php';
if(!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',app_config()['database']))throw new RuntimeException('Isolated fixture only.');
$pdo=database();$target=(int)(getenv('PHASE9_TARGET')?:0);$userId=getenv('PHASE9_USER')?:'';
if(!in_array($target,[100,1000,10000],true)||$userId==='')throw new RuntimeException('Invalid probe parameters.');
$existing=(int)$pdo->query("SELECT COUNT(*) FROM payroll_read_items WHERE id LIKE 'phase9item-%'")->fetchColumn();
$put=$pdo->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?)');
$start=microtime(true);
for($first=$existing+1;$first<=$target;$first+=100){
    $changed=['payrollBatches'=>[],'payrollItems'=>[],'workGroups'=>[]];$pdo->beginTransaction();
    for($number=$first;$number<=min($target,$first+99);$number+=10){
        $batchNumber=(int)ceil($number/10);$batchId='phase9batch-'.str_pad((string)$batchNumber,5,'0',STR_PAD_LEFT);
        $items=[];$memberIds=[];
        for($n=$number;$n<=min($number+9,$target);$n++){
            $itemId='phase9item-'.str_pad((string)$n,5,'0',STR_PAD_LEFT);$kind=$n%5;
            $stage=$kind<2?'initial_checking':($kind<4?'verification_signing':'release');
            $status=$stage==='release'?'Ready_For_Release':'In_Progress';
            $item=['id'=>$itemId,'batchId'=>$batchId,'batchNumber'=>'P9-LOAD-'.str_pad((string)$batchNumber,5,'0',STR_PAD_LEFT),'itemNumber'=>$n-$number+1,
                'barcode'=>'P9BAR-'.$n,'title'=>'Representative payroll item '.$n,'office'=>'HRMDO','classificationType'=>'Salary','employmentClassification'=>'Regular',
                'verificationStatus'=>'Passed','status'=>$status,'currentStage'=>$stage,'workGroupId'=>$stage==='verification_signing'?'phase9group-'.$batchNumber:null,
                'assignedToUserId'=>$stage==='verification_signing'?$userId:null,'auditHistory'=>[],
                'createdAt'=>'2026-10-01T00:00:00Z','updatedAt'=>'2026-10-01T00:00:00Z'];
            $items[]=$item;if($stage==='verification_signing')$memberIds[]=$itemId;
            $raw=json_encode($item,JSON_THROW_ON_ERROR);$put->execute(['payrollItems',$itemId,$raw]);$changed['payrollItems'][$itemId]=['value'=>$item,'raw'=>$raw];
        }
        $groupId='phase9group-'.$batchNumber;
        $group=['id'=>$groupId,'batchId'=>$batchId,'batchNumber'=>'P9-LOAD-'.$batchNumber,'code'=>'P9-GROUP-'.$batchNumber,'classification'=>'Regular','assignedProcessorId'=>$userId,'assignedProcessorName'=>'Load Processor','assignedProcessorRoleTitle'=>'Processor','assignedTeam'=>'','itemIds'=>$memberIds,'status'=>'In_Progress','auditHistory'=>[],'createdAt'=>'2026-10-01T00:00:00Z','updatedAt'=>'2026-10-01T00:00:00Z'];
        $raw=json_encode($group,JSON_THROW_ON_ERROR);$put->execute(['workGroups',$groupId,$raw]);$changed['workGroups'][$groupId]=['value'=>$group,'raw'=>$raw];
        $desk=['stage'=>'initial_checking','assignmentType'=>'Person','userId'=>$userId,'userName'=>'Load Processor','roleTitle'=>'Processor'];
        $batch=['id'=>$batchId,'batchNumber'=>'P9-LOAD-'.str_pad((string)$batchNumber,5,'0',STR_PAD_LEFT),'batchBarcode'=>'P9-LOADBAR-'.$batchNumber,'classification'=>'Payroll','payrollType'=>'Representative salary','office'=>'HRMDO','payrollPeriod'=>'October','receivedFromLiaison'=>'Liaison','remarks'=>'Load fixture','dateReceived'=>'2026-10-01T00:00:00Z','dateEncoded'=>'2026-10-01T00:00:00Z','updatedAt'=>'2026-10-01T00:00:00Z','encodedBy'=>['userId'=>'seed-owner','userName'=>'Seed Owner','userRole'=>'Receiving Officer'],'currentStage'=>'initial_checking','currentStageName'=>'Initial Checking','assignedDesk'=>$desk,'initialCheckingDesk'=>$desk,'workflowStages'=>[['stageNumber'=>4,'name'=>'Release','status'=>'Pending','assignedTo'=>['stage'=>'release','assignmentType'=>'Person','userId'=>$userId,'userName'=>'Load Processor','roleTitle'=>'Processor']]],'workflowHistory'=>[],'totalItemsCount'=>count($items),'itemIds'=>array_column($items,'id'),'workGroupIds'=>[$groupId],'attachments'=>[],'status'=>'INITIAL_CHECKING','createdAt'=>'2026-10-01T00:00:00Z'];
        $batch['progress']=calculate_payroll_batch_progress($batch,$items);$batch['status']=$batch['progress']['derivedStatus'];$batch['currentStageName']=$batch['progress']['displayStatus'];
        $raw=json_encode($batch,JSON_THROW_ON_ERROR);$put->execute(['payrollBatches',$batchId,$raw]);$changed['payrollBatches'][$batchId]=['value'=>$batch,'raw'=>$raw];
    }
    payroll_write_projection($pdo,$changed,[]);$pdo->commit();
}
echo json_encode(['target'=>$target,'seedSeconds'=>round(microtime(true)-$start,3),'batches'=>(int)$pdo->query("SELECT COUNT(*) FROM payroll_read_batches WHERE id LIKE 'phase9batch-%'")->fetchColumn(),'items'=>(int)$pdo->query("SELECT COUNT(*) FROM payroll_read_items WHERE id LIKE 'phase9item-%'")->fetchColumn()],JSON_THROW_ON_ERROR);
