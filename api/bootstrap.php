<?php
declare(strict_types=1);
require_once __DIR__.'/db.php';
date_default_timezone_set('UTC');
final class ApiError extends RuntimeException {
    public function __construct(string $message, public int $status = 422) { parent::__construct($message); }
}
function fail_unless(bool $condition, string $message, int $status = 422): void {
    if (!$condition) throw new ApiError($message, $status);
}
function respond(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
function request_json(): array {
    fail_unless(str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json'), 'Send application/json.', 415);
    fail_unless((int)($_SERVER['CONTENT_LENGTH'] ?? 0) <= 2 * 1024 * 1024, 'Request is too large.', 413);
    try { $body = json_decode(file_get_contents('php://input'), true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { throw new ApiError('Invalid JSON.'); }
    fail_unless(is_array($body), 'A JSON object is required.'); return $body;
}
function public_user(array $r): array {
    $modules=null;
    if (!empty($r['sidebar_modules'])) { $decoded=json_decode($r['sidebar_modules'],true); if (is_array($decoded)) $modules=$decoded; }
    return ['id'=>$r['id'],'email'=>$r['email'],'name'=>$r['name'],'role'=>$r['role'], 'roleTitle'=>$r['role_title'],'office'=>$r['office'],'division'=>$r['division'], 'position'=>$r['position'],'avatarInitials'=>$r['avatar_initials'],'sidebarModules'=>$modules];
}
function authenticated_user(PDO $pdo): array {
    fail_unless(!empty($_SESSION['user_id']), 'Please sign in again.', 401);
    $q=$pdo->prepare('SELECT * FROM app_users WHERE id=?'); $q->execute([$_SESSION['user_id']]); $row=$q->fetch();
    fail_unless((bool)$row && ($_SESSION['credential'] ?? '') === hash('sha256', $row['password_hash']), 'Please sign in again.', 401);
    return public_user($row);
}
function csrf_check(): void {
    fail_unless(isset($_SERVER['HTTP_X_CSRF_TOKEN']) && hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN']), 'Session security token expired. Refresh and try again.', 403);
}
if (PHP_SAPI !== 'cli') {
    ini_set('display_errors','0');
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    set_exception_handler(function(Throwable $e) {
        if ($e instanceof ApiError) respond(['error'=>$e->getMessage()],$e->status);
        error_log('HRMDO: '.$e->getMessage());
        respond(['error'=>'The operation could not be saved. Check the server logs and database setup.'],503);
    });
    ini_set('session.use_strict_mode','1'); session_name('hrmdo_session');
    session_set_cookie_params(['path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/', 'httponly'=>true, 'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite'=>'Strict']);
    session_start();
    if (isset($_SESSION['last_active']) && time()-$_SESSION['last_active'] > app_config()['session_timeout']) $_SESSION=[];
    $_SESSION['last_active']=time(); $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
