<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();$params=payroll_read_params(['id','itemPage','groupPage','limit','itemOrder']);
try {
    if(!isset($params['id'])||mb_strlen($params['id'])>190)throw new InvalidArgumentException('Batch ID is required.');
    $itemOrder=$params['itemOrder']??'';
    if($itemOrder!==''&&$itemOrder!=='name')throw new InvalidArgumentException('Invalid item order.');
    respond(payroll_batch_detail($pdo,$user,$params['id'],payroll_read_int($params,'itemPage',1),payroll_read_int($params,'groupPage',1),payroll_read_int($params,'limit',25),$itemOrder));
} catch(InvalidArgumentException $e){throw new ApiError($e->getMessage(),400);}
