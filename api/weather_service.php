<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';

const WEATHER_GEOCODING_ENDPOINT='https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_FORECAST_ENDPOINT='https://api.open-meteo.com/v1/forecast';
const WEATHER_CACHE_SECONDS=1800;
const WEATHER_WINDY_KMH=35.0;
const WEATHER_THEMES=['sunny','cloudy','windy','rainy','thunderstorm','winter'];
const WEATHER_SETTING_KEYS=['weather_location_query','weather_location_name','weather_latitude','weather_longitude','weather_timezone','weather_effective_theme','weather_code','weather_label','weather_updated_at'];

function system_theme_revision(PDO $pdo): int {
    $query=$pdo->prepare("SELECT setting_value FROM application_settings WHERE setting_key='system_theme_revision'");
    $query->execute();
    $value=$query->fetchColumn();
    return is_numeric($value) ? max(0,(int)$value) : 0;
}

function increment_system_theme_revision(PDO $pdo,?string $actorId): int {
    $put=$pdo->prepare("INSERT INTO application_settings (setting_key,setting_value,updated_at,updated_by_user_id) VALUES ('system_theme_revision','1',CURRENT_TIMESTAMP,?) ON DUPLICATE KEY UPDATE setting_value=CAST(setting_value AS UNSIGNED)+1,updated_at=CURRENT_TIMESTAMP,updated_by_user_id=VALUES(updated_by_user_id)");
    $put->execute([$actorId]);
    return system_theme_revision($pdo);
}

function sidebar_weather_tacloban(): array {
    $cacheFile=dirname(__DIR__).'/storage/weather-tacloban.json'; $freshSeconds=15*60; $staleSeconds=6*60*60;
    $cached=null;
    if (is_file($cacheFile)) try { $value=json_decode((string)file_get_contents($cacheFile),true,16,JSON_THROW_ON_ERROR); if (is_array($value)) $cached=$value; } catch (Throwable) {}
    $age=$cached ? time()-(int)($cached['_cachedAt']??0) : PHP_INT_MAX;
    if ($cached && $age<$freshSeconds) return $cached;
    try {
        $url=WEATHER_FORECAST_ENDPOINT.'?'.http_build_query(['latitude'=>11.2443,'longitude'=>125.0039,'current'=>'temperature_2m,apparent_temperature,weather_code,is_day','daily'=>'temperature_2m_max,temperature_2m_min,precipitation_probability_max','timezone'=>'Asia/Manila','forecast_days'=>1]);
        $weather=weather_http_json($url);
        fail_unless(is_numeric($weather['current']['temperature_2m']??null) && is_numeric($weather['current']['weather_code']??null) && is_numeric($weather['daily']['temperature_2m_max'][0]??null) && is_numeric($weather['daily']['temperature_2m_min'][0]??null),'Weather is temporarily unavailable.',503);
        $weather['_cachedAt']=time(); @file_put_contents($cacheFile,json_encode($weather,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES),LOCK_EX); return $weather;
    } catch (Throwable $error) {
        error_log('HRMDO sidebar weather: '.$error->getMessage());
        if ($cached && $age<$staleSeconds) return $cached;
        throw new ApiError('Weather is temporarily unavailable.',503);
    }
}

