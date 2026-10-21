<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
require_once __DIR__.'/leave_suggestion_history.php';

$pdo=database();
$user=authenticated_user($pdo);
$method=$_SERVER['REQUEST_METHOD'];
fail_unless(in_array($method,['GET','POST'],true),'Use GET to search or POST to save a suggestion.',405);
$role=$pdo->prepare("SELECT record_json FROM app_records WHERE collection='systemRoles' AND id=?");
$role->execute([$user['role']]); $raw=$role->fetchColumn();
$state=['systemRoles'=>$raw===false?[]:[json_decode($raw,true,64,JSON_THROW_ON_ERROR)]];
fail_unless(can_view_leave_application($state,$user,[]),'Your account cannot access Leave suggestions.',403);
if ($method==='POST') {
    csrf_check();
    // Matches intake/edit authority without loading application state.
    $modules=$user['sidebarModules']??null;
    fail_unless(has_cap($state,$user,'canIntake') && ($modules===null || in_array('leave',$modules,true)),'Your account cannot save Leave suggestions.',403);
    $input=request_json();
} else $input=$_GET;
$category=choice($input['category']??null,['medical','destination'],'suggestion category');
$location=choice($input['locationType']??'',['','WITHIN_PHILIPPINES','ABROAD'],'location type');
fail_unless($category==='destination' || $location==='','Medical suggestions do not accept a location type.');
$value=$input[$method==='POST'?'value':'q']??'';
fail_unless(is_string($value) && mb_check_encoding($value,'UTF-8') && mb_strlen($value)<=2000,'Suggestion must be at most 2000 characters.');
// Allow textarea newlines as whitespace, but reject control/invisible formatting characters.
$value=trim(preg_replace('/\s+/u',' ',$value));
fail_unless(!preg_match('/[\p{Cc}\p{Cf}]/u',$value),'Invalid suggestion.');
$normalized=mb_strtolower($value,'UTF-8');
// Visibility is shared within the authenticated Leave module, never controlled by request parameters.
$scope=$category==='medical'?LEAVE_MEDICAL_SHARED_SCOPE:'';
if ($method==='GET') {
    $prefix=str_replace(['!','%','_'],['!!','!%','!_'],$normalized).'%';
    $ranking=" ORDER BY CASE WHEN normalized_value=? THEN 0 ELSE 1 END,
        CASE WHEN location_type=? AND ?<>'' THEN 0 ELSE 1 END,
        CHAR_LENGTH(display_value), normalized_value, id";
    $query=$pdo->prepare("SELECT id, display_value AS value FROM leave_suggestions
        WHERE category=? AND scope_key=? AND normalized_value LIKE ? ESCAPE '!'".$ranking.' LIMIT 8');
    $query->execute([$category,$scope,$prefix,$normalized,$location,$location]);
    $items=$query->fetchAll();
    // Indexed prefixes fill the list first. Only scan the permitted vocabulary for substrings if needed.
    if (count($items)<8 && $normalized!=='') {
        $remaining=8-count($items);
        $query=$pdo->prepare("SELECT id, display_value AS value FROM leave_suggestions
            WHERE category=? AND scope_key=? AND LOCATE(?,normalized_value)>1
            AND normalized_value NOT LIKE ? ESCAPE '!'".$ranking.' LIMIT '.$remaining);
        $query->execute([$category,$scope,$normalized,$prefix,$normalized,$location,$location]);
        $items=array_merge($items,$query->fetchAll());
    }
    respond(['items'=>$items]);
}
fail_unless($value!=='' && preg_match('/[\p{L}\p{N}]/u',$value)===1,'Enter a non-empty suggestion containing letters or numbers.');
$hash=hash('sha256',$normalized);
$id=uid('suggestion');
$pdo->beginTransaction();
try {
    // A database constraint resolves simultaneous registrations; existing spelling is retained.
    $insert=$pdo->prepare('INSERT INTO leave_suggestions (id,category,scope_key,display_value,normalized_value,value_hash,location_type) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id');
    $insert->execute([$id,$category,$scope,$value,$normalized,$hash,$location!==''?$location:null]);
    $find=$pdo->prepare('SELECT id,display_value AS value FROM leave_suggestions WHERE category=? AND scope_key=? AND value_hash=?');
    $find->execute([$category,$scope,$hash]); $item=$find->fetch();
    $created=$item['id']===$id;
    if ($created) audit($pdo,$user,'LEAVE_SUGGESTION_CREATED',$id,'Saved a Leave suggestion',$category==='medical'?'Shared medical suggestion':'Shared destination suggestion');
    $pdo->commit();
    respond(['item'=>$item,'created'=>$created]);
} catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
