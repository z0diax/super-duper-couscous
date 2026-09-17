<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';

$pdo=database();
$user=authenticated_user($pdo);
$state=load_state($pdo);
require_cap($state,$user,'canAdmin');
fail_unless($_SERVER['REQUEST_METHOD']==='GET','Use GET to query the historical archive.',405);

$archiveDatabase=(string)app_config()['archive_database'];
fail_unless((bool)preg_match('/^[a-zA-Z0-9_]+$/',$archiveDatabase),'Invalid archive database configuration.',500);
$tables=[
    'document'=>[
        'columns'=>'id,barcode,title,office,classification,status,action_taken,remarks,timestamp,accepted_timestamp,released_timestamp,forwarded_timestamp',
        'search'=>['barcode','title','office','classification','status','action_taken','remarks'],
        'sort'=>'timestamp DESC, id DESC',
    ],
    'ewp_records'=>[
        'columns'=>'id,barcode,employee_name,office,amount,purpose,remarks,status,created_timestamp',
        'search'=>['barcode','employee_name','office','purpose','remarks','status'],
        'sort'=>'created_timestamp DESC, id DESC',
    ],
    'leave_requests'=>[
        'columns'=>'id,barcode,employee_name,office,start_date,end_date,status,remarks,type,subtype,subtype_detail,created_timestamp,released_timestamp',
        'search'=>['barcode','employee_name','office','status','remarks','type','subtype','subtype_detail'],
        'sort'=>'created_timestamp DESC, id DESC',
    ],
];
$table=(string)($_GET['table']??'document');
fail_unless(isset($tables[$table]),'Invalid archive dataset.');
$page=max(1,filter_var($_GET['page']??1,FILTER_VALIDATE_INT)?:1);
$pageSize=filter_var($_GET['pageSize']??25,FILTER_VALIDATE_INT)?:25;
fail_unless(in_array($pageSize,[10,25,50],true),'Page size must be 10, 25, or 50.');
$q=mb_strtolower(trim((string)($_GET['q']??'')));
fail_unless(mb_strlen($q)<=190,'Search must be at most 190 characters.');

$schemaCheck=$pdo->prepare('SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?');
$schemaCheck->execute([$archiveDatabase]);
fail_unless((int)$schemaCheck->fetchColumn()===1,'The configured historical archive database is unavailable.',503);

$counts=[];
$tableCheck=$pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=? AND table_name=?');
foreach (array_keys($tables) as $sourceTable) {
    $tableCheck->execute([$archiveDatabase,$sourceTable]);
    fail_unless((int)$tableCheck->fetchColumn()===1,"Archive table $sourceTable is unavailable.",503);
    $counts[$sourceTable]=(int)$pdo->query("SELECT COUNT(*) FROM `$archiveDatabase`.`$sourceTable`")->fetchColumn();
}

$definition=$tables[$table];
$where=''; $params=[];
if ($q!=='') {
    $haystack="LOWER(CONCAT_WS(' ',".implode(',',array_map(fn($column)=>"COALESCE(`$column`,'')",$definition['search'])).'))';
    foreach (preg_split('/\s+/u',$q,-1,PREG_SPLIT_NO_EMPTY) as $word) {
        $where.=" AND $haystack LIKE ?";
        $params[]='%'.$word.'%';
    }
}
$qualified="`$archiveDatabase`.`$table`";
$count=$pdo->prepare("SELECT COUNT(*) FROM $qualified WHERE 1=1$where");
$count->execute($params);
$total=(int)$count->fetchColumn();
$totalPages=max(1,(int)ceil($total/$pageSize));
$page=min($page,$totalPages);
$offset=($page-1)*$pageSize;
$list=$pdo->prepare("SELECT {$definition['columns']} FROM $qualified WHERE 1=1$where ORDER BY {$definition['sort']} LIMIT $pageSize OFFSET $offset");
$list->execute($params);

respond([
    'items'=>$list->fetchAll(),
    'counts'=>$counts,
    'pagination'=>['page'=>$page,'pageSize'=>$pageSize,'totalRecords'=>$total,'totalPages'=>$totalPages],
]);
