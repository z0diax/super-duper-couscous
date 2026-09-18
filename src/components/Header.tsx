import { PasswordForm } from './PasswordForm';
import { UserAvatar } from './UserAvatar';
import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { isDocumentActionableForUser } from '../services/documentTaskAssignment';
import { DocumentRecord, PayrollBatch, PayrollItem, SidebarModule } from '../types';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';
import { useTheme } from '../theme/ThemeProvider';
import type { AppearanceMode, SystemThemeId } from '../theme/themeTypes';
import { SYSTEM_THEMES } from '../theme/themeRegistry';
import { ThemeNavEffects } from '../theme/ThemeEffects';
import { previewWeatherLocation, type WeatherPreview } from '../services/themeApi';
import { 
  Search, 
  Plus, 
  Bell, 
  ChevronDown,
  Menu,
  Layers,
  LogOut,
  X,
  FileText,
  ChevronRight,
  CheckCheck,
  CircleAlert,
  Inbox,
  Clock3
  ,Monitor, Sun, Moon, Palette, Check, Sparkles, CloudSun, MapPin, RefreshCw, ArrowLeft
} from 'lucide-react';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenRegisterModal: () => void;
  onOpenPayrollModal?: () => void;
}

type QuickSearchResult =
  | { key: string; kind: 'document'; reference: string; title: string; detail: string; office: string; status: string; document: DocumentRecord }
  | { key: string; kind: 'batch'; reference: string; title: string; detail: string; office: string; status: string; batch: PayrollBatch }
  | { key: string; kind: 'item'; reference: string; title: string; detail: string; office: string; status: string; batch: PayrollBatch; item: PayrollItem };

