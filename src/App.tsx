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
import { useWorkspaceState } from './services/workspace';

const MainLayout: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab,
    authReady,
    isAuthenticated,
    databaseReady,
    databaseError,
    isSaving, can, refreshState, workflowTemplates,
    users,
    currentUser,
    selectedPayrollBatch, 
    isBatchModalOpen, 
    closeBatchModal, 
    selectedWorkGroupId 
  } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useWorkspaceState(currentUser.id, 'modal.register-document', false);
  const [isRegisterPayrollModalOpen, setIsRegisterPayrollModalOpen] = useWorkspaceState(currentUser.id, 'modal.register-payroll', false);
  const operationTabs = currentUser.role === 'admin' ? ['dashboard','queues','payroll','registry','leave'] : currentUser.sidebarModules || ['dashboard','queues','payroll','registry','leave'];
  const canViewLeaveTab = operationTabs.includes('leave');

  React.useEffect(() => {
    const privilegedTab = ['workflows','catalogue','users','migration'].includes(activeTab) && can('canAdmin');
    const complianceTab = activeTab === 'audit' && (can('canAdmin') || can('canSupervise'));
    if (!privilegedTab && !complianceTab && !operationTabs.includes(activeTab)) setActiveTab((operationTabs[0] || 'leave') as typeof activeTab);
  }, [activeTab, currentUser.id, currentUser.sidebarModules, can, setActiveTab]);

  if (!authReady) {
    return <StartupMessage title="Checking your login session..." />;
  }

  if (!isAuthenticated) {
    return <LoginPortal />;
  }

  if (!databaseReady) {
    return <StartupMessage title="Connecting to the application database..." />;
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
    <div className="min-h-screen bg-slate-100 text-slate-900 flex font-sans selection:bg-blue-600 selection:text-white">
      {/* Toast Notification Container */}
      <Toast />
      {isSaving && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] bg-slate-900/20 flex items-center justify-center cursor-wait"><div className="rounded-xl bg-white px-6 py-4 shadow-xl font-semibold">Saving changes…</div></div>}

      {/* Left Navigation Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
        onOpenPayrollModal={() => setIsRegisterPayrollModalOpen(true)}
      />

      {/* Main Content Area (offset by sidebar width on desktop) */}
      <div className="flex-1 lg:pl-64 sm:lg:pl-72 flex flex-col min-h-screen w-full transition-all duration-200">
        
        {/* Top Header */}
        <Header 
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
          onOpenPayrollModal={() => setIsRegisterPayrollModalOpen(true)}
        />

        {/* Dynamic Main Body Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {can('canAdmin') && !workflowTemplates.some(w => w.isActive) && <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">Before registering documents, configure your users, review the classification catalogue, and create active workflows. Payroll batches also require employment routing rules.</div>}
          {activeTab === 'dashboard' && (
            <Dashboard onOpenRegisterModal={() => setIsRegisterModalOpen(true)} />
          )}

          {activeTab === 'queues' && (
            <MyTasksQueue />
          )}

          {activeTab === 'payroll' && (
            <PayrollManagement onOpenRegisterBatchModal={() => setIsRegisterPayrollModalOpen(true)} />
          )}

          {activeTab === 'registry' && (
            <DocumentRegistry onOpenRegisterModal={() => setIsRegisterModalOpen(true)} />
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
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              Human Resource Management and Development Office (HRMDO) &bull; Document Tracking System
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
