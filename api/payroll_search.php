<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();$params=payroll_read_params(['q']);
try {if(!isset($params['q']))throw new InvalidArgumentException('A search query is required.');respond(payroll_search($pdo,$user,$params['q']));}
catch(InvalidArgumentException $e){throw new ApiError($e->getMessage(),400);}
