<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();$params=payroll_read_params(['owned','office','stage','page','limit']);
try {
    if(isset($params['owned'])&&$params['owned']!=='1')throw new InvalidArgumentException('Invalid ownership filter.');
    $filters=['owned'=>isset($params['owned']),'office'=>$params['office']??'','stage'=>$params['stage']??''];
    $result=payroll_batch_list($pdo,$user,$filters,payroll_read_int($params,'page',1),payroll_read_int($params,'limit',10));
    respond(['data'=>$result['items'],'pagination'=>['page'=>$result['page'],'limit'=>$result['limit'],'total'=>$result['total'],'totalPages'=>$result['totalPages']],'metrics'=>$result['metrics'],'offices'=>$result['offices']]);
} catch(InvalidArgumentException $e){throw new ApiError($e->getMessage(),400);}
