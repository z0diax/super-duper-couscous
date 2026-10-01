<?php
declare(strict_types=1);
require_once __DIR__.'/document_read_http.php';
[$pdo,$user]=document_read_context();
document_read_params([]);
respond(document_repository_shell_summary($pdo,$user));
