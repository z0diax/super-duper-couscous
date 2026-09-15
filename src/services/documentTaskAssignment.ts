import { DocumentRecord, UserAccount, WorkflowStepInstance } from '../types';

type Assignment = WorkflowStepInstance['assignedTo'] | NonNullable<WorkflowStepInstance['returnReceiver']>;

export const assignmentMatchesUser = (assignment: Assignment | undefined, user: UserAccount, includeTeam = false) => {
  if (!assignment) return false;
  if (assignment.userId) return assignment.userId === user.id;
  if (assignment.type === 'Role') return assignment.role === user.role;
  return includeTeam && assignment.type === 'Team' && !!assignment.team && [user.division, user.office].includes(assignment.team);
};

export const currentDocumentStep = (document: DocumentRecord) =>
  document.workflowSteps.find(step => step.stepNumber === document.currentStepNumber);

export const isDocumentActionableForUser = (document: DocumentRecord, user: UserAccount, includeTeam = false) => {
  if (['Released', 'Archived', 'Disapproved'].includes(document.status)) return false;
  const step = currentDocumentStep(document);
  if (!step) return false;

  if (step.stageType !== 'EXTERNAL_HANDOFF_REVIEW') {
    return assignmentMatchesUser(step.assignedTo, user, includeTeam);
  }

  if (step.externalStatus === 'PENDING_HANDOFF') {
    return step.handoffOwner?.userId === user.id;
  }

  if (step.externalStatus === 'OUTSIDE_HRMDO') {
    return assignmentMatchesUser(step.returnReceiver, user, includeTeam);
  }

  return false;
};
