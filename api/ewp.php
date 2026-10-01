<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
fail_unless(($_SERVER['REQUEST_METHOD']??'')==='GET','Method not allowed.',405);
$pdo=database();$user=authenticated_user($pdo);
fail_unless(getenv('HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED')==='1','Targeted Leave/EWP reads are disabled.',503);
foreach($_GET as $key=>$value)fail_unless(in_array($key,['q','page','limit'],true)&&is_string($value)&&$value!=='','Invalid query parameter.',400);
fail_unless(can_view_ewp_records($user),'EWP records are unavailable.',403);
$page=filter_var($_GET['page']??1,FILTER_VALIDATE_INT);$limit=filter_var($_GET['limit']??10,FILTER_VALIDATE_INT);
fail_unless($page!==false&&$page>=1&&$limit!==false&&$limit>=1&&$limit<=100&&($page-1)*$limit<=2147483647,'Invalid page or limit.',400);
$search=mb_strtolower(trim((string)($_GET['q']??'')));
fail_unless(mb_strlen($search)<=150&&!preg_match('/[\x00-\x1F\x7F]/u',$search),'Invalid search query.',400);
$base=" FROM app_records r WHERE r.collection='ewpRecords'";
$fields=["$.barcode","$.employeeName","$.office","$.purpose","$.remarks"];
$where='';$params=[];
if($search!==''){$where=' AND ('.implode(' OR ',array_fill(0,count($fields),"LOWER(JSON_UNQUOTE(JSON_EXTRACT(r.record_json,?))) LIKE ? ESCAPE '!' ")).')';
    $pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],$search).'%';foreach($fields as $field){$params[]=$field;$params[]=$pattern;}}
$count=$pdo->prepare("SELECT COUNT(*)$base$where");$count->execute($params);$total=(int)$count->fetchColumn();
$query=$pdo->prepare("SELECT r.record_json$base$where ORDER BY JSON_UNQUOTE(JSON_EXTRACT(r.record_json,'$.createdAt')) DESC,r.id ASC LIMIT ? OFFSET ?");
foreach([...$params,$limit,($page-1)*$limit] as $i=>$value)$query->bindValue($i+1,$value,is_int($value)?PDO::PARAM_INT:PDO::PARAM_STR);
$query->execute();$items=array_map(fn($row)=>json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR),$query->fetchAll());
$summary=$pdo->query("SELECT COUNT(*) total,COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.amount')) AS DECIMAL(14,2))),0) amount,COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.office'))) offices FROM app_records WHERE collection='ewpRecords'")->fetch();
respond(['data'=>$items,'pagination'=>['page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit)],'summary'=>['total'=>(int)$summary['total'],'amount'=>(float)$summary['amount'],'offices'=>(int)$summary['offices']]]);
