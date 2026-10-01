<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();$params=payroll_read_params(['search','page','limit']);
try {
    $search=trim($params['search']??'');if(mb_strlen($search)>150)throw new InvalidArgumentException('Search is too long.');
    $result=payroll_task_page($pdo,$user,$search,payroll_read_int($params,'page',1),payroll_read_int($params,'limit',25));
    respond(['data'=>$result['items'],'pagination'=>['page'=>$result['page'],'limit'=>$result['limit'],'total'=>$result['total'],'totalPages'=>$result['totalPages']],'allTaskCount'=>$result['allTaskCount']]);
} catch(InvalidArgumentException $e){throw new ApiError($e->getMessage(),400);}
