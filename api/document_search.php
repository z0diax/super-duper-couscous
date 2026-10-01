<?php
declare(strict_types=1);
require_once __DIR__.'/document_read_http.php';
[$pdo,$user]=document_read_context();
$params=document_read_params(['q']);
try {
    if (!isset($params['q'])) throw new InvalidArgumentException('A search query is required.');
    respond(document_repository_shell_search($pdo,$user,$params['q']));
} catch (InvalidArgumentException $e) { throw new ApiError($e->getMessage(),400); }
