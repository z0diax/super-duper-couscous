<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
fail_unless(($_SERVER['REQUEST_METHOD']??'')==='GET','Method not allowed.',405);
$pdo=database();$user=authenticated_user($pdo);
fail_unless(getenv('HRMDO_LEAVE_EWP_TARGETED_READS_ENABLED')==='1','Targeted Leave/EWP reads are disabled.',503);
fail_unless(count($_GET)===1&&isset($_GET['id'])&&is_string($_GET['id'])&&preg_match('/^[A-Za-z0-9_-]{1,190}$/',$_GET['id']),'Invalid Leave ID.',400);
$modules=$user['sidebarModules']??null;
$role=$pdo->prepare("SELECT record_json FROM app_records WHERE collection='systemRoles' AND id=?");$role->execute([$user['role']]);$rawRole=$role->fetchColumn();$roleState=['systemRoles'=>$rawRole===false?[]:[json_decode($rawRole,true,64,JSON_THROW_ON_ERROR)]];
fail_unless($user['role']==='admin'||has_cap($roleState,$user,'canAdmin')||$modules===null||in_array('leave',$modules,true),'Leave record unavailable.',403);
$query=$pdo->prepare("SELECT record_json FROM app_records WHERE collection='leaveApplications' AND id=?");$query->execute([$_GET['id']]);$raw=$query->fetchColumn();
fail_unless($raw!==false,'Leave record was not found.',404);
$record=json_decode($raw,true,64,JSON_THROW_ON_ERROR);
fail_unless(empty($record['isLegacyV1']),'Leave record was not found.',404);
respond(['record'=>$record]);
