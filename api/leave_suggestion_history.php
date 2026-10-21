<?php
declare(strict_types=1);

const LEAVE_MEDICAL_SHARED_SCOPE='__shared_medical__';

// Project only reusable field values, never applicant names or leave IDs.
function remember_leave_history_suggestion(PDO $pdo,array $record): bool {
    $type=$record['leaveType']??'';
    $medical=$type==='Sick Leave';
    if (!$medical && !in_array($type,['Vacation Leave','Special Privilege Leave'],true)) return false;
    $value=$record['leaveDetails']??null;
    if (!is_string($value) || !mb_check_encoding($value,'UTF-8') || mb_strlen($value)>2000) return false;
    // Both vocabularies are shared among authorized Leave users; keep categories separate.
    $scope=$medical?LEAVE_MEDICAL_SHARED_SCOPE:'';
    if (!$medical) {
        // Import simple destination fields, excluding multiline narratives/contact information.
        if (mb_strlen($value)>190 || preg_match('/[\r\n\p{Cc}\p{Cf}]/u',$value)
            || !preg_match("/^[\p{L}\p{M}\p{N} '\x{2019}.,()\/&-]+$/u",$value)
            || preg_match('/\d{5,}/u',$value)) return false;
    }
    $value=trim(preg_replace('/\s+/u',' ',$value));
    if ($value==='' || preg_match('/[\p{Cc}\p{Cf}]/u',$value) || !preg_match('/[\p{L}\p{N}]/u',$value)) return false;
    $normalized=mb_strtolower($value,'UTF-8');
    if (mb_strlen($normalized)>2000) return false;
    $location=!$medical && in_array($record['leaveSubtype']??'', ['WITHIN_PHILIPPINES','ABROAD'],true)?$record['leaveSubtype']:null;
    $put=$pdo->prepare('INSERT INTO leave_suggestions (id,category,scope_key,display_value,normalized_value,value_hash,location_type) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id');
    $put->execute(['suggestion-'.bin2hex(random_bytes(12)),$medical?'medical':'destination',$scope,$value,$normalized,hash('sha256',$normalized),$location]);
    return $put->rowCount()===1;
}

function backfill_leave_history_suggestions(PDO $pdo): int {
    $last=''; $count=0;
    // Preserve Enter-saved terms from the earlier account-scoped implementation without deleting old rows.
    $saved=$pdo->prepare("SELECT id,display_value FROM leave_suggestions WHERE category='medical' AND scope_key<>? AND id>? ORDER BY id LIMIT 500");
    do {
        $saved->execute([LEAVE_MEDICAL_SHARED_SCOPE,$last]); $rows=$saved->fetchAll();
        foreach ($rows as $row) {
            if (remember_leave_history_suggestion($pdo,['leaveType'=>'Sick Leave','leaveDetails'=>$row['display_value']])) $count++;
            $last=$row['id'];
        }
    } while (count($rows)===500);
    $last='';
    // Keyset batches keep the migration bounded; keystrokes query only the indexed vocabulary table.
    $query=$pdo->prepare("SELECT id,
        JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveType')) AS leaveType,
        JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveSubtype')) AS leaveSubtype,
        JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveDetails')) AS leaveDetails
        FROM app_records WHERE collection='leaveApplications' AND id>?
        AND JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.leaveType')) IN ('Vacation Leave','Special Privilege Leave','Sick Leave')
        AND JSON_TYPE(JSON_EXTRACT(record_json,'$.leaveDetails'))='STRING'
        ORDER BY id LIMIT 500");
    do {
        $query->execute([$last]); $rows=$query->fetchAll();
        foreach ($rows as $row) {
            if (remember_leave_history_suggestion($pdo,$row)) $count++;
            $last=$row['id'];
        }
    } while (count($rows)===500);
    return $count;
}
