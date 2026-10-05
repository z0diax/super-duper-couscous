<?php
declare(strict_types=1);
// Read-only normalized repository. app_records remains authoritative for writes.
require_once __DIR__.'/domain.php';

const DOCUMENT_LIST_COLUMNS='d.id,d.tracking_number,d.barcode,d.title,d.subject,d.source_office,d.sender_name,d.classification,d.document_type,d.employment_classification,d.priority,d.status,d.date_received,d.current_step_number,d.total_steps,d.current_location,d.workflow_template_id,d.encoded_by_user_id,d.is_legacy_v1,(SELECT s.name FROM document_workflow_steps s WHERE s.document_id=d.id AND s.step_number=d.current_step_number) AS current_step_name,(SELECT CASE WHEN s.assignment_source=\'dynamic\' THEN \'dynamic\' ELSE NULL END FROM document_workflow_steps s WHERE s.document_id=d.id AND s.step_number=d.current_step_number) AS routing_mode';

function document_repository_role_state(PDO $pdo,array $user): array {
    $q=$pdo->prepare("SELECT record_json FROM app_records WHERE collection='systemRoles' AND id=? LIMIT 1");
    $q->execute([$user['role']]); $json=$q->fetchColumn();
    return ['systemRoles'=>$json===false?[]:[json_decode($json,true,64,JSON_THROW_ON_ERROR)]];
}
function document_repository_capabilities(array $state,array $user): array {
    return ['all'=>can_view_all_operational_records($state,$user),'intake'=>has_cap($state,$user,'canIntake'),'release'=>has_cap($state,$user,'canRelease')];
}
function document_repository_bind(PDOStatement $statement,array $values): void {
    foreach (array_values($values) as $i=>$value) $statement->bindValue($i+1,$value,is_int($value)?PDO::PARAM_INT:PDO::PARAM_STR);
}
function document_repository_assignment_sql(string $alias,string $prefix): string {
    $type=$prefix==='assigned'?'assignment_type':$prefix.'_type';
    return "(($alias.{$prefix}_user_id IS NOT NULL AND $alias.{$prefix}_user_id<>'' AND $alias.{$prefix}_user_id=?)"
        ." OR (($alias.{$prefix}_user_id IS NULL OR $alias.{$prefix}_user_id='') AND $alias.$type='Role' AND $alias.{$prefix}_role=?)"
        ." OR (($alias.{$prefix}_user_id IS NULL OR $alias.{$prefix}_user_id='') AND $alias.$type='Team' AND $alias.{$prefix}_team<>'' AND $alias.{$prefix}_team IN (?,?)))";
}
function document_repository_assignment_params(array $user): array {
    return [$user['id'],$user['role'],$user['division'],$user['office']];
}
function document_repository_visibility(array $state,array $user): array {
    $caps=document_repository_capabilities($state,$user);
    if ($caps['all']) return ['1=1',[]];
    $assignment=document_repository_assignment_sql('v','assigned');
    $receiver=document_repository_assignment_sql('v','return_receiver');
    $sql="(d.encoded_by_user_id=? OR EXISTS (SELECT 1 FROM document_workflow_steps v WHERE v.document_id=d.id AND "
        ."(v.completed_by_user_id=? OR v.handoff_owner_user_id=? OR (v.step_number=d.current_step_number AND "
        ."($assignment OR (v.stage_type='EXTERNAL_HANDOFF_REVIEW' AND "
        ."((v.external_status='PENDING_HANDOFF' AND (v.handoff_owner_user_id=? OR ?=1)) OR "
        ."(v.external_status='OUTSIDE_HRMDO' AND ($receiver OR ?=1)))))))) "
        ."OR (d.status IN ('Ready_For_Release','Released') AND ?=1))";
    $params=[$user['id'],$user['id'],$user['id'],...document_repository_assignment_params($user),$user['id'],(int)$caps['intake'],...document_repository_assignment_params($user),(int)$caps['intake'],(int)$caps['release']];
    return [$sql,$params];
}
function document_repository_page(int $page=1,int $limit=25): array {
    if ($page<1) throw new InvalidArgumentException('Page must be at least 1.');
    if ($limit<1 || $limit>100) throw new InvalidArgumentException('Limit must be between 1 and 100.');
    $offset=($page-1)*$limit;
    if ($offset>2147483647) throw new InvalidArgumentException('Page is too large.');
    return [$page,$limit,$offset];
}
function document_repository_filters(array $filters): array {
    $allowed=['status','classification','documentType','priority','workflowTemplateId','assignedUserId','assignedRole','assignedTeam','dateFrom','dateTo','registry','isLegacyV1'];
    foreach ($filters as $key=>$value) if (!in_array($key,$allowed,true) || !is_string($value) || $value==='') throw new InvalidArgumentException("Invalid document filter: $key.");
    $columns=['status'=>'d.status','classification'=>'d.classification','documentType'=>'d.document_type','priority'=>'d.priority','workflowTemplateId'=>'d.workflow_template_id'];
    $clauses=[]; $params=[];
    foreach ($columns as $filter=>$column) if (isset($filters[$filter])) { $clauses[]="$column=?"; $params[]=$filters[$filter]; }
    if (isset($filters['registry'])) {
        if ($filters['registry']!=='1') throw new InvalidArgumentException('Invalid registry filter.');
        $clauses[]="d.classification<>'Payroll'";
    }
    if (isset($filters['isLegacyV1'])) {
        if (!in_array($filters['isLegacyV1'],['0','1'],true)) throw new InvalidArgumentException('Invalid dataset filter.');
        $clauses[]=$filters['isLegacyV1']==='0'?'(d.is_legacy_v1=0 OR d.is_legacy_v1 IS NULL)':'d.is_legacy_v1=1';
    }
    foreach (['assignedUserId'=>'assigned_user_id','assignedRole'=>'assigned_role','assignedTeam'=>'assigned_team'] as $filter=>$column) if (isset($filters[$filter])) {
        $clauses[]="EXISTS (SELECT 1 FROM document_workflow_steps f WHERE f.document_id=d.id AND f.step_number=d.current_step_number AND f.$column=?)";
        $params[]=$filters[$filter];
    }
    if (isset($filters['dateFrom'])) { $clauses[]='d.date_received>=?'; $params[]=$filters['dateFrom']; }
    if (isset($filters['dateTo'])) { $clauses[]='d.date_received<=?'; $params[]=$filters['dateTo']; }
    return [$clauses,$params];
}
function document_repository_list(PDO $pdo,array $user,array $filters=[],int $page=1,int $limit=25): array {
    [$page,$limit,$offset]=document_repository_page($page,$limit);
    $roleState=document_repository_role_state($pdo,$user);
    [$scope,$params]=document_repository_visibility($roleState,$user);
    [$filterClauses,$filterParams]=document_repository_filters($filters);
    $where=implode(' AND ',array_merge([$scope],$filterClauses));
    $params=array_merge($params,$filterParams);
    $count=$pdo->prepare("SELECT COUNT(*) FROM documents d WHERE $where"); document_repository_bind($count,$params); $count->execute();
    $total=(int)$count->fetchColumn();
    $order=isset($filters['registry'])?'d.id ASC':'d.date_received DESC,d.id DESC';
    $query=$pdo->prepare('SELECT '.DOCUMENT_LIST_COLUMNS." FROM documents d WHERE $where ORDER BY $order LIMIT ? OFFSET ?");
    document_repository_bind($query,[...$params,$limit,$offset]); $query->execute();
    $result=['items'=>$query->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit)];
    if (isset($filters['registry'])) $result['registryCounts']=document_repository_registry_counts($pdo,$user);
    return $result;
}
function document_repository_registry_counts(PDO $pdo,array $user): array {
    [$scope,$params]=document_repository_visibility(document_repository_role_state($pdo,$user),$user);
    $q=$pdo->prepare("SELECT COUNT(*) AS all_count,COALESCE(SUM(CASE WHEN d.is_legacy_v1=1 THEN 1 ELSE 0 END),0) AS historical_count,COALESCE(SUM(CASE WHEN d.is_legacy_v1=0 OR d.is_legacy_v1 IS NULL THEN 1 ELSE 0 END),0) AS active_count,COALESCE(SUM(CASE WHEN d.status='Awaiting_External_Return' THEN 1 ELSE 0 END),0) AS outside_count FROM documents d WHERE $scope AND d.classification<>'Payroll'");
    document_repository_bind($q,$params); $q->execute(); $row=$q->fetch();
    return ['all'=>(int)$row['all_count'],'v1'=>(int)$row['historical_count'],'v2'=>(int)$row['active_count'],'outside'=>(int)$row['outside_count']];
}
function document_repository_registry_export(PDO $pdo,array $user,array $filters): void {
    $roleState=document_repository_role_state($pdo,$user);
    [$scope,$params]=document_repository_visibility($roleState,$user);
    [$clauses,$filterParams]=document_repository_filters($filters);
    $where=implode(' AND ',array_merge([$scope],$clauses));
    $q=$pdo->prepare("SELECT d.tracking_number,d.title,d.classification,d.document_type,d.source_office,d.sender_name,d.priority,d.status,d.date_received,d.is_legacy_v1 FROM documents d WHERE $where ORDER BY d.id ASC");
    document_repository_bind($q,[...$params,...$filterParams]); $q->execute();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="HRMDO_DTS_'.gmdate('Y-m-d').'.csv"');
    $out=fopen('php://output','wb');
    fputcsv($out,['Tracking Number','Title','Classification','Document Type','Source Office','Sender','Priority','Status','Date Received','Dataset']);
    while ($row=$q->fetch()) {
        $values=[$row['tracking_number'],$row['title'],$row['classification'],$row['document_type'],$row['source_office'],$row['sender_name'],$row['priority'],$row['status'],$row['date_received'],((int)$row['is_legacy_v1'])===1?'Historical Archive':'Active Records'];
        fputcsv($out,array_map(fn($value)=>preg_match('/^[\\s]*[=+@-]|^[\\t\\r\\n]/u',(string)$value)?"'".$value:$value,$values));
    }
    fclose($out);
}
function document_repository_lookup(PDO $pdo,array $user,string $field,string $value): ?array {
    $columns=['id'=>'d.id','trackingNumber'=>'d.tracking_number','barcode'=>'d.barcode'];
    if (!isset($columns[$field])) throw new InvalidArgumentException('Unsupported document identifier.');
    $roleState=document_repository_role_state($pdo,$user);
    [$scope,$params]=document_repository_visibility($roleState,$user);
    $query=$pdo->prepare("SELECT d.source_json FROM documents d WHERE {$columns[$field]}=? AND $scope ORDER BY d.date_received DESC,d.id DESC");
    document_repository_bind($query,[$value,...$params]); $query->execute();
    while ($json=$query->fetchColumn()) {
        $document=json_decode($json,true,64,JSON_THROW_ON_ERROR);
        // Defense in depth: exact existing record-level policy on a targeted record.
        if (can_view_document($roleState,$user,$document)) return $document;
    }
    return null;
}
function document_repository_by_id(PDO $pdo,array $user,string $id): ?array { return document_repository_lookup($pdo,$user,'id',$id); }
function document_repository_by_tracking(PDO $pdo,array $user,string $tracking): ?array { return document_repository_lookup($pdo,$user,'trackingNumber',$tracking); }
function document_repository_by_barcode(PDO $pdo,array $user,string $barcode): ?array { return document_repository_lookup($pdo,$user,'barcode',$barcode); }

