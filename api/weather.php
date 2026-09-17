<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';

fail_unless($_SERVER['REQUEST_METHOD']==='GET','Method not allowed.',405);
authenticated_user(database());

$cacheFile=dirname(__DIR__).'/storage/weather-tacloban.json';
$cacheSeconds=15*60;
$staleSeconds=6*60*60;
$readCache=static function() use ($cacheFile): ?array {
    if (!is_file($cacheFile)) return null;
    try {
        $value=json_decode((string)file_get_contents($cacheFile),true,16,JSON_THROW_ON_ERROR);
        return is_array($value) ? $value : null;
    } catch (Throwable) { return null; }
};

$cached=$readCache();
$cacheAge=$cached ? time()-(int)($cached['_cachedAt']??0) : PHP_INT_MAX;
if ($cached && $cacheAge<$cacheSeconds) respond($cached);

$url='https://api.open-meteo.com/v1/forecast?latitude=11.2443&longitude=125.0039&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FManila&forecast_days=1';
$body=false;
if (function_exists('curl_init')) {
    $curl=curl_init($url);
    curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>8,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_USERAGENT=>'HRMDO-Records-Weather/1.0',CURLOPT_HTTPHEADER=>['Accept: application/json']]);
    $body=curl_exec($curl);
    $status=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if ($status!==200) $body=false;
} else {
    $context=stream_context_create(['http'=>['timeout'=>8,'ignore_errors'=>true,'header'=>"Accept: application/json\r\nUser-Agent: HRMDO-Records-Weather/1.0\r\n"]]);
    $body=@file_get_contents($url,false,$context);
}

if (is_string($body) && $body!=='') {
    try {
        $weather=json_decode($body,true,32,JSON_THROW_ON_ERROR);
        $valid=is_array($weather)
            && is_numeric($weather['current']['temperature_2m']??null)
            && is_numeric($weather['current']['weather_code']??null)
            && is_numeric($weather['daily']['temperature_2m_max'][0]??null)
            && is_numeric($weather['daily']['temperature_2m_min'][0]??null);
        if ($valid) {
            $weather['_cachedAt']=time();
            file_put_contents($cacheFile,json_encode($weather,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES),LOCK_EX);
            respond($weather);
        }
    } catch (Throwable) {}
}

if ($cached && $cacheAge<$staleSeconds) respond($cached);
respond(['error'=>'Weather is temporarily unavailable.'],503);
