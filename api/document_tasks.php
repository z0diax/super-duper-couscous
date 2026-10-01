<?php
declare(strict_types=1);
require_once __DIR__.'/document_read_http.php';
[$pdo,$user]=document_read_context();
$params=document_read_params(['page','limit','queue','classification','search']);
try {
    $page=document_read_number($params,'page',1); $limit=document_read_number($params,'limit',25);
    if (!isset($params['queue'])) {
        fail_unless(!isset($params['classification']) && !isset($params['search']),'A task queue is required for filters.',400);
        document_read_page(document_repository_tasks($pdo,$user,$page,$limit));
    }
    $filters=[]; foreach (['classification','search'] as $key) if (isset($params[$key])) $filters[$key]=$params[$key];
    document_read_page(document_repository_task_queue($pdo,$user,$params['queue'],$filters,$page,$limit));
} catch (InvalidArgumentException $e) { throw new ApiError($e->getMessage(),400); }
