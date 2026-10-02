import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Toast } from './components/Toast';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MyTasksQueue } from './components/MyTasksQueue';
import { DocumentRegistry } from './components/DocumentRegistry';
import { RegisterDocumentModal } from './components/RegisterDocumentModal';
import { DocumentDetailModal } from './components/DocumentDetailModal';
import { LeaveContinuity } from './components/LeaveContinuity';
import { WorkflowManager } from './components/WorkflowManager';
import { ClassificationCatalogue } from './components/ClassificationCatalogue';
import { V1MigrationPanel } from './components/V1MigrationPanel';
import { AuditReportView } from './components/AuditReportView';
import { UsersDashboard } from './components/UsersDashboard';
import { PayrollManagement } from './components/PayrollManagement';
import { RegisterPayrollModal } from './components/RegisterPayrollModal';
import { PayrollBatchDetailModal } from './components/PayrollBatchDetailModal';
import { LoginPortal } from './components/LoginPortal';
import { AppLoader } from './components/AppLoader';
import { useWorkspaceState } from './services/workspace';
import { ThemeEffects } from './theme/ThemeEffects';
import { useDocumentShellSummary } from './services/useDocumentShellSummary';
import { usePayrollShellSummary } from './services/usePayrollShellSummary';

const INITIAL_LOADER_KEY = 'hrmdo.initial-loader-shown';

