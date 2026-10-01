<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/api/db.php';
$pdo=database();
$queries=[
    'owned_batch_page'=>"SELECT b.id FROM payroll_read_batches b WHERE b.encoded_by_user_id='no-user' ORDER BY b.date_encoded DESC,b.id DESC LIMIT 10",
    'batch_item_page'=>"SELECT i.id FROM payroll_read_items i WHERE i.batch_id='no-batch' ORDER BY i.item_number ASC,i.id ASC LIMIT 25",
    'batch_group_page'=>"SELECT g.id FROM payroll_read_groups g WHERE g.batch_id='no-batch' ORDER BY g.id ASC LIMIT 25",
    'group_membership'=>"SELECT gi.group_id FROM payroll_read_group_items gi WHERE gi.item_id='no-item'",
    'exact_barcode'=>"SELECT i.id FROM payroll_read_items i WHERE i.barcode='no-barcode' LIMIT 1",
];
$plans=[];
foreach($queries as $name=>$sql)$plans[$name]=$pdo->query('EXPLAIN '.$sql)->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($plans,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),PHP_EOL;
