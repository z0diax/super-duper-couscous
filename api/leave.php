<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';

$pdo=database(); $user=authenticated_user($pdo); $state=load_state($pdo);
fail_unless($_SERVER['REQUEST_METHOD']==='GET','Use GET to query Leave Applications.',405);
$modules=$user['sidebarModules']??null;
fail_unless($user['role']==='admin' || has_cap($state,$user,'canAdmin') || $modules===null || in_array('leave',$modules,true),'Your account is not authorized to view Leave Applications.',403);

$page=max(1,filter_var($_GET['page']??1,FILTER_VALIDATE_INT)?:1);
$pageSize=filter_var($_GET['pageSize']??10,FILTER_VALIDATE_INT)?:10;
fail_unless(in_array($pageSize,[10,25,50],true),'Page size must be 10, 25, or 50.');
$q=mb_strtolower(trim((string)($_GET['q']??''))); fail_unless(mb_strlen($q)<=190,'Search must be at most 190 characters.');
$status=(string)($_GET['status']??''); $leaveType=(string)($_GET['leaveType']??''); $office=(string)($_GET['office']??'');
$filedFrom=(string)($_GET['filedFrom']??''); $filedTo=(string)($_GET['filedTo']??''); $leaveDate=(string)($_GET['leaveDate']??'');
$statuses=['For_Computation','For_Processing','For_Signature','On_Hold','Released','Cancelled','Pending','Approved','Disapproved'];
$leaveTypes=['COC','Vacation Leave','Mandatory / Forced Leave','Sick Leave','Wellness Leave','Maternity Leave','Paternity Leave','Special Privilege Leave','Solo Parent Leave','Study Leave','10-Day VAWC Leave','Rehabilitation Privilege','Special Leave Benefits for Women','Special Emergency / Calamity Leave','Adoption Leave','Others','Terminal Leave'];
if ($status!=='') fail_unless(in_array($status,$statuses,true),'Invalid Leave status filter.');
if ($leaveType!=='') fail_unless(in_array($leaveType,$leaveTypes,true),'Invalid Leave Type filter.');
foreach (['Filed From'=>$filedFrom,'Filed To'=>$filedTo,'Leave Date'=>$leaveDate] as $label=>$date) if ($date!=='') { $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date); fail_unless($parsed && $parsed->format('Y-m-d')===$date,"$label must be a valid date."); }
fail_unless($filedFrom==='' || $filedTo==='' || $filedFrom<=$filedTo,'Filed From must be on or before Filed To.');
$sort=(string)($_GET['sort']??'registered_desc');
$sortSql=['registered_desc'=>'registered_at DESC, id DESC','registered_asc'=>'registered_at ASC, id ASC','employee_asc'=>'employee_name ASC, id ASC','employee_desc'=>'employee_name DESC, id DESC','status_asc'=>'leave_status ASC, id ASC','type_asc'=>'leave_type ASC, id ASC'][$sort]??null;
fail_unless($sortSql!==null,'Invalid Leave sort option.');

