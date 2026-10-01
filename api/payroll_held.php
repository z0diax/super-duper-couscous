<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();$params=payroll_read_params(['page','limit']);
try {$result=payroll_held_page($pdo,$user,payroll_read_int($params,'page',1),payroll_read_int($params,'limit',25));
    respond(['data'=>$result['items'],'batches'=>$result['batches'],'pagination'=>['page'=>$result['page'],'limit'=>$result['limit'],'total'=>$result['total'],'totalPages'=>$result['totalPages']]]);
}catch(InvalidArgumentException $e){throw new ApiError($e->getMessage(),400);}
