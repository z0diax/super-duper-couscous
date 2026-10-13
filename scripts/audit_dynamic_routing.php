<?php
declare(strict_types=1);
// Read-only production inspection. Never modifies records or schema.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/api/db.php';
$pdo=database();
$pdo->exec('SET TRANSACTION READ ONLY');
$pdo->beginTransaction();
try {
    $counts=['dynamicDocuments'=>0,'missingInitialAssignment'=>0,'missingInitialCustody'=>0,'invalidActiveAssignee'=>0,'projectionMismatch'=>0,'legacyCopies'=>0];
    $steps=$pdo->prepare('SELECT step_number,assigned_user_id FROM document_workflow_steps WHERE document_id=? ORDER BY step_number');
    $history=$pdo->prepare('SELECT movement_type FROM document_custody_history WHERE document_id=? ORDER BY position');
    $person=$pdo->prepare('SELECT COUNT(*) FROM app_users WHERE id=?');
    $legacy=$pdo->prepare("SELECT COUNT(*) FROM app_records WHERE collection='documents' AND id=?");
    foreach ($pdo->query("SELECT id,current_step_number,status,source_json FROM documents WHERE JSON_UNQUOTE(JSON_EXTRACT(source_json,'$.routingMode'))='dynamic'") as $row) {
        $counts['dynamicDocuments']++;
        $doc=json_decode($row['source_json'],true,64,JSON_THROW_ON_ERROR);
        $steps->execute([$row['id']]); $assignments=$steps->fetchAll();
        $history->execute([$row['id']]); $events=$history->fetchAll(PDO::FETCH_COLUMN);
        if (!$assignments || (int)$assignments[0]['step_number']!==1 || empty($assignments[0]['assigned_user_id'])) $counts['missingInitialAssignment']++;
        if (!$events || $events[0]!=='DOCKETED_SENT') $counts['missingInitialCustody']++;
        $current=array_values(array_filter($assignments,fn($s)=>(int)$s['step_number']===(int)$row['current_step_number']));
        $person->execute([$current[0]['assigned_user_id']??'']);
        if ($row['status']==='In_Progress' && (int)$person->fetchColumn()!==1) $counts['invalidActiveAssignee']++;
        if (count($assignments)!==count($doc['workflowSteps']??[]) || count($events)!==count($doc['custodyHistory']??[]) || ($current[0]['assigned_user_id']??null)!==($doc['workflowSteps'][(int)$row['current_step_number']-1]['assignedTo']['userId']??null)) $counts['projectionMismatch']++;
        $legacy->execute([$row['id']]); $counts['legacyCopies']+=(int)$legacy->fetchColumn();
    }
    $counts['orphanWorkflowSteps']=(int)$pdo->query('SELECT COUNT(*) FROM document_workflow_steps s LEFT JOIN documents d ON d.id=s.document_id WHERE d.id IS NULL')->fetchColumn();
    $counts['orphanCustodyEvents']=(int)$pdo->query('SELECT COUNT(*) FROM document_custody_history h LEFT JOIN documents d ON d.id=h.document_id WHERE d.id IS NULL')->fetchColumn();
    $pdo->commit();
    echo json_encode($counts,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
