import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { emptyState, loadAppState, performAction, type StateResponse } from '../services/stateApi';
import { ApiError, uploadFiles } from '../services/http';
import { getSession, login as authenticate, logout as endSession } from '../services/authApi';
import { createId } from '../services/id';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';
import type { UserAccount, DocumentRecord, PayrollBatch, WorkflowTemplate, AssigneeDesignation, SystemRoleDefinition, MigrationSummary, LeaveApplicationRecord } from '../types';

const EMPTY_USER: UserAccount = { id: '', name: '', email: '', role: '', roleTitle: '', office: '', division: '', position: '', avatarInitials: '' };
type Tab = 'dashboard' | 'queues' | 'payroll' | 'registry' | 'leave' | 'workflows' | 'catalogue' | 'migration' | 'audit' | 'users';
type Toast = { id: string; type: 'success' | 'info' | 'warning' | 'error'; title: string; message: string };
type WorkspaceLocation = { activeTab: Tab; documentId: string | null; batchId: string | null; workGroupId: string | null };
const TABS: Tab[] = ['dashboard','queues','payroll','registry','leave','workflows','catalogue','migration','audit','users'];

function useApplication() {
  const [state, setState] = useState(emptyState);
  const [currentUser, setCurrentUser] = useState(EMPTY_USER);
  const [authReady, setAuthReady] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [selectedWorkGroupId, setSelectedWorkGroupId] = useState<string | null>(null);
  const [workspaceRestoredForUser, setWorkspaceRestoredForUser] = useState('');
  const revision = useRef(-1);
  const busy = useRef(false);
  const mounted = useRef(true);
  const sessionGeneration = useRef(0);
  const isAuthenticated = currentUser.id !== '';
  const showToast = useCallback((type: Toast['type'], title: string, message: string) => setToast({ id: createId(), type, title, message }), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  const accept = useCallback((payload: StateResponse) => {
    if (!mounted.current || payload.revision < revision.current) return;
    revision.current = payload.revision; setState(payload.state); setDatabaseError(null); setDatabaseReady(true);
    setCurrentUser(user => payload.state.users.find(u => u.id === user.id) || user);
  }, []);
  const refreshState = useCallback(async () => {
    const generation = sessionGeneration.current;
    try { const payload = await loadAppState(); if (generation === sessionGeneration.current) accept(payload); }
    catch (error) {
      if (generation !== sessionGeneration.current) return;
      if (error instanceof ApiError && error.status === 401) { setCurrentUser(EMPTY_USER); setState(emptyState); setDatabaseReady(false); }
      else { setDatabaseError(error instanceof Error ? error.message : 'Database unavailable.'); setDatabaseReady(true); }
    }
  }, [accept]);
  useEffect(() => {
    mounted.current = true;
    getSession().then(user => { if (mounted.current && user) setCurrentUser(user); })
      .catch(error => setDatabaseError(error.message)).finally(() => setAuthReady(true));
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshState();
    const timer = setInterval(() => { if (!busy.current && document.visibilityState === 'visible') void refreshState(); }, 30000);
    return () => clearInterval(timer);
  }, [isAuthenticated, refreshState]);
  useEffect(() => {
    if (!currentUser.id) { setWorkspaceRestoredForUser(''); return; }
    if (workspaceRestoredForUser === currentUser.id) return;
    const saved = readWorkspaceValue<WorkspaceLocation>(currentUser.id, 'location', { activeTab: 'dashboard', documentId: null, batchId: null, workGroupId: null });
    setActiveTab(TABS.includes(saved.activeTab) ? saved.activeTab : 'dashboard');
    setDocumentId(saved.documentId || null); setBatchId(saved.batchId || null); setSelectedWorkGroupId(saved.workGroupId || null);
    setWorkspaceRestoredForUser(currentUser.id);
  }, [currentUser.id, workspaceRestoredForUser]);
  useEffect(() => {
    if (!currentUser.id || workspaceRestoredForUser !== currentUser.id) return;
    writeWorkspaceValue<WorkspaceLocation>(currentUser.id, 'location', { activeTab, documentId, batchId, workGroupId: selectedWorkGroupId });
  }, [currentUser.id, workspaceRestoredForUser, activeTab, documentId, batchId, selectedWorkGroupId]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (busy.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const login = async (email: string, password: string) => {
    const user = await authenticate(email, password); sessionGeneration.current++; revision.current = -1; setState(emptyState); setDatabaseReady(false); setDatabaseError(null); setCurrentUser(user);
  };
  const logout = async () => {
    if (busy.current) return;
    try { await endSession(); sessionGeneration.current++; setCurrentUser(EMPTY_USER); setState(emptyState); setDocumentId(null); setBatchId(null); setSelectedWorkGroupId(null); setActiveTab('dashboard'); setDatabaseReady(false); revision.current = -1; }
    catch (error) { showToast('error', 'Sign out failed', error.message); }
  };
  async function prepare(value: any): Promise<any> {
    if (value instanceof File) return (await uploadFiles([value]))[0];
    if (Array.isArray(value)) { const result = []; for (const entry of value) result.push(await prepare(entry)); return result; }
    if (value && typeof value === 'object') { const result = {}; for (const [key, entry] of Object.entries(value)) result[key] = await prepare(entry); return result; }
    return value;
  }
  const operation = <T = boolean,>(action: string) => async (...args: any[]): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true; setIsSaving(true);
    try {
      const payload = await performAction(action, await prepare(args), revision.current);
      accept(payload); showToast('success', 'Saved', 'The database has confirmed your changes.'); return payload.result as T;
    } catch (error) {
      showToast('error', 'Changes were not saved', error instanceof Error ? error.message : 'Please try again.');
      if (error instanceof ApiError && [401, 409].includes(error.status)) await refreshState();
      return null;
    } finally { busy.current = false; setIsSaving(false); }
  };
  const can = (cap: string) => currentUser.role === 'admin' || !!state.systemRoles.find(r => r.id === currentUser.role)?.[cap] || !!state.systemRoles.find(r => r.id === currentUser.role)?.canAdmin;
  return {
    ...state, currentUser, authReady, isAuthenticated, databaseReady, databaseError, isSaving, login, logout, refreshState, can,
    activeTab, setActiveTab, quickSearchQuery, setQuickSearchQuery, toast, showToast, clearToast: () => setToast(null),
    selectedDocument: state.documents.find(d => d.id === documentId) || null,
    setSelectedDocument: (doc: DocumentRecord | null) => setDocumentId(doc?.id || null),
    selectedPayrollBatch: state.payrollBatches.find(b => b.id === batchId) || null,
    setSelectedPayrollBatch: (batch: PayrollBatch | null) => setBatchId(batch?.id || null),
    selectedWorkGroupId, setSelectedWorkGroupId, isBatchModalOpen: !!batchId,
    openBatchModal: (batch: PayrollBatch, groupId?: string) => { setBatchId(batch.id); setSelectedWorkGroupId(groupId || null); },
    closeBatchModal: () => { setBatchId(null); setSelectedWorkGroupId(null); },
    registerDocument: operation<DocumentRecord>('registerDocument'), deleteDocument: operation('deleteDocument'), registerSinglePayroll: operation<DocumentRecord>('registerSinglePayroll'),
    registerPayrollBatch: operation<PayrollBatch>('registerPayrollBatch'), updatePayrollBatch: operation<PayrollBatch>('updatePayrollBatch'), deletePayrollBatch: operation('deletePayrollBatch'),
    claimTask: operation('claimTask'), completeStep: operation('completeStep'), returnStep: operation('returnStep'), reassignTask: operation('reassignTask'), placeDocumentHold: operation('placeDocumentHold'), submitDocumentCompliance: operation('submitDocumentCompliance'), recheckDocumentHold: operation('recheckDocumentHold'),
    approveDocument: operation('approveDocument'), releaseDocument: operation('releaseDocument'), recordExternalHandoff: operation('recordExternalHandoff'), recordExternalReturn: operation('recordExternalReturn'), addDocumentRemark: operation('addDocumentRemark'), uploadSupportingFile: operation('uploadSupportingFile'),
    updatePayrollItemClassification: operation('updatePayrollItemClassification'), bulkClassifyPayrollItems: operation('bulkClassifyPayrollItems'), markPayrollItemException: operation('markPayrollItemException'), clearPayrollItemException: operation('clearPayrollItemException'), recordPayrollItemCompliance: operation('recordPayrollItemCompliance'), recheckPayrollItem: operation('recheckPayrollItem'), placePayrollItemHold: operation('placePayrollItemHold'), submitPayrollItemCompliance: operation('submitPayrollItemCompliance'), resumePayrollItemHold: operation('resumePayrollItemHold'), completeInitialCheckingAndRoute: operation('completeInitialCheckingAndRoute'), completePayrollItemInitialCheckingAndRoute: operation('completePayrollItemInitialCheckingAndRoute'), processWorkGroupItems: operation('processWorkGroupItems'), releasePayrollBatch: operation('releasePayrollBatch'), updateEmploymentRoutingRule: operation('updateEmploymentRoutingRule'),
    toggleClassificationType: operation('toggleClassificationType'), addClassificationType: operation('addClassificationType'), updateClassificationType: operation('updateClassificationType'), deleteClassificationType: operation('deleteClassificationType'),
    createWorkflowTemplate: operation<WorkflowTemplate>('createWorkflowTemplate'), updateWorkflowTemplate: operation('updateWorkflowTemplate'), deleteWorkflowTemplate: operation('deleteWorkflowTemplate'),
    addAssigneeDesignation: operation<AssigneeDesignation>('addAssigneeDesignation'), updateAssigneeDesignation: operation('updateAssigneeDesignation'), deleteAssigneeDesignation: operation('deleteAssigneeDesignation'), resetAssigneeDesignations: operation('resetAssigneeDesignations'),
    addSystemRole: operation<SystemRoleDefinition>('addSystemRole'), updateSystemRole: operation<SystemRoleDefinition>('updateSystemRole'), deleteSystemRole: operation('deleteSystemRole'), resetSystemRoles: operation('resetSystemRoles'),
    addUser: operation<UserAccount>('addUser'), updateUser: operation('updateUser'), deleteUser: operation('deleteUser'), changePassword: operation('changePassword'),
    fileLeaveApplication: operation('fileLeaveApplication'), updateLeaveApplication: operation('updateLeaveApplication'),
    completeLeaveComputation: operation<LeaveApplicationRecord>('completeLeaveComputation'), sendLeaveForSignature: operation<LeaveApplicationRecord>('sendLeaveForSignature'), releaseLeaveApplication: operation<LeaveApplicationRecord>('releaseLeaveApplication'),
    placeLeaveOnHold: operation<LeaveApplicationRecord>('placeLeaveOnHold'), recordLeaveCompliance: operation<LeaveApplicationRecord>('recordLeaveCompliance'), resumeLeaveProcessing: operation<LeaveApplicationRecord>('resumeLeaveProcessing'), cancelLeaveApplication: operation<LeaveApplicationRecord>('cancelLeaveApplication'),
    approveLeaveApplication: operation('approveLeaveApplication'), runMigrationCheck: operation<MigrationSummary>('runMigrationCheck'),
  };
}
const AppContext = createContext<ReturnType<typeof useApplication> | undefined>(undefined);
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <AppContext.Provider value={useApplication()}>{children}</AppContext.Provider>;
export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('AppProvider is required.'); return context; }
