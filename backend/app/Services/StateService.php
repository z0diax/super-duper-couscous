<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class StateService
{
    private const COLLECTIONS = [
        'assigneeDesignations', 'systemRoles', 'documents', 'classifications',
        'workflowTemplates', 'leaveApplications', 'ewpRecords', 'migrationSummaries',
        'payrollBatches', 'payrollItems', 'workGroups', 'employmentRoutingRules',
    ];

    public function read(User $user): array
    {
        $state = array_fill_keys(self::COLLECTIONS, []);

        foreach (DB::table('app_records')->orderBy('id')->get() as $row) {
            if (isset($state[$row->collection])) {
                $state[$row->collection][] = json_decode($row->record_json, true, 64, JSON_THROW_ON_ERROR);
            }
        }

        $state['users'] = User::query()->orderBy('name')->get()
            ->map(fn (User $record): array => $record->publicProfile())->all();
        $state['auditLogs'] = DB::table('app_audit')->orderByDesc('sequence')->pluck('record_json')
            ->map(fn (string $record): array => json_decode($record, true, 64, JSON_THROW_ON_ERROR))->all();

        return $this->filterForUser($state, $user);
    }

    public function revision(): int
    {
        return (int) DB::table('app_meta')->where('id', 1)->value('revision');
    }

    private function filterForUser(array $state, User $user): array
    {
        $profile = $user->publicProfile();
        $documents = array_values(array_filter($state['documents'], fn (array $doc): bool =>
            $this->canViewDocument($state, $profile, $doc)));
        $items = array_values(array_filter($state['payrollItems'], fn (array $item): bool =>
            $this->canViewPayrollItem($state, $profile, $item)));
        $groups = array_values(array_filter($state['workGroups'], fn (array $group): bool =>
            $this->canViewWorkGroup($state, $profile, $group)));
        $batches = [];
        foreach ($state['payrollBatches'] as $batch) {
            if ($this->canViewPayrollBatch($state, $profile, $batch)) {
                $batches[] = $this->scopedPayrollBatch($state, $profile, $batch, $items);
            }
        }
        $batchIds = array_column($batches, 'id');
        $items = array_values(array_filter($items, fn (array $item): bool =>
            ($item['batchId'] ?? '') === 'SINGLE_ENTRY' || in_array($item['batchId'] ?? '', $batchIds, true)));
        $groups = array_values(array_filter($groups, fn (array $group): bool =>
            in_array($group['batchId'] ?? '', $batchIds, true)));
        $authorizedLeaves = array_values(array_filter($state['leaveApplications'], fn (array $leave): bool =>
            $this->canViewLeave($state, $profile, $leave)));
        $leaves = array_values(array_filter($authorizedLeaves, fn (array $leave): bool =>
            !empty($leave['isLegacyV1'])));
        $modules = $profile['sidebarModules'];
        $ewp = ($profile['role'] === 'admin' || $modules === null || in_array('leave', $modules, true))
            ? $state['ewpRecords'] : [];
        $visibleIds = array_merge(
            array_column($documents, 'id'), array_column($batches, 'id'),
            array_column($items, 'id'), array_column($groups, 'id'),
            array_column($leaves, 'id'), array_column($ewp, 'id')
        );

        $state['documents'] = $documents;
        $state['payrollBatches'] = $batches;
        $state['payrollItems'] = $items;
        $state['workGroups'] = $groups;
        $state['leaveApplications'] = $leaves;
        $state['ewpRecords'] = $ewp;
        $state['auditLogs'] = array_values(array_filter($state['auditLogs'], fn (array $event): bool =>
            ($event['actorId'] ?? null) === $user->id
            || in_array($event['documentId'] ?? '', $visibleIds, true)));

        return $state;
    }

    private function canViewDocument(array $state, array $user, array $doc): bool
    {
        if ($this->canViewAll($state, $user) || ($doc['encodedBy']['userId'] ?? null) === $user['id']) {
            return true;
        }
        foreach ($doc['workflowSteps'] ?? [] as $step) {
            if (($step['completedBy']['userId'] ?? null) === $user['id']
                || ($step['handoffOwner']['userId'] ?? null) === $user['id']) {
                return true;
            }
            if (($step['stepNumber'] ?? 0) !== ($doc['currentStepNumber'] ?? 0)) {
                continue;
            }
            if ($this->canAssign($state, $user, $step['assignedTo'] ?? [])) {
                return true;
            }
            if (($step['stageType'] ?? '') === 'EXTERNAL_HANDOFF_REVIEW') {
                if (($step['externalStatus'] ?? null) === 'PENDING_HANDOFF'
                    && (($step['handoffOwner']['userId'] ?? null) === $user['id']
                        || $this->hasCapability($state, $user, 'canIntake'))) {
                    return true;
                }
                if (($step['externalStatus'] ?? null) === 'OUTSIDE_HRMDO'
                    && ($this->canAssign($state, $user, $step['returnReceiver'] ?? [])
                        || $this->hasCapability($state, $user, 'canIntake'))) {
                    return true;
                }
            }
        }
        return in_array($doc['status'] ?? '', ['Ready_For_Release', 'Released'], true)
            && $this->hasCapability($state, $user, 'canRelease');
    }

    private function canViewWorkGroup(array $state, array $user, array $group): bool
    {
        return $this->canViewAll($state, $user)
            || ($group['assignedProcessorId'] ?? null) === $user['id']
            || (($group['assignedTeam'] ?? '') !== ''
                && in_array($group['assignedTeam'], [$user['division'], $user['office']], true));
    }

    private function canViewPayrollItem(array $state, array $user, array $item): bool
    {
        if ($this->canViewAll($state, $user)) {
            return true;
        }
        if (($item['batchId'] ?? null) === 'SINGLE_ENTRY') {
            foreach ($state['documents'] as $doc) {
                if (($doc['id'] ?? null) === ($item['documentId'] ?? null)) {
                    return $this->canViewDocument($state, $user, $doc);
                }
            }
            return false;
        }
        $batch = null;
        foreach ($state['payrollBatches'] as $candidate) {
            if (($candidate['id'] ?? null) === ($item['batchId'] ?? null)) {
                $batch = $candidate;
                break;
            }
        }
        if ($batch === null) {
            return false;
        }
        if (($batch['encodedBy']['userId'] ?? null) === $user['id']) {
            return true;
        }
        $stage = $item['currentStage'] ?? (empty($item['workGroupId']) ? 'initial_checking' : 'verification_signing');
        if ($stage === 'initial_checking'
            && $this->payrollDeskAllowsView($state, $user, $batch['initialCheckingDesk'] ?? $batch['assignedDesk'] ?? [])) {
            return true;
        }
        if ($stage === 'release') {
            foreach ($batch['workflowStages'] ?? [] as $workflowStage) {
                if (($workflowStage['stageNumber'] ?? 0) === 4
                    && $this->payrollDeskAllowsView($state, $user, $workflowStage['assignedTo'] ?? [])) {
                    return true;
                }
            }
        }
        if (($item['assignedToUserId'] ?? null) === $user['id']) {
            return true;
        }
        foreach ($state['workGroups'] as $group) {
            if (in_array($item['id'], $group['itemIds'] ?? [], true)
                && $this->canViewWorkGroup($state, $user, $group)) {
                return true;
            }
        }
        return in_array($item['status'] ?? '', ['Ready_For_Release', 'Released'], true)
            && $this->hasCapability($state, $user, 'canRelease');
    }

    private function canViewPayrollBatch(array $state, array $user, array $batch): bool
    {
        if ($this->canViewFullPayrollBatch($state, $user, $batch)) {
            return true;
        }
        foreach ($state['payrollItems'] as $item) {
            if (($item['batchId'] ?? null) === ($batch['id'] ?? null)
                && $this->canViewPayrollItem($state, $user, $item)) {
                return true;
            }
        }
        return false;
    }

    private function canViewFullPayrollBatch(array $state, array $user, array $batch): bool
    {
        return $this->canViewAll($state, $user)
            || ($batch['encodedBy']['userId'] ?? null) === $user['id']
            || $this->payrollDeskAllowsView($state, $user, $batch['initialCheckingDesk'] ?? $batch['assignedDesk'] ?? []);
    }

    private function scopedPayrollBatch(array $state, array $user, array $batch, array $visibleItems): array
    {
        if ($this->canViewFullPayrollBatch($state, $user, $batch)) {
            return $batch;
        }
        $batch['itemIds'] = array_values(array_intersect($batch['itemIds'] ?? [], array_column($visibleItems, 'id')));
        $batch['attachments'] = [];
        $batch['remarks'] = '';
        $batch['receivedFromLiaison'] = '';
        $batch['workflowStages'] = array_values(array_map(fn (array $stage): array => [
            'stageNumber' => $stage['stageNumber'],
            'name' => $stage['name'],
            'status' => $stage['status'],
            'assignedTo' => $stage['assignedTo'],
            'allowHold' => (bool) ($stage['allowHold'] ?? false),
            'payrollAssignmentSource' => $stage['payrollAssignmentSource'] ?? null,
            'dynamic' => (bool) ($stage['dynamic'] ?? false),
        ], $batch['workflowStages'] ?? []));
        unset($batch['workflowHistory'], $batch['releaseDetails']);
        return $batch;
    }

    private function hasCapability(array $state, array $user, string $capability): bool
    {
        if ($user['role'] === 'admin') {
            return true;
        }
        foreach ($state['systemRoles'] ?? [] as $role) {
            if (($role['id'] ?? null) === $user['role']) {
                return !empty($role['canAdmin']) || !empty($role[$capability]);
            }
        }
        return false;
    }

    private function canViewAll(array $state, array $user): bool
    {
        return $this->hasCapability($state, $user, 'canSupervise')
            || $this->hasCapability($state, $user, 'canAdmin');
    }

    private function canAssign(array $state, array $user, array $assignment): bool
    {
        if ($this->hasCapability($state, $user, 'canSupervise')) {
            return true;
        }
        if (!empty($assignment['userId'])) {
            return $assignment['userId'] === $user['id'];
        }
        if (($assignment['type'] ?? '') === 'Role') {
            return ($assignment['role'] ?? null) === $user['role'];
        }
        return ($assignment['type'] ?? '') === 'Team'
            && !empty($assignment['team'])
            && in_array($assignment['team'], [$user['division'], $user['office']], true);
    }

    private function payrollDeskAllowsView(array $state, array $user, array $desk): bool
    {
        if ($this->canViewAll($state, $user)) {
            return true;
        }
        if (!empty($desk['userId'])) {
            return $desk['userId'] === $user['id'];
        }
        if (($desk['assignmentType'] ?? '') === 'Role') {
            return ($desk['roleId'] ?? null) === $user['role'];
        }
        return ($desk['assignmentType'] ?? '') === 'Team'
            && !empty($desk['team'])
            && in_array($desk['team'], [$user['division'], $user['office']], true);
    }

    private function canViewLeave(array $state, array $user, array $leave): bool
    {
        $modules = $user['sidebarModules'] ?? null;
        return $this->canViewAll($state, $user)
            || $modules === null
            || in_array('leave', $modules, true);
    }
}
