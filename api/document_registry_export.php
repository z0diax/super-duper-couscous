<?php
declare(strict_types=1);
require_once __DIR__.'/document_read_http.php';
[$pdo,$user]=document_read_context();
$params=document_read_params(['registry','isLegacyV1','status','classification','priority']);
fail_unless(($params['registry']??null)==='1','Registry export is required.',400);
try { document_repository_registry_export($pdo,$user,$params); }
catch (InvalidArgumentException $e) { throw new ApiError($e->getMessage(),400); }
