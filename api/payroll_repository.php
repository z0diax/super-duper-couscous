<?php
declare(strict_types=1);
require_once __DIR__.'/payroll.php';

function payroll_read_caps(PDO $pdo,array $user): array {
    $q=$pdo->prepare("SELECT record_json FROM app_records WHERE collection='systemRoles' AND id=?");$q->execute([$user['role']]);
    $row=$q->fetchColumn();$state=['systemRoles'=>$row===false?[]:[json_decode($row,true,64,JSON_THROW_ON_ERROR)]];
    return ['all'=>can_view_all_operational_records($state,$user),'release'=>has_cap($state,$user,'canRelease')];
}
function payroll_desk_sql(string $prefix,array $user): array {
    return ["(($prefix".'_user_id=?'." ) OR (($prefix".'_user_id IS NULL OR '.$prefix."_user_id='') AND $prefix".'_role=?'.") OR (($prefix".'_user_id IS NULL OR '.$prefix."_user_id='') AND $prefix".'_team IN (?,?)))',
        [$user['id'],$user['role'],$user['division'],$user['office']]];
}
function payroll_full_batch_sql(array $user,array $caps): array {
    if($caps['all'])return ['1=1',[]];
    [$desk,$params]=payroll_desk_sql('b.initial',$user);
    return ["(b.encoded_by_user_id=? OR $desk)",[$user['id'],...$params]];
}
function payroll_item_sql(array $user,array $caps): array {
    if($caps['all'])return ['1=1',[]];
    [$full,$fullParams]=payroll_full_batch_sql($user,$caps);
    [$initial,$initialParams]=payroll_desk_sql('b.initial',$user);
    [$release,$releaseParams]=payroll_desk_sql('b.release',$user);
    $group="EXISTS (SELECT 1 FROM payroll_read_group_items gi JOIN payroll_read_groups g ON g.id=gi.group_id WHERE gi.item_id=i.id AND (g.processor_id=? OR (g.assigned_team<>'' AND g.assigned_team IN (?,?))))";
    $sql="($full OR (i.current_stage='initial_checking' AND $initial) OR (i.current_stage='release' AND $release) OR i.assigned_user_id=? OR $group";
    $params=[...$fullParams,...$initialParams,...$releaseParams,$user['id'],$user['id'],$user['division'],$user['office']];
    if($caps['release'])$sql.=" OR i.status IN ('Ready_For_Release','Released')";
    return [$sql.')',$params];
}
function payroll_batch_sql(array $user,array $caps): array {
    if($caps['all'])return ['1=1',[]];
    [$full,$fullParams]=payroll_full_batch_sql($user,$caps);
    [$item,$itemParams]=payroll_item_sql($user,$caps);
    return ["($full OR EXISTS (SELECT 1 FROM payroll_read_items i WHERE i.batch_id=b.id AND $item))",[...$fullParams,...$itemParams]];
}
function payroll_bind(PDOStatement $query,array $params): void {
    foreach(array_values($params) as $index=>$value)$query->bindValue($index+1,$value,is_int($value)?PDO::PARAM_INT:PDO::PARAM_STR);
}
function payroll_page(int $page,int $limit): array {
    if($page<1||$limit<1||$limit>100||($page-1)*$limit>2147483647)throw new InvalidArgumentException('Invalid page or limit.');
    return [$page,$limit,($page-1)*$limit];
}
function payroll_json_rows(PDO $pdo,string $collection,array $ids): array {
    if(!$ids)return [];
    $q=$pdo->prepare('SELECT id,record_json FROM app_records WHERE collection=? AND id IN ('.implode(',',array_fill(0,count($ids),'?')).')');
    payroll_bind($q,[$collection,...$ids]);$q->execute();
    $map=[];foreach($q as $row)$map[$row['id']]=json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR);
    if($collection==='payrollBatches'){
        $progress=$pdo->prepare('SELECT id,progress_json FROM payroll_read_batches WHERE id IN ('.implode(',',array_fill(0,count($ids),'?')).')');
        payroll_bind($progress,$ids);$progress->execute();
        foreach($progress as $row)if(isset($map[$row['id']])&&$row['progress_json']){
            $summary=json_decode($row['progress_json'],true,64,JSON_THROW_ON_ERROR);
            $map[$row['id']]['progress']=$summary;
            $map[$row['id']]['status']=$summary['derivedStatus'];
            $map[$row['id']]['currentStageName']=$summary['displayStatus'];
        }
    }
    return array_values(array_filter(array_map(fn($id)=>$map[$id]??null,$ids)));
}
function payroll_batch_list(PDO $pdo,array $user,array $filters,int $page=1,int $limit=10): array {
    [$page,$limit,$offset]=payroll_page($page,$limit);
    $caps=payroll_read_caps($pdo,$user);$where=[];$params=[];
    if(!empty($filters['owned'])) {if($user['role']!=='admin'){$where[]='b.encoded_by_user_id=?';$params[]=$user['id'];}}
    else {[$scope,$scopeParams]=payroll_batch_sql($user,$caps);$where[]=$scope;$params=array_merge($params,$scopeParams);}
    if(!empty($filters['office'])){$where[]='b.office=?';$params[]=$filters['office'];}
    if(!empty($filters['stage'])){
        $stage=$filters['stage'];
        $stageSql=match($stage){'initial_checking'=>'b.initial_active>0','verification_signing'=>'(b.management_active>0 OR b.management_on_hold>0)','release'=>'b.release_ready>0','completed'=>"b.derived_status='COMPLETED'",default=>throw new InvalidArgumentException('Invalid stage filter.')};
        $where[]=$stageSql;
    }
    $condition=$where?implode(' AND ',$where):'1=1';
    $count=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_batches b WHERE $condition");payroll_bind($count,$params);$count->execute();$total=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT b.id FROM payroll_read_batches b WHERE $condition ORDER BY b.date_encoded DESC,b.id DESC LIMIT ? OFFSET ?");payroll_bind($q,[...$params,$limit,$offset]);$q->execute();
    $batches=payroll_json_rows($pdo,'payrollBatches',$q->fetchAll(PDO::FETCH_COLUMN));
    foreach($batches as &$batch){
        $editable=$pdo->prepare("SELECT NOT EXISTS(SELECT 1 FROM payroll_read_items i WHERE i.batch_id=? AND i.current_stage<>'initial_checking') AND NOT EXISTS(SELECT 1 FROM payroll_read_groups g WHERE g.batch_id=?)");
        $editable->execute([$batch['id'],$batch['id']]);$batch['_canEdit']=$batch['encodedBy']['userId']===$user['id']&&(bool)$editable->fetchColumn();
        $batch['itemIds']=[];$batch['workGroupIds']=[];$batch['attachments']=[];$batch['workflowHistory']=[];
    }unset($batch);
    $owner=$user['role']==='admin'?'1=1':'b.encoded_by_user_id=?';$ownerParams=$user['role']==='admin'?[]:[$user['id']];
    $stats=$pdo->prepare("SELECT COALESCE(SUM(b.derived_status<>'COMPLETED'),0) active,COALESCE(SUM(b.initial_active>0),0) initial,COALESCE(SUM(b.derived_status='COMPLETED'),0) completed FROM payroll_read_batches b WHERE $owner");
    payroll_bind($stats,$ownerParams);$stats->execute();$metric=$stats->fetch();
    $groups=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_groups g JOIN payroll_read_batches b ON b.id=g.batch_id WHERE $owner AND g.status='In_Progress'");payroll_bind($groups,$ownerParams);$groups->execute();
    $offices=$pdo->prepare("SELECT DISTINCT b.office FROM payroll_read_batches b WHERE $owner ORDER BY b.office ASC");payroll_bind($offices,$ownerParams);$offices->execute();
    return ['items'=>$batches,'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit),
        'metrics'=>['active'=>(int)$metric['active'],'initial'=>(int)$metric['initial'],'completed'=>(int)$metric['completed'],'workGroups'=>(int)$groups->fetchColumn()],
        'offices'=>$offices->fetchAll(PDO::FETCH_COLUMN)];
}
function payroll_task_condition(array $user,array $caps): array {
    [$initial,$initialParams]=payroll_desk_sql('b.initial',$user);
    [$release,$releaseParams]=payroll_desk_sql('b.release',$user);
    $initialTask="(EXISTS (SELECT 1 FROM payroll_read_items i WHERE i.batch_id=b.id AND i.current_stage='initial_checking') AND $initial)";
    $groupTask="EXISTS (SELECT 1 FROM payroll_read_groups g WHERE g.batch_id=b.id AND g.status='In_Progress' AND (g.processor_id=? OR (g.assigned_team<>'' AND g.assigned_team IN (?,?))))";
    $releaseTask="(EXISTS (SELECT 1 FROM payroll_read_items i WHERE i.batch_id=b.id AND i.current_stage='release' AND i.status IN ('Ready_For_Release','On_Hold','Ready_For_Recheck')) AND $release)";
    [$scope,$scopeParams]=payroll_batch_sql($user,$caps);
    return ["b.derived_status<>'COMPLETED' AND ($initialTask OR $groupTask OR $releaseTask) AND $scope",
        [...$initialParams,$user['id'],$user['division'],$user['office'],...$releaseParams,...$scopeParams]];
}
function payroll_task_page(PDO $pdo,array $user,string $search='',int $page=1,int $limit=25): array {
    [$page,$limit,$offset]=payroll_page($page,$limit);$caps=payroll_read_caps($pdo,$user);
    [$task,$taskParams]=payroll_task_condition($user,$caps);
    $count=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_batches b WHERE $task");payroll_bind($count,$taskParams);$count->execute();$all=(int)$count->fetchColumn();
    $where=$task;$params=$taskParams;
    if($search!==''){$where.=' AND (LOWER(b.batch_number) LIKE ? ESCAPE \'!\' OR LOWER(b.payroll_type) LIKE ? ESCAPE \'!\' OR LOWER(b.office) LIKE ? ESCAPE \'!\')';$like='%'.str_replace(['!','%','_'],['!!','!%','!_'],mb_strtolower($search)).'%';$params=array_merge($params,[$like,$like,$like]);}
    $count=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_batches b WHERE $where");payroll_bind($count,$params);$count->execute();$total=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT b.id FROM payroll_read_batches b WHERE $where ORDER BY b.id ASC LIMIT ? OFFSET ?");payroll_bind($q,[...$params,$limit,$offset]);$q->execute();
    $batches=payroll_json_rows($pdo,'payrollBatches',$q->fetchAll(PDO::FETCH_COLUMN));
    foreach($batches as &$batch){
        $group=$pdo->prepare("SELECT g.id FROM payroll_read_groups g WHERE g.batch_id=? AND g.status='In_Progress' AND g.processor_id=? ORDER BY g.id ASC LIMIT 1");
        $group->execute([$batch['id'],$user['id']]);$groupId=$group->fetchColumn();
        $batch['_assignedGroup']=$groupId?payroll_json_rows($pdo,'workGroups',[$groupId])[0]:null;
        $batch['itemIds']=[];$batch['workGroupIds']=[];$batch['attachments']=[];$batch['workflowHistory']=[];
    }unset($batch);
    return ['items'=>$batches,'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit),'allTaskCount'=>$all];
}
function payroll_held_page(PDO $pdo,array $user,int $page=1,int $limit=25): array {
    [$page,$limit,$offset]=payroll_page($page,$limit);
    [$desk,$deskParams]=payroll_desk_sql('b.initial',$user);
    $where="i.batch_id<>'SINGLE_ENTRY' AND i.current_stage='initial_checking' AND (i.status IN ('On_Hold','Ready_For_Recheck') OR (i.status='Ready' AND i.hold_resolved_at IS NOT NULL AND i.hold_resolved_at<>'')) AND $desk";
    $from=' FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id';
    $count=$pdo->prepare("SELECT COUNT(*)$from WHERE $where");payroll_bind($count,$deskParams);$count->execute();$total=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT i.id$from WHERE $where ORDER BY i.id ASC LIMIT ? OFFSET ?");payroll_bind($q,[...$deskParams,$limit,$offset]);$q->execute();$items=payroll_json_rows($pdo,'payrollItems',$q->fetchAll(PDO::FETCH_COLUMN));
    $ids=array_values(array_unique(array_column($items,'batchId')));$batches=payroll_json_rows($pdo,'payrollBatches',$ids);
    foreach($batches as &$batch){$batch['itemIds']=[];$batch['workGroupIds']=[];$batch['attachments']=[];$batch['workflowHistory']=[];}unset($batch);
    return ['items'=>$items,'batches'=>$batches,'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit)];
}
function payroll_shell_summary(PDO $pdo,array $user): array {
    $caps=payroll_read_caps($pdo,$user);[$task,$params]=payroll_task_condition($user,$caps);
    $count=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_batches b WHERE $task");payroll_bind($count,$params);$count->execute();$taskCount=(int)$count->fetchColumn();
    $attention="b.derived_status<>'COMPLETED' AND ((b.encoded_by_user_id=? AND EXISTS (SELECT 1 FROM payroll_read_items h WHERE h.batch_id=b.id AND h.status='On_Hold')) OR ($task))";
    $q=$pdo->prepare("SELECT b.id FROM payroll_read_batches b WHERE $attention ORDER BY COALESCE(b.updated_at,b.date_encoded) DESC,b.id ASC LIMIT 25");
    payroll_bind($q,[$user['id'],...$params]);$q->execute();$batches=payroll_json_rows($pdo,'payrollBatches',$q->fetchAll(PDO::FETCH_COLUMN));
    $notifications=[];
    foreach($batches as $batch){
        $id=$batch['id'];$flags=$pdo->prepare("SELECT EXISTS(SELECT 1 FROM payroll_read_items WHERE batch_id=? AND status='On_Hold') held,EXISTS(SELECT 1 FROM payroll_read_items WHERE batch_id=? AND current_stage='initial_checking') initial_items,EXISTS(SELECT 1 FROM payroll_read_items WHERE batch_id=? AND current_stage='release' AND status IN ('Ready_For_Release','On_Hold','Ready_For_Recheck')) release_items");
        $flags->execute([$id,$id,$id]);$row=$flags->fetch();
        $needsCompliance=$batch['encodedBy']['userId']===$user['id']&&(bool)$row['held'];
        $initial=$batch['initialCheckingDesk']??$batch['assignedDesk']??[];
        $initialAssigned=(bool)$row['initial_items'] && payroll_desk_matches_user([], $user,$initial);
        $group=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_groups WHERE batch_id=? AND status='In_Progress' AND (processor_id=? OR (assigned_team<>'' AND assigned_team IN (?,?)))");
        $group->execute([$id,$user['id'],$user['division'],$user['office']]);$groupAssigned=(int)$group->fetchColumn()>0;
        $release=[];foreach($batch['workflowStages']??[] as $stage)if(($stage['stageNumber']??0)===4){$release=$stage['assignedTo']??[];break;}
        $releaseAssigned=(bool)$row['release_items'] && payroll_desk_matches_user([], $user,$release);
        if(!$needsCompliance&&!$initialAssigned&&!$groupAssigned&&!$releaseAssigned)continue;
        $title=$needsCompliance?'Payroll compliance required':($releaseAssigned?'Payroll ready for release':($groupAssigned?'Payroll work group assigned':'Payroll awaiting initial checking'));
        $status=$batch['progress']['displayStatus']??$batch['currentStageName']??'';
        $notifications[]=['id'=>'payroll-'.$id.'-'.($batch['progress']['derivedStatus']??$batch['status']??'').'-'.($batch['progress']['onHoldTotal']??0),
            'batchId'=>$id,'title'=>$title,'message'=>$batch['batchNumber'].' · '.$status,
            'timestamp'=>$batch['updatedAt']??$batch['dateEncoded'],'tone'=>$needsCompliance?'amber':($releaseAssigned?'violet':'blue')];
    }
    return ['sidebarPayrollTaskCount'=>$taskCount,'payrollNotifications'=>$notifications];
}
function payroll_batch_detail(PDO $pdo,array $user,string $id,int $itemPage=1,int $groupPage=1,int $limit=25): array {
    [$itemPage,$limit,$itemOffset]=payroll_page($itemPage,$limit);[$groupPage,,$groupOffset]=payroll_page($groupPage,$limit);
    $caps=payroll_read_caps($pdo,$user);[$scope,$params]=payroll_batch_sql($user,$caps);
    $q=$pdo->prepare("SELECT b.id FROM payroll_read_batches b WHERE b.id=? AND $scope");payroll_bind($q,[$id,...$params]);$q->execute();
    if(!$q->fetchColumn())throw new ApiError('Payroll batch was not found.',404);
    $batch=payroll_json_rows($pdo,'payrollBatches',[$id])[0];
    [$fullScope,$fullParams]=payroll_full_batch_sql($user,$caps);
    $full=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_batches b WHERE b.id=? AND $fullScope");payroll_bind($full,[$id,...$fullParams]);$full->execute();$isFull=(int)$full->fetchColumn()>0;
    [$itemScope,$itemParams]=payroll_item_sql($user,$caps);
    $itemWhere="i.batch_id=? AND $itemScope";$itemParams=[$id,...$itemParams];
    $count=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id WHERE $itemWhere");payroll_bind($count,$itemParams);$count->execute();$itemTotal=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT i.id FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id WHERE $itemWhere ORDER BY i.item_number ASC,i.id ASC LIMIT ? OFFSET ?");
    // item_number remains authoritative in JSON; IDs preserve its usual registration order.
    payroll_bind($q,[...$itemParams,$limit,$itemOffset]);$q->execute();$items=payroll_json_rows($pdo,'payrollItems',$q->fetchAll(PDO::FETCH_COLUMN));
    $groupMember="(g.processor_id=? OR (g.assigned_team<>'' AND g.assigned_team IN (?,?)))";
    $groupWhere=$isFull?'g.batch_id=?':"g.batch_id=? AND $groupMember";
    $groupParams=$isFull?[$id]:[$id,$user['id'],$user['division'],$user['office']];
    $count=$pdo->prepare("SELECT COUNT(*) FROM payroll_read_groups g WHERE $groupWhere");payroll_bind($count,$groupParams);$count->execute();$groupTotal=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT g.id FROM payroll_read_groups g WHERE $groupWhere ORDER BY g.id ASC LIMIT ? OFFSET ?");payroll_bind($q,[...$groupParams,$limit,$groupOffset]);$q->execute();$groups=payroll_json_rows($pdo,'workGroups',$q->fetchAll(PDO::FETCH_COLUMN));
    $aggregate=$pdo->prepare("SELECT
        COALESCE(SUM(i.employment_classification IN ('JOW/COS','Job Order (JOW)') AND i.status<>'On_Hold'),0) jow,
        COALESCE(SUM(i.employment_classification='Casual' AND i.status<>'On_Hold'),0) casual,
        COALESCE(SUM(i.employment_classification='Regular' AND i.status<>'On_Hold'),0) regular,
        COALESCE(SUM(i.status='On_Hold'),0) held,
        COALESCE(SUM(i.current_stage='initial_checking' AND i.status<>'On_Hold' AND i.verification_status='Passed' AND i.employment_classification IS NOT NULL AND i.employment_classification<>''),0) ready,
        COALESCE(SUM(i.current_stage='initial_checking' AND i.status<>'On_Hold' AND (i.verification_status IS NULL OR i.verification_status<>'Passed' OR i.employment_classification IS NULL OR i.employment_classification='')),0) unresolved,
        COALESCE(SUM(i.status='Ready_For_Release'),0) ready_release,
        COALESCE(SUM(i.status='Released'),0) released
        FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id WHERE $itemWhere");
    payroll_bind($aggregate,$itemParams);$aggregate->execute();$counts=array_map('intval',$aggregate->fetch(PDO::FETCH_ASSOC));
    if(!$isFull)$batch=scoped_payroll_batch([], $user,$batch,$items);
    $batch['itemIds']=array_column($items,'id');$batch['workGroupIds']=array_column($groups,'id');
    return ['batch'=>$batch,'items'=>$items,'workGroups'=>$groups,'itemCounts'=>$counts,'itemPagination'=>['page'=>$itemPage,'limit'=>$limit,'total'=>$itemTotal,'totalPages'=>(int)ceil($itemTotal/$limit)],'groupPagination'=>['page'=>$groupPage,'limit'=>$limit,'total'=>$groupTotal,'totalPages'=>(int)ceil($groupTotal/$limit)]];
}
function payroll_search(PDO $pdo,array $user,string $term): array {
    $query=trim($term);
    if($query===''||mb_strlen($query)>150||preg_match('/[\x00-\x1F\x7F]/u',$query))throw new InvalidArgumentException('Invalid search query.');
    $caps=payroll_read_caps($pdo,$user);
    [$batchScope,$batchParams]=payroll_batch_sql($user,$caps);
    [$itemScope,$itemParams]=payroll_item_sql($user,$caps);
    $q=$pdo->prepare("SELECT i.id,i.batch_id FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id WHERE i.barcode=? AND $itemScope ORDER BY i.id ASC LIMIT 1");
    payroll_bind($q,[$query,...$itemParams]);$q->execute();$exactItem=$q->fetch()?:null;
    $q=$pdo->prepare("SELECT b.id FROM payroll_read_batches b WHERE (b.batch_number=? OR b.batch_barcode=?".($exactItem?' OR b.id=?':'').") AND $batchScope ORDER BY b.id ASC LIMIT 1");
    payroll_bind($q,[$query,$query,...($exactItem?[$exactItem['batch_id']]:[]),...$batchParams]);$q->execute();$exactBatch=$q->fetchColumn()?:null;
    if($exactBatch){
        $batch=payroll_json_rows($pdo,'payrollBatches',[$exactBatch])[0];
        return ['exact'=>['batch'=>payroll_compact_batch($batch),'item'=>$exactItem?payroll_compact_item(payroll_json_rows($pdo,'payrollItems',[$exactItem['id']])[0]):null],
            'batches'=>[],'items'=>[],'total'=>1];
    }
    $pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],mb_strtolower($query)).'%';
    $batchFields=['b.batch_number','b.batch_barcode','b.office','b.payroll_type',
        "JSON_UNQUOTE(JSON_EXTRACT(r.record_json,'$.payrollPeriod'))","JSON_UNQUOTE(JSON_EXTRACT(r.record_json,'$.receivedFromLiaison'))",
        "JSON_UNQUOTE(JSON_EXTRACT(r.record_json,'$.remarks'))","JSON_UNQUOTE(JSON_EXTRACT(r.record_json,'$.encodedBy.userName'))"];
    $batchText='('.implode(' OR ',array_map(fn($field)=>"LOWER($field) LIKE ? ESCAPE '!'",$batchFields)).')';
    $batchWhere="$batchScope AND $batchText";$batchBind=[...$batchParams,...array_fill(0,count($batchFields),$pattern)];
    $from=" FROM payroll_read_batches b JOIN app_records r ON r.collection='payrollBatches' AND r.id=b.id";
    $count=$pdo->prepare("SELECT COUNT(*)$from WHERE $batchWhere");payroll_bind($count,$batchBind);$count->execute();$batchTotal=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT b.id$from WHERE $batchWhere ORDER BY b.batch_number ASC,b.id ASC LIMIT 100");payroll_bind($q,$batchBind);$q->execute();
    $batches=array_map('payroll_compact_batch',payroll_json_rows($pdo,'payrollBatches',$q->fetchAll(PDO::FETCH_COLUMN)));
    $itemFields=['i.barcode','i.title','i.office','i.classification_type','i.employment_classification'];
    $itemText='('.implode(' OR ',array_map(fn($field)=>"LOWER($field) LIKE ? ESCAPE '!'",$itemFields)).')';
    $itemWhere="$itemScope AND $itemText";$itemBind=[...$itemParams,...array_fill(0,count($itemFields),$pattern)];
    $from=' FROM payroll_read_items i JOIN payroll_read_batches b ON b.id=i.batch_id';
    $count=$pdo->prepare("SELECT COUNT(*)$from WHERE $itemWhere");payroll_bind($count,$itemBind);$count->execute();$itemTotal=(int)$count->fetchColumn();
    $q=$pdo->prepare("SELECT i.id$from WHERE $itemWhere ORDER BY i.barcode ASC,i.id ASC LIMIT 100");payroll_bind($q,$itemBind);$q->execute();
    $items=array_map('payroll_compact_item',payroll_json_rows($pdo,'payrollItems',$q->fetchAll(PDO::FETCH_COLUMN)));
    return ['exact'=>null,'batches'=>$batches,'items'=>$items,'total'=>$batchTotal+$itemTotal];
}
function payroll_compact_batch(array $batch): array {
    return ['id'=>$batch['id'],'batchNumber'=>$batch['batchNumber'],'batchBarcode'=>$batch['batchBarcode']??null,
        'payrollType'=>$batch['payrollType'],'office'=>$batch['office'],'totalItemsCount'=>$batch['totalItemsCount']??0,
        'status'=>$batch['progress']['displayStatus']??$batch['currentStageName']??''];
}
function payroll_compact_item(array $item): array {
    return ['id'=>$item['id'],'batchId'=>$item['batchId'],'batchNumber'=>$item['batchNumber']??'','barcode'=>$item['barcode'],'title'=>$item['title'],
        'office'=>$item['office']??'','classificationType'=>$item['classificationType']??'',
        'employmentClassification'=>$item['employmentClassification']??null,'status'=>$item['status']];
}
