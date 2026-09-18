<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';

const ALLOWED_SYSTEM_THEMES=['classic'];

function system_theme_setting(PDO $pdo): array {
    $query=$pdo->prepare("SELECT s.setting_value,s.updated_at,s.updated_by_user_id,u.name AS updated_by_name FROM application_settings s LEFT JOIN app_users u ON u.id=s.updated_by_user_id WHERE s.setting_key='system_theme'");
    $query->execute(); $row=$query->fetch();
    $theme=is_array($row) && in_array($row['setting_value']??'',ALLOWED_SYSTEM_THEMES,true)?$row['setting_value']:'classic';
    return ['theme'=>$theme,'updatedAt'=>$row['updated_at']??null,'updatedBy'=>!empty($row['updated_by_user_id'])?['id'=>$row['updated_by_user_id'],'name'=>$row['updated_by_name']??'Administrator']:null];
}

$pdo=database(); $user=authenticated_user($pdo); $method=$_SERVER['REQUEST_METHOD'];
fail_unless(in_array($method,['GET','PUT'],true),'Use GET to read or PUT to update.',405);
if ($method==='GET') respond(system_theme_setting($pdo));

csrf_check(); $body=request_json(); $requested=$body['theme']??null;
fail_unless(is_string($requested) && in_array($requested,ALLOWED_SYSTEM_THEMES,true),'Invalid system theme.',422);
$state=load_state($pdo); require_cap($state,$user,'canAdmin');
$pdo->beginTransaction();
try {
    $current=system_theme_setting($pdo);
    if ($current['theme']===$requested) { $pdo->commit(); respond($current); }
    $put=$pdo->prepare('INSERT INTO application_settings (setting_key,setting_value,updated_at,updated_by_user_id) VALUES (?,?,CURRENT_TIMESTAMP,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=CURRENT_TIMESTAMP,updated_by_user_id=VALUES(updated_by_user_id)');
    $put->execute(['system_theme',$requested,$user['id']]);
    audit($pdo,$user,'SYSTEM_THEME_CHANGED','system-theme','Change system theme','Previous theme: '.$current['theme'].'. New theme: '.$requested.'.');
    $pdo->commit(); respond(system_theme_setting($pdo));
} catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
