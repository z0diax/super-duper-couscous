<?php
declare(strict_types=1);
require_once __DIR__.'/document_read_http.php';
[$pdo,$user]=document_read_context();
$roleState=document_repository_role_state($pdo,$user);
fail_unless(has_cap($roleState,$user,'canAdmin'),'Your account is not authorized for workflow configuration.',403);
$params=document_read_params(['id','version','page','limit']);
try {
    if (isset($params['id'])) {
        fail_unless(count($params)===1 || (count($params)===2 && isset($params['version'])),'Invalid template lookup.',400);
        $version=isset($params['version'])?document_read_number($params,'version',1):null;
        $template=document_repository_template($pdo,$params['id'],$version);
        fail_unless($template!==null,'Workflow template not found.',404);
        respond(['data'=>$template]);
    }
    fail_unless(!isset($params['version']),'Template ID is required with a version.',400);
    document_read_page(document_repository_template_list($pdo,document_read_number($params,'page',1),document_read_number($params,'limit',25)));
} catch (InvalidArgumentException $e) { throw new ApiError($e->getMessage(),400); }
