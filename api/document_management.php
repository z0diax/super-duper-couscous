<?php
declare(strict_types=1);
require_once __DIR__.'/document_repository.php';

function document_management_write(PDO $pdo,array $user,array $data): array {
    if (!$pdo->inTransaction()) throw new RuntimeException('Document management requires a write transaction.');
    $id=required($data,'documentId');
    $action=choice($data['action']??'', ['edit','correct','delete'],'document management action');
    $q=$pdo->prepare('SELECT source_json FROM documents WHERE id=? FOR UPDATE'); $q->execute([$id]); $json=$q->fetchColumn();
    fail_unless($json!==false,'Document not found.',404);
    $doc=json_decode($json,true,64,JSON_THROW_ON_ERROR);
    $roles=document_repository_role_state($pdo,$user);
    fail_unless(can_view_document($roles,$user,$doc),'Document not found.',404);
    $events=document_repository_audit($pdo,$id);
    $policy=document_management_permissions($doc,$user,$roles,$events);
    fail_unless(($doc['encodedBy']['userId']??'')===$user['id'] || has_cap($roles,$user,'canAdmin'),'Only the creator or an administrator may modify this document.',403);
    if (($doc['routingMode']??'')!=='dynamic') {
        $source=$pdo->prepare("SELECT record_json FROM app_records WHERE collection='documents' AND id=? FOR UPDATE"); $source->execute([$id]); $raw=$source->fetchColumn();
        fail_unless($raw!==false && json_decode($raw,true,64,JSON_THROW_ON_ERROR)===$doc,'The document projection is not current. Review the database synchronization before editing.',409);
    }
    $version=required($data,'expectedVersion',64);
    fail_unless(hash_equals($policy['version'],$version),'The document changed. Reopen it and review the latest information before saving.',409);
    $reason=$data['reason']??'';
    fail_unless(is_string($reason) && mb_strlen($reason)<=2000,'Reason must be at most 2000 characters.'); $reason=trim($reason);
    if ($action==='delete') {
        fail_unless(!array_diff(array_keys($data),['action','documentId','expectedVersion','reason']),'Unexpected deletion fields.');
        document_management_assert_delete($doc,$user,$roles,$events);
        audit($pdo,$user,'DOCUMENT_DELETED',$id,'Delete unprocessed document',p2_json(['reason'=>$reason,'document'=>$doc]),$doc['trackingNumber']);
        // Delete metadata/access using the same normalized writer as routing;
        // physical uploaded files retain the existing retention/cleanup policy.
        p2_write_project($pdo,[],[$id]);
        $pdo->prepare("DELETE FROM app_records WHERE collection='documents' AND id=?")->execute([$id]);
        $pdo->prepare('DELETE FROM app_files WHERE owner_id=?')->execute([$id]);
        return ['id'=>$id,'trackingNumber'=>$doc['trackingNumber'],'deleted'=>true];
    }
    fail_unless($policy['canEdit'],$policy['restriction']??'You cannot edit this document.',403);
    fail_unless(($action==='correct')===($policy['mode']==='correction'),'The processing state changed. Reopen the document to use the permitted edit mode.',409);
    if ($action==='correct') fail_unless($reason!=='','A correction reason is required.');
    fail_unless(!array_diff(array_keys($data),['action','documentId','expectedVersion','reason','fields']),'Protected document fields cannot be changed.');
    $fields=$data['fields']??null;
    fail_unless(is_array($fields) && $fields!==[] && !array_diff(array_keys($fields),array_keys(DOCUMENT_METADATA_FIELDS)),'Only descriptive metadata may be changed.');
    $changes=[];
    foreach ($fields as $field=>$value) {
        fail_unless(is_string($value) && mb_strlen($value)<=DOCUMENT_METADATA_FIELDS[$field],"Invalid $field (maximum ".DOCUMENT_METADATA_FIELDS[$field].' characters).');
        $value=trim($value);
        if (in_array($field,['title','sourceOffice'],true)) fail_unless($value!=='',"$field is required.");
        if ($field==='priority') $value=choice($value,['Routine','Priority','Urgent'],'priority');
        if ($field==='sourceType') $value=choice($value,['Internal','External'],'source type');
        if (($doc[$field]??'')!==$value) { $changes[$field]=['before'=>$doc[$field]??'','after'=>$value]; $doc[$field]=$value; }
    }
    fail_unless($changes!==[],'No metadata changes were supplied.');
    if ($changes) {
        // Metadata-only projection update leaves every child/history row intact.
        $project=p2_project(['documents'=>[$id=>['value'=>$doc,'raw'=>p2_json($doc)]],'workflowTemplates'=>[]],[]);
        p2_put($pdo,'documents',$project['documents'][0]);
        if (($doc['routingMode']??'')!=='dynamic') {
            $pdo->prepare("UPDATE app_records SET record_json=? WHERE collection='documents' AND id=?")->execute([p2_json($doc),$id]);
            fail_unless($pdo->query('SELECT ROW_COUNT()')->fetchColumn()==1,'The predefined document source could not be updated.',409);
        }
        audit($pdo,$user,$action==='correct'?'DOCUMENT_CORRECTED':'DOCUMENT_EDITED',$id,$action==='correct'?'Correct active document metadata':'Edit unprocessed document',p2_json(['reason'=>$reason,'changes'=>$changes]),$doc['trackingNumber']);
    }
    $doc['management']=document_management_permissions($doc,$user,$roles,$events);
    return $doc;
}
