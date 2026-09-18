<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
require_once __DIR__.'/weather_service.php';

const WEATHER_ALLOWED_SYSTEM_THEMES=['classic','valentine','womens-month','amihan-bloom','winter','chinese-new-year','hallo-christmas','government','festive','rainy-season','weather-sync'];

$pdo=database(); $user=authenticated_user($pdo); $method=$_SERVER['REQUEST_METHOD'];
if ($method==='GET') respond(sidebar_weather_tacloban());
$state=load_state($pdo); require_cap($state,$user,'canAdmin');
fail_unless(in_array($method,['POST','PUT'],true),'Use GET for sidebar weather, POST to preview or refresh, or PUT to activate Weather Sync.',405); csrf_check(); $body=request_json();

if ($method==='POST' && ($body['action']??'preview')==='preview') {
    try { respond(weather_resolve(weather_validate_location_query($body['location']??null))); }
    catch (ApiError $error) { throw $error; }
    catch (Throwable $error) { error_log('HRMDO weather preview: '.$error->getMessage()); throw new ApiError('Unable to retrieve weather for this location. Try again later.',503); }
}
if ($method==='POST' && ($body['action']??'')==='refresh') {
    weather_refresh_cached($pdo,true,true); respond(weather_theme_response($pdo,WEATHER_ALLOWED_SYSTEM_THEMES,false));
}
fail_unless($method==='PUT','Invalid Weather Sync action.',405);

try { $resolved=weather_resolve(weather_validate_location_query($body['location']??null)); }
catch (ApiError $error) { throw $error; }
catch (Throwable $error) { error_log('HRMDO weather activation: '.$error->getMessage()); throw new ApiError('Unable to retrieve weather for this location. Try again later.',503); }

$activationLock=(int)$pdo->query("SELECT GET_LOCK('hrmdo_weather_refresh',10)")->fetchColumn()===1;
fail_unless($activationLock,'Weather Sync is being refreshed. Try again in a moment.',409);
$pdo->beginTransaction();
try {
    $previous=weather_theme_response($pdo,WEATHER_ALLOWED_SYSTEM_THEMES);
    weather_write_settings($pdo,weather_snapshot_values($resolved),$user['id']);
    $put=$pdo->prepare('INSERT INTO application_settings (setting_key,setting_value,updated_at,updated_by_user_id) VALUES (?,?,CURRENT_TIMESTAMP,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=CURRENT_TIMESTAMP,updated_by_user_id=VALUES(updated_by_user_id)');
    $put->execute(['system_theme','weather-sync',$user['id']]);
    if ($previous['theme']!=='weather-sync') audit($pdo,$user,'SYSTEM_THEME_CHANGED','system-theme','Change system theme','Previous theme: '.$previous['theme'].'. New theme: weather-sync.');
    $oldLocation=$previous['location']['name']??''; $newLocation=$resolved['location']['name'];
    if ($oldLocation!==$newLocation) audit($pdo,$user,'WEATHER_SYNC_LOCATION_CHANGED','weather-sync','Change Weather Sync location','Previous location: '.($oldLocation!==''?$oldLocation:'Not configured').'. New location: '.$newLocation.'.');
    $configurationChanged=$previous['theme']!=='weather-sync'
        || ($previous['location']['query']??'')!==$resolved['location']['query']
        || $oldLocation!==$newLocation
        || ($previous['effectiveWeatherTheme']??null)!==$resolved['weather']['effectiveTheme'];
    if ($configurationChanged) increment_system_theme_revision($pdo,$user['id']);
    $pdo->commit(); $response=weather_theme_response($pdo,WEATHER_ALLOWED_SYSTEM_THEMES,false);
} catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
finally { $pdo->query("SELECT RELEASE_LOCK('hrmdo_weather_refresh')"); }
respond($response);
