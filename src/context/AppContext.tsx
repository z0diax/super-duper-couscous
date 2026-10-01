import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { emptyState, loadAppState, performAction, getRevision, getReferenceData, type StateResponse, type RevisionResponse } from '../services/stateApi';
import { ApiError, uploadFiles, deleteUnattachedUpload } from '../services/http';
import { invalidateResource, type OperationalResource } from '../services/resourceInvalidation';
import { getSession, login as authenticate, logout as endSession } from '../services/authApi';
import { createId } from '../services/id';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';
import type { UserAccount, DocumentRecord, PayrollBatch, WorkflowTemplate, AssigneeDesignation, SystemRoleDefinition, MigrationSummary, LeaveApplicationRecord } from '../types';

const EMPTY_USER: UserAccount = { id: '', name: '', email: '', role: '', roleTitle: '', office: '', division: '', position: '', avatarInitials: '' };
type Tab = 'dashboard' | 'queues' | 'payroll' | 'registry' | 'leave' | 'workflows' | 'catalogue' | 'migration' | 'audit' | 'users';
type Toast = { id: string; type: 'success' | 'info' | 'warning' | 'error'; title: string; message: string };
type WorkspaceLocation = { activeTab: Tab; documentId: string | null; targetedDocumentId?: string | null; batchId: string | null; workGroupId: string | null };
const TABS: Tab[] = ['dashboard','queues','payroll','registry','leave','workflows','catalogue','migration','audit','users'];
const lightweightSync=import.meta.env.VITE_LIGHTWEIGHT_STATE_SYNC==='1';
const sameUser=(first:UserAccount,second:UserAccount)=>JSON.stringify(first)===JSON.stringify(second);
const includesFile=(value:unknown):boolean=>value instanceof File || Array.isArray(value)&&value.some(includesFile) || !!value&&typeof value==='object'&&Object.values(value).some(includesFile);
const affectedResources=(action:string):OperationalResource[]=>{
  if(action.includes('Ewp'))return ['ewp'];
  if(action.includes('Leave'))return ['leave'];
  if(action==='registerSinglePayroll')return ['document','payroll'];
  if(action.includes('Payroll')||action.includes('WorkGroup')||action.includes('InitialChecking')||action.includes('EmploymentRouting'))return ['payroll'];
  return ['document'];
};

