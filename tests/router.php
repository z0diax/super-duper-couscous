<?php
// Isolated test server only. Never used by the Apache deployment.
$root=dirname(__DIR__); $path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
$path=preg_replace('#^/hrmdo-document-tracking-system#','',$path);
if (in_array($path,['/api/auth.php','/api/state.php','/api/files.php'],true)) { require $root.$path; return true; }
if (str_starts_with($path,'/dist/')) {
    $file=realpath($root.$path); if ($file && str_starts_with($file,realpath($root.'/dist').DIRECTORY_SEPARATOR) && is_file($file)) {
        $ext=pathinfo($file,PATHINFO_EXTENSION); header('Content-Type: '.(['js'=>'application/javascript','css'=>'text/css','svg'=>'image/svg+xml','html'=>'text/html'][$ext]??'application/octet-stream')); readfile($file); return true;
    }
}
if (in_array($path,['/','/dist/',''],true)) { header('Content-Type: text/html'); readfile($root.'/dist/index.html'); return true; }
http_response_code(404); echo 'Not found';
