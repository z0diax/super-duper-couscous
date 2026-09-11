<?php
declare(strict_types=1);
require_once __DIR__.'/domain.php';
$pdo=database(); $u=authenticated_user($pdo); $method=$_SERVER['REQUEST_METHOD'];
if ($method==='GET') {
    $id=$_GET['id']??''; fail_unless((bool)preg_match('/^file-[a-f0-9]{24}$/',$id),'File not found.',404);
    $q=$pdo->prepare('SELECT * FROM app_files WHERE id=?'); $q->execute([$id]); $file=$q->fetch();
    // File identifiers are not authorization. Resolve the owning record and apply
    // the same record-level view policy used by the state API so an authenticated
    // user cannot enumerate attachments from records outside their work scope.
    $state=load_state($pdo);
    fail_unless((bool)$file && can_view_attachment_owner($state,$u,$file['owner_id']??null,$file['uploaded_by']??null),'File not found.',404);
    $path=app_config()['upload_directory'].'/'.$id; fail_unless(is_file($path),'Stored file is missing.',404);
    fail_unless(hash_equals($file['sha256'],hash_file('sha256',$path)),'File integrity verification failed.',409);
    header('Content-Type: '.$file['mime_type']); header('Content-Length: '.$file['size_bytes']);
    header("Content-Disposition: attachment; filename=\"download\"; filename*=UTF-8''".rawurlencode($file['original_name']));
    session_write_close(); readfile($path); exit;
}
fail_unless($method==='POST','Method not allowed.',405); csrf_check();
$f=$_FILES['file']??null; fail_unless(is_array($f) && $f['error']===UPLOAD_ERR_OK,'Upload failed. Check the file size and PHP upload limits.');
fail_unless($f['size']>0 && $f['size']<=app_config()['upload_max_bytes'],'Files must be between 1 byte and 10 MB.',413);
$name=basename(str_replace('\\','/',$f['name'])); fail_unless(mb_strlen($name)<=255 && !preg_match('/[\x00-\x1f]/',$name),'Invalid filename.');
$extension=strtolower(pathinfo($name,PATHINFO_EXTENSION)); $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$allowed=['pdf'=>['application/pdf'],'png'=>['image/png'],'jpg'=>['image/jpeg'],'jpeg'=>['image/jpeg'],'txt'=>['text/plain'],'csv'=>['text/plain','text/csv','application/csv'], 'docx'=>['application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 'xlsx'=>['application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']];
fail_unless(isset($allowed[$extension]) && in_array($mime,$allowed[$extension],true),'Allowed files: PDF, PNG, JPEG, TXT, CSV, DOCX, and XLSX.');
if (in_array($extension,['docx','xlsx'],true)) {
    try {
        $zip=new PharData($f['tmp_name'],0,null,Phar::ZIP);
        $valid=isset($zip['[Content_Types].xml']) && isset($zip[$extension==='docx'?'word/document.xml':'xl/workbook.xml']);
        unset($zip);
    } catch (Throwable $e) { $valid=false; }
    fail_unless($valid,'Invalid Office file.');
}
$id=uid('file'); $dir=app_config()['upload_directory']; if (!is_dir($dir) && !mkdir($dir,0700,true)) throw new RuntimeException('Cannot create upload directory.');
$hash=hash_file('sha256',$f['tmp_name']); fail_unless(move_uploaded_file($f['tmp_name'],$dir.'/'.$id),'Unable to store upload.',503);
try { $pdo->prepare('INSERT INTO app_files (id,original_name,mime_type,size_bytes,sha256,uploaded_by) VALUES (?,?,?,?,?,?)')->execute([$id,$name,$mime,$f['size'],$hash,$u['id']]); }
catch (Throwable $e) { unlink($dir.'/'.$id); throw $e; }
respond(['file'=>['id'=>$id,'name'=>$name,'sizeBytes'=>$f['size'],'mimeType'=>$mime]],201);
