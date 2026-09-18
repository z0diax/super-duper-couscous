<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
require_once __DIR__.'/weather_service.php';

// Keep synchronized with src/theme/themeRegistry.ts. Disabled themes are omitted.
const ALLOWED_SYSTEM_THEMES=['classic','valentine','womens-month','amihan-bloom','winter','chinese-new-year','hallo-christmas','government','festive','rainy-season','weather-sync'];

function system_theme_setting(PDO $pdo): array {
    return weather_theme_response($pdo,ALLOWED_SYSTEM_THEMES);
}

$pdo=database(); $user=authenticated_user($pdo); $method=$_SERVER['REQUEST_METHOD'];
fail_unless(in_array($method,['GET','PUT'],true),'Use GET to read or PUT to update.',405);
if ($method==='GET') {
    $current=system_theme_setting($pdo); $stale=false;
    if ($current['theme']==='weather-sync') { $refreshed=weather_refresh_cached($pdo); $stale=$refreshed['stale']; }
    respond(weather_theme_response($pdo,ALLOWED_SYSTEM_THEMES,$stale));
}

csrf_check(); $body=request_json(); $requested=$body['theme']??null;
fail_unless(is_string($requested) && in_array($requested,ALLOWED_SYSTEM_THEMES,true),'Invalid system theme.',422);
fail_unless($requested!=='weather-sync','Configure and confirm a Weather Sync location before activation.',422);
$state=load_state($pdo); require_cap($state,$user,'canAdmin');
$pdo->beginTransaction();
try {
    $current=system_theme_setting($pdo);
    if ($current['theme']===$requested) { $pdo->commit(); respond($current); }
    $put=$pdo->prepare('INSERT INTO application_settings (setting_key,setting_value,updated_at,updated_by_user_id) VALUES (?,?,CURRENT_TIMESTAMP,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=CURRENT_TIMESTAMP,updated_by_user_id=VALUES(updated_by_user_id)');
    $put->execute(['system_theme',$requested,$user['id']]);
    increment_system_theme_revision($pdo,$user['id']);
    audit($pdo,$user,'SYSTEM_THEME_CHANGED','system-theme','Change system theme','Previous theme: '.$current['theme'].'. New theme: '.$requested.'.');
    $pdo->commit(); respond(system_theme_setting($pdo));
} catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
