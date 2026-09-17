export type UserRole = 
  | 'receiving_officer'
  | 'processor'
  | 'reviewer'
  | 'approver'
  | 'releasing_officer'
  | 'supervisor'
  | 'admin'
  | 'employee'
  | (string & {});

export type SidebarModule = 'dashboard' | 'queues' | 'payroll' | 'registry' | 'leave';

export interface SystemRoleDefinition {
  id: string;
  name: string;
  code: string;
  description: string;
  badgeClass: string;
  canIntake?: boolean;
  canProcess?: boolean;
  canReview?: boolean;
  canApprove?: boolean;
  canRelease?: boolean;
  canSupervise?: boolean;
  canAdmin?: boolean;
  isSystemDefault?: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleTitle: string;
  office: string;
  division: string;
  position: string;
  avatarInitials: string;
  avatarSeed?: string;
  sidebarModules?: SidebarModule[];
  isMigratedV1?: boolean;
  legacyId?: string;
}

export interface AssigneeDesignation {
  id: string;
  category: 'Role' | 'Team';
  title: string;
  baseRole?: UserRole;
  description?: string;
  isCustom?: boolean;
}

export type EmploymentClassification = 'JOW/COS' | 'Casual' | 'Regular' | 'Job Order (JOW)';

export type PayrollProcessingMode = 'Single Payroll' | 'Payroll Batch';

export type PayrollBatchStage = 
  | 'receiving'
  | 'initial_checking'
  | 'verification_signing'
  | 'release'
  | 'completed';

export type PayrollItemVerificationStatus = 'Pending' | 'Passed' | 'Exception';

export type PayrollItemStatus = 'Pending' | 'Ready' | 'Ready_For_Recheck' | 'In_Progress' | 'Completed' | 'On_Hold' | 'Ready_For_Release' | 'Released';

export interface PayrollItemAuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  details?: string;
  previousState?: string;
  newState?: string;
}

