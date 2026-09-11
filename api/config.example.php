<?php
return [
    'host'=>'127.0.0.1', 'port'=>3306,
    'database'=>'hrmdo_document_tracking',
    'username'=>'hrmdo_app', 'password'=>'replace-with-a-unique-database-password',
    'session_timeout'=>1800,
    'upload_max_bytes'=>10 * 1024 * 1024,
    // Prefer a private directory outside Apache's document root in production.
    'upload_directory'=>dirname(__DIR__).'/storage/uploads',
];
