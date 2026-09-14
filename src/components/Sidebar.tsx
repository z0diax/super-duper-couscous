import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  LayoutDashboard, 
  Inbox, 
  Layers,
  FileStack, 
  CalendarClock, 
  GitMerge, 
  Tags, 
  DatabaseBackup, 
  History,
  FileText,
  X,
  ChevronRight,
  ShieldCheck,
  Plus,
  Users
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRegisterModal: () => void;
  onOpenPayrollModal?: () => void;
}

interface NavItem {
  id: 'dashboard' | 'queues' | 'payroll' | 'registry' | 'leave' | 'workflows' | 'catalogue' | 'migration' | 'audit' | 'users';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  section?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenRegisterModal, onOpenPayrollModal }) => {
  const { activeTab, setActiveTab, documents, currentUser, payrollBatches, payrollItems, workGroups, can } = useApp();
  const showConfiguration = can('canAdmin');
  const showComplianceHistory = can('canAdmin') || can('canSupervise');

  const isAssignedDesk = (desk: { userId?: string; assignmentType?: string; roleId?: string; team?: string }) => {
    if (desk.userId) return desk.userId === currentUser.id;
    if (desk.assignmentType === 'Role') return desk.roleId === currentUser.role;
    return desk.assignmentType === 'Team' && !!desk.team && [currentUser.division, currentUser.office].includes(desk.team);
  };

  // A phase becomes a task for its configured person, role, or team as soon as
  // it is active. Payroll tasks follow this exact rule just like documents.
  const documentTaskCount = documents.filter(doc => {
    if (doc.status === 'Released' || doc.status === 'Archived') return false;
    const step = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
    if (!step) return false;
    return (doc.status === 'On_Hold' && doc.encodedBy.userId === currentUser.id) || step.assignedTo.userId === currentUser.id || (!step.assignedTo.userId && step.assignedTo.role === currentUser.role);
  }).length;

  const payrollTaskCount = payrollBatches.filter(b => {
    if (b.progress.derivedStatus === 'COMPLETED') return false;
    const hasInitialItems = payrollItems.some(item => item.batchId === b.id && (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'initial_checking');
    const initialDesk = b.initialCheckingDesk || b.assignedDesk;
    const assignedToInitialChecking = isAssignedDesk(initialDesk);
    if (hasInitialItems && assignedToInitialChecking) return true;
    const myGroup = workGroups.find(w => w.batchId === b.id && w.assignedProcessorId === currentUser.id && w.status === 'In_Progress');
    if (myGroup) return true;
    const releaseDesk = b.workflowStages?.find(stage => stage.stageNumber === 4)?.assignedTo;
    if (payrollItems.some(item => item.batchId === b.id && item.currentStage === 'release' && ['Ready_For_Release','On_Hold','Ready_For_Recheck'].includes(item.status)) && releaseDesk && isAssignedDesk(releaseDesk)) return true;
    return false;
  }).length;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Operations' },
    { 
      id: 'queues', 
      label: 'My Tasks & Queues', 
      icon: Inbox, 
      badge: documentTaskCount + payrollTaskCount > 0 ? documentTaskCount + payrollTaskCount : undefined,
      section: 'Operations'
    },
    { 
      id: 'payroll', 
      label: 'Payroll Management', 
      icon: Layers, 
      section: 'Operations' 
    },
    { id: 'registry', label: 'Document Registry', icon: FileStack, section: 'Operations' },
    { id: 'leave', label: 'Leave Continuity', icon: CalendarClock, section: 'Operations' },

    ...(showConfiguration ? [
      { id: 'workflows' as const, label: 'Workflow Engine', icon: GitMerge, section: 'Configuration' },
      { id: 'catalogue' as const, label: 'Classification Catalogue', icon: Tags, section: 'Configuration' },
      { id: 'users' as const, label: 'Users & Designations', icon: Users, section: 'Configuration' },
    ] : []),

    ...(showComplianceHistory ? [
      ...(showConfiguration ? [{ id: 'migration' as const, label: 'V1 Historical Archive', icon: DatabaseBackup, section: 'Compliance & History' }] : []),
      { id: 'audit' as const, label: 'Audit Trail & Reports', icon: History, section: 'Compliance & History' },
    ] : []),
  ];

  const handleNavClick = (tabId: NavItem['id']) => {
    setActiveTab(tabId);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Group items by section
  const sections = ['Operations', 'Configuration', 'Compliance & History'];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 sm:w-72 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 sm:px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md ring-2 ring-blue-500/20 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white tracking-tight text-xs sm:text-sm truncate">
                  Document Tracking System
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">
                Document Routing &amp; Tracking
              </p>
            </div>
          </div>

          <button
            id="btn-close-sidebar-mobile"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors lg:hidden shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Button */}
        <div className="p-4 pb-2 shrink-0 space-y-2">
          <button
            id="btn-sidebar-register-doc"
            onClick={() => {
              onOpenRegisterModal();
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register Document</span>
          </button>

          {onOpenPayrollModal && (
            <button
              id="btn-sidebar-register-payroll"
              onClick={() => {
                onOpenPayrollModal();
                if (window.innerWidth < 1024) onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-semibold text-xs transition-all duration-150 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Intake Payroll</span>
            </button>
          )}
        </div>

        {/* Navigation Links (Organized by Section) */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {sections.map(section => {
            const items = navItems.filter(item => item.section === section && (!['workflows', 'catalogue', 'users', 'migration'].includes(item.id) || can('canAdmin')));
            return (
              <div key={section} className="space-y-1">
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {section}
                </div>
                {items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`sidebar-link-${item.id}`}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold shadow-xs'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          isActive ? 'bg-white text-blue-600' : 'bg-rose-500 text-white'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Active Desk Info in Sidebar Bottom */}
        <div className="p-3 border-t border-slate-800 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white shrink-0">
              {currentUser.avatarInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {currentUser.roleTitle}
              </div>
            </div>
          </div>
        </div>

      </aside>
    </>
  );
};