function weather_http_json(string $url): array {
    $context=stream_context_create(['http'=>['method'=>'GET','timeout'=>8,'ignore_errors'=>true,'header'=>"Accept: application/json\r\nUser-Agent: HRMDO-Records-Management-System/1.0\r\n"],'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
    $body=@file_get_contents($url,false,$context);
    $status=0;
    foreach ($http_response_header??[] as $header) if (preg_match('/^HTTP\/\S+\s+(\d{3})/',(string)$header,$match)) $status=(int)$match[1];
    if ($body===false || $status<200 || $status>=300) throw new RuntimeException('Weather provider request failed with HTTP '.$status.'.');
    try { $decoded=json_decode($body,true,32,JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new RuntimeException('Weather provider returned invalid JSON.',0,$error); }
    if (!is_array($decoded) || !empty($decoded['error'])) throw new RuntimeException('Weather provider returned an error response.');
    return $decoded;
}

function weather_validate_location_query(mixed $value): string {
    fail_unless(is_string($value),'Enter a city or municipality.');
    $query=trim($value);
    fail_unless(mb_strlen($query)>=2 && mb_strlen($query)<=120,'Location must contain between 2 and 120 characters.');
    fail_unless(!preg_match('/[<>\x00-\x1F\x7F]/u',$query),'Location contains unsupported characters.');
    return $query;
}

function weather_geocode(string $query): array {
    $url=WEATHER_GEOCODING_ENDPOINT.'?'.http_build_query(['name'=>$query,'count'=>1,'language'=>'en','format'=>'json']);
    $payload=weather_http_json($url); $result=$payload['results'][0]??null;
    fail_unless(is_array($result),'Location not found. Enter a city or municipality.',422);
    fail_unless(is_numeric($result['latitude']??null) && is_numeric($result['longitude']??null),'The resolved location has invalid coordinates.',422);
    $parts=[];
    foreach (['name','admin1','country'] as $field) { $part=trim((string)($result[$field]??'')); if ($part!=='' && !in_array($part,$parts,true)) $parts[]=$part; }
    return ['query'=>$query,'name'=>mb_substr(implode(', ',$parts),0,190),'latitude'=>(float)$result['latitude'],'longitude'=>(float)$result['longitude'],'timezone'=>mb_substr((string)($result['timezone']??'auto'),0,120)];
}

function weather_label(int $code): string {
    return match (true) {
        $code===0=>'Clear', $code===1=>'Mainly clear', $code===2=>'Partly cloudy', $code===3=>'Overcast',
        in_array($code,[45,48],true)=>'Fog', in_array($code,[51,53,55,56,57],true)=>'Drizzle',
        in_array($code,[61,63,65,66,67],true)=>'Rain', in_array($code,[71,73,75,77],true)=>'Snow',
        in_array($code,[80,81,82],true)=>'Rain showers', in_array($code,[85,86],true)=>'Snow showers',
        in_array($code,[95,96,99],true)=>'Thunderstorm', default=>'Current conditions',
    };
}

function weather_classify(int $code,float $cloudCover,float $windSpeed,float $windGusts): string {
    if (in_array($code,[95,96,99],true)) return 'thunderstorm';
    if (in_array($code,[71,73,75,77,85,86],true)) return 'winter';
    if (in_array($code,[51,53,55,56,57,61,63,65,66,67,80,81,82],true)) return 'rainy';
    if (max($windSpeed,$windGusts)>=WEATHER_WINDY_KMH) return 'windy';
    if (in_array($code,[1,2,3,45,48],true) || $cloudCover>=60) return 'cloudy';
    return 'sunny';
}

function weather_fetch_current(array $location): array {
    $url=WEATHER_FORECAST_ENDPOINT.'?'.http_build_query([
        'latitude'=>$location['latitude'],'longitude'=>$location['longitude'],
        'current'=>'weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,is_day',
        'wind_speed_unit'=>'kmh','timezone'=>$location['timezone']?:'auto',
    ]);
    $payload=weather_http_json($url); $current=$payload['current']??null;
    if (!is_array($current) || !is_numeric($current['weather_code']??null)) throw new RuntimeException('Weather provider did not return current conditions.');
    $code=(int)$current['weather_code']; $cloud=(float)($current['cloud_cover']??0); $wind=(float)($current['wind_speed_10m']??0); $gusts=(float)($current['wind_gusts_10m']??0);
    $theme=weather_classify($code,$cloud,$wind,$gusts);
    return ['effectiveTheme'=>$theme,'code'=>$code,'label'=>$theme==='windy'?'Windy':weather_label($code),'updatedAt'=>gmdate('Y-m-d\TH:i:s\Z'),'cloudCover'=>$cloud,'windSpeedKmh'=>$wind,'windGustsKmh'=>$gusts,'isDay'=>(int)($current['is_day']??1)===1];
}

function weather_resolve(string $query): array {
    $location=weather_geocode(weather_validate_location_query($query));
    return ['location'=>$location,'weather'=>weather_fetch_current($location)];
}

function weather_settings(PDO $pdo): array {
    $rows=$pdo->query("SELECT setting_key,setting_value FROM application_settings WHERE setting_key LIKE 'weather_%'")->fetchAll();
    $values=[]; foreach ($rows as $row) $values[$row['setting_key']]=$row['setting_value']; return $values;
}

function weather_snapshot(PDO $pdo): ?array {
    $values=weather_settings($pdo);
    if (empty($values['weather_location_name']) || empty($values['weather_effective_theme']) || !in_array($values['weather_effective_theme'],WEATHER_THEMES,true)) return null;
    return ['location'=>['query'=>$values['weather_location_query']??'','name'=>$values['weather_location_name'],'latitude'=>(float)($values['weather_latitude']??0),'longitude'=>(float)($values['weather_longitude']??0),'timezone'=>$values['weather_timezone']??'auto'],'weather'=>['effectiveTheme'=>$values['weather_effective_theme'],'code'=>(int)($values['weather_code']??0),'label'=>$values['weather_label']??'Current conditions','updatedAt'=>$values['weather_updated_at']??null]];
}

function weather_is_fresh(?array $snapshot): bool {
    $updated=$snapshot['weather']['updatedAt']??null; if (!is_string($updated) || $updated==='') return false;
    $timestamp=strtotime($updated); return $timestamp!==false && time()-$timestamp<WEATHER_CACHE_SECONDS;
}

function weather_write_settings(PDO $pdo,array $values,?string $actorId): void {
    $put=$pdo->prepare('INSERT INTO application_settings (setting_key,setting_value,updated_at,updated_by_user_id) VALUES (?,?,CURRENT_TIMESTAMP,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=CURRENT_TIMESTAMP,updated_by_user_id=VALUES(updated_by_user_id)');
    foreach ($values as $key=>$value) { fail_unless(in_array($key,WEATHER_SETTING_KEYS,true),'Invalid weather setting.'); $put->execute([$key,(string)$value,$actorId]); }
}

function weather_snapshot_values(array $resolved): array {
    return [
        'weather_location_query'=>$resolved['location']['query'],'weather_location_name'=>$resolved['location']['name'],
        'weather_latitude'=>(string)$resolved['location']['latitude'],'weather_longitude'=>(string)$resolved['location']['longitude'],
        'weather_timezone'=>$resolved['location']['timezone'],'weather_effective_theme'=>$resolved['weather']['effectiveTheme'],
        'weather_code'=>(string)$resolved['weather']['code'],'weather_label'=>$resolved['weather']['label'],'weather_updated_at'=>$resolved['weather']['updatedAt'],
    ];
}

function weather_refresh_cached(PDO $pdo,bool $force=false,bool $throwOnFailure=false): array {
    $cached=weather_snapshot($pdo); if (!$force && weather_is_fresh($cached)) return ['snapshot'=>$cached,'stale'=>false];
    if (!$cached) { if ($throwOnFailure) throw new ApiError('Configure a valid Weather Sync location first.',422); return ['snapshot'=>null,'stale'=>true]; }
    $locked=(int)$pdo->query("SELECT GET_LOCK('hrmdo_weather_refresh',1)")->fetchColumn()===1;
    if (!$locked) return ['snapshot'=>$cached,'stale'=>true];
    try {
        $latest=weather_snapshot($pdo); if (!$force && weather_is_fresh($latest)) return ['snapshot'=>$latest,'stale'=>false];
        $weather=weather_fetch_current($cached['location']);
        $effectiveChanged=($latest['weather']['effectiveTheme']??$cached['weather']['effectiveTheme']??null)!==$weather['effectiveTheme'];
        $pdo->beginTransaction();
        try {
            weather_write_settings($pdo,['weather_effective_theme'=>$weather['effectiveTheme'],'weather_code'=>(string)$weather['code'],'weather_label'=>$weather['label'],'weather_updated_at'=>$weather['updatedAt']],null);
            if ($effectiveChanged) increment_system_theme_revision($pdo,null);
            $pdo->commit();
        }
        catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
        return ['snapshot'=>weather_snapshot($pdo),'stale'=>false];
    } catch (Throwable $error) {
        error_log('HRMDO weather refresh: '.$error->getMessage());
        if ($throwOnFailure) throw new ApiError('Unable to retrieve current weather. The last successful weather state remains active.',503);
        return ['snapshot'=>$cached,'stale'=>true];
    } finally { $pdo->query("SELECT RELEASE_LOCK('hrmdo_weather_refresh')"); }
}

function weather_theme_response(PDO $pdo,array $allowedThemes,bool $stale=false): array {
    $query=$pdo->prepare("SELECT s.setting_value,s.updated_at,s.updated_by_user_id,u.name AS updated_by_name FROM application_settings s LEFT JOIN app_users u ON u.id=s.updated_by_user_id WHERE s.setting_key='system_theme'");
    $query->execute(); $row=$query->fetch();
    $theme=is_array($row) && in_array($row['setting_value']??'',$allowedThemes,true)?$row['setting_value']:'classic';
    $snapshot=weather_snapshot($pdo);
    return ['theme'=>$theme,'revision'=>system_theme_revision($pdo),'effectiveWeatherTheme'=>$snapshot['weather']['effectiveTheme']??null,'location'=>$snapshot['location']??null,'weather'=>$snapshot['weather']??null,'weatherUpdatedAt'=>$snapshot['weather']['updatedAt']??null,'weatherStale'=>$stale,'updatedAt'=>$row['updated_at']??null,'updatedBy'=>!empty($row['updated_by_user_id'])?['id'=>$row['updated_by_user_id'],'name'=>$row['updated_by_name']??'Administrator']:null];
}