type HeaderNotification = {
  id: string; title: string; message: string; timestamp: string; tone: 'blue'|'amber'|'violet';
  document?: DocumentRecord; batch?: PayrollBatch;
};

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar, onOpenRegisterModal, onOpenPayrollModal }) => {
  const { 
    currentUser, 
    users,
    documents,
    payrollBatches,
    payrollItems,
    workGroups,
    setSelectedDocument, 
    openBatchModal,
    setActiveTab, 
    showToast,
    clearToast,
    logout, can
  } = useApp();
  const { appearanceMode, setAppearanceMode, effectsEnabled, setEffectsEnabled, systemTheme, systemThemeSetting, updateSystemTheme, activateWeatherSync, refreshWeatherSync } = useTheme();
  const canManageSystemTheme = can('canAdmin');

  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<QuickSearchResult[] | null>(null);
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [isPersonaOpen, setIsPersonaOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isThemeCatalogueOpen, setIsThemeCatalogueOpen] = useState(false);
  const [isWeatherConfigOpen, setIsWeatherConfigOpen] = useState(false);
  const [weatherLocation, setWeatherLocation] = useState('');
  const [weatherPreview, setWeatherPreview] = useState<WeatherPreview | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [isWeatherBusy, setIsWeatherBusy] = useState(false);
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const themeMutationInFlight = useRef(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => readWorkspaceValue(currentUser.id, 'notifications.read', []));
  const allOperationModules: SidebarModule[] = ['dashboard', 'queues', 'payroll', 'registry', 'leave'];
  const visibleOperationModules = currentUser.role === 'admin'
    ? allOperationModules
    : currentUser.sidebarModules || allOperationModules;
  const applySystemTheme = async (next: SystemThemeId) => {
    if (themeMutationInFlight.current) return;
    if (next === 'weather-sync') {
      setWeatherLocation(systemThemeSetting?.location?.query || ''); setWeatherPreview(null); setWeatherError(''); setIsWeatherConfigOpen(true); return;
    }
    if (next === systemTheme) return;
    const definition = SYSTEM_THEMES[next];
    if (!window.confirm(`Change System Theme?\n\n${definition.name} will be applied to all users of the HRMDO Records Management System.`)) return;
    themeMutationInFlight.current = true; setIsThemeSaving(true);
    try { await updateSystemTheme(next); showToast('success', 'System theme updated', `${definition.name} now applies to all users.`); setIsThemeCatalogueOpen(false); }
    catch (error) { showToast('error', 'System theme was not changed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { themeMutationInFlight.current = false; setIsThemeSaving(false); }
  };
  const checkWeatherLocation = async () => {
    setIsWeatherBusy(true); setWeatherError(''); setWeatherPreview(null);
    try { setWeatherPreview(await previewWeatherLocation(weatherLocation)); }
    catch (error) { setWeatherError(error instanceof Error ? error.message : 'Unable to check this location.'); }
    finally { setIsWeatherBusy(false); }
  };
  const applyWeatherSync = async () => {
    if (themeMutationInFlight.current || !weatherPreview || !window.confirm(`Apply Weather Sync?\n\n${weatherPreview.location.name} will determine the visual atmosphere for all users.`)) return;
    themeMutationInFlight.current = true;
    setIsWeatherBusy(true); setWeatherError('');
    try { const setting=await activateWeatherSync(weatherLocation); showToast('success','Weather Sync activated',`${setting.location?.name || weatherPreview.location.name} now controls the global weather theme.`); setIsWeatherConfigOpen(false); setIsThemeCatalogueOpen(false); }
    catch (error) { setWeatherError(error instanceof Error ? error.message : 'Weather Sync could not be activated.'); }
    finally { themeMutationInFlight.current = false; setIsWeatherBusy(false); }
  };
  const forceWeatherRefresh = async () => {
    if (themeMutationInFlight.current) return;
    themeMutationInFlight.current = true;
    setIsWeatherBusy(true); setWeatherError('');
    try { const setting=await refreshWeatherSync(); showToast('success','Weather refreshed',`${setting.weather?.label || 'Current conditions'} · ${setting.effectiveWeatherTheme || 'Weather Sync'}`); }
    catch (error) { setWeatherError(error instanceof Error ? error.message : 'Weather could not be refreshed.'); }
    finally { themeMutationInFlight.current = false; setIsWeatherBusy(false); }
  };

  const deskMatchesUser = (desk?: { userId?: string; assignmentType?: string; roleId?: string; team?: string }) => {
    if (!desk) return false;
    if (desk.userId) return desk.userId === currentUser.id;
    if (desk.assignmentType === 'Role') return desk.roleId === currentUser.role;
    return desk.assignmentType === 'Team' && !!desk.team && [currentUser.division,currentUser.office].includes(desk.team);
  };
  const notifications = useMemo<HeaderNotification[]>(() => {
    const entries: HeaderNotification[] = [];
    documents.forEach(document => {
      if (document.isLegacyV1 || ['Released','Archived','Disapproved'].includes(document.status)) return;
      const needsCompliance=document.status==='On_Hold' && document.encodedBy.userId===currentUser.id;
      if (!needsCompliance && !isDocumentActionableForUser(document,currentUser,true)) return;
      const step=document.workflowSteps.find(item=>item.stepNumber===document.currentStepNumber);
      entries.push({ id:`document-${document.id}-${document.status}-${document.currentStepNumber}`, title:needsCompliance?'Document needs compliance':'Document assigned to you', message:`${document.trackingNumber} · ${needsCompliance?(document.holdReason||'Submit the requested compliance'):(step?.name||document.title)}`, timestamp:document.heldAt||step?.startedAt||document.dateEncoded, tone:needsCompliance?'amber':'blue', document });
    });
    payrollBatches.forEach(batch => {
      if (batch.progress.derivedStatus==='COMPLETED') return;
      const items=payrollItems.filter(item=>item.batchId===batch.id);
      const needsCompliance=batch.encodedBy.userId===currentUser.id && items.some(item=>item.status==='On_Hold');
      const initialAssigned=items.some(item=>(item.currentStage||(item.workGroupId?'verification_signing':'initial_checking'))==='initial_checking') && deskMatchesUser(batch.initialCheckingDesk||batch.assignedDesk);
      const groupAssigned=workGroups.some(group=>group.batchId===batch.id && group.status==='In_Progress' && (group.assignedProcessorId===currentUser.id || !!group.assignedTeam && [currentUser.division,currentUser.office].includes(group.assignedTeam)));
      const releaseDesk=batch.workflowStages?.find(stage=>stage.stageNumber===4)?.assignedTo;
      const releaseAssigned=items.some(item=>item.currentStage==='release' && ['Ready_For_Release','On_Hold','Ready_For_Recheck'].includes(item.status)) && deskMatchesUser(releaseDesk);
      if (!needsCompliance&&!initialAssigned&&!groupAssigned&&!releaseAssigned) return;
      const title=needsCompliance?'Payroll compliance required':releaseAssigned?'Payroll ready for release':groupAssigned?'Payroll work group assigned':'Payroll awaiting initial checking';
      entries.push({ id:`payroll-${batch.id}-${batch.progress.derivedStatus}-${batch.progress.onHoldTotal}`, title, message:`${batch.batchNumber} · ${batch.progress.displayStatus}`, timestamp:batch.updatedAt||batch.dateEncoded, tone:needsCompliance?'amber':releaseAssigned?'violet':'blue', batch });
    });
    return entries.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,25);
  },[currentUser.id,currentUser.role,currentUser.division,currentUser.office,documents,payrollBatches,payrollItems,workGroups]);
  const unreadCount=notifications.filter(notification=>!readNotificationIds.includes(notification.id)).length;
  const saveReadNotifications=(ids:string[])=>{ const retained=ids.slice(-200); setReadNotificationIds(retained); writeWorkspaceValue(currentUser.id,'notifications.read',retained); };
  const markAllNotificationsRead=()=>saveReadNotifications(Array.from(new Set([...readNotificationIds,...notifications.map(notification=>notification.id)])));

  const openDocument = (document: DocumentRecord, notify = true) => {
    setSearchResults(null);
    setSelectedDocument(document);
    if (notify) showToast('success', document.status === 'Awaiting_External_Return' ? 'Document Outside HRMDO' : 'Document Found', document.status === 'Awaiting_External_Return' ? `${document.trackingNumber} is awaiting return from ${document.currentLocation || 'its external destination'}.` : `Opened tracking file for ${document.trackingNumber}`);
    setSearchInput('');
  };

  const openPayrollBatch = (batch: PayrollBatch, item?: PayrollItem, notify = true) => {
    setSearchResults(null);
    setActiveTab('payroll');
    openBatchModal(batch);
    if (notify) showToast('success', 'Payroll Batch Found', item ? `Opened ${batch.batchNumber} containing payroll ${item.barcode}.` : `Opened payroll batch ${batch.batchNumber}.`);
    setSearchInput('');
  };

  const openSearchResult = (result: QuickSearchResult) => {
    if (result.kind === 'document') openDocument(result.document);
    else openPayrollBatch(result.batch, result.kind === 'item' ? result.item : undefined);
  };

  const openNotification = (notification: HeaderNotification) => {
    if (!readNotificationIds.includes(notification.id)) saveReadNotifications([...readNotificationIds,notification.id]);
    setIsNotificationsOpen(false);
    if (notification.document) openDocument(notification.document, false);
    else if (notification.batch) openPayrollBatch(notification.batch, undefined, false);
  };

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim().toLowerCase();
    if (!query) return;
    clearToast();

    const exactDocument = documents.find(d =>
      d.trackingNumber.toLowerCase() === query ||
      (d.barcode && d.barcode.toLowerCase() === query) ||
      (d.legacyId && d.legacyId.toLowerCase() === query)
    );
    const exactPayrollItem = payrollItems.find(item => item.barcode.toLowerCase() === query);
    const exactBatch = payrollBatches.find(batch =>
      batch.batchNumber.toLowerCase() === query ||
      batch.batchBarcode?.toLowerCase() === query ||
      batch.id === exactPayrollItem?.batchId
    );

    if (exactDocument) return openDocument(exactDocument);
    if (exactBatch) return openPayrollBatch(exactBatch, exactPayrollItem);

    const documentResults: QuickSearchResult[] = documents
      .filter(document => [document.trackingNumber, document.barcode, document.legacyId, document.title, document.subject, document.sourceOffice, document.senderName, document.classification, document.documentType]
        .some(value => value?.toLowerCase().includes(query)))
      .map(document => ({
        key: `document-${document.id}`, kind: 'document', reference: document.trackingNumber,
        title: document.title, detail: `${document.classification} · ${document.documentType}`,
        office: document.sourceOffice, status: document.status, document,
      }));
    const payrollResults: QuickSearchResult[] = [];
    payrollBatches.forEach(batch => {
      const batchMatches = [batch.batchNumber, batch.batchBarcode, batch.office, batch.payrollType, batch.payrollPeriod, batch.receivedFromLiaison, batch.remarks, batch.encodedBy.userName]
        .some(value => value?.toLowerCase().includes(query));
      if (batchMatches) payrollResults.push({
        key: `batch-${batch.id}`, kind: 'batch', reference: batch.batchNumber,
        title: batch.payrollType, detail: `Payroll Batch · ${batch.totalItemsCount} item${batch.totalItemsCount === 1 ? '' : 's'}`,
        office: batch.office, status: batch.progress.displayStatus, batch,
      });
      payrollItems.filter(item => item.batchId === batch.id).forEach(item => {
        if (![item.barcode, item.title, item.office, item.classificationType, item.employmentClassification]
          .some(value => value?.toLowerCase().includes(query))) return;
        payrollResults.push({
          key: `item-${item.id}`, kind: 'item', reference: item.barcode,
          title: item.title, detail: `Payroll Item · ${batch.batchNumber}`,
          office: item.office || batch.office, status: item.status, batch, item,
        });
      });
    });
    const results = [...documentResults, ...payrollResults].sort((a, b) => a.reference.localeCompare(b.reference));
    setSubmittedSearch(searchInput.trim());
    setSearchResults(results);
    if (results.length === 0) showToast('warning', 'No Results', `No document or payroll record matches "${searchInput}".`);
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
    <header className={`app-header relative isolate text-white border-b border-slate-800 sticky top-0 shadow-xs h-16 ${searchResults !== null ? 'z-50' : 'z-30'}`}>
      <ThemeNavEffects />
      <div className="relative z-10 h-full px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6">
        
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
              placeholder="Search tracking no., batch, barcode, or title..."
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

          {searchResults !== null && (
            <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex items-start justify-center bg-slate-950/45 p-3 pt-4 backdrop-blur-[2px] sm:p-6" onMouseDown={() => setSearchResults(null)}>
              <section role="dialog" aria-modal="true" aria-labelledby="global-search-results-title" className="flex max-h-[calc(100dvh-6rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Search className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Global search</p>
                      <h2 id="global-search-results-title" className="mt-1 text-base font-bold text-slate-950 sm:text-lg">Results for “{submittedSearch}”</h2>
                      <p className="mt-1 text-xs text-slate-500">Documents and payroll records matching your keyword.</p>
                    </div>
                  </div>
                  <button type="button" aria-label="Close search results" onClick={() => setSearchResults(null)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto">
                  {searchResults.length > 0 ? (
                    <table className="w-full min-w-[760px] border-collapse text-left">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="border-b border-slate-200 px-5 py-3">Record</th>
                          <th className="border-b border-slate-200 px-4 py-3">Reference</th>
                          <th className="border-b border-slate-200 px-4 py-3">Title / Details</th>
                          <th className="border-b border-slate-200 px-4 py-3">Office</th>
                          <th className="border-b border-slate-200 px-4 py-3">Status</th>
                          <th className="border-b border-slate-200 px-5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {searchResults.slice(0, 100).map(result => (
                          <tr key={result.key} className="transition-colors hover:bg-blue-50/40">
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold ${result.kind === 'document' ? 'bg-blue-50 text-blue-700' : result.kind === 'batch' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {result.kind === 'document' ? <FileText className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
                                {result.kind === 'document' ? 'Document' : result.kind === 'batch' ? 'Payroll Batch' : 'Payroll Item'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800">{result.reference}</td>
                            <td className="max-w-xs px-4 py-3.5"><p className="truncate text-xs font-semibold text-slate-900">{result.title}</p><p className="mt-1 truncate text-[11px] text-slate-500">{result.detail}</p></td>
                            <td className="max-w-48 px-4 py-3.5 text-xs text-slate-600"><span className="line-clamp-2">{result.office}</span></td>
                            <td className="px-4 py-3.5"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{result.status.replaceAll('_', ' ')}</span></td>
                            <td className="px-5 py-3.5 text-right"><button type="button" onClick={() => openSearchResult(result)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100">Open <ChevronRight className="h-3.5 w-3.5" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Search className="h-6 w-6" /></span>
                      <h3 className="mt-4 text-sm font-bold text-slate-900">No matching records</h3>
                      <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">Try a tracking number, batch number, barcode, title, office, classification, or personnel name.</p>
                    </div>
                  )}
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:px-6">
                  <p className="text-[11px] text-slate-500">{searchResults.length > 100 ? `Showing the first 100 of ${searchResults.length} matches` : `${searchResults.length} matching record${searchResults.length === 1 ? '' : 's'}`}</p>
                  <button type="button" onClick={() => setSearchResults(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Close</button>
                </footer>
              </section>
            </div>
          )}
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
            <div className="relative shrink-0">
              <button
                id="btn-header-notifications"
                type="button"
                aria-label={`Notifications${unreadCount?` (${unreadCount} unread)`:''}`}
                aria-expanded={isNotificationsOpen}
                onClick={() => { setIsNotificationsOpen(value=>!value); setIsPersonaOpen(false); }}
                className={`relative rounded-lg border p-2 transition-colors ${isNotificationsOpen?'border-slate-600 bg-slate-800 text-white':'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white'}`}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex min-w-4.5 h-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-slate-900">{unreadCount>99?'99+':unreadCount}</span>}
              </button>
              {isNotificationsOpen&&<><button type="button" aria-label="Close notifications" onClick={()=>setIsNotificationsOpen(false)} className="fixed inset-0 z-40 cursor-default"/><section role="dialog" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(34rem,calc(100vh-5rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5"><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-950">Notifications</h2>{unreadCount>0&&<span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">{unreadCount} unread</span>}</div><p className="mt-1 text-[11px] text-slate-500">Assigned work and records requiring your attention.</p></div>{unreadCount>0&&<button type="button" onClick={markAllNotificationsRead} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50"><CheckCheck className="h-3.5 w-3.5"/>Mark all read</button>}</header>
                <div className="min-h-0 flex-1 overflow-y-auto">{notifications.length?notifications.map(notification=>{const unread=!readNotificationIds.includes(notification.id);const Icon=notification.tone==='amber'?CircleAlert:notification.batch?Layers:FileText;return <button type="button" key={notification.id} onClick={()=>openNotification(notification)} className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-50 ${unread?'bg-blue-50/45':'bg-white'}`}><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${notification.tone==='amber'?'bg-amber-100 text-amber-700':notification.tone==='violet'?'bg-violet-100 text-violet-700':'bg-blue-100 text-blue-700'}`}><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><strong className="text-xs text-slate-900">{notification.title}</strong>{unread&&<span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600"/>}</span><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-slate-600">{notification.message}</span><span className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3"/>{new Date(notification.timestamp).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span></span><ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-300"/></button>}) : <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Inbox className="h-6 w-6"/></span><h3 className="mt-3 text-sm font-bold text-slate-900">You are all caught up</h3><p className="mt-1 text-xs leading-5 text-slate-500">New assignments and compliance requests will appear here.</p></div>}</div>
                <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3"><span className="text-[10px] text-slate-500">Showing up to 25 current notifications</span><button type="button" onClick={()=>{setIsNotificationsOpen(false);setActiveTab('queues');}} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">Open My Tasks</button></footer>
              </section></>}
            </div>
          )}

          {/* Persona Switcher Dropdown */}
          <div className="relative shrink-0">
            <button
              id="btn-persona-switcher"
              onClick={() => { setIsPersonaOpen(!isPersonaOpen); setIsNotificationsOpen(false); }}
              className="flex items-center gap-2 p-1.5 pl-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 transition-colors text-left cursor-pointer"
            >
              <UserAvatar seed={currentUser.avatarSeed || currentUser.id} name={currentUser.name} initials={currentUser.avatarInitials} className="h-7 w-7 rounded-full ring-1 ring-white/20 shadow-2xs" />
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
                    <UserAvatar seed={currentUser.avatarSeed || currentUser.id} name={currentUser.name} initials={currentUser.avatarInitials} className="h-10 w-10 rounded-full ring-1 ring-slate-200 shadow-xs" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{currentUser.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{currentUser.email}</p>
                      <p className="mt-0.5 truncate text-[10px] font-medium text-blue-700">{currentUser.roleTitle}</p>
                    </div>
                  </div>

                  <PasswordForm />
                  <div className="border-t border-slate-100 px-3 py-2.5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Appearance</p>
                    <div className="grid grid-cols-3 gap-1" role="group" aria-label="Appearance mode">
                      {([['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([mode, label, Icon]) => (
                        <button key={mode} type="button" aria-pressed={appearanceMode === mode} onClick={() => setAppearanceMode(mode as AppearanceMode)} className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors ${appearanceMode === mode ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                          <Icon className="h-3.5 w-3.5" />{label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
                        <span><strong className="block text-[11px] text-slate-800">Theme Effects</strong><span className="block text-[10px] text-slate-500">Decorative animations</span></span>
                      </div>
                      <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Theme effects">
                        {[true, false].map(enabled => <button key={String(enabled)} type="button" aria-pressed={effectsEnabled === enabled} onClick={() => setEffectsEnabled(enabled)} className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${effectsEnabled === enabled ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:bg-white'}`}>{enabled ? 'On' : 'Off'}</button>)}
                      </div>
                    </div>
                  </div>
                  {canManageSystemTheme && <div className="border-t border-slate-100 px-3 py-2.5">
                    <button type="button" onClick={() => { setIsPersonaOpen(false); setIsThemeCatalogueOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100">
                      <Palette className="h-4 w-4 text-blue-600" /><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">System Theme</strong><span className="block truncate text-[10px] text-slate-500">{SYSTEM_THEMES[systemTheme].name} · Applies to all users</span></span><ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                    {systemThemeSetting?.updatedAt && <p className="mt-2 text-[10px] text-slate-400">Updated {new Date(systemThemeSetting.updatedAt).toLocaleString()}{systemThemeSetting.updatedBy?.name ? ` by ${systemThemeSetting.updatedBy.name}` : ''}</p>}
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

          {isThemeCatalogueOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xs sm:p-6" role="dialog" aria-modal="true" aria-labelledby="system-theme-title">
            <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
              <header className="app-header flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 text-white sm:px-6">
                <div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600"><Palette className="h-5 w-5" /></span><div><h2 id="system-theme-title" className="font-bold">System Theme</h2><p className="mt-1 text-xs text-slate-300">Choose the visual identity applied to every user. Personal Light and Dark preferences remain independent.</p></div></div>
                <button type="button" aria-label="Close system theme catalogue" onClick={() => { setIsThemeCatalogueOpen(false); setIsWeatherConfigOpen(false); }} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
              </header>
              {isWeatherConfigOpen ? <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <button type="button" onClick={() => { setIsWeatherConfigOpen(false); setWeatherError(''); }} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700"><ArrowLeft className="h-3.5 w-3.5"/>All themes</button>
                <div className="mx-auto max-w-xl">
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><CloudSun className="h-5 w-5"/></span><div><h3 className="font-bold text-slate-900">Weather Sync</h3><p className="mt-1 text-xs leading-5 text-slate-500">Resolve and confirm a city or municipality before weather-driven theming is applied globally.</p></div></div>
                  {systemTheme==='weather-sync' && systemThemeSetting?.location && <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center justify-between gap-3"><strong className="text-xs text-blue-800">Currently active</strong><button type="button" disabled={isWeatherBusy} onClick={() => void forceWeatherRefresh()} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${isWeatherBusy?'animate-spin':''}`}/>Refresh Weather</button></div>
                    <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-slate-500">Location</dt><dd className="mt-1 font-semibold text-slate-900">{systemThemeSetting.location.name}</dd></div><div><dt className="text-slate-500">Current weather</dt><dd className="mt-1 font-semibold text-slate-900">{systemThemeSetting.weather?.label || 'Unavailable'} · <span className="capitalize">{systemThemeSetting.effectiveWeatherTheme}</span></dd></div><div><dt className="text-slate-500">Last updated</dt><dd className="mt-1 font-semibold text-slate-900">{systemThemeSetting.weather?.updatedAt ? new Date(systemThemeSetting.weather.updatedAt).toLocaleString() : 'Unavailable'}</dd></div><div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-semibold text-slate-900">{systemThemeSetting.weatherStale?'Temporarily unavailable · using last update':'Weather data current'}</dd></div></dl>
                  </section>}
                  <label className="mt-5 block text-xs font-bold text-slate-700" htmlFor="weather-sync-location">Location</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input id="weather-sync-location" value={weatherLocation} maxLength={120} onChange={event=>{setWeatherLocation(event.target.value);setWeatherPreview(null);setWeatherError('');}} placeholder="e.g. Tacloban City" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900"/></div><button type="button" disabled={isWeatherBusy || weatherLocation.trim().length<2} onClick={() => void checkWeatherLocation()} className="rounded-lg border border-blue-300 bg-white px-4 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-50">{isWeatherBusy?'Checking…':'Check Location'}</button></div>
                  {weatherError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{weatherError}</p>}
                  {weatherPreview && <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Resolved location</p><p className="mt-1 text-sm font-bold text-slate-900">{weatherPreview.location.name}</p><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-500">Current weather</span><strong className="mt-1 block text-slate-900">{weatherPreview.weather.label}</strong></div><div><span className="text-slate-500">Visual state</span><strong className="mt-1 block capitalize text-slate-900">{weatherPreview.weather.effectiveTheme}</strong></div></div><button type="button" disabled={isWeatherBusy} onClick={() => void applyWeatherSync()} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{isWeatherBusy?'Applying…':'Apply Weather Sync'}</button></section>}
                </div>
              </div> : <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
                {Object.values(SYSTEM_THEMES).filter(theme => theme.enabled).map(theme => { const active = theme.id === systemTheme; return <button key={theme.id} type="button" aria-pressed={active} disabled={isThemeSaving || isWeatherBusy} onClick={() => void applySystemTheme(theme.id)} className={`relative rounded-xl border p-4 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}>
                  <span className="flex items-center justify-between gap-3"><span className="flex gap-1.5" aria-hidden="true"><span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{backgroundColor:theme.preview.primary}}/><span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{backgroundColor:theme.preview.secondary}}/><span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{backgroundColor:theme.preview.surface}}/></span>{active && <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white"><Check className="h-3 w-3"/>Current</span>}</span>
                  <strong className="mt-3 block text-sm text-slate-900">{theme.name}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{theme.description}</span>
                </button>; })}
              </div>}
              <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3.5"><p className="text-[11px] text-slate-500">Changes require confirmation and are recorded in the audit trail.</p><button type="button" onClick={() => { setIsThemeCatalogueOpen(false); setIsWeatherConfigOpen(false); }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Close</button></footer>
            </section>
          </div>}

        </div>

      </div>
    </header>
  );
};
