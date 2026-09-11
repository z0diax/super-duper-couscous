<?php
declare(strict_types=1);
require_once __DIR__.'/store.php';
$method=$_SERVER['REQUEST_METHOD'];
if ($method==='GET') {
    $user=null; if (!empty($_SESSION['user_id'])) { try { $user=authenticated_user(database()); } catch (ApiError $e) { unset($_SESSION['user_id']); } }
    respond(['user'=>$user,'csrfToken'=>$_SESSION['csrf']]);
}
fail_unless(in_array($method,['POST','DELETE'],true),'Method not allowed.',405); csrf_check();
if ($method==='DELETE') { $_SESSION=[]; session_destroy(); respond(['ok'=>true]); }
$body=request_json(); $email=strtolower(trim((string)($body['email']??''))); $password=(string)($body['password']??'');
fail_unless(strlen($email)<=190 && strlen($password)<=72 && $email!=='' && $password!=='','Email and password are required.');
$pdo=database();
// Both address and account windows prevent bypassing the limit with new cookies.
$keys=[hash('sha256','ip:'.($_SERVER['REMOTE_ADDR']??'')),hash('sha256','email:'.$email)];
$pdo->beginTransaction();
try {
    foreach ($keys as $key) {
        $pdo->prepare('INSERT IGNORE INTO app_login_attempts (attempt_key,window_start) VALUES (?,?)')->execute([$key,time()]);
        $q=$pdo->prepare('SELECT * FROM app_login_attempts WHERE attempt_key=? FOR UPDATE'); $q->execute([$key]); $r=$q->fetch();
        if (time()-(int)$r['window_start']>=900) { $pdo->prepare('UPDATE app_login_attempts SET attempts=0,window_start=? WHERE attempt_key=?')->execute([time(),$key]); $r['attempts']=0; }
        fail_unless((int)$r['attempts']<20,'Too many sign-in attempts. Try again in 15 minutes.',429);
        $pdo->prepare('UPDATE app_login_attempts SET attempts=attempts+1 WHERE attempt_key=?')->execute([$key]);
    }
    $pdo->commit();
} catch (Throwable $e) { $pdo->rollBack(); throw $e; }
$q=$pdo->prepare('SELECT * FROM app_users WHERE email=?'); $q->execute([$email]); $row=$q->fetch();
$valid=password_verify($password,$row['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
fail_unless((bool)$row && $valid,'Invalid email or password.',401);
$pdo->prepare('DELETE FROM app_login_attempts WHERE attempt_key=?')->execute([$keys[1]]);
$pdo->prepare('UPDATE app_login_attempts SET attempts=GREATEST(attempts-1,0) WHERE attempt_key=?')->execute([$keys[0]]);
session_regenerate_id(true); $_SESSION['user_id']=$row['id']; $_SESSION['credential']=hash('sha256',$row['password_hash']); $_SESSION['csrf']=bin2hex(random_bytes(32));
respond(['user'=>public_user($row),'csrfToken'=>$_SESSION['csrf']]);
