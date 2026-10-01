<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
fail_unless(($_SERVER['REQUEST_METHOD']??'')==='GET','Method not allowed.',405);
fail_unless(!$_GET,'Invalid query parameter.',400);
$pdo=database();$user=authenticated_user($pdo);
$collections=['assigneeDesignations','systemRoles','classifications','workflowTemplates','employmentRoutingRules'];
$data=array_fill_keys($collections,[]);
$pdo->beginTransaction();
try {
    $configRevision=(int)$pdo->query('SELECT config_revision FROM app_meta WHERE id=1')->fetchColumn();
    $marks=implode(',',array_fill(0,count($collections),'?'));
    $rows=$pdo->prepare("SELECT collection,record_json FROM app_records WHERE collection IN ($marks) ORDER BY id");$rows->execute($collections);
    foreach($rows as $row)$data[$row['collection']][]=json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR);
    $data['users']=array_map('public_user',$pdo->query('SELECT * FROM app_users ORDER BY name')->fetchAll());
    $pdo->commit();
}catch(Throwable $e){$pdo->rollBack();throw $e;}
respond(['configRevision'=>$configRevision,'data'=>$data,'user'=>$user]);
