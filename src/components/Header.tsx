import { PasswordForm } from './PasswordForm';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SidebarModule } from '../types';
import { 
  Search, 
  Plus, 
  Bell, 
  ChevronDown,
  Menu,
  Layers,
  LogOut
} from 'lucide-react';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenRegisterModal: () => void;
  onOpenPayrollModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar, onOpenRegisterModal, onOpenPayrollModal }) => {
  const { 
    currentUser, 
    users,
    documents, 
    setSelectedDocument, 
    setActiveTab, 
    showToast,
    logout
  } = useApp();

  const [searchInput, setSearchInput] = useState('');
  const [isPersonaOpen, setIsPersonaOpen] = useState(false);
  const allOperationModules: SidebarModule[] = ['dashboard', 'queues', 'payroll', 'registry', 'leave'];
  const visibleOperationModules = currentUser.role === 'admin'
    ? allOperationModules
    : currentUser.sidebarModules || allOperationModules;

  // Compute pending tasks for current active persona
  const myPendingCount = documents.filter(doc => {
    if (doc.status === 'Released' || doc.status === 'Archived') return false;
    const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
    if (!currentStep) return false;
    return currentStep.assignedTo.userId === currentUser.id || currentStep.assignedTo.role === currentUser.role;
  }).length;

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim().toLowerCase();
    if (!query) return;

    const matched = documents.find(d => 
      d.trackingNumber.toLowerCase().includes(query) ||
      (d.barcode && d.barcode.toLowerCase().includes(query)) ||
      d.title.toLowerCase().includes(query) ||
      (d.legacyId && d.legacyId.toLowerCase().includes(query))
    );

    if (matched) {
      setSelectedDocument(matched);
      showToast('success', matched.status === 'Awaiting_External_Return' ? 'Document Outside HRMDO' : 'Document Found', matched.status === 'Awaiting_External_Return' ? `${matched.trackingNumber} is awaiting return from ${matched.currentLocation || 'its external destination'}.` : `Opened tracking file for ${matched.trackingNumber}`);
      setSearchInput('');
    } else {
      showToast('warning', 'Tracking Not Found', `No document matching "${searchInput}". Opening registry.`);
      setActiveTab('registry');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'receiving_officer':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'processor':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'reviewer':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'approver':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'releasing_officer':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'supervisor':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'admin':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-xs h-16">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6">
        
        {/* Left: Mobile Menu Toggle */}
        <div className="flex items-center gap-3">
          <button
            id="btn-open-sidebar-menu"
            onClick={onOpenSidebar}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors lg:hidden"
            aria-label="Open sidebar menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Center: Global Quick Tracking Search */}
        <div className="flex-1 max-w-lg">
          <form onSubmit={handleQuickSearch} className="relative flex items-center">
            <input
              id="header-quick-search-input"
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search tracking no., title, or keyword..."
              className="w-full bg-slate-800/90 text-xs sm:text-sm text-slate-100 pl-9 pr-20 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <button
              type="submit"
              id="btn-header-quick-search"
              className="absolute right-1 top-1 px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {/* Right Tools & Persona Switcher */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Quick Register Buttons */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {visibleOperationModules.includes('registry') && (
              <button
                id="btn-register-doc-header"
                onClick={onOpenRegisterModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Doc</span>
              </button>
            )}

            {onOpenPayrollModal && visibleOperationModules.includes('payroll') && (
              <button
                id="btn-register-payroll-header"
                onClick={onOpenPayrollModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Intake Payroll</span>
              </button>
            )}
          </div>

          {/* Pending Tasks Notification Bell */}
          {visibleOperationModules.includes('queues') && (
            <button
              id="btn-header-tasks-badge"
              onClick={() => setActiveTab('queues')}
              className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              title={`${myPendingCount} tasks pending for your queue`}
            >
              <Bell className="w-4 h-4" />
              {myPendingCount > 0 && (
                <span className="absolute 1 top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-slate-900">
                  {myPendingCount}
                </span>
              )}
            </button>
          )}

          {/* Persona Switcher Dropdown */}
          <div className="relative shrink-0">
            <button
              id="btn-persona-switcher"
              onClick={() => setIsPersonaOpen(!isPersonaOpen)}
              className="flex items-center gap-2 p-1.5 pl-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 transition-colors text-left cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-2xs">
                {currentUser.avatarInitials}
              </div>
              <div className="hidden md:block text-left pr-1">
                <div className="text-xs font-semibold text-slate-100 leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-blue-300 truncate max-w-[120px]">
                  {currentUser.roleTitle}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Persona Switcher Popup */}
            {isPersonaOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsPersonaOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 duration-100">
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {currentUser.avatarInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{currentUser.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{currentUser.email}</p>
                      <p className="mt-0.5 truncate text-[10px] font-medium text-blue-700">{currentUser.roleTitle}</p>
                    </div>
                  </div>

                  <PasswordForm />
                  {currentUser.role === 'admin' && <div className="border-t border-slate-100 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('users');
                        setIsPersonaOpen(false);
                      }}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 cursor-pointer"
                    >
                      Manage users and designations
                    </button>
                  </div>}
                  <div className="border-t border-slate-100 px-2 py-1.5">
                    <button
                      id="btn-sign-out"
                      onClick={() => { void logout(); setIsPersonaOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