function useApplication() {
  const [state, setState] = useState(emptyState);
  const [currentUser, setCurrentUser] = useState(EMPTY_USER);
  const [authReady, setAuthReady] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [stateRevision, setStateRevision] = useState(-1);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [syncError,setSyncError]=useState<string|null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [targetedDocumentId, setTargetedDocumentId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [targetedPayrollBatch,setTargetedPayrollBatch]=useState<PayrollBatch|null>(null);
  const [selectedWorkGroupId, setSelectedWorkGroupId] = useState<string | null>(null);
  const [workspaceRestoredForUser, setWorkspaceRestoredForUser] = useState('');
  const revision = useRef(-1);
  const configRevision=useRef(-1);
  const syncPending=useRef<{generation:number;promise:Promise<RevisionResponse>}|null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const sessionGeneration = useRef(0);
  const isAuthenticated = currentUser.id !== '';
  const showToast = useCallback((type: Toast['type'], title: string, message: string) => setToast({ id: createId(), type, title, message }), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  const accept = useCallback((payload: StateResponse) => {
    if (!mounted.current || payload.revision < revision.current) return;
    revision.current = payload.revision;configRevision.current=payload.configRevision;setStateRevision(payload.revision); setState(payload.state); setDatabaseError(null); setDatabaseReady(true);setSyncError(null);
    setCurrentUser(user => payload.state.users.find(u => u.id === user.id) || user);
  }, []);
  const refreshState = useCallback(async () => {
    const generation = sessionGeneration.current;
    try { const payload = await loadAppState(); if (generation === sessionGeneration.current) accept(payload); }
    catch (error) {
      if (generation !== sessionGeneration.current) return;
      if (error instanceof ApiError && error.status === 401) { sessionGeneration.current++;setCurrentUser(EMPTY_USER); setState(emptyState); setDatabaseReady(false); }
      else { setDatabaseError(error instanceof Error ? error.message : 'Database unavailable.'); setDatabaseReady(true); }
    }
  }, [accept]);
  const refreshReferenceData=useCallback(async()=>{
    const generation=sessionGeneration.current;
    const payload=await getReferenceData();
    if(generation!==sessionGeneration.current||!mounted.current)return;
    if(payload.configRevision>=configRevision.current){
      configRevision.current=payload.configRevision;
      setState(previous=>({...previous,...payload.data}));
      setCurrentUser(previous=>sameUser(previous,payload.user)?previous:payload.user);
    }
  },[]);
  const syncRevision=useCallback(async():Promise<RevisionResponse>=>{
    const generation=sessionGeneration.current;
    if(syncPending.current?.generation===generation)return syncPending.current.promise;
    const pending=getRevision().then(async payload=>{
      if(generation!==sessionGeneration.current||!mounted.current)return payload;
      revision.current=Math.max(revision.current,payload.revision);
      setCurrentUser(previous=>sameUser(previous,payload.user)?previous:payload.user);
      if(payload.configRevision>configRevision.current)await refreshReferenceData();
      setSyncError(null);
      return payload;
    }).catch(error=>{
      if(generation===sessionGeneration.current){
        if(error instanceof ApiError&&error.status===401){sessionGeneration.current++;setCurrentUser(EMPTY_USER);setState(emptyState);setDatabaseReady(false);}
        else setSyncError('Live synchronization is unavailable. Changes will be checked before they are saved.');
      }
      throw error;
    }).finally(()=>{if(syncPending.current?.promise===pending)syncPending.current=null;});
    syncPending.current={generation,promise:pending};return pending;
  },[refreshReferenceData]);
  useEffect(() => {
    mounted.current = true;
    getSession().then(user => { if (mounted.current && user) { setCurrentUser(user); window.dispatchEvent(new CustomEvent('hrmdo:auth-changed',{detail:{userId:user.id}})); } })
      .catch(error => setDatabaseError(error.message)).finally(() => setAuthReady(true));
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if(isAuthenticated)void refreshState(); },[isAuthenticated,refreshState]);
  useEffect(() => {
    if (!isAuthenticated||!databaseReady) return;
    // Keep assigned queues and notification counts current without requiring
    // the user to reload the page. The API remains the source of truth, while
    // focus/online events provide an immediate refresh after returning to the app.
    const update=()=>{if(!busy.current&&document.visibilityState==='visible')void (lightweightSync?syncRevision():refreshState()).catch(()=>{});};
    const timer = setInterval(update, 5000);
    const refreshWhenActive = () => update();
    window.addEventListener('focus', refreshWhenActive);
    window.addEventListener('online', refreshWhenActive);
    document.addEventListener('visibilitychange',refreshWhenActive);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshWhenActive);
      window.removeEventListener('online', refreshWhenActive);
      document.removeEventListener('visibilitychange',refreshWhenActive);
    };
  }, [isAuthenticated,databaseReady, refreshState,syncRevision]);
  useEffect(() => {
    if (!currentUser.id) { setWorkspaceRestoredForUser(''); return; }
    if (workspaceRestoredForUser === currentUser.id) return;
    const saved = readWorkspaceValue<WorkspaceLocation>(currentUser.id, 'location', { activeTab: 'dashboard', documentId: null, batchId: null, workGroupId: null });
    setActiveTab(TABS.includes(saved.activeTab) ? saved.activeTab : 'dashboard');
    setDocumentId(saved.documentId || null); setTargetedDocumentId(import.meta.env.VITE_DOCUMENT_DETAIL_TARGETED_READS === '1' ? saved.targetedDocumentId || null : null); setBatchId(saved.batchId || null); setSelectedWorkGroupId(saved.workGroupId || null);
    setWorkspaceRestoredForUser(currentUser.id);
  }, [currentUser.id, workspaceRestoredForUser]);
  useEffect(() => {
    if (!currentUser.id || workspaceRestoredForUser !== currentUser.id) return;
    writeWorkspaceValue<WorkspaceLocation>(currentUser.id, 'location', { activeTab, documentId, targetedDocumentId, batchId, workGroupId: selectedWorkGroupId });
  }, [currentUser.id, workspaceRestoredForUser, activeTab, documentId, targetedDocumentId, batchId, selectedWorkGroupId]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (busy.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const login = async (identifier: string, password: string) => {
    const user = await authenticate(identifier, password); sessionGeneration.current++; revision.current = -1;configRevision.current=-1;setSyncError(null); setState(emptyState); setDocumentId(null); setTargetedDocumentId(null); setTargetedPayrollBatch(null); setDatabaseReady(false); setDatabaseError(null); setCurrentUser(user); window.dispatchEvent(new CustomEvent('hrmdo:auth-changed',{detail:{userId:user.id}}));
  };
  const logout = async () => {
    if (busy.current) return;
    try { await endSession(); sessionGeneration.current++; setCurrentUser(EMPTY_USER); setState(emptyState); setDocumentId(null); setTargetedDocumentId(null); setTargetedPayrollBatch(null); setBatchId(null); setSelectedWorkGroupId(null); setActiveTab('dashboard'); setDatabaseReady(false); revision.current = -1;configRevision.current=-1;setSyncError(null); window.dispatchEvent(new CustomEvent('hrmdo:auth-changed',{detail:{userId:null}})); }
    catch (error) { showToast('error', 'Sign out failed', error.message); }
  };
  async function prepare(value: any,uploadedIds:string[]): Promise<any> {
    if (value instanceof File) {const uploaded=(await uploadFiles([value]))[0];uploadedIds.push(uploaded.id);return uploaded;}
    if (Array.isArray(value)) { const result = []; for (const entry of value) result.push(await prepare(entry,uploadedIds)); return result; }
    if (value && typeof value === 'object') { const result = {}; for (const [key, entry] of Object.entries(value)) result[key] = await prepare(entry,uploadedIds); return result; }
    return value;
  }
  const operation = <T = boolean,>(action: string) => async (...args: any[]): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true; setIsSaving(true);
    const uploadedIds:string[]=[];
    let submitted=false;
    try {
      if(lightweightSync&&includesFile(args)){
        const prior=revision.current;const latest=await syncRevision();
        if(latest.revision!==prior){affectedResources(action).forEach(invalidateResource);showToast('warning','Review the latest record','Records changed before your file was uploaded. Review and submit again.');return null;}
      }
      const prepared=await prepare(args,uploadedIds);
      submitted=true;
      const payload = await performAction(action, prepared, revision.current);
      accept(payload); showToast('success', 'Saved', 'The database has confirmed your changes.'); return payload.result as T;
    } catch (error) {
      if(uploadedIds.length&&(!submitted||error instanceof ApiError))await Promise.allSettled(uploadedIds.map(deleteUnattachedUpload));
      if(error instanceof ApiError&&error.status===409&&lightweightSync){
        try{await syncRevision();}catch{/* The alert below keeps the action uncommitted. */}
        affectedResources(action).forEach(invalidateResource);
        showToast('warning','Review the latest record','The record changed or cannot be saved in its current state. Review the refreshed record and submit again.');
      }else{
        showToast('error', 'Changes were not saved', error instanceof Error ? error.message : 'Please try again.');
        if (error instanceof ApiError && [401, 409].includes(error.status)&&!lightweightSync) await refreshState();
      }
      return null;
    } finally { busy.current = false; setIsSaving(false); }
  };
  const can = (cap: string) => currentUser.role === 'admin' || !!state.systemRoles.find(r => r.id === currentUser.role)?.[cap] || !!state.systemRoles.find(r => r.id === currentUser.role)?.canAdmin;
  return {
    ...state, currentUser, authReady, isAuthenticated, databaseReady, databaseError, syncError, stateRevision, isSaving, login, logout, refreshState, retrySync:syncRevision, can,
    activeTab, setActiveTab, quickSearchQuery, setQuickSearchQuery, toast, showToast, clearToast: () => setToast(null),
    selectedDocument: state.documents.find(d => d.id === documentId) || null,
    targetedDocumentId,
    openTargetedDocument: (id: string) => { setDocumentId(id); setTargetedDocumentId(id); },
    setSelectedDocument: (doc: DocumentRecord | null) => { setTargetedDocumentId(null); setDocumentId(doc?.id || null); },
    selectedPayrollBatch: import.meta.env.VITE_PAYROLL_TARGETED_READS==='1' && targetedPayrollBatch?.id===batchId?targetedPayrollBatch:state.payrollBatches.find(b => b.id === batchId) || null,
    setSelectedPayrollBatch: (batch: PayrollBatch | null) => setBatchId(batch?.id || null),
    selectedWorkGroupId, setSelectedWorkGroupId, isBatchModalOpen: !!batchId,
    openBatchModal: (batch: PayrollBatch, groupId?: string) => { setBatchId(batch.id);if(import.meta.env.VITE_PAYROLL_TARGETED_READS==='1')setTargetedPayrollBatch(batch); setSelectedWorkGroupId(groupId || null); },
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
    fileLeaveApplication: operation('fileLeaveApplication'), registerEwpRecord: operation('registerEwpRecord'), updateEwpRecord: operation('updateEwpRecord'), deleteEwpRecord: operation('deleteEwpRecord'), updateLeaveApplication: operation('updateLeaveApplication'), deleteLeaveApplication: operation('deleteLeaveApplication'),
    completeLeaveComputation: operation<LeaveApplicationRecord>('completeLeaveComputation'), sendLeaveForSignature: operation<LeaveApplicationRecord>('sendLeaveForSignature'), releaseLeaveApplication: operation<LeaveApplicationRecord>('releaseLeaveApplication'),
    placeLeaveOnHold: operation<LeaveApplicationRecord>('placeLeaveOnHold'), recordLeaveCompliance: operation<LeaveApplicationRecord>('recordLeaveCompliance'), resumeLeaveProcessing: operation<LeaveApplicationRecord>('resumeLeaveProcessing'), cancelLeaveApplication: operation<LeaveApplicationRecord>('cancelLeaveApplication'),
    changeLeaveApplicationStatus: operation<LeaveApplicationRecord>('changeLeaveApplicationStatus'),
    approveLeaveApplication: operation('approveLeaveApplication'), runMigrationCheck: operation<MigrationSummary>('runMigrationCheck'),
  };
}
const AppContext = createContext<ReturnType<typeof useApplication> | undefined>(undefined);
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <AppContext.Provider value={useApplication()}>{children}</AppContext.Provider>;
export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('AppProvider is required.'); return context; }