export interface PayrollItem {
    id: string;
    documentId?: string;
    batchId: string;
  batchNumber: string;
  itemNumber: number;
  barcode: string;
  title: string;
  office?: string;
  classificationType?: string;
  employmentClassification?: EmploymentClassification | null;
  verificationStatus: PayrollItemVerificationStatus;
  status: PayrollItemStatus;
  currentStage?: PayrollBatchStage;
  exceptionReason?: string;
  exceptionNotes?: string;
  holdReason?: string;
  holdRemarks?: string;
  holdStage?: PayrollBatchStage;
  heldAt?: string;
  heldByUserId?: string;
  heldByName?: string;
  holdResolvedAt?: string;
  holdResolvedByUserId?: string;
  holdResolvedByName?: string;
  complianceRemarks?: string;
  complianceAttachments?: FileAttachment[];
  recheckedAt?: string;
  recheckedByUserId?: string;
  workGroupId?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  remarks?: string;
  auditHistory: PayrollItemAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkGroup {
  id: string;
  batchId: string;
  batchNumber: string;
  code: string;
  classification: EmploymentClassification;
  assignedProcessorId: string;
  assignedProcessorName: string;
  assignedProcessorRoleTitle: string;
  assignedTeam?: string;
  assignedRoleId?: UserRole;
  itemIds: string[];
  status: 'Pending' | 'In_Progress' | 'Completed';
  startedAt?: string;
  completedAt?: string;
  completedBy?: {
    userId: string;
    userName: string;
  };
  remarks?: string;
  auditHistory?: PayrollItemAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PayrollBatch {
  id: string;
  batchNumber: string;
  classification: 'Payroll';
  payrollType: string;
  office: string;
  payrollPeriod?: string;
  receivedFromLiaison?: string;
  batchBarcode?: string;
  remarks?: string;
  dateReceived: string;
  dateEncoded: string;
  encodedBy: {
    userId: string;
    userName: string;
    userRole: string;
  };
  workflowTemplateId?: string;
  workflowVersion?: number;
  currentStage: PayrollBatchStage;
  currentStageName: string;
  assignedDesk: {
    stage: PayrollBatchStage;
    assignmentType?: 'Person' | 'Role' | 'Team' | 'Dynamic';
    userId?: string;
    roleId?: UserRole;
    team?: string;
    userName: string;
    roleTitle: string;
  };
  initialCheckingDesk?: {
    stage: PayrollBatchStage;
    assignmentType?: 'Person' | 'Role' | 'Team' | 'Dynamic';
    userId?: string;
    roleId?: UserRole;
    team?: string;
    userName: string;
    roleTitle: string;
  };
  workflowStages?: Array<{
    stageNumber: number;
    name: string;
    status: 'Pending' | 'In_Progress' | 'Completed';
    assignedTo: PayrollBatch['assignedDesk'];
    completedBy?: { userId: string; userName: string; userRole: string };
    completedAt?: string;
    dynamic?: boolean;
    payrollAssignmentSource?: 'workflow' | 'employment_routing';
    allowHold?: boolean;
  }>;
  workflowHistory?: PayrollItemAuditEntry[];
  /** Server-derived aggregate. Individual PayrollItem state controls routing. */
  progress: {
    totalItems: number;
    docketed: number;
    stage1Completed: number;
    initialChecking: { active: number; completed: number; onHold: number };
    management: { reached: number; active: number; completed: number; onHold: number; notReached: number };
    release: { ready: number; released: number; notReached: number };
    onHoldTotal: number;
    exceptionCount: number;
    completedCount: number;
    derivedStatus: 'INITIAL_CHECKING' | 'IN_PROCESS' | 'ON_HOLD' | 'PROCESSING_WITH_HOLDS' | 'PARTIALLY_READY_FOR_RELEASE' | 'READY_FOR_RELEASE' | 'COMPLETED';
    displayStatus: string;
  };
  totalItemsCount: number;
  itemIds: string[];
  workGroupIds: string[];
  attachments: FileAttachment[];
  /** Deprecated compatibility field; it mirrors progress.derivedStatus. */
  status: 'Active' | 'On_Hold' | 'Completed' | 'Archived' | 'INITIAL_CHECKING' | 'IN_PROCESS' | 'ON_HOLD' | 'PROCESSING_WITH_HOLDS' | 'PARTIALLY_READY_FOR_RELEASE' | 'READY_FOR_RELEASE' | 'COMPLETED';
  releaseDetails?: {
    releasedAt?: string;
    releasedBy?: string;
    releasedTo?: string;
    releaseMode?: string;
    receiptRemarks?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EmploymentRoutingRule {
  id: string;
  classification: EmploymentClassification;
  title: string;
  primaryProcessorId: string;
  primaryProcessorName: string;
  primaryProcessorRoleTitle: string;
  assignmentMode?: 'fixed' | 'pool' | 'team';
  eligibleProcessorIds?: string[];
  backupProcessorId?: string;
  backupProcessorName?: string;
  assignedTeam?: string;
  defaultSlaHours?: number;
  description: string;
  updatedAt: string;
}

export type DocumentClassification = 'Communication' | 'Payroll' | 'Request' | 'Others';

export type PriorityLevel = 'Routine' | 'Priority' | 'Urgent';

export type DocumentStatus = 
  | 'Draft'
  | 'Registered'
  | 'In_Progress'
  | 'Under_Review'
  | 'Pending_Approval'
  | 'Awaiting_External_Handoff'
  | 'Awaiting_External_Return'
  | 'Approved'
  | 'Returned'
  | 'On_Hold'
  | 'Ready_For_Recheck'
  | 'Ready_For_Release'
  | 'Released'
  | 'Disapproved'
  | 'Archived';

export interface FileAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  stepNumber?: number;
  url?: string;
  isLegacyV1?: boolean;
}

export interface WorkflowStepTemplate {
  stepNumber: number;
  name: string;
  description: string;
  stageType?: 'INTERNAL_PROCESSING' | 'EXTERNAL_HANDOFF_REVIEW' | 'FINAL_RELEASE';
  assigneeType: 'Role' | 'Team' | 'Person' | 'System';
  assigneeRole?: UserRole;
  assigneeTeam?: string;
  assigneeUserId?: string;
  assigneeName: string;
  slaHours: number;
  requiredAction: 'Receive' | 'Verify & Process' | 'Review & Recommend' | 'Approve & Sign' | 'Release & Archive' | 'External Handoff';
  allowReturn: boolean;
  allowHold?: boolean;
  requiresAttachment: boolean;
  assignmentSource?: 'workflow' | 'personnel_pool' | 'employment_routing';
  personnelPoolUserIds?: string[];
  payrollAssignmentSource?: 'workflow' | 'employment_routing';
  externalPurpose?: 'Approval' | 'Comments' | 'Signature' | 'Review' | 'Recommendation' | 'Certification' | 'Other';
  externalDestinationMode?: 'FIXED_DESTINATION' | 'SELECT_AT_HANDOFF';
  externalDestinationOffice?: string;
  returnReceiverType?: 'Role' | 'Team' | 'Person';
  returnReceiverRole?: UserRole;
  returnReceiverTeam?: string;
  returnReceiverUserId?: string;
  returnReceiverName?: string;
  expectedTurnaroundHours?: number;
  requiresReturnedAttachment?: boolean;
  requiresExternalResult?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  classification: DocumentClassification;
  documentType: string;
  documentTypes?: string[];
  employmentClassification?: 'All' | 'Job Order (JOW)' | 'Regular' | 'Casual';
  title: string;
  description: string;
  version: number;
  isActive: boolean;
  steps: WorkflowStepTemplate[];
}

export interface WorkflowStepInstance {
  stageType?: WorkflowStepTemplate['stageType'];
  requiredAction?: WorkflowStepTemplate['requiredAction'];
  allowReturn?: boolean;
  allowHold?: boolean;
  requiresAttachment?: boolean;
  payrollAssignmentSource?: WorkflowStepTemplate['payrollAssignmentSource'];
  assignmentSource?: WorkflowStepTemplate['assignmentSource'];
  personnelPoolUserIds?: string[];
  stepNumber: number;
  name: string;
  assignedTo: {
    type: 'Role' | 'Team' | 'Person' | 'System';
    role?: UserRole;
    team?: string;
    userId?: string;
    displayName: string;
  };
  status: 'Pending' | 'In_Progress' | 'Completed' | 'Returned' | 'On_Hold' | 'Ready_For_Recheck' | 'Skipped';
  slaHours: number;
  startedAt?: string;
  completedAt?: string;
  completedBy?: {
    userId: string;
    userName: string;
    userRole: string;
  };
  actionTaken?: string;
  remarks?: string;
  supportingFileIds?: string[];
  isCurrent: boolean;
  externalPurpose?: WorkflowStepTemplate['externalPurpose'];
  externalDestinationMode?: WorkflowStepTemplate['externalDestinationMode'];
  externalDestinationOffice?: string;
  returnReceiver?: {
    type: 'Role' | 'Team' | 'Person';
    role?: UserRole;
    team?: string;
    userId?: string;
    displayName: string;
  };
  expectedTurnaroundHours?: number;
  requiresReturnedAttachment?: boolean;
  requiresExternalResult?: boolean;
  externalStatus?: 'PENDING_HANDOFF' | 'OUTSIDE_HRMDO' | 'COMPLETED';
  handoffOwner?: { userId: string; userName: string; userRole: string };
  externalHandoff?: {
    destinationOffice: string;
    purpose: string;
    handedTo: string;
    representative?: string;
    remarks?: string;
    expectedReturn?: string;
    sentAt: string;
    sentBy: { userId: string; userName: string; userRole: string };
  };
  externalReturn?: {
    returnedFrom: string;
    returnedBy?: string;
    result?: 'Approved' | 'Approved with Comments' | 'Returned with Comments' | 'Signed' | 'Reviewed' | 'Disapproved' | 'No Action' | 'Other';
    remarks?: string;
    returnedAt: string;
    receivedBy: { userId: string; userName: string; userRole: string };
  };
}

export interface AuditEvent {
  id: string;
  documentId: string;
  trackingNumber: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  actionType: 
    | 'LEAVE_FILED'
    | 'LEAVE_APPLICATION_REGISTERED'
    | 'LEAVE_APPLICATION_UPDATED'
    | 'LEAVE_APPROVED'
    | 'LEAVE_COMPUTATION_COMPLETED'
    | 'LEAVE_SENT_FOR_SIGNATURE'
    | 'LEAVE_PLACED_ON_HOLD'
    | 'LEAVE_COMPLIANCE_RECEIVED'
    | 'LEAVE_PROCESSING_RESUMED'
    | 'LEAVE_RELEASED'
    | 'LEAVE_CANCELLED'
    | 'USER_CREATED'
    | 'USER_UPDATED'
    | 'USER_DELETED'
    | 'PASSWORD_CHANGED'
    | 'DOCUMENT_REGISTERED'
    | 'STEP_STARTED'
    | 'TASK_CLAIMED'
    | 'STEP_COMPLETED'
    | 'STEP_RETURNED'
    | 'TASK_REASSIGNED'
    | 'DOCUMENT_APPROVED'
    | 'DOCUMENT_RELEASED'
    | 'DOCUMENT_SENT_OUTSIDE_HRMDO'
    | 'DOCUMENT_RETURNED_TO_HRMDO'
    | 'REMARK_ADDED'
    | 'ATTACHMENT_UPLOADED'
    | 'WORKFLOW_CONFIG_UPDATED'
    | 'MIGRATION_VERIFIED'
    | 'PAYROLL_BATCH_CREATED'
    | 'PAYROLL_BATCH_DOCKETED'
    | 'WORKFLOW_STAGE_COMPLETED'
    | 'WORKFLOW_STAGE_ASSIGNED'
    | 'PAYROLL_ITEM_CREATED'
    | 'INITIAL_CHECK_STARTED'
    | 'EMPLOYMENT_CLASSIFICATION_SET'
    | 'BULK_CLASSIFICATION_SET'
    | 'PAYROLL_ITEM_EXCEPTION'
    | 'INITIAL_CHECK_COMPLETED'
    | 'PAYROLL_ITEM_AUTO_ROUTED'
    | 'WORK_GROUP_CREATED'
    | 'WORK_GROUP_ACCEPTED'
    | 'PAYROLL_ITEM_COMPLETED'
    | 'PAYROLL_ITEM_RETURNED'
    | 'PAYROLL_READY_FOR_RELEASE'
    | 'PAYROLL_RELEASED';
  summary: string;
  details?: string;
  stepNumber?: number;
}

export interface DocumentRecord {
  id: string;
  trackingNumber: string;
  barcode?: string;
  title: string;
  subject: string;
  sourceType: 'Internal' | 'External';
  sourceOffice: string;
  senderName: string;
  senderContact?: string;
  classification: DocumentClassification;
  documentType: string;
  employmentClassification?: 'Job Order (JOW)' | 'Regular' | 'Casual';
  priority: PriorityLevel;
  dateReceived: string;
  dateEncoded: string;
  description: string;
  status: DocumentStatus;
  holdReason?: string;
  holdRemarks?: string;
  heldAt?: string;
  heldByUserId?: string;
  heldByName?: string;
  holdPhaseNumber?: number;
  complianceRemarks?: string;
  complianceAttachments?: FileAttachment[];
  complianceSubmittedAt?: string;
  currentStepNumber: number;
  totalSteps: number;
  workflowTemplateId: string;
  workflowSteps: WorkflowStepInstance[];
  attachments: FileAttachment[];
  currentLocation?: string;
  custodyHistory?: Array<{
    id: string;
    movementType: 'INTAKE' | 'EXTERNAL_HANDOFF' | 'RETURN_TO_HRMDO' | 'FINAL_RELEASE';
    fromLocation: string;
    toLocation: string;
    timestamp: string;
    stageNumber?: number;
    purpose?: string;
    remarks?: string;
    actorId?: string;
    actorName?: string;
    representative?: string;
  }>;
  encodedBy: {
    userId: string;
    userName: string;
  };
  releasedDetails?: {
    releaseNumber: string;
    releasedAt: string;
    releasedBy: string;
    releasedTo: string;
    releaseMode: 'HRMDO Liaison' | 'External Liaison' | 'In-Person Pickup' | 'Others';
    otherReleaseMode?: string;
    receiptRemarks?: string;
  };
  isLegacyV1?: boolean;
  legacyId?: string;
  legacySource?: string;
}

export interface LeaveApplicationRecord {
  id: string;
  trackingNumber?: string;
  barcode?: string;
  legacyId?: string;
  isLegacyV1: boolean;
  employeeId: string;
  employeeName: string;
  office?: string;
  department: string;
  position: string;
  leaveType: LeaveType;
  leaveSubtype?: string | null;
  leaveDetails?: string | null;
  filingDate: string;
  startDate: string;
  endDate: string;
  dateRanges?: LeaveDateRange[];
  workingDaysNumber: number;
  totalLeaveDays?: number;
  commutation: 'Requested' | 'Not Requested';
  status: 'For_Computation' | 'For_Processing' | 'For_Signature' | 'On_Hold' | 'Released' | 'Pending' | 'Approved' | 'Disapproved' | 'Cancelled';
  createdByUserId?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  releasedAt?: string | null;
  releasedByUserId?: string;
  releasedByName?: string;
  releaseRemarks?: string;
  computationRemarks?: string;
  heldFromStatus?: 'For_Computation' | 'For_Processing' | 'For_Signature';
  holdReason?: string;
  holdRemarks?: string;
  heldAt?: string;
  heldByUserId?: string;
  heldByName?: string;
  complianceRemarks?: string;
  complianceReceivedAt?: string;
  complianceReceivedByUserId?: string;
  complianceReceivedByName?: string;
  cancelledAt?: string;
  cancelledByUserId?: string;
  cancelledByName?: string;
  cancellationReason?: string;
  approvalDate?: string;
  approvedBy?: string;
  disapprovalReason?: string;
  remarks?: string;
  v1MigrationStatus?: 'Reconciled' | 'Historical Reference';
}

export interface EwpRecord {
  id: string;
  barcode: string;
  employeeName: string;
  office: string;
  amount: number;
  purpose: string;
  remarks: string;
  status: 'Recorded';
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveDateRange {
  id?: string;
  leaveApplicationId?: string;
  startDate: string;
  endDate: string;
  dayType?: 'WHOLE_DAY' | 'AM_HALF_DAY' | 'PM_HALF_DAY';
  leaveDayUnits?: number;
  createdAt?: string;
}

export type LeaveType =
  | 'COC' | 'Vacation Leave' | 'Mandatory / Forced Leave' | 'Sick Leave' | 'Wellness Leave'
  | 'Maternity Leave' | 'Paternity Leave' | 'Special Privilege Leave' | 'Solo Parent Leave'
  | 'Study Leave' | '10-Day VAWC Leave' | 'Rehabilitation Privilege'
  | 'Special Leave Benefits for Women' | 'Special Emergency / Calamity Leave'
  | 'Adoption Leave' | 'Others' | 'Terminal Leave';

export interface ClassificationCategory {
  id: string;
  classification: DocumentClassification;
  description: string;
  types: {
    id: string;
    name: string;
    description: string;
    defaultSlaHours: number;
    isActive: boolean;
    hasSpecificWorkflow: boolean;
  }[];
}

export interface MigrationSummary {
  datasetName: string;
  priority: 'Critical' | 'High' | 'Secondary' | 'None';
  totalV1Records: number;
  successfullyMigrated: number;
  exceptionsCount: number;
  status: 'Reconciled' | 'Dry-Run Validated' | 'Not Required' | 'Skipped';
  v2Destination: string;
  lastReconciledAt: string;
}