function document_repository_children(PDO $pdo,string $table,string $documentId): array {
    $orders=['document_workflow_steps'=>'step_number','document_custody_history'=>'position'];
    if (!isset($orders[$table])) throw new InvalidArgumentException('Unsupported document child table.');
    $order=$orders[$table];
    $q=$pdo->prepare("SELECT source_json FROM `$table` WHERE document_id=? ORDER BY $order");
    $q->execute([$documentId]);
    return array_map(fn($row)=>json_decode($row['source_json'],true,64,JSON_THROW_ON_ERROR),$q->fetchAll());
}
function document_repository_steps(PDO $pdo,array $user,string $documentId): ?array {
    if (document_repository_by_id($pdo,$user,$documentId)===null) return null;
    return document_repository_children($pdo,'document_workflow_steps',$documentId);
}
function document_repository_attachments(PDO $pdo,array $user,string $documentId): ?array {
    if (document_repository_by_id($pdo,$user,$documentId)===null) return null;
    $q=$pdo->prepare('SELECT attachment_kind,source_json FROM document_attachments WHERE document_id=? ORDER BY attachment_kind,position');
    $q->execute([$documentId]); $result=['normal'=>[],'compliance'=>[]];
    foreach ($q as $row) $result[$row['attachment_kind']][]=json_decode($row['source_json'],true,64,JSON_THROW_ON_ERROR);
    return $result;
}
function document_repository_custody(PDO $pdo,array $user,string $documentId): ?array {
    if (document_repository_by_id($pdo,$user,$documentId)===null) return null;
    return document_repository_children($pdo,'document_custody_history',$documentId);
}
function document_repository_detail(PDO $pdo,array $user,string $id): ?array {
    $document=document_repository_by_id($pdo,$user,$id);
    if ($document===null) return null;
    $document['workflowSteps']=document_repository_children($pdo,'document_workflow_steps',$id);
    $q=$pdo->prepare('SELECT attachment_kind,source_json FROM document_attachments WHERE document_id=? ORDER BY attachment_kind,position');
    $q->execute([$id]); $attachments=['normal'=>[],'compliance'=>[]];
    foreach ($q as $row) $attachments[$row['attachment_kind']][]=json_decode($row['source_json'],true,64,JSON_THROW_ON_ERROR);
    $document['attachments']=$attachments['normal'];
    if (array_key_exists('complianceAttachments',$document) || $attachments['compliance']) $document['complianceAttachments']=$attachments['compliance'];
    if (array_key_exists('custodyHistory',$document)) $document['custodyHistory']=document_repository_children($pdo,'document_custody_history',$id);
    return $document;
}
function document_repository_audit(PDO $pdo,string $documentId): array {
    // The caller has already authorized this document through document_repository_detail().
    $q=$pdo->prepare("SELECT record_json FROM app_audit WHERE JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.documentId'))=? ORDER BY sequence DESC");
    $q->execute([$documentId]);
    return array_map(fn($row)=>json_decode($row['record_json'],true,64,JSON_THROW_ON_ERROR),$q->fetchAll());
}
function document_repository_template(PDO $pdo,string $id,?int $version=null): ?array {
    $where=$version===null?'id=? AND is_current=1':'id=? AND version=?';
    $q=$pdo->prepare("SELECT source_json,version FROM workflow_templates WHERE $where LIMIT 1");
    document_repository_bind($q,$version===null?[$id]:[$id,$version]); $q->execute(); $row=$q->fetch();
    if (!$row) return null;
    $template=json_decode($row['source_json'],true,64,JSON_THROW_ON_ERROR);
    $steps=$pdo->prepare('SELECT source_json FROM workflow_template_steps WHERE template_id=? AND template_version=? ORDER BY step_number');
    $steps->execute([$id,$row['version']]);
    $template['steps']=array_map(fn($s)=>json_decode($s['source_json'],true,64,JSON_THROW_ON_ERROR),$steps->fetchAll());
    $types=$pdo->prepare('SELECT document_type FROM workflow_template_document_types WHERE template_id=? AND template_version=? ORDER BY position');
    $types->execute([$id,$row['version']]); $template['documentTypes']=$types->fetchAll(PDO::FETCH_COLUMN);
    return $template;
}
function document_repository_template_list(PDO $pdo,int $page=1,int $limit=25): array {
    [$page,$limit,$offset]=document_repository_page($page,$limit);
    $total=(int)$pdo->query('SELECT COUNT(*) FROM workflow_templates WHERE is_current=1')->fetchColumn();
    $q=$pdo->prepare('SELECT id,version,classification,document_type,employment_classification,title,is_active FROM workflow_templates WHERE is_current=1 ORDER BY title,id LIMIT ? OFFSET ?');
    document_repository_bind($q,[$limit,$offset]); $q->execute();
    return ['items'=>$q->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit)];
}
function document_repository_task_where(array $roleState,array $user): array {
    [$scope,$scopeParams]=document_repository_visibility($roleState,$user);
    $assigned=document_repository_assignment_sql('s','assigned');
    $receiver=document_repository_assignment_sql('s','return_receiver');
    $where="(d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1) AND d.status NOT IN ('Released','Archived','Disapproved') AND s.step_number=d.current_step_number AND $scope AND "
        ."((d.status='On_Hold' AND d.encoded_by_user_id=?) OR "
        ."((s.stage_type IS NULL OR s.stage_type<>'EXTERNAL_HANDOFF_REVIEW') AND $assigned) OR "
        ."(s.stage_type='EXTERNAL_HANDOFF_REVIEW' AND ((s.external_status='PENDING_HANDOFF' AND s.handoff_owner_user_id=?) OR "
        ."(s.external_status='OUTSIDE_HRMDO' AND $receiver))))";
    $params=[...$scopeParams,$user['id'],...document_repository_assignment_params($user),$user['id'],...document_repository_assignment_params($user)];
    return [$where,$params];
}
function document_repository_tasks(PDO $pdo,array $user,int $page=1,int $limit=25): array {
    [$page,$limit,$offset]=document_repository_page($page,$limit);
    $roleState=document_repository_role_state($pdo,$user);
    [$where,$params]=document_repository_task_where($roleState,$user);
    $from=' FROM documents d JOIN document_workflow_steps s ON s.document_id=d.id';
    $count=$pdo->prepare("SELECT COUNT(*)$from WHERE $where"); document_repository_bind($count,$params); $count->execute(); $total=(int)$count->fetchColumn();
    // Keep the list projection compact; the joined step supplies queue context only.
    $sql='SELECT '.DOCUMENT_LIST_COLUMNS.',s.name AS current_step_name,s.assignment_type,s.assigned_user_id,s.assigned_role,s.assigned_team,s.external_status'
        .$from." WHERE $where ORDER BY d.date_received DESC,d.id DESC LIMIT ? OFFSET ?";
    $q=$pdo->prepare($sql); document_repository_bind($q,[...$params,$limit,$offset]); $q->execute();
    return ['items'=>$q->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit)];
}
const DOCUMENT_TASK_QUEUES=['my_tasks','team_queue','returned','waiting','ready_for_release','completed'];
function document_repository_task_assignment(array $user,string $prefix,bool $includeTeam): array {
    $column=$prefix==='assigned'?'assignment_type':$prefix.'_type';
    $sql="((s.{$prefix}_user_id IS NOT NULL AND s.{$prefix}_user_id<>'' AND s.{$prefix}_user_id=?) OR ((s.{$prefix}_user_id IS NULL OR s.{$prefix}_user_id='') AND s.$column='Role' AND s.{$prefix}_role=?)";
    $params=[$user['id'],$user['role']];
    if ($includeTeam) { $sql.=" OR ((s.{$prefix}_user_id IS NULL OR s.{$prefix}_user_id='') AND s.$column='Team' AND s.{$prefix}_team<>'' AND s.{$prefix}_team IN (?,?))"; $params[]=$user['division']; $params[]=$user['office']; }
    return [$sql.')',$params];
}
function document_repository_task_actionable(array $user,bool $includeTeam): array {
    [$assigned,$assignedParams]=document_repository_task_assignment($user,'assigned',$includeTeam);
    [$receiver,$receiverParams]=document_repository_task_assignment($user,'return_receiver',$includeTeam);
    $sql="(((s.stage_type IS NULL OR s.stage_type<>'EXTERNAL_HANDOFF_REVIEW') AND $assigned) OR (s.stage_type='EXTERNAL_HANDOFF_REVIEW' AND ((s.external_status='PENDING_HANDOFF' AND s.handoff_owner_user_id=?) OR (s.external_status='OUTSIDE_HRMDO' AND $receiver))))";
    return [$sql,[...$assignedParams,$user['id'],...$receiverParams]];
}
function document_repository_task_queue_condition(string $queue,array $user): array {
    if (!in_array($queue,DOCUMENT_TASK_QUEUES,true)) throw new InvalidArgumentException('Invalid task queue.');
    [$actionable,$actionParams]=document_repository_task_actionable($user,false);
    [$actionableTeam,$teamParams]=document_repository_task_actionable($user,true);
    $active="d.status NOT IN ('Released','Archived','Disapproved')";
    return match($queue) {
        'my_tasks'=>["$active AND s.document_id IS NOT NULL AND ((d.status='On_Hold' AND d.encoded_by_user_id=?) OR $actionable)",[$user['id'],...$actionParams]],
        'team_queue'=>document_repository_team_queue_condition($user,$active),
        'returned'=>["d.status='Returned'",[]],
        'waiting'=>["$active AND ((d.encoded_by_user_id=?) OR EXISTS (SELECT 1 FROM document_workflow_steps prior WHERE prior.document_id=d.id AND prior.step_number<d.current_step_number AND prior.completed_by_user_id=?)) AND COALESCE($actionableTeam,0)=0",[$user['id'],$user['id'],...$teamParams]],
        'ready_for_release'=>["d.status='Ready_For_Release'",[]],
        'completed'=>["(d.status IN ('Released','Disapproved') OR (d.status='Archived' AND s.assignment_source='dynamic'))",[]],
    };
}
function document_repository_team_queue_condition(array $user,string $active): array {
    [$assigned,$assignedParams]=document_repository_task_assignment($user,'assigned',true);
    [$receiver,$receiverParams]=document_repository_task_assignment($user,'return_receiver',true);
    return ["$active AND s.document_id IS NOT NULL AND (((s.stage_type IS NULL OR s.stage_type<>'EXTERNAL_HANDOFF_REVIEW') AND s.assignment_type='Team' AND $assigned) OR (s.stage_type='EXTERNAL_HANDOFF_REVIEW' AND s.external_status='OUTSIDE_HRMDO' AND s.return_receiver_type='Team' AND $receiver))",[...$assignedParams,...$receiverParams]];
}
function document_repository_task_filter(array $filters): array {
    foreach ($filters as $key=>$value) if (!in_array($key,['classification','search'],true) || !is_string($value)) throw new InvalidArgumentException('Invalid task filter.');
    $sql=[]; $params=[];
    if (isset($filters['classification'])) {
        if (!in_array($filters['classification'],['Communication','Payroll','Request','Others'],true)) throw new InvalidArgumentException('Invalid classification.');
        $sql[]='d.classification=?'; $params[]=$filters['classification'];
    }
    if (isset($filters['search'])) {
        $search=$filters['search'];
        if (trim($search)==='' || mb_strlen($search)>150) throw new InvalidArgumentException('Invalid task search.');
        $pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],mb_strtolower($search)).'%';
        $sql[]="(LOWER(d.tracking_number) LIKE ? ESCAPE '!' OR LOWER(d.title) LIKE ? ESCAPE '!' OR LOWER(d.source_office) LIKE ? ESCAPE '!' OR LOWER(d.sender_name) LIKE ? ESCAPE '!')";
        $params=array_merge($params,[$pattern,$pattern,$pattern,$pattern]);
    }
    return [$sql,$params];
}
function document_repository_task_queue(PDO $pdo,array $user,string $queue,array $filters=[],int $page=1,int $limit=25): array {
    [$page,$limit,$offset]=document_repository_page($page,$limit);
    $roleState=document_repository_role_state($pdo,$user);
    [$scope,$scopeParams]=document_repository_visibility($roleState,$user);
    [$filterSql,$filterParams]=document_repository_task_filter($filters);
    $base="(d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1) AND $scope";
    $from=' FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number';
    $countExpressions=[]; $countParams=[]; $selectedWhere=''; $selectedParams=[];
    foreach (DOCUMENT_TASK_QUEUES as $name) {
        [$condition,$conditionParams]=document_repository_task_queue_condition($name,$user);
        $countWhere="$base AND $condition";
        $countExpressions[]="COALESCE(SUM(CASE WHEN ($condition) THEN 1 ELSE 0 END),0) AS `$name`";
        array_push($countParams,...$conditionParams);
        if ($name===$queue) {
            $selectedWhere=implode(' AND ',array_merge([$countWhere],$filterSql));
            $selectedParams=[...$scopeParams,...$conditionParams,...$filterParams];
        }
    }
    if ($selectedWhere==='') throw new InvalidArgumentException('Invalid task queue.');
    $q=$pdo->prepare('SELECT '.implode(',',$countExpressions).$from." WHERE $base");
    document_repository_bind($q,[...$countParams,...$scopeParams]); $q->execute();
    $counts=array_map('intval',$q->fetch(PDO::FETCH_ASSOC));
    if ($filterSql) {
        $q=$pdo->prepare("SELECT COUNT(*)$from WHERE $selectedWhere"); document_repository_bind($q,$selectedParams); $q->execute();
        $total=(int)$q->fetchColumn();
    } else $total=$counts[$queue];
    $q=$pdo->prepare('SELECT '.DOCUMENT_LIST_COLUMNS.',s.assigned_display_name,s.assignment_type,s.assigned_user_id,s.assigned_role,s.assigned_team,s.external_status'.$from." WHERE $selectedWhere ORDER BY d.id ASC LIMIT ? OFFSET ?");
    document_repository_bind($q,[...$selectedParams,$limit,$offset]); $q->execute();
    return ['items'=>$q->fetchAll(),'page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit),'queueCounts'=>$counts];
}

const DOCUMENT_SHELL_SEARCH_COLUMNS='d.id,d.tracking_number,d.title,d.classification,d.document_type,d.source_office,d.status,d.current_location';
function document_repository_shell_search(PDO $pdo,array $user,string $term): array {
    $query=trim($term);
    if ($query==='' || mb_strlen($query)>150 || preg_match('/[\x00-\x1F\x7F]/u',$query)) throw new InvalidArgumentException('Invalid search query.');
    $roleState=document_repository_role_state($pdo,$user);
    [$scope,$scopeParams]=document_repository_visibility($roleState,$user);
    // The source array is ID ordered: one exact document precedes any Payroll exact match.
    // Three indexed candidate branches preserve this ordering without loading documents.
    $candidate='(SELECT id FROM documents WHERE tracking_number=? UNION ALL SELECT id FROM documents WHERE barcode=? UNION ALL SELECT id FROM documents WHERE legacy_id=?) hits';
    $exact=$pdo->prepare('SELECT '.DOCUMENT_SHELL_SEARCH_COLUMNS.' FROM documents d JOIN '.$candidate." ON hits.id=d.id WHERE $scope ORDER BY d.id ASC LIMIT 1");
    document_repository_bind($exact,[$query,$query,$query,...$scopeParams]); $exact->execute();
    $row=$exact->fetch();
    if ($row) return ['exact'=>$row,'items'=>[],'total'=>1];
    $pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],mb_strtolower($query)).'%';
    $fields=['tracking_number','barcode','legacy_id','title','subject','source_office','sender_name','classification','document_type'];
    $terms=array_map(fn($field)=>"LOWER(d.$field) LIKE ? ESCAPE '!'",$fields);
    $where="$scope AND (".implode(' OR ',$terms).')';
    $params=[...$scopeParams,...array_fill(0,count($fields),$pattern)];
    $count=$pdo->prepare("SELECT COUNT(*) FROM documents d WHERE $where"); document_repository_bind($count,$params); $count->execute();
    $total=(int)$count->fetchColumn();
    $list=$pdo->prepare('SELECT '.DOCUMENT_SHELL_SEARCH_COLUMNS." FROM documents d WHERE $where ORDER BY d.tracking_number ASC,d.id ASC LIMIT 100");
    document_repository_bind($list,$params); $list->execute();
    return ['exact'=>null,'items'=>$list->fetchAll(),'total'=>$total];
}

