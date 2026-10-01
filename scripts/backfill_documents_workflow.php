<?php
declare(strict_types=1);
// Additive shadow backfill. app_records remains the source of truth.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
require_once dirname(__DIR__).'/api/document_projection.php';

function p2_read(PDO $pdo,array &$issues): array {
    $rows=[]; $ids=['documents'=>[],'workflowTemplates'=>[]];
    $q=$pdo->query("SELECT collection,id,record_json FROM app_records WHERE collection IN ('documents','workflowTemplates') ORDER BY collection,id");
    foreach ($q as $record) {
        $kind=$record['collection']; $key=$record['id'];
        try { $value=json_decode($record['record_json'],true,64,JSON_THROW_ON_ERROR); }
        catch (Throwable $e) { p2_issue($issues,'error',"$kind:$key",'Invalid JSON: '.$e->getMessage()); continue; }
        if (!is_array($value) || array_is_list($value)) { p2_issue($issues,'error',"$kind:$key",'Record must be a JSON object.'); continue; }
        if (!isset($value['id']) || !is_string($value['id']) || $value['id']==='' || $value['id']!==$key) {
            p2_issue($issues,'error',"$kind:$key",'Missing ID or JSON ID differs from app_records.id.'); continue;
        }
        if (isset($ids[$kind][$key])) { p2_issue($issues,'error',"$kind:$key",'Duplicate record ID.'); continue; }
        $ids[$kind][$key]=true;
        $rows[$kind][$key]=['value'=>$value,'raw'=>$record['record_json']];
    }
    return $rows;
}
function p2_validate(PDO $pdo,array $source,array &$issues): void {
    $users=array_fill_keys($pdo->query('SELECT id FROM app_users')->fetchAll(PDO::FETCH_COLUMN),true);
    $files=[];
    foreach ($pdo->query('SELECT id,owner_id FROM app_files') as $row) $files[$row['id']]=$row['owner_id'];
    $documentCodes=[];
    foreach (['workflowTemplates'=>'steps','documents'=>'workflowSteps'] as $kind=>$field) foreach ($source[$kind]??[] as $id=>$entry) {
        $v=$entry['value']; $subject="$kind:$id";
        if ($kind==='documents') foreach (['trackingNumber','barcode'] as $codeField) {
            $code=$v[$codeField]??null;
            if (!is_string($code) || $code==='') continue;
            $normalized=strtolower($code);
            if (isset($documentCodes[$normalized]) && $documentCodes[$normalized]!==$id) p2_issue($issues,'warning',$subject,"Duplicate tracking/barcode value $code also occurs on {$documentCodes[$normalized]}.");
            else $documentCodes[$normalized]=$id;
        }
        if (!isset($v[$field]) || !is_array($v[$field]) || !array_is_list($v[$field])) {
            p2_issue($issues,'error',$subject,"$field must be an ordered array."); continue;
        }
        $seen=[];
        foreach ($v[$field] as $position=>$step) {
            if (!is_array($step) || array_is_list($step) || !isset($step['stepNumber']) || !is_numeric($step['stepNumber']) || (int)$step['stepNumber']<1) {
                p2_issue($issues,'error',$subject,"Invalid step at position $position."); continue;
            }
            $number=(int)$step['stepNumber'];
            if (isset($seen[$number])) p2_issue($issues,'error',$subject,"Duplicate step number $number.");
            $seen[$number]=true;
            if ($number!==$position+1) p2_issue($issues,'warning',$subject,"Step $number is not at array position ".($position+1).'.');
            $assignment=$kind==='documents'?p2_object($step['assignedTo']??null):$step;
            $userId=$kind==='documents'?($assignment['userId']??null):($step['assigneeUserId']??null);
            if (is_string($userId) && $userId!=='' && !isset($users[$userId])) p2_issue($issues,'warning',$subject,"Step $number references missing assignee user $userId.");
            $pool=is_array($step['personnelPoolUserIds']??null)?$step['personnelPoolUserIds']:[];
            $otherUserIds=$kind==='documents'
                ? [($step['returnReceiver']['userId']??null),($step['completedBy']['userId']??null),($step['handoffOwner']['userId']??null)]
                : [($step['returnReceiverUserId']??null),...$pool];
            foreach ($otherUserIds as $otherUserId) if (is_string($otherUserId) && $otherUserId!=='' && !isset($users[$otherUserId])) p2_issue($issues,'warning',$subject,"Step $number references missing user $otherUserId.");
            $external=$step['externalStatus']??null;
            if ($external!==null && !in_array($external,['PENDING_HANDOFF','OUTSIDE_HRMDO','COMPLETED'],true)) p2_issue($issues,'error',$subject,"Invalid external status on step $number.");
            if ($external==='OUTSIDE_HRMDO' && !is_array($step['externalHandoff']??null)) p2_issue($issues,'error',$subject,"External step $number is outside without handoff data.");
            if ($external==='COMPLETED' && !is_array($step['externalReturn']??null)) p2_issue($issues,'warning',$subject,"External step $number is completed without return details.");
        }
        if ($kind==='documents') {
            $template=$v['workflowTemplateId']??null;
            if (is_string($template) && $template!=='' && !isset($source['workflowTemplates'][$template])) p2_issue($issues,'warning',$subject,"Missing current workflow template $template; instance snapshot is retained.");
            $encoder=$v['encodedBy']['userId']??null;
            if (is_string($encoder) && $encoder!=='' && !isset($users[$encoder])) p2_issue($issues,'warning',$subject,"Missing encoder user $encoder; name snapshot is retained.");
            foreach (['attachments','complianceAttachments'] as $attachmentKind) {
                $items=$v[$attachmentKind]??[];
                if (!is_array($items) || !array_is_list($items)) { p2_issue($issues,'error',$subject,"$attachmentKind must be an array."); continue; }
                foreach ($items as $position=>$file) {
                    if (!is_array($file) || empty($file['id']) || !is_string($file['id'])) { p2_issue($issues,'error',$subject,"Malformed $attachmentKind entry at position $position."); continue; }
                    if (!array_key_exists($file['id'],$files)) p2_issue($issues,'warning',$subject,"Missing app_files row for $attachmentKind file {$file['id']}.");
                    elseif ($files[$file['id']]!==null && $files[$file['id']]!==$id) p2_issue($issues,'warning',$subject,"File {$file['id']} is owned by another record.");
                }
            }
            $custody=$v['custodyHistory']??[];
            if (!is_array($custody) || !array_is_list($custody)) p2_issue($issues,'error',$subject,'custodyHistory must be an array.');
            else {
                $movementIds=[];
                foreach ($custody as $position=>$movement) {
                    if (!is_array($movement) || empty($movement['movementType']) || empty($movement['timestamp'])) { p2_issue($issues,'error',$subject,"Malformed custody movement at position $position."); continue; }
                    $movementId=$movement['id']??null;
                    if (is_string($movementId) && $movementId!=='') {
                        if (isset($movementIds[$movementId])) p2_issue($issues,'warning',$subject,"Duplicate custody ID $movementId.");
                        $movementIds[$movementId]=true;
                    }
                }
            }
            $current=(int)($v['currentStepNumber']??0);
            if ($current>0 && !isset($seen[$current])) p2_issue($issues,'error',$subject,"Current step $current does not exist.");
            $currentFlags=array_filter($v[$field],fn($step)=>is_array($step) && !empty($step['isCurrent']));
            if (count($currentFlags)>1) p2_issue($issues,'error',$subject,'Multiple current workflow steps.');
            if (count($currentFlags)===1 && (int)reset($currentFlags)['stepNumber']!==$current) p2_issue($issues,'warning',$subject,'Current step number and isCurrent flag differ.');
        }
    }
}

