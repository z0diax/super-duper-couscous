import React from 'react';
import { useApp } from '../context/AppContext';
import { isDocumentActionableForUser } from '../services/documentTaskAssignment';
import { SidebarModule } from '../types';
import { Layers, X, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { AnimatedBrandText } from './AnimatedBrandText';
import { AnimatedNavIcon, type NavIconType } from './AnimatedNavIcon';
import { SidebarWeatherCard } from './SidebarWeatherCard';
import { SidebarTooltip, SidebarTooltipGroup } from './SidebarTooltip';
import './Sidebar.css';
import { SidebarThemeDecoration } from '../theme/SidebarThemeDecoration';
import { useTheme } from '../theme/ThemeProvider';
import type { DocumentShellSnapshot } from '../services/useDocumentShellSummary';
import type { PayrollShellSnapshot } from '../services/usePayrollShellSummary';

interface SidebarProps {
  documentShell: DocumentShellSnapshot;
  payrollShell: PayrollShellSnapshot;
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  onOpenRegisterModal: () => void;
  onOpenPayrollModal?: () => void;
}

interface NavItem {
  id: NavIconType;
  label: string;
  badge?: number;
  section?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ documentShell, payrollShell, isOpen, isCollapsed, onToggleCollapsed, onClose, onOpenRegisterModal, onOpenPayrollModal }) => {
  const { activeTab, setActiveTab, documents, currentUser, payrollBatches, payrollItems, workGroups, can } = useApp();
  const { effectsEnabled } = useTheme();
  const showConfiguration = can('canAdmin');
  const showComplianceHistory = can('canAdmin') || can('canSupervise');
  const allOperationModules: SidebarModule[] = ['dashboard','queues','payroll','registry','leave'];
  const visibleOperationModules = currentUser.role === 'admin' ? allOperationModules : currentUser.sidebarModules || allOperationModules;

  const isAssignedDesk = (desk: { userId?: string; assignmentType?: string; roleId?: string; team?: string }) => {
    if (desk.userId) return desk.userId === currentUser.id;
    if (desk.assignmentType === 'Role') return desk.roleId === currentUser.role;
    return desk.assignmentType === 'Team' && !!desk.team && [currentUser.division, currentUser.office].includes(desk.team);
  };

  // A phase becomes a task for its configured person, role, or team as soon as
  // it is active. Payroll tasks follow this exact rule just like documents.
  const legacyDocumentTaskCount = (import.meta.env.VITE_DOCUMENT_SHELL_TARGETED_READS==='1'?[]:documents).filter(doc => {
    if (doc.status === 'Released' || doc.status === 'Archived' || doc.status === 'Disapproved') return false;
    return (doc.status === 'On_Hold' && doc.encodedBy.userId === currentUser.id) || isDocumentActionableForUser(doc, currentUser, true);
  }).length;
  const documentTaskCount=import.meta.env.VITE_DOCUMENT_SHELL_TARGETED_READS==='1'?(documentShell.summary?.sidebarDocumentTaskCount ?? 0):legacyDocumentTaskCount;

  const legacyPayrollTaskCount = (import.meta.env.VITE_PAYROLL_TARGETED_READS==='1'?[]:payrollBatches).filter(b => {
    if (b.progress.derivedStatus === 'COMPLETED') return false;
    const hasInitialItems = payrollItems.some(item => item.batchId === b.id && (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'initial_checking');
    const initialDesk = b.initialCheckingDesk || b.assignedDesk;
    const assignedToInitialChecking = isAssignedDesk(initialDesk);
    if (hasInitialItems && assignedToInitialChecking) return true;
    const myGroup = workGroups.find(w => w.batchId === b.id && (w.assignedProcessorId === currentUser.id || !!w.assignedTeam && [currentUser.division,currentUser.office].includes(w.assignedTeam)) && w.status === 'In_Progress');
    if (myGroup) return true;
    const releaseDesk = b.workflowStages?.find(stage => stage.stageNumber === 4)?.assignedTo;
    if (payrollItems.some(item => item.batchId === b.id && item.currentStage === 'release' && ['Ready_For_Release','On_Hold','Ready_For_Recheck'].includes(item.status)) && releaseDesk && isAssignedDesk(releaseDesk)) return true;
    return false;
  }).length;
  const payrollTaskCount=import.meta.env.VITE_PAYROLL_TARGETED_READS==='1'?(payrollShell.summary?.sidebarPayrollTaskCount??0):legacyPayrollTaskCount;

  const navItems: NavItem[] = ([
    { id: 'dashboard', label: 'Dashboard', section: 'Operations' },
    { 
      id: 'queues', 
      label: 'My Tasks & Queues', 
      badge: documentTaskCount + payrollTaskCount > 0 ? documentTaskCount + payrollTaskCount : undefined,
      section: 'Operations'
    },
    { 
      id: 'payroll', 
      label: 'Payroll Management', 
      section: 'Operations'
    },
    { id: 'registry', label: 'Document Registry', section: 'Operations' },
    { id: 'leave', label: 'Leave Records', section: 'Operations' },

    ...(showConfiguration ? [
      { id: 'workflows' as const, label: 'Workflow Engine', section: 'Configuration' },
      { id: 'catalogue' as const, label: 'Classification Catalogue', section: 'Configuration' },
      { id: 'users' as const, label: 'Users & Designations', section: 'Configuration' },
    ] : []),

    ...(showComplianceHistory ? [
      ...(showConfiguration ? [{ id: 'migration' as const, label: 'Historical Archive', section: 'Compliance & History' }] : []),
      { id: 'audit' as const, label: 'Audit Trail & Reports', section: 'Compliance & History' },
    ] : []),
  ] as NavItem[]).filter(item => item.section !== 'Operations' || visibleOperationModules.includes(item.id as SidebarModule));

  const handleNavClick = (tabId: NavItem['id']) => {
    setActiveTab(tabId);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Group items by section
  const sections = ['Operations', 'Configuration', 'Compliance & History'];

  return (
    <SidebarTooltipGroup>
      {/* Mobile Backdrop */}
      <div
        className="sidebar-mobile-backdrop fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
        data-open={isOpen}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Container */}
      <aside 
        className={`app-sidebar fixed top-0 bottom-0 left-0 z-50 w-64 sm:w-72 text-slate-300 flex flex-col overflow-hidden border-r border-slate-800 lg:translate-x-0 ${effectsEnabled ? 'sidebar-effects-on' : ''} ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="sidebar-brand-header relative z-10 h-20 px-4 sm:px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex flex-1 items-center gap-2.5 sm:gap-3 min-w-0">
            <BrandLogo className="h-10 w-10 shrink-0 drop-shadow-md" title="HRMDO Records Management System" />
            <div className="sidebar-brand-text min-w-0 flex-1"><AnimatedBrandText /></div>
          </div>

          <button
            id="btn-close-sidebar-mobile"
            aria-label="Close sidebar menu"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors lg:hidden shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <SidebarThemeDecoration />

        {/* Quick Action Button */}
        <div className="sidebar-quick-actions relative z-10 p-4 pb-2 shrink-0 space-y-2">
          {visibleOperationModules.includes('registry') && <SidebarTooltip enabled={isCollapsed} label="Register Document"><button
            id="btn-sidebar-register-doc"
            aria-label="Register Document"
            onClick={() => {
              onOpenRegisterModal();
              if (window.innerWidth < 1024) onClose();
            }}
            className="sidebar-quick-action sidebar-primary-action w-full flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl font-semibold text-xs shadow-xs transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sidebar-label">Register Document</span>
          </button></SidebarTooltip>}

          {onOpenPayrollModal && visibleOperationModules.includes('payroll') && (
            <SidebarTooltip enabled={isCollapsed} label="Intake Payroll"><button
              id="btn-sidebar-register-payroll"
              aria-label="Intake Payroll"
              onClick={() => {
                onOpenPayrollModal();
                if (window.innerWidth < 1024) onClose();
              }}
              className="sidebar-quick-action w-full flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-semibold text-xs transition-all duration-150 cursor-pointer"
            >
              <Layers className="sidebar-payroll-icon w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="sidebar-label">Intake Payroll</span>
            </button></SidebarTooltip>
          )}
        </div>

        {/* Navigation Links (Organized by Section) */}
        <nav id="sidebar-navigation" aria-label="Main navigation" className="sidebar-nav relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-5">
          {sections.map(section => {
            const items = navItems.filter(item => item.section === section && (!['workflows', 'catalogue', 'users', 'migration'].includes(item.id) || can('canAdmin')));
            if (items.length === 0) return null;
            return (
              <div key={section} className="sidebar-nav-section space-y-1">
                <div className="sidebar-section-heading px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {section}
                </div>
                {items.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <SidebarTooltip key={item.id} enabled={isCollapsed} label={item.label}><button
                      id={`sidebar-link-${item.id}`}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      aria-describedby={item.id === 'queues' ? [item.badge !== undefined ? 'sidebar-task-count' : '', documentShell.error || payrollShell.error ? 'sidebar-task-error' : ''].filter(Boolean).join(' ') || undefined : undefined}
                      onClick={() => handleNavClick(item.id)}
                      className={`sidebar-nav-item relative w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'sidebar-nav-active font-semibold shadow-xs'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="sidebar-nav-content flex min-w-0 items-center gap-2.5">
                        <AnimatedNavIcon type={item.id} active={isActive} />
                        <span className="sidebar-label truncate">{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span id="sidebar-task-count" aria-label={`${item.badge} tasks`} className={`sidebar-task-badge px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          isActive ? 'sidebar-active-badge bg-white' : 'bg-rose-500 text-white'
                        }`}>
                          <span className="sidebar-badge-full">{item.badge}</span>
                          <span className="sidebar-badge-compact" aria-hidden="true">{item.badge > 9 ? '9+' : item.badge}</span>
                        </span>
                      )}
                      {item.id==='queues' && (documentShell.error||payrollShell.error) && <span id="sidebar-task-error" title="Task count unavailable" aria-label="Task count unavailable" className="sidebar-task-error rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950">!</span>}
                    </button></SidebarTooltip>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Local Date, Time & Weather */}
        <div className="sidebar-weather-area relative z-10 p-3 border-t border-slate-800 shrink-0 bg-slate-950/40">
          <SidebarWeatherCard />
        </div>

      </aside>
      {/* Edge handle stays outside the sidebar's clipping, without a toolbar row. */}
      <div className="sidebar-desktop-controls hidden lg:flex">
        <SidebarTooltip enabled label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <button type="button" id="btn-toggle-sidebar-collapsed" onClick={onToggleCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed} aria-controls="sidebar-navigation"
            className="sidebar-collapse-control">
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" aria-hidden="true" /> : <PanelLeftClose className="w-4 h-4" aria-hidden="true" />}
          </button>
        </SidebarTooltip>
      </div>
    </SidebarTooltipGroup>
  );
};
