<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
function management_action(PDO $pdo,array &$s,array $u,string $action,array $args): mixed {
    require_cap($s,$u,'canAdmin'); $d=$args[0]??[];
    if (in_array($action,['addUser','updateUser','deleteUser'],true)) {
        if ($action==='deleteUser') {
            $id=(string)$d; fail_unless($id!==$u['id'],'You cannot delete your own account.');
            index_of($s['users'],$id);
            foreach (['workflowTemplates','documents','employmentRoutingRules','payrollBatches','workGroups'] as $key) {
                foreach ($s[$key] as $record) fail_unless(!str_contains(json_encode($record),json_encode($id)),'This officer is referenced by documents or routing configuration. Reassign references first.');
            }
            $pdo->prepare('DELETE FROM app_users WHERE id=?')->execute([$id]); return true;
        }
        $d['email']=strtolower(required($d,'email')); fail_unless((bool)filter_var($d['email'],FILTER_VALIDATE_EMAIL),'Enter a valid email address.');
        foreach (['name'=>160,'role'=>64,'roleTitle'=>160,'office'=>190,'division'=>190,'position'=>190] as $key=>$max) $d[$key]=required($d,$key,$max);
        index_of($s['systemRoles'],$d['role']); $id=$action==='addUser'?uid('user'):required($d,'id',64);
        $q=$pdo->prepare('SELECT * FROM app_users WHERE id=?'); $q->execute([$id]); $old=$q->fetch();
        if ($action==='updateUser') {
            fail_unless((bool)$old,'User does not exist.',404);
            fail_unless($id!==$u['id'] || $d['role']===$u['role'],'Use another administrator to change your own role.');
        }
        $password=$d['password']??'';
        fail_unless(is_string($password),'Invalid password.');
        fail_unless(($action==='updateUser' && $password==='') || (mb_strlen($password)>=3 && strlen($password)<=72),'Use a password with at least 3 characters and at most 72 bytes.');
        $hash=$password!==''?password_hash($password,PASSWORD_DEFAULT):$old['password_hash'];
        $initials=mb_substr(implode('',array_map(fn($word)=>mb_substr($word,0,1),preg_split('/\s+/',$d['name']))),0,3);
        $q=$pdo->prepare('SELECT id FROM app_users WHERE email=? AND id<>?'); $q->execute([$d['email'],$id]); fail_unless(!$q->fetch(),'An account already uses this email.',409);
        $allowedModules=['dashboard','queues','payroll','registry','leave']; $modules=$d['sidebarModules']??null;
        if ($modules===null && $action==='updateUser' && !empty($old['sidebar_modules'])) $modules=json_decode($old['sidebar_modules'],true);
        if ($modules===null) $modules=$allowedModules;
        fail_unless(is_array($modules),'Invalid sidebar module selection.'); $modules=array_values(array_unique(array_filter($modules,fn($module)=>is_string($module) && in_array($module,$allowedModules,true))));
        fail_unless(count($modules)>0,'Select at least one sidebar module.'); if ($d['role']==='admin') $modules=$allowedModules;
        $d['sidebarModules']=$modules; $modulesJson=json_encode($modules,JSON_THROW_ON_ERROR);
        $pdo->prepare('INSERT INTO app_users (id,email,password_hash,name,role,role_title,office,division,position,avatar_initials,sidebar_modules) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE email=VALUES(email),password_hash=VALUES(password_hash),name=VALUES(name),role=VALUES(role),role_title=VALUES(role_title),office=VALUES(office),division=VALUES(division),position=VALUES(position),avatar_initials=VALUES(avatar_initials),sidebar_modules=VALUES(sidebar_modules)')->execute([$id,$d['email'],$hash,$d['name'],$d['role'],$d['roleTitle'],$d['office'],$d['division'],$d['position'],$initials,$modulesJson]);
        unset($d['password']); return array_merge($d,['id'=>$id,'avatarInitials'=>$initials]);
    }
    if ($action==='changePassword') throw new ApiError('Unsupported management action.');
    if (in_array($action,['addClassificationType','updateClassificationType','toggleClassificationType','deleteClassificationType'],true)) {
        $i=index_of($s['classifications'],(string)$d); $category=&$s['classifications'][$i];
        if ($action==='toggleClassificationType') { $j=index_of($category['types'],(string)$args[1]); $category['types'][$j]['isActive']=!$category['types'][$j]['isActive']; return $category; }
        if ($action==='deleteClassificationType') {
            $j=index_of($category['types'],(string)$args[1]); $type=$category['types'][$j]; $typeName=$type['name'];
            $matchingWorkflow=function(array $workflow) use ($category,$typeName): bool {
                if (($workflow['classification']??null)!==$category['classification']) return false;
                foreach ($workflow['documentTypes']??[$workflow['documentType']??''] as $workflowType) if (strcasecmp((string)$workflowType,$typeName)===0) return true;
                return false;
            };
            $workflows=count(array_filter($s['workflowTemplates'], $matchingWorkflow));
            $documents=count(array_filter($s['documents'],fn($document)=>($document['classification']??null)===$category['classification'] && strcasecmp((string)($document['documentType']??''),$typeName)===0));
            $batches=$category['classification']==='Payroll' ? count(array_filter($s['payrollBatches'],fn($batch)=>strcasecmp((string)($batch['payrollType']??''),$typeName)===0)) : 0;
            $items=$category['classification']==='Payroll' ? count(array_filter($s['payrollItems'],fn($item)=>strcasecmp((string)($item['classificationType']??''),$typeName)===0)) : 0;
            $dependencies=[];
            if ($workflows) $dependencies[]=$workflows.' workflow template'.($workflows===1?'':'s');
            if ($documents) $dependencies[]=$documents.' document record'.($documents===1?'':'s');
            if ($batches) $dependencies[]=$batches.' payroll batch'.($batches===1?'':'es');
            if ($items) $dependencies[]=$items.' payroll item'.($items===1?'':'s');
            fail_unless(!$dependencies,'This document type is used by '.implode(', ',$dependencies).'. Disable it instead to preserve those records.');
            array_splice($category['types'],$j,1); return true;
        }
        $type=$args[1]; $type['name']=required($type,'name'); $type['defaultSlaHours']=positive($type['defaultSlaHours']??0,'SLA hours');
        foreach ($category['types'] as $t) fail_unless(strcasecmp($t['name'],$type['name'])!==0 || ($type['id']??null)===$t['id'],'This document type already exists.',409);
        if ($action==='addClassificationType') { $type=array_merge($type,['id'=>uid('type'),'isActive'=>true,'hasSpecificWorkflow'=>false]); $category['types'][]=$type; }
        else {
            $j=index_of($category['types'],required($type,'id')); $oldName=$category['types'][$j]['name'];
            $category['types'][$j]=array_merge($category['types'][$j],$type);
            if ($oldName!==$type['name']) foreach ($s['workflowTemplates'] as &$workflow) {
                if ($workflow['classification']!==$category['classification']) continue;
                $workflowTypes=$workflow['documentTypes']??[$workflow['documentType']];
                $renamed=false;
                foreach ($workflowTypes as &$workflowType) if (strcasecmp($workflowType,$oldName)===0) { $workflowType=$type['name']; $renamed=true; }
                unset($workflowType);
                if ($renamed) { $workflow['documentTypes']=$workflowTypes; $workflow['documentType']=$workflowTypes[0]; $workflow['version']++; }
            } unset($workflow);
        }
        return $type;
    }
    if (in_array($action,['createWorkflowTemplate','updateWorkflowTemplate','deleteWorkflowTemplate'],true)) {
        if ($action==='deleteWorkflowTemplate') {
            $i=index_of($s['workflowTemplates'],(string)$d);
            fail_unless(count(array_filter($s['documents'],fn($doc)=>$doc['workflowTemplateId']===$d))===0,'This workflow is used by documents. Deactivate it to preserve history.');
            array_splice($s['workflowTemplates'],$i,1); return true;
        }
        $d=validated_workflow($s,$d);
        if ($d['isActive']) foreach ($s['workflowTemplates'] as $other) {
            $otherTypes=array_map('strtolower',$other['documentTypes']??[$other['documentType']]);
            $newTypes=array_map('strtolower',$d['documentTypes']);
            $overlap=(bool)array_intersect($otherTypes,$newTypes) || in_array('all',$otherTypes,true) || in_array('all',$newTypes,true);
            fail_unless(empty($other['isActive']) || ($other['id']??null)===($d['id']??null) || $other['classification']!==$d['classification'] || !$overlap || ($other['employmentClassification']??'All')!==($d['employmentClassification']??'All'),'An active workflow already covers one or more selected document types for this employment classification. Deactivate it first.',409);
        }
        if ($action==='createWorkflowTemplate') { $d['id']=uid('workflow'); $d['version']=1; $s['workflowTemplates'][]=$d; }
        else { $i=index_of($s['workflowTemplates'],required($d,'id')); $d['version']=$s['workflowTemplates'][$i]['version']+1; $s['workflowTemplates'][$i]=$d; }
        return $d;
    }
    if ($action==='updateEmploymentRoutingRule') {
        $i=index_of($s['employmentRoutingRules'],required($d,'id')); $mode=choice($d['assignmentMode']??'fixed',['fixed','pool','team'],'assignment mode');
        $d['classification']=$s['employmentRoutingRules'][$i]['classification']; $d['assignmentMode']=$mode;
        if ($mode==='fixed') {
            $target=$s['users'][index_of($s['users'],required($d,'primaryProcessorId'))]; $d['primaryProcessorName']=$target['name']; $d['primaryProcessorRoleTitle']=$target['roleTitle']; $d['eligibleProcessorIds']=[]; $d['assignedTeam']='';
        } elseif ($mode==='pool') {
            $ids=array_values(array_unique(array_filter($d['eligibleProcessorIds']??[],fn($id)=>is_string($id) && $id!==''))); fail_unless(count($ids)>0,'Choose at least one eligible processor.');
            foreach ($ids as $id) index_of($s['users'],$id); $d['eligibleProcessorIds']=$ids; $d['primaryProcessorId']=''; $d['primaryProcessorName']=count($ids).' eligible personnel'; $d['primaryProcessorRoleTitle']='Personnel pool'; $d['assignedTeam']='';
        } else {
            $d['assignedTeam']=required($d,'assignedTeam',190); $d['primaryProcessorId']=''; $d['primaryProcessorName']=$d['assignedTeam']; $d['primaryProcessorRoleTitle']='Team queue'; $d['eligibleProcessorIds']=[];
        }
        $d['defaultSlaHours']=positive($d['defaultSlaHours']??0,'SLA hours'); $d['updatedAt']=now(); $s['employmentRoutingRules'][$i]=$d; return $d;
    }
    $map=['AssigneeDesignation'=>'assigneeDesignations','SystemRole'=>'systemRoles'];
    foreach ($map as $suffix=>$key) {
        if ($action==='reset'.$suffix.'s') {
            foreach (defaults()[$key] as $item) if (!in_array($item['id'],array_column($s[$key],'id'),true)) $s[$key][]=$item;
            if ($key==='systemRoles') {
                foreach (defaults()['assigneeDesignations'] as $item) {
                    if (!in_array($item['id'],array_column($s['assigneeDesignations'],'id'),true)) $s['assigneeDesignations'][]=$item;
                }
            }
            return true;
        }
        if (!in_array($action,['add'.$suffix,'update'.$suffix,'delete'.$suffix],true)) continue;
        if ($action==='delete'.$suffix) {
            $i=index_of($s[$key],(string)$d); $old=$s[$key][$i];
            if ($key==='systemRoles') {
                fail_unless($old['id']!=='admin' && empty($old['canAdmin']),'Administrator roles are protected.');
                $personnel=count(array_filter($s['users'],fn($record)=>($record['role']??null)===$old['id']));
                $workflows=count(array_filter($s['workflowTemplates'],function($record) use ($old) {
                    foreach ($record['steps']??[] as $step) if (($step['assigneeRole']??null)===$old['id']) return true;
                    return false;
                }));
                $documents=count(array_filter($s['documents'],function($record) use ($old) {
                    foreach ($record['workflowSteps']??[] as $step) if (($step['assignedTo']['role']??null)===$old['id']) return true;
                    return false;
                }));
                $dependencies=[];
                if ($personnel) $dependencies[]=$personnel.' personnel account'.($personnel===1?'':'s');
                if ($workflows) $dependencies[]=$workflows.' workflow'.($workflows===1?'':'s');
                if ($documents) $dependencies[]=$documents.' document'.($documents===1?'':'s');
                fail_unless(!$dependencies,'Role is still used by '.implode(', ',$dependencies).'. Reassign those references first.');
                // Role designations are catalogue labels rather than operational history.
                // Remove them with the role so an otherwise unused role can be deleted.
                $s['assigneeDesignations']=array_values(array_filter($s['assigneeDesignations'],fn($record)=>($record['baseRole']??null)!==$old['id']));
            } else {
                foreach (['workflowTemplates','documents'] as $refKey) foreach ($s[$refKey] as $r) {
                    fail_unless(!str_contains(json_encode($r),json_encode($old['title'])),'This designation is in use. Update its references first.');
                }
            }
            array_splice($s[$key],$i,1); return true;
        }
        $nameKey=$key==='systemRoles'?'name':'title'; $d[$nameKey]=required($d,$nameKey,160);
        $roleUpdateIndex=null; $previousRoleId=null;
        if ($key==='systemRoles') {
            $d['id']=required($d,'id',64); fail_unless((bool)preg_match('/^[a-z][a-z0-9_]*$/',$d['id']),'Role ID must use lowercase letters, digits, and underscores.');
            if ($action==='updateSystemRole') {
                $reference=is_array($args[1]??null)?$args[1]:[]; $matches=[];
                foreach ($s[$key] as $index=>$role) {
                    $sameCurrentId=$role['id']===$d['id'];
                    $sameOriginalId=!empty($reference['id']) && $role['id']===$reference['id'];
                    $sameCode=!empty($reference['code']) && strcasecmp((string)($role['code']??''),(string)$reference['code'])===0;
                    $sameName=!empty($reference['name']) && strcasecmp((string)($role['name']??''),(string)$reference['name'])===0;
                    if ($sameCurrentId || $sameOriginalId || $sameCode || $sameName) $matches[]=$index;
                }
                $matches=array_values(array_unique($matches));
                fail_unless(count($matches)===1,'This role changed or was removed. Close the editor and select the role again.',409);
                $roleUpdateIndex=$matches[0]; $previousRoleId=$s[$key][$roleUpdateIndex]['id'];
                fail_unless($previousRoleId!=='admin' || $d['id']==='admin','The administrator system key cannot be changed.');
                fail_unless($d['id']===$previousRoleId || !in_array($d['id'],array_column($s[$key],'id'),true),'This identifier already exists.',409);
            }
            if ($d['id']==='admin') $d['canAdmin']=true;
            foreach (['canIntake','canProcess','canReview','canApprove','canRelease','canSupervise','canAdmin'] as $cap) $d[$cap]=(bool)($d[$cap]??false);
        } else {
            choice($d['category']??null,['Role','Team'],'designation category');
            if ($d['category']==='Role') index_of($s['systemRoles'],required($d,'baseRole',64));
        }
        if ($action==='add'.$suffix) {
            $d['id']=$key==='systemRoles'?$d['id']:uid('designation');
            fail_unless(!in_array($d['id'],array_column($s[$key],'id'),true),'This identifier already exists.',409);
            $d['isSystemDefault']=false; $s[$key][]=$d;
        } elseif ($key==='systemRoles' && $roleUpdateIndex!==null && $previousRoleId!==null) {
            $d['isSystemDefault']=$s[$key][$roleUpdateIndex]['isSystemDefault']??false;
            if ($d['id']!==$previousRoleId) {
                foreach ($s['users'] as &$person) if (($person['role']??null)===$previousRoleId) $person['role']=$d['id'];
                unset($person);
                foreach ($s['assigneeDesignations'] as &$designation) if (($designation['baseRole']??null)===$previousRoleId) $designation['baseRole']=$d['id'];
                unset($designation);
                foreach ($s['workflowTemplates'] as &$workflow) foreach ($workflow['steps'] as &$step) if (($step['assigneeRole']??null)===$previousRoleId) $step['assigneeRole']=$d['id'];
                unset($step,$workflow);
                foreach ($s['documents'] as &$document) foreach ($document['workflowSteps'] as &$step) if (($step['assignedTo']['role']??null)===$previousRoleId) $step['assignedTo']['role']=$d['id'];
                unset($step,$document);
                $pdo->prepare('UPDATE app_users SET role=? WHERE role=?')->execute([$d['id'],$previousRoleId]);
            }
            $s[$key][$roleUpdateIndex]=$d;
        } else {
            $i=index_of($s[$key],required($d,'id')); $d['isSystemDefault']=$s[$key][$i]['isSystemDefault']??false; $s[$key][$i]=$d;
        }
        return $d;
    }
    throw new ApiError('Unknown operation.',404);
}
