<?php
declare(strict_types=1);
// Additive read indexes. app_records remains the only Payroll write authority.
function payroll_project_batch(array $value,string $raw): array {
    $initial=$value['initialCheckingDesk']??$value['assignedDesk']??[];
    $release=[];foreach($value['workflowStages']??[] as $step) if (($step['stageNumber']??null)===4) {$release=$step['assignedTo']??[];break;}
    return [$value['id'],$value['batchNumber']??null,$value['batchBarcode']??null,$value['payrollType']??null,$value['office']??null,
        $value['encodedBy']['userId']??null,$value['dateEncoded']??null,$value['updatedAt']??null,$value['progress']['derivedStatus']??$value['status']??null,
        (int)($value['progress']['initialChecking']['active']??0),(int)($value['progress']['management']['active']??0),
        (int)($value['progress']['management']['onHold']??0),(int)($value['progress']['release']['ready']??0),
        $initial['userId']??null,($initial['assignmentType']??null)==='Role'?($initial['roleId']??null):null,($initial['assignmentType']??null)==='Team'?($initial['team']??null):null,
        $release['userId']??null,($release['assignmentType']??null)==='Role'?($release['roleId']??null):null,($release['assignmentType']??null)==='Team'?($release['team']??null):null,
        json_encode($value['progress']??null,JSON_THROW_ON_ERROR),hash('sha256',$raw)];
}
function payroll_project_item(array $value,string $raw): array {
    return [$value['id'],$value['batchId']??'',$value['documentId']??null,$value['itemNumber']??null,$value['barcode']??null,$value['title']??null,$value['office']??null,
        $value['classificationType']??null,$value['employmentClassification']??null,
        $value['currentStage']??(empty($value['workGroupId'])?'initial_checking':'verification_signing'),$value['status']??null,$value['verificationStatus']??null,$value['holdResolvedAt']??null,
        $value['assignedToUserId']??null,$value['workGroupId']??null,hash('sha256',$raw)];
}
function payroll_project_group(array $value,string $raw): array {
    return [$value['id'],$value['batchId']??'',$value['assignedProcessorId']??null,$value['assignedTeam']??null,$value['status']??null,hash('sha256',$raw)];
}
function payroll_write_projection(PDO $pdo,array $changed,array $deleted): void {
    if (!$pdo->inTransaction()) throw new RuntimeException('Payroll projection requires the authoritative transaction.');
    $tables=['payrollBatches'=>['payroll_read_batches','batch_number,batch_barcode,payroll_type,office,encoded_by_user_id,date_encoded,updated_at,derived_status,initial_active,management_active,management_on_hold,release_ready,initial_user_id,initial_role,initial_team,release_user_id,release_role,release_team,progress_json,source_sha256','payroll_project_batch'],
        'payrollItems'=>['payroll_read_items','batch_id,document_id,item_number,barcode,title,office,classification_type,employment_classification,current_stage,status,verification_status,hold_resolved_at,assigned_user_id,work_group_id,source_sha256','payroll_project_item'],
        'workGroups'=>['payroll_read_groups','batch_id,processor_id,assigned_team,status,source_sha256','payroll_project_group']];
    foreach($tables as $collection=>[$table,$columns,$project]) {
        $names='id,'.$columns;$fields=explode(',',$names);$placeholders=implode(',',array_fill(0,count($fields),'?'));
        $updates=implode(',',array_map(fn($name)=>"$name=VALUES($name)",array_slice($fields,1)));
        $put=$pdo->prepare("INSERT INTO $table ($names) VALUES ($placeholders) ON DUPLICATE KEY UPDATE $updates");
        $remove=$pdo->prepare("DELETE FROM $table WHERE id=?");
        $removeMembers=$collection==='workGroups'?$pdo->prepare('DELETE FROM payroll_read_group_items WHERE group_id=?'):null;
        $addMember=$collection==='workGroups'?$pdo->prepare('INSERT INTO payroll_read_group_items (group_id,item_id) VALUES (?,?)'):null;
        foreach($deleted[$collection]??[] as $id){$remove->execute([$id]);if($removeMembers)$removeMembers->execute([$id]);}
        foreach($changed[$collection]??[] as $id=>$entry){
            $put->execute($project($entry['value'],$entry['raw']));
            if($removeMembers){$removeMembers->execute([$id]);foreach(array_unique($entry['value']['itemIds']??[]) as $itemId)$addMember->execute([$id,$itemId]);}
        }
    }
}
