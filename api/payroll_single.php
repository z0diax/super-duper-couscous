<?php
declare(strict_types=1);
require_once __DIR__.'/payroll_read_http.php';
[$pdo,$user]=payroll_read_context();$params=payroll_read_params(['office','stage','page','limit']);
try {
    [$page,$limit,$offset]=payroll_page(payroll_read_int($params,'page',1),payroll_read_int($params,'limit',10));
    $where=["d.classification='Payroll'"];$bind=[];
    if($user['role']!=='admin'){$where[]='d.encoded_by_user_id=?';$bind[]=$user['id'];}
    if(isset($params['office'])){$where[]='d.source_office=?';$bind[]=$params['office'];}
    if(isset($params['stage'])){
        $where[]=match($params['stage']){
            'initial_checking'=>"d.status NOT IN ('Archived','Released') AND d.current_step_number<=2",
            'verification_signing'=>"d.status NOT IN ('Archived','Released','Ready_For_Release') AND d.current_step_number>=3",
            'release'=>"d.status='Ready_For_Release'",
            'completed'=>"d.status IN ('Archived','Released')",
            default=>throw new InvalidArgumentException('Invalid stage filter.')};
    }
    $condition=implode(' AND ',$where);
    $count=$pdo->prepare("SELECT COUNT(*) FROM documents d WHERE $condition");payroll_bind($count,$bind);$count->execute();$total=(int)$count->fetchColumn();
    $owner=$user['role']==='admin'?'1=1':'d.encoded_by_user_id=?';
    $ownerBind=$user['role']==='admin'?[]:[$user['id']];
    $stats=$pdo->prepare("SELECT COUNT(*) total,
        COALESCE(SUM(d.status IN ('On_Hold','Ready_For_Recheck')),0) hold,
        COALESCE(SUM(d.status NOT IN ('Archived','Released') AND d.current_step_number<=2),0) initial,
        COALESCE(SUM(d.status IN ('Archived','Released')),0) released
        FROM documents d WHERE d.classification='Payroll' AND $owner");
    payroll_bind($stats,$ownerBind);$stats->execute();$metrics=$stats->fetch();
    $q=$pdo->prepare("SELECT d.id FROM documents d WHERE $condition ORDER BY d.date_encoded DESC,d.id DESC LIMIT ? OFFSET ?");payroll_bind($q,[...$bind,$limit,$offset]);$q->execute();
    $data=payroll_json_rows($pdo,'documents',$q->fetchAll(PDO::FETCH_COLUMN));
    respond(['data'=>$data,'pagination'=>['page'=>$page,'limit'=>$limit,'total'=>$total,'totalPages'=>(int)ceil($total/$limit)],
        'metrics'=>['total'=>(int)$metrics['total'],'hold'=>(int)$metrics['hold'],'initial'=>(int)$metrics['initial'],'released'=>(int)$metrics['released']]]);
}catch(InvalidArgumentException $e){throw new ApiError($e->getMessage(),400);}
