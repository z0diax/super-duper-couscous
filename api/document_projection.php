<?php
declare(strict_types=1);
// Shared projection for one-time backfill and transactional runtime synchronization.
function p2_json(array $value): string { return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function p2_get(array $row, string $key): ?string {
    $v=$row[$key]??null;
    return is_scalar($v) ? (string)$v : null;
}
function p2_bool(array $row, string $key): ?int { return array_key_exists($key,$row) ? (int)(bool)$row[$key] : null; }
function p2_add(array &$rows,string $table,array $values): void { $rows[$table][]=$values; }
function p2_issue(array &$issues,string $severity,string $subject,string $message): void { $issues[]=['severity'=>$severity,'subject'=>$subject,'message'=>$message]; }
function p2_object($value): array { return is_array($value) ? $value : []; }
function p2_snapshot(array $row): array { $json=p2_json($row); return [$json,hash('sha256',$json)]; }

function p2_project(array $source,array $files): array {
    $out=[];
    foreach ($source['workflowTemplates']??[] as $id=>$entry) {
        $v=$entry['value']; $version=(int)($v['version']??1); $raw=$entry['raw'];
        p2_add($out,'workflow_templates',['id'=>$id,'version'=>$version,'is_current'=>1,'classification'=>p2_get($v,'classification'),'document_type'=>p2_get($v,'documentType'),'employment_classification'=>p2_get($v,'employmentClassification'),'title'=>p2_get($v,'title'),'description'=>p2_get($v,'description'),'is_active'=>p2_bool($v,'isActive'),'source_json'=>$raw,'source_sha256'=>hash('sha256',$raw)]);
        $types=$v['documentTypes']??[$v['documentType']??''];
        if (!is_array($types)) $types=[];
        foreach (array_values($types) as $position=>$type) p2_add($out,'workflow_template_document_types',['template_id'=>$id,'template_version'=>$version,'position'=>$position,'document_type'=>is_scalar($type)?(string)$type:'']);
        foreach ($v['steps'] as $step) {
            [$json,$sha]=p2_snapshot($step);
            p2_add($out,'workflow_template_steps',['template_id'=>$id,'template_version'=>$version,'step_number'=>(int)$step['stepNumber'],'name'=>p2_get($step,'name'),'description'=>p2_get($step,'description'),'stage_type'=>p2_get($step,'stageType'),'assignee_type'=>p2_get($step,'assigneeType'),'assignee_role'=>p2_get($step,'assigneeRole'),'assignee_team'=>p2_get($step,'assigneeTeam'),'assignee_user_id'=>p2_get($step,'assigneeUserId'),'assignee_name'=>p2_get($step,'assigneeName'),'sla_hours'=>p2_get($step,'slaHours'),'required_action'=>p2_get($step,'requiredAction'),'allow_return'=>p2_bool($step,'allowReturn'),'allow_hold'=>p2_bool($step,'allowHold'),'requires_attachment'=>p2_bool($step,'requiresAttachment'),'assignment_source'=>p2_get($step,'assignmentSource'),'payroll_assignment_source'=>p2_get($step,'payrollAssignmentSource'),'external_purpose'=>p2_get($step,'externalPurpose'),'external_destination_mode'=>p2_get($step,'externalDestinationMode'),'external_destination_office'=>p2_get($step,'externalDestinationOffice'),'return_receiver_type'=>p2_get($step,'returnReceiverType'),'return_receiver_role'=>p2_get($step,'returnReceiverRole'),'return_receiver_team'=>p2_get($step,'returnReceiverTeam'),'return_receiver_user_id'=>p2_get($step,'returnReceiverUserId'),'expected_turnaround_hours'=>p2_get($step,'expectedTurnaroundHours'),'source_json'=>$json,'source_sha256'=>$sha]);
        }
    }
    foreach ($source['documents']??[] as $id=>$entry) {
        $v=$entry['value']; $encoded=p2_object($v['encodedBy']??null); $released=p2_object($v['releasedDetails']??null); $raw=$entry['raw'];
        p2_add($out,'documents',['id'=>$id,'tracking_number'=>p2_get($v,'trackingNumber'),'barcode'=>p2_get($v,'barcode'),'title'=>p2_get($v,'title'),'subject'=>p2_get($v,'subject'),'source_type'=>p2_get($v,'sourceType'),'source_office'=>p2_get($v,'sourceOffice'),'sender_name'=>p2_get($v,'senderName'),'sender_contact'=>p2_get($v,'senderContact'),'classification'=>p2_get($v,'classification'),'document_type'=>p2_get($v,'documentType'),'employment_classification'=>p2_get($v,'employmentClassification'),'priority'=>p2_get($v,'priority'),'date_received'=>p2_get($v,'dateReceived'),'date_encoded'=>p2_get($v,'dateEncoded'),'description'=>p2_get($v,'description'),'status'=>p2_get($v,'status'),'current_step_number'=>p2_get($v,'currentStepNumber'),'total_steps'=>p2_get($v,'totalSteps'),'workflow_template_id'=>p2_get($v,'workflowTemplateId'),'workflow_version'=>p2_get($v,'workflowVersion'),'current_location'=>p2_get($v,'currentLocation'),'encoded_by_user_id'=>p2_get($encoded,'userId'),'encoded_by_name'=>p2_get($encoded,'userName'),'is_legacy_v1'=>p2_bool($v,'isLegacyV1'),'legacy_id'=>p2_get($v,'legacyId'),'legacy_source'=>p2_get($v,'legacySource'),'hold_reason'=>p2_get($v,'holdReason'),'held_at'=>p2_get($v,'heldAt'),'held_by_user_id'=>p2_get($v,'heldByUserId'),'compliance_submitted_at'=>p2_get($v,'complianceSubmittedAt'),'released_at'=>p2_get($released,'releasedAt'),'released_to'=>p2_get($released,'releasedTo'),'release_mode'=>p2_get($released,'releaseMode'),'source_json'=>$raw,'source_sha256'=>hash('sha256',$raw)]);
        foreach ($v['workflowSteps'] as $step) {
            $assignment=p2_object($step['assignedTo']??null); $completed=p2_object($step['completedBy']??null); $receiver=p2_object($step['returnReceiver']??null); $owner=p2_object($step['handoffOwner']??null); [$json,$sha]=p2_snapshot($step);
            p2_add($out,'document_workflow_steps',['document_id'=>$id,'step_number'=>(int)$step['stepNumber'],'name'=>p2_get($step,'name'),'stage_type'=>p2_get($step,'stageType'),'required_action'=>p2_get($step,'requiredAction'),'status'=>p2_get($step,'status'),'assignment_type'=>p2_get($assignment,'type'),'assigned_role'=>p2_get($assignment,'role'),'assigned_team'=>p2_get($assignment,'team'),'assigned_user_id'=>p2_get($assignment,'userId'),'assigned_display_name'=>p2_get($assignment,'displayName'),'sla_hours'=>p2_get($step,'slaHours'),'started_at'=>p2_get($step,'startedAt'),'completed_at'=>p2_get($step,'completedAt'),'completed_by_user_id'=>p2_get($completed,'userId'),'completed_by_name'=>p2_get($completed,'userName'),'action_taken'=>p2_get($step,'actionTaken'),'remarks'=>p2_get($step,'remarks'),'is_current'=>p2_bool($step,'isCurrent'),'allow_return'=>p2_bool($step,'allowReturn'),'allow_hold'=>p2_bool($step,'allowHold'),'requires_attachment'=>p2_bool($step,'requiresAttachment'),'assignment_source'=>p2_get($step,'assignmentSource'),'payroll_assignment_source'=>p2_get($step,'payrollAssignmentSource'),'external_status'=>p2_get($step,'externalStatus'),'handoff_owner_user_id'=>p2_get($owner,'userId'),'return_receiver_type'=>p2_get($receiver,'type'),'return_receiver_role'=>p2_get($receiver,'role'),'return_receiver_team'=>p2_get($receiver,'team'),'return_receiver_user_id'=>p2_get($receiver,'userId'),'expected_turnaround_hours'=>p2_get($step,'expectedTurnaroundHours'),'source_json'=>$json,'source_sha256'=>$sha]);
        }
        foreach (['attachments'=>'normal','complianceAttachments'=>'compliance'] as $field=>$kind) foreach ($v[$field]??[] as $position=>$file) {
            [$json,$sha]=p2_snapshot($file); $fileId=p2_get($file,'id');
            p2_add($out,'document_attachments',['document_id'=>$id,'attachment_kind'=>$kind,'position'=>$position,'file_id'=>$fileId,'step_number'=>p2_get($file,'stepNumber'),'uploaded_at'=>p2_get($file,'uploadedAt'),'uploaded_by'=>p2_get($file,'uploadedBy'),'file_name'=>p2_get($file,'name'),'mime_type'=>p2_get($file,'mimeType'),'size_bytes'=>p2_get($file,'sizeBytes'),'file_exists'=>isset($files[$fileId??''])?1:0,'source_json'=>$json,'source_sha256'=>$sha]);
        }
        foreach ($v['custodyHistory']??[] as $position=>$move) {
            [$json,$sha]=p2_snapshot($move);
            p2_add($out,'document_custody_history',['document_id'=>$id,'position'=>$position,'movement_id'=>p2_get($move,'id'),'movement_type'=>p2_get($move,'movementType'),'from_location'=>p2_get($move,'fromLocation'),'to_location'=>p2_get($move,'toLocation'),'movement_at'=>p2_get($move,'timestamp'),'stage_number'=>p2_get($move,'stageNumber'),'purpose'=>p2_get($move,'purpose'),'remarks'=>p2_get($move,'remarks'),'actor_id'=>p2_get($move,'actorId'),'actor_name'=>p2_get($move,'actorName'),'representative'=>p2_get($move,'representative'),'source_json'=>$json,'source_sha256'=>$sha]);
        }
    }
    return $out;
}
function p2_put(PDO $pdo,string $table,array $row): void {
    $names=array_keys($row); $columns=implode(',',array_map(fn($n)=>'`'.$n.'`',$names));
    $holders=implode(',',array_fill(0,count($names),'?'));
    $updates=implode(',',array_map(fn($n)=>'`'.$n.'`=VALUES(`'.$n.'`)',$names));
    $pdo->prepare("INSERT INTO `$table` ($columns) VALUES ($holders) ON DUPLICATE KEY UPDATE $updates")->execute(array_values($row));
}
function p2_write_project(PDO $pdo,array $project,array $deletedDocuments=[],array $deletedTemplates=[]): void {
    // Caller owns the transaction. Backfill and live writes use the same mapping and writer.
    $templateChildren=[]; $documentChildren=[];
    foreach (['workflow_template_document_types','workflow_template_steps'] as $table) foreach ($project[$table]??[] as $row) {
        $templateChildren[$table][$row['template_id']."\0".$row['template_version']][]=$row;
    }
    foreach (['document_workflow_steps','document_attachments','document_custody_history'] as $table) foreach ($project[$table]??[] as $row) {
        $documentChildren[$table][$row['document_id']][]=$row;
    }
    foreach ($project['workflow_templates']??[] as $row) {
        $pdo->prepare('UPDATE workflow_templates SET is_current=0 WHERE id=? AND version<>?')->execute([$row['id'],$row['version']]);
        p2_put($pdo,'workflow_templates',$row);
        foreach (['workflow_template_document_types','workflow_template_steps'] as $table) {
            $pdo->prepare("DELETE FROM `$table` WHERE template_id=? AND template_version=?")->execute([$row['id'],$row['version']]);
            foreach ($templateChildren[$table][$row['id']."\0".$row['version']]??[] as $child) p2_put($pdo,$table,$child);
        }
    }
    foreach ($project['documents']??[] as $row) {
        p2_put($pdo,'documents',$row);
        foreach (['document_workflow_steps','document_attachments','document_custody_history'] as $table) {
            $pdo->prepare("DELETE FROM `$table` WHERE document_id=?")->execute([$row['id']]);
            foreach ($documentChildren[$table][$row['id']]??[] as $child) p2_put($pdo,$table,$child);
        }
    }
    foreach (array_unique($deletedDocuments) as $id) {
        foreach (['document_workflow_steps','document_attachments','document_custody_history'] as $table) $pdo->prepare("DELETE FROM `$table` WHERE document_id=?")->execute([$id]);
        $pdo->prepare('DELETE FROM documents WHERE id=?')->execute([$id]);
    }
    foreach (array_unique($deletedTemplates) as $id) {
        // Keep all historical versions and their steps/types for audit and old references.
        $pdo->prepare('UPDATE workflow_templates SET is_current=0 WHERE id=?')->execute([$id]);
    }
}