function p2_schema(PDO $pdo): void {
    $sql=file_get_contents(dirname(__DIR__).'/database/phase2_documents_workflow.sql');
    foreach (explode(';',$sql) as $statement) if (trim($statement)!=='') $pdo->exec($statement);
}
function p2_apply(PDO $pdo,array $project,int $sourceRevision): void {
    $pdo->beginTransaction();
    try {
        // The existing app locks this row for every state request. Keep a coherent source snapshot.
        $lockedRevision=(int)$pdo->query('SELECT revision FROM app_meta WHERE id=1 FOR UPDATE')->fetchColumn();
        if ($lockedRevision!==$sourceRevision) throw new RuntimeException('Source revision changed during preflight. Rerun the backfill.');
        p2_write_project($pdo,$project);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
function p2_verify(PDO $pdo,array $project,array &$issues): array {
    $keys=['workflow_templates'=>['id','version'],'workflow_template_document_types'=>['template_id','template_version','position'],'workflow_template_steps'=>['template_id','template_version','step_number'],'documents'=>['id'],'document_workflow_steps'=>['document_id','step_number'],'document_attachments'=>['document_id','attachment_kind','position'],'document_custody_history'=>['document_id','position']];
    $counts=[];
    foreach ($keys as $table=>$keyFields) {
        $expected=[];
        foreach ($project[$table]??[] as $row) $expected[implode('|',array_map(fn($k)=>(string)$row[$k],$keyFields))]=$row;
        $actual=[];
        $query=$table==='workflow_templates'?'SELECT * FROM workflow_templates WHERE is_current=1':($table==='workflow_template_steps'||$table==='workflow_template_document_types' ? "SELECT child.* FROM `$table` child JOIN workflow_templates parent ON parent.id=child.template_id AND parent.version=child.template_version WHERE parent.is_current=1" : "SELECT * FROM `$table`");
        foreach ($pdo->query($query) as $row) $actual[implode('|',array_map(fn($k)=>(string)$row[$k],$keyFields))]=$row;
        $counts[$table]=['source'=>count($expected),'normalized'=>count($actual)];
        foreach ($expected as $key=>$row) {
            if (!isset($actual[$key])) { p2_issue($issues,'error',"$table:$key",'Missing normalized row.'); continue; }
            foreach ($row as $column=>$value) {
                $found=$actual[$key][$column]??null;
                if (($value===null)!==($found===null) || ($value!==null && (string)$value!==(string)$found && !(is_numeric($value) && is_numeric($found) && (float)$value===(float)$found))) p2_issue($issues,'error',"$table:$key","Value mismatch in $column.");
            }
        }
        foreach (array_diff_key($actual,$expected) as $key=>$unused) p2_issue($issues,'error',"$table:$key",'Normalized row has no current source row.');
    }
    return $counts;
}

$mode=$argv[1]??'';
if (!in_array($mode,['--apply','--verify','--check'],true)) { fwrite(STDERR,"Usage: php scripts/backfill_documents_workflow.php --check|--apply|--verify\n"); exit(2); }
$issues=[]; $counts=[];
try {
    $pdo=database();
    $sourceRevision=(int)$pdo->query('SELECT revision FROM app_meta WHERE id=1')->fetchColumn();
    $source=p2_read($pdo,$issues); p2_validate($pdo,$source,$issues);
    $files=array_fill_keys($pdo->query('SELECT id FROM app_files')->fetchAll(PDO::FETCH_COLUMN),true);
    if (!array_filter($issues,fn($i)=>$i['severity']==='error')) {
        $project=p2_project($source,$files);
        if ($mode==='--apply') { p2_schema($pdo); p2_apply($pdo,$project,$sourceRevision); }
        if ($mode!=='--check') $counts=p2_verify($pdo,$project,$issues);
        else foreach ($project as $table=>$rows) $counts[$table]=['source'=>count($rows)];
    }
} catch (Throwable $e) { p2_issue($issues,'error','backfill',$e->getMessage()); }
$result=['mode'=>$mode,'counts'=>$counts,'issues'=>$issues,'status'=>array_filter($issues,fn($i)=>$i['severity']==='error')?'failed':'ok'];
echo json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),"\n";
exit($result['status']==='ok'?0:1);
