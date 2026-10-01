<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/document_projection.php';
require_once __DIR__.'/payroll_projection.php';
const COLLECTIONS=['assigneeDesignations','systemRoles','documents','classifications','workflowTemplates','leaveApplications','ewpRecords','migrationSummaries','payrollBatches','payrollItems','workGroups','employmentRoutingRules'];
function uid(string $prefix): string { return $prefix.'-'.bin2hex(random_bytes(12)); }
function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
function defaults(): array {
    $state=array_fill_keys(COLLECTIONS,[]);
    foreach (['receiving_officer'=>['Receiving Officer','canIntake'],'processor'=>['Processor','canProcess'], 'reviewer'=>['Reviewer','canReview'],'approver'=>['Approver','canApprove'], 'releasing_officer'=>['Releasing Officer','canRelease'],'supervisor'=>['Supervisor','canSupervise'], 'admin'=>['Administrator','canAdmin'],'employee'=>['Employee','']] as $id=>$v) {
        $role=['id'=>$id,'name'=>$v[0],'code'=>strtoupper($id),'description'=>$v[0],'badgeClass'=>'bg-blue-100 text-blue-800 border-blue-200','isSystemDefault'=>true];
        foreach (['canIntake','canProcess','canReview','canApprove','canRelease','canSupervise','canAdmin'] as $cap) $role[$cap]=$v[1]===$cap;
        $state['systemRoles'][]=$role;
        $state['assigneeDesignations'][]=['id'=>'designation-'.$id,'category'=>'Role','title'=>$v[0],'baseRole'=>$id];
    }
    foreach (['Communication'=>['Office Order','Memorandum','Letter'],'Payroll'=>['Salary','Voucher','Trust fund','Terminal Pay','Overtime Pay','Mid Year Bonus','Subsistence Allowance','Travel Allowance','RATA','Mobile Allowance','Clothing Allowance'],'Request'=>['Certification','Service Record','Leave Request'],'Others'=>['General Request']] as $name=>$types) {
        $state['classifications'][]=['id'=>'cat-'.strtolower($name),'classification'=>$name,'description'=>$name.' documents','types'=>array_map(fn($type)=>['id'=>uid('type'),'name'=>$type,'description'=>'','defaultSlaHours'=>48,'isActive'=>true,'hasSpecificWorkflow'=>false],$types)];
    }
    foreach (['JOW/COS','Casual','Regular'] as $class) $state['employmentRoutingRules'][]=['id'=>'rule-'.strtolower(str_replace('/','-',$class)),'classification'=>$class,'title'=>$class.' payroll','assignmentMode'=>'fixed','primaryProcessorId'=>'','primaryProcessorName'=>'Unassigned','primaryProcessorRoleTitle'=>'','eligibleProcessorIds'=>[],'assignedTeam'=>'','defaultSlaHours'=>24,'description'=>'Assign a processor before routing payroll.','updatedAt'=>now()];
    return $state;
}
function load_state(PDO $pdo): array {
    $state=array_fill_keys(COLLECTIONS,[]);
    foreach ($pdo->query('SELECT collection,record_json FROM app_records ORDER BY id') as $row) if (isset($state[$row['collection']])) $state[$row['collection']][]=json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR);
    $state['users']=array_map('public_user',$pdo->query('SELECT * FROM app_users ORDER BY name')->fetchAll());
    $state['auditLogs']=array_map(fn($r)=>json_decode($r['record_json'],true),$pdo->query('SELECT record_json FROM app_audit ORDER BY sequence DESC')->fetchAll());
    return $state;
}
function persist_state(PDO $pdo,array $before,array $after): void {
    if (!$pdo->inTransaction()) throw new RuntimeException('State persistence requires an authoritative transaction.');
    $put=$pdo->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE record_json=VALUES(record_json)');
    $del=$pdo->prepare('DELETE FROM app_records WHERE collection=? AND id=?');
    $source=['documents'=>[],'workflowTemplates'=>[]]; $deletedDocuments=[]; $deletedTemplates=[];
    $payrollChanged=['payrollBatches'=>[],'payrollItems'=>[],'workGroups'=>[]];$payrollDeleted=['payrollBatches'=>[],'payrollItems'=>[],'workGroups'=>[]];
    foreach (COLLECTIONS as $key) {
        $old=[]; foreach ($before[$key]??[] as $item) $old[$item['id']??$item['datasetName']]=$item;
        foreach ($after[$key]??[] as $item) {
            $id=$item['id']??$item['datasetName'];
            if (($old[$id]??null)!==$item) {
                $raw=json_encode($item,JSON_THROW_ON_ERROR);
                $put->execute([$key,$id,$raw]);
                if ($key==='documents' || $key==='workflowTemplates') $source[$key][$id]=['value'=>$item,'raw'=>$raw];
                if (isset($payrollChanged[$key])) $payrollChanged[$key][$id]=['value'=>$item,'raw'=>$raw];
            }
            unset($old[$id]);
        }
        foreach ($old as $id=>$unused) {
            $del->execute([$key,$id]);
            if ($key==='documents') $deletedDocuments[]=$id;
            if ($key==='workflowTemplates') $deletedTemplates[]=$id;
            if (isset($payrollDeleted[$key])) $payrollDeleted[$key][]=$id;
        }
    }
    if ($source['documents'] || $source['workflowTemplates'] || $deletedDocuments || $deletedTemplates) {
        $fileIds=[];
        foreach ($source['documents'] as $entry) foreach (['attachments','complianceAttachments'] as $field) foreach ($entry['value'][$field]??[] as $file) if (is_array($file) && !empty($file['id'])) $fileIds[$file['id']]=true;
        $existingFiles=[];
        if ($fileIds) {
            $placeholders=implode(',',array_fill(0,count($fileIds),'?'));
            $files=$pdo->prepare("SELECT id FROM app_files WHERE id IN ($placeholders)");
            $files->execute(array_keys($fileIds));
            $existingFiles=array_fill_keys($files->fetchAll(PDO::FETCH_COLUMN),true);
        }
        p2_write_project($pdo,p2_project($source,$existingFiles),$deletedDocuments,$deletedTemplates);
    }
    if ($payrollChanged['payrollBatches'] || $payrollChanged['payrollItems'] || $payrollChanged['workGroups'] || $payrollDeleted['payrollBatches'] || $payrollDeleted['payrollItems'] || $payrollDeleted['workGroups']) {
        $affected=array_fill_keys(array_keys($payrollChanged['payrollBatches']),true);
        foreach($payrollChanged['payrollItems'] as $entry)if(($entry['value']['batchId']??'')!=='SINGLE_ENTRY')$affected[$entry['value']['batchId']]=true;
        if($payrollChanged['payrollItems'])foreach($before['payrollItems']??[] as $item)if(isset($payrollChanged['payrollItems'][$item['id']]) && ($item['batchId']??'')!=='SINGLE_ENTRY')$affected[$item['batchId']]=true;
        foreach($payrollDeleted['payrollItems'] as $id)foreach($before['payrollItems']??[] as $item)if($item['id']===$id && ($item['batchId']??'')!=='SINGLE_ENTRY')$affected[$item['batchId']]=true;
        foreach($after['payrollBatches']??[] as $batch)if(isset($affected[$batch['id']])){
            $raw=$payrollChanged['payrollBatches'][$batch['id']]['raw']??json_encode($batch,JSON_THROW_ON_ERROR);
            $items=array_values(array_filter($after['payrollItems']??[],fn($item)=>($item['batchId']??'')===$batch['id']));
            $batch['progress']=calculate_payroll_batch_progress($batch,$items);
            $payrollChanged['payrollBatches'][$batch['id']]=['value'=>$batch,'raw'=>$raw];
        }
        payroll_write_projection($pdo,$payrollChanged,$payrollDeleted);
    }
}
function audit(PDO $pdo,array $user,string $action,string $id,string $summary,string $details='',string $tracking=''): void {
    $event=['id'=>uid('audit'),'timestamp'=>now(),'actorId'=>$user['id'],'actorName'=>$user['name'],'actorRole'=>$user['roleTitle'],'actionType'=>$action,'documentId'=>$id,'trackingNumber'=>$tracking,'summary'=>$summary,'details'=>$details];
    $pdo->prepare('INSERT INTO app_audit (id,record_json) VALUES (?,?)')->execute([$event['id'],json_encode($event,JSON_THROW_ON_ERROR)]);
}