function document_repository_shell_summary(PDO $pdo,array $user): array {
    [$actionable,$actionParams]=document_repository_task_actionable($user,true);
    $active="d.status NOT IN ('Released','Archived','Disapproved')";
    $attention="(($active AND d.status='On_Hold' AND d.encoded_by_user_id=?) OR ($active AND $actionable))";
    // Both branches imply can_view_document: the encoder owns a held document,
    // and the current assignment/handoff owner/return receiver is visible.
    // Applying the broader visibility EXISTS again caused a correlated lookup
    // for every candidate row without changing the authorized result set.
    $params=[$user['id'],...$actionParams];
    $from=' FROM documents d LEFT JOIN document_workflow_steps s ON s.document_id=d.id AND s.step_number=d.current_step_number';
    $count=$pdo->prepare("SELECT COUNT(*)$from WHERE $attention"); document_repository_bind($count,$params); $count->execute();
    $sidebarCount=(int)$count->fetchColumn();
    $timestamp="COALESCE(NULLIF(d.held_at,''),NULLIF(s.started_at,''),d.date_encoded)";
    $list=$pdo->prepare("SELECT d.id,d.tracking_number,d.title,d.status,d.current_step_number,d.current_location,d.encoded_by_user_id,d.hold_reason,d.held_at,d.date_encoded,s.name AS step_name,s.started_at AS step_started_at,$timestamp AS notification_timestamp".$from." WHERE $attention AND (d.is_legacy_v1 IS NULL OR d.is_legacy_v1<>1) ORDER BY notification_timestamp DESC,d.id ASC LIMIT 25");
    document_repository_bind($list,$params); $list->execute();
    $notifications=[];
    foreach ($list->fetchAll() as $row) {
        $needsCompliance=$row['status']==='On_Hold' && $row['encoded_by_user_id']===$user['id'];
        $notifications[]=['id'=>'document-'.$row['id'].'-'.$row['status'].'-'.$row['current_step_number'],
            'documentId'=>$row['id'],'trackingNumber'=>$row['tracking_number'],'status'=>$row['status'],'currentLocation'=>$row['current_location'],
            'title'=>$needsCompliance?'Document needs compliance':'Document assigned to you',
            'message'=>$row['tracking_number'].' · '.($needsCompliance?($row['hold_reason']?:'Submit the requested compliance'):($row['step_name']?:$row['title'])),
            'timestamp'=>$row['notification_timestamp']?:$row['date_encoded'],'tone'=>$needsCompliance?'amber':'blue'];
    }
    return ['sidebarDocumentTaskCount'=>$sidebarCount,'documentNotifications'=>$notifications];
}
