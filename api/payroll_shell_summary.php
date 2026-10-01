<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();payroll_read_params([]);respond(payroll_shell_summary($pdo,$user));
