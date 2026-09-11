<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
const COLLECTIONS=['assigneeDesignations','systemRoles','documents','classifications','workflowTemplates','leaveApplications','migrationSummaries','payrollBatches','payrollItems','workGroups','employmentRoutingRules'];
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
    foreach (['JOW/COS','Casual','Regular'] as $class) $state['employmentRoutingRules'][]=['id'=>'rule-'.strtolower(str_replace('/','-',$class)),'classification'=>$class,'title'=>$class.' payroll','primaryProcessorId'=>'','primaryProcessorName'=>'Unassigned','primaryProcessorRoleTitle'=>'','defaultSlaHours'=>24,'description'=>'Assign a processor before routing payroll.','updatedAt'=>now()];
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
    $put=$pdo->prepare('INSERT INTO app_records (collection,id,record_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE record_json=VALUES(record_json)');
    $del=$pdo->prepare('DELETE FROM app_records WHERE collection=? AND id=?');
    foreach (COLLECTIONS as $key) {
        $old=[]; foreach ($before[$key]??[] as $item) $old[$item['id']??$item['datasetName']]=$item;
        foreach ($after[$key]??[] as $item) {
            $id=$item['id']??$item['datasetName'];
            if (($old[$id]??null)!==$item) $put->execute([$key,$id,json_encode($item,JSON_THROW_ON_ERROR)]);
            unset($old[$id]);
        }
        foreach ($old as $id=>$unused) $del->execute([$key,$id]);
    }
}
function audit(PDO $pdo,array $user,string $action,string $id,string $summary,string $details='',string $tracking=''): void {
    $event=['id'=>uid('audit'),'timestamp'=>now(),'actorId'=>$user['id'],'actorName'=>$user['name'],'actorRole'=>$user['roleTitle'],'actionType'=>$action,'documentId'=>$id,'trackingNumber'=>$tracking,'summary'=>$summary,'details'=>$details];
    $pdo->prepare('INSERT INTO app_audit (id,record_json) VALUES (?,?)')->execute([$event['id'],json_encode($event,JSON_THROW_ON_ERROR)]);
}
