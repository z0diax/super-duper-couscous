<?php
declare(strict_types=1);
require_once __DIR__.'/document_repository.php';

function document_read_context(): array {
    fail_unless(($_SERVER['REQUEST_METHOD']??'')==='GET','Method not allowed.',405);
    $pdo=database();
    $user=authenticated_user($pdo);
    fail_unless(getenv('HRMDO_DOCUMENT_TARGETED_READS_ENABLED')==='1','Targeted document reads are disabled.',503);
    return [$pdo,$user];
}
function document_read_params(array $allowed): array {
    $params=[];
    foreach ($_GET as $key=>$value) {
        fail_unless(in_array($key,$allowed,true) && is_string($value) && $value!=='','Invalid query parameter.',400);
        $params[$key]=$value;
    }
    return $params;
}
function document_read_number(array $params,string $key,int $default): int {
    if (!isset($params[$key])) return $default;
    fail_unless((bool)preg_match('/^[1-9][0-9]*$/',$params[$key]),"Invalid $key.",400);
    $number=filter_var($params[$key],FILTER_VALIDATE_INT);
    fail_unless($number!==false,"Invalid $key.",400);
    return $number;
}
function document_read_page(array $result): never {
    $response=['data'=>$result['items'],'pagination'=>['page'=>$result['page'],'limit'=>$result['limit'],'total'=>$result['total'],'totalPages'=>$result['totalPages']]];
    if (isset($result['registryCounts'])) $response['registryCounts']=$result['registryCounts'];
    if (isset($result['queueCounts'])) $response['queueCounts']=$result['queueCounts'];
    respond($response);
}