const MainLayout: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab,
    authReady,
    isAuthenticated,
    databaseReady,
    databaseError,syncError,retrySync,
    isSaving, can, refreshState, workflowTemplates,
    users,
    currentUser,
    stateRevision,
    selectedPayrollBatch, 
    isBatchModalOpen, 
    closeBatchModal, 
    selectedWorkGroupId 
  } = useApp();
  const documentShell=useDocumentShellSummary(currentUser.id,stateRevision);
  const payrollShell=usePayrollShellSummary(currentUser.id,stateRevision);
  const [initialDisplayComplete, setInitialDisplayComplete] = useState(() => {
    try { return sessionStorage.getItem(INITIAL_LOADER_KEY) === '1'; }
    catch { return false; }
  });
  const [initialDelayElapsed, setInitialDelayElapsed] = useState(false);
  const [initialDisplayExiting, setInitialDisplayExiting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useWorkspaceState(currentUser.id, 'modal.register-document', false);
  const [isRegisterPayrollModalOpen, setIsRegisterPayrollModalOpen] = useWorkspaceState(currentUser.id, 'modal.register-payroll', false);
  const operationTabs = currentUser.role === 'admin' ? ['dashboard','queues','payroll','registry','leave'] : currentUser.sidebarModules || ['dashboard','queues','payroll','registry','leave'];
  const canViewLeaveTab = operationTabs.includes('leave');
  const canRegisterDocument = currentUser.role === 'admin' || operationTabs.includes('registry');
  const canRegisterPayroll = currentUser.role === 'admin' || operationTabs.includes('payroll');
  const canViewRegistry = currentUser.role === 'admin' || operationTabs.includes('registry');
  const canViewAudit = currentUser.role === 'admin' || can('canSupervise');

  React.useEffect(() => {
    if (initialDisplayComplete) return;
    try { sessionStorage.setItem(INITIAL_LOADER_KEY, '1'); }
    catch { /* The loader still works when storage is unavailable. */ }
    const timer = window.setTimeout(() => setInitialDelayElapsed(true), 5000);
    return () => window.clearTimeout(timer);
  }, [initialDisplayComplete]);

  React.useEffect(() => {
    if (initialDisplayComplete || !initialDelayElapsed || !authReady || (isAuthenticated && !databaseReady)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInitialDisplayComplete(true);
      return;
    }
    setInitialDisplayExiting(true);
    const timer = window.setTimeout(() => setInitialDisplayComplete(true), 360);
    return () => window.clearTimeout(timer);
  }, [initialDisplayComplete, initialDelayElapsed, authReady, isAuthenticated, databaseReady]);

  React.useEffect(() => {
    if (!initialDisplayComplete || !initialDisplayExiting) return;
    const timer = window.setTimeout(() => setInitialDisplayExiting(false), 320);
    return () => window.clearTimeout(timer);
  }, [initialDisplayComplete, initialDisplayExiting]);

  React.useEffect(() => {
    if (!canRegisterDocument) setIsRegisterModalOpen(false);
    if (!canRegisterPayroll) setIsRegisterPayrollModalOpen(false);
  }, [canRegisterDocument, canRegisterPayroll, setIsRegisterModalOpen, setIsRegisterPayrollModalOpen]);

  React.useEffect(() => {
    const privilegedTab = ['workflows','catalogue','users','migration'].includes(activeTab) && can('canAdmin');
    const complianceTab = activeTab === 'audit' && (can('canAdmin') || can('canSupervise'));
    if (!privilegedTab && !complianceTab && !operationTabs.includes(activeTab)) setActiveTab((operationTabs[0] || 'leave') as typeof activeTab);
  }, [activeTab, currentUser.id, currentUser.sidebarModules, can, setActiveTab]);

  if (!initialDisplayComplete && !(authReady && isAuthenticated && databaseReady && (databaseError || users.length === 0))) {
    return <AppLoader exiting={initialDisplayExiting} message={!authReady ? 'Checking your login session...' : isAuthenticated && !databaseReady ? 'Connecting to the application database...' : 'Opening Records Management System...'} />;
  }

  if (!authReady) {
    return <AppLoader message="Checking your login session..." />;
  }

  if (!isAuthenticated) {
    return <div className={initialDisplayExiting ? 'app-startup-reveal' : undefined}><LoginPortal /></div>;
  }

  if (!databaseReady) {
    return <AppLoader message="Connecting to the application database..." />;
  }

  if (databaseError) {
    return <StartupMessage title="Database connection required" message={databaseError} onRetry={refreshState} />;
  }

  if (users.length === 0) {
    return (
      <StartupMessage
        title="Application setup required"
        message="The database is connected, but no user accounts are configured. Add the first administrator account to the application state before signing in."
      />
    );
  }

  return (
    <div className={`relative isolate min-h-screen bg-slate-100 text-slate-900 flex font-sans selection:bg-blue-600 selection:text-white${initialDisplayExiting ? ' app-startup-reveal' : ''}`}>
      <ThemeEffects />
      {/* Toast Notification Container */}
      <Toast />
      {isSaving && <div role="status" aria-live="polite" className="app-saving-overlay fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-slate-900/20"><div className="max-w-full rounded-xl bg-white px-6 py-4 text-center font-semibold shadow-xl">Saving changes…</div></div>}

      {/* Left Navigation Sidebar */}
      <Sidebar
        documentShell={documentShell}
        payrollShell={payrollShell}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenRegisterModal={() => { if (canRegisterDocument) setIsRegisterModalOpen(true); }}
        onOpenPayrollModal={() => { if (canRegisterPayroll) setIsRegisterPayrollModalOpen(true); }}
      />

      {/* Main Content Area (offset by sidebar width on desktop) */}
      <div className="relative z-10 flex min-h-screen w-full flex-1 flex-col transition-all duration-200 lg:pl-64 xl:pl-72">
        
        {/* Top Header */}
        <Header 
          documentShell={documentShell}
          payrollShell={payrollShell}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenRegisterModal={() => { if (canRegisterDocument) setIsRegisterModalOpen(true); }}
          onOpenPayrollModal={() => { if (canRegisterPayroll) setIsRegisterPayrollModalOpen(true); }}
        />

        {/* Dynamic Main Body Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {syncError&&<div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{syncError} <button type="button" className="font-semibold underline" onClick={()=>void retrySync().catch(()=>{})}>Retry sync</button></div>}
          {can('canAdmin') && !workflowTemplates.some(w => w.isActive) && <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">Before registering documents, configure your users, review the classification catalogue, and create active workflows. Payroll batches also require employment routing rules.</div>}
          {activeTab === 'dashboard' && (
            <Dashboard onOpenRegisterModal={() => { if (canRegisterDocument) setIsRegisterModalOpen(true); }} canRegisterDocument={canRegisterDocument} canViewRegistry={canViewRegistry} canViewLeave={canViewLeaveTab} canViewAudit={canViewAudit} />
          )}

          {activeTab === 'queues' && (
            <MyTasksQueue />
          )}

          {activeTab === 'payroll' && (
            <PayrollManagement onOpenRegisterBatchModal={() => { if (canRegisterPayroll) setIsRegisterPayrollModalOpen(true); }} />
          )}

          {activeTab === 'registry' && (
            <DocumentRegistry onOpenRegisterModal={() => { if (canRegisterDocument) setIsRegisterModalOpen(true); }} />
          )}

          {activeTab === 'leave' && canViewLeaveTab && (
            <LeaveContinuity />
          )}

          {activeTab === 'workflows' && can('canAdmin') && (
            <WorkflowManager />
          )}

          {activeTab === 'catalogue' && can('canAdmin') && (
            <ClassificationCatalogue />
          )}

          {activeTab === 'migration' && can('canAdmin') && (
            <V1MigrationPanel />
          )}

          {activeTab === 'audit' && (can('canAdmin') || can('canSupervise')) && (
            <AuditReportView />
          )}

          {activeTab === 'users' && can('canAdmin') && (
            <UsersDashboard />
          )}
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-3 sm:flex-row sm:px-6 lg:px-8">
            <span>
              Human Resource Management and Development Office (HRMDO) &bull; Records Management System
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Database connected
            </span>
          </div>
        </footer>

      </div>

      {/* Global Modals */}
      <RegisterDocumentModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSwitchToPayroll={() => setIsRegisterPayrollModalOpen(true)}
      />

      <DocumentDetailModal />

      <RegisterPayrollModal
        isOpen={isRegisterPayrollModalOpen}
        onClose={() => setIsRegisterPayrollModalOpen(false)}
      />

      <PayrollBatchDetailModal
        batch={selectedPayrollBatch}
        isOpen={isBatchModalOpen}
        onClose={closeBatchModal}
        initialWorkGroupId={selectedWorkGroupId}
      />
    </div>
  );
};

const StartupMessage: React.FC<{ title: string; message?: string; onRetry?: () => void }> = ({ title, message, onRetry }) => (
  <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
    <section className="max-w-lg w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {message && <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>}
      {onRetry && <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={onRetry}>Reconnect</button>}
    </section>
  </main>
);

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
