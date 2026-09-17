import { request } from './http';
import type { UserAccount, AssigneeDesignation, SystemRoleDefinition, DocumentRecord, ClassificationCategory, WorkflowTemplate, LeaveApplicationRecord, EwpRecord, MigrationSummary, AuditEvent, PayrollBatch, PayrollItem, WorkGroup, EmploymentRoutingRule } from '../types';
export interface AppState {
  users: UserAccount[]; assigneeDesignations: AssigneeDesignation[]; systemRoles: SystemRoleDefinition[];
  documents: DocumentRecord[]; classifications: ClassificationCategory[]; workflowTemplates: WorkflowTemplate[];
  leaveApplications: LeaveApplicationRecord[]; ewpRecords: EwpRecord[]; migrationSummaries: MigrationSummary[]; auditLogs: AuditEvent[];
  payrollBatches: PayrollBatch[]; payrollItems: PayrollItem[]; workGroups: WorkGroup[]; employmentRoutingRules: EmploymentRoutingRule[];
}
export const emptyState: AppState = { users: [], assigneeDesignations: [], systemRoles: [], documents: [], classifications: [], workflowTemplates: [], leaveApplications: [], ewpRecords: [], migrationSummaries: [], auditLogs: [], payrollBatches: [], payrollItems: [], workGroups: [], employmentRoutingRules: [] };
export interface StateResponse { state: AppState; revision: number; result?: unknown }
export const loadAppState = (): Promise<StateResponse> => request('state.php');
export const performAction = (action: string, args: unknown[], revision: number): Promise<StateResponse> => request('state.php', { method: 'POST', body: JSON.stringify({ action, args, revision }) });
