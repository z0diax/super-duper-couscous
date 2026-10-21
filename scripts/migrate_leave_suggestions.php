<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
$pdo=database();
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/leave_suggestions.sql'));
echo "Leave suggestion table ready. Existing records unchanged.\n";