$base=" FROM (SELECT id, record_json, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.createdAt')),JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.filingDate')),'') registered_at, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.employeeName')),'') employee_name, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.office')),JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.department')),'') office_name, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveType')),'') leave_type, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.status')),'') leave_status FROM app_records WHERE collection='leaveApplications' AND COALESCE(JSON_EXTRACT(record_json,'$.isLegacyV1'),false)=false) leaves WHERE 1=1";
$where=''; $params=[];
if ($q!=='') foreach (preg_split('/\s+/u',$q,-1,PREG_SPLIT_NO_EMPTY) as $word) { $where.=" AND LOWER(CONCAT_WS(' ',COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.barcode')),''),COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.trackingNumber')),''),employee_name,office_name,leave_type,leave_status,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveSubtype')),''),COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveDetails')),''),COALESCE(JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.remarks')),''))) LIKE ?"; $params[]='%'.$word.'%'; }
if ($status!=='') { $where.=' AND leave_status=?'; $params[]=$status; }
if ($leaveType!=='') { $where.=' AND leave_type=?'; $params[]=$leaveType; }
if ($office!=='') { $where.=' AND office_name=?'; $params[]=$office; }
if ($filedFrom!=='') { $where.=' AND LEFT(registered_at,10)>=?'; $params[]=$filedFrom; }
if ($filedTo!=='') { $where.=' AND LEFT(registered_at,10)<=?'; $params[]=$filedTo; }
if ($leaveDate!=='') {
    $rangeChecks=[];
    for ($rangeIndex=0;$rangeIndex<50;$rangeIndex++) { $rangeChecks[]="? BETWEEN JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.dateRanges[$rangeIndex].startDate')) AND JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.dateRanges[$rangeIndex].endDate'))"; $params[]=$leaveDate; }
    $rangeChecks[]="? BETWEEN JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.startDate')) AND JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.endDate'))"; $params[]=$leaveDate;
    $where.=' AND ('.implode(' OR ',$rangeChecks).')';
}
$count=$pdo->prepare('SELECT COUNT(*)'.$base.$where); $count->execute($params); $total=(int)$count->fetchColumn(); $pages=max(1,(int)ceil($total/$pageSize)); $page=min($page,$pages); $offset=($page-1)*$pageSize;
$list=$pdo->prepare('SELECT record_json'.$base.$where.' ORDER BY '.$sortSql.' LIMIT '.$pageSize.' OFFSET '.$offset); $list->execute($params); $items=array_map(fn($row)=>json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR),$list->fetchAll());

$summaryWhere=preg_replace('/ AND leave_status=\?/','',$where,1); $summaryParams=$params;
if ($status!=='') { $statusIndex=count($summaryParams)-1; if ($leaveType!==''||$office!==''||$filedFrom!==''||$filedTo!==''||$leaveDate!=='') { $statusIndex=count(preg_split('/\s+/u',$q,-1,PREG_SPLIT_NO_EMPTY)); } array_splice($summaryParams,$statusIndex,1); }
$summary=$pdo->prepare("SELECT COUNT(*) total,SUM(leave_status='For_Computation') forComputation,SUM(leave_status='For_Processing') processing,SUM(leave_status='For_Signature') forSignature,SUM(leave_status='On_Hold') onHold,SUM(leave_status='Released') released".$base.$summaryWhere); $summary->execute($summaryParams); $counts=$summary->fetch()?:[];
$taskStatuses=[]; if (has_cap($state,$user,'canProcess')||has_cap($state,$user,'canSupervise')) array_push($taskStatuses,'For_Computation','For_Processing','On_Hold'); if (has_cap($state,$user,'canApprove')||has_cap($state,$user,'canRelease')||has_cap($state,$user,'canSupervise')) array_push($taskStatuses,'For_Signature');
$taskCount=0; if ($taskStatuses) { $taskStatuses=array_values(array_unique($taskStatuses)); $marks=implode(',',array_fill(0,count($taskStatuses),'?')); $task=$pdo->prepare('SELECT COUNT(*)'.$base.' AND leave_status IN ('.$marks.')'); $task->execute($taskStatuses); $taskCount=(int)$task->fetchColumn(); }
$offices=$pdo->query("SELECT DISTINCT TRIM(office) office FROM app_users WHERE TRIM(office)<>'' UNION SELECT DISTINCT TRIM(division) FROM app_users WHERE TRIM(division)<>'' ORDER BY office")->fetchAll(PDO::FETCH_COLUMN);
respond(['items'=>$items,'pagination'=>['page'=>$page,'pageSize'=>$pageSize,'totalRecords'=>$total,'totalPages'=>$pages],'summary'=>array_map('intval',$counts),'taskCount'=>$taskCount,'offices'=>$offices,'leaveTypes'=>$leaveTypes,'statuses'=>$statuses]);
