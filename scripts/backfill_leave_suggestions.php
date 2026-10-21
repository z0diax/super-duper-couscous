<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
require_once dirname(__DIR__).'/api/leave_suggestion_history.php';
$pdo=database();
$pdo->beginTransaction();
try {
    $count=backfill_leave_history_suggestions($pdo);
    $pdo->commit();
    echo "Added $count suggestions from eligible existing leave entries. Original records unchanged.\n";
} catch (Throwable $error) { $pdo->rollBack(); throw $error; }
