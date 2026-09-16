import React, { useState } from 'react';
import { downloadUrl } from '../services/http';
import { useApp } from '../context/AppContext';
import { useWorkspaceState } from '../services/workspace';
import { PayrollBatch, EmploymentClassification } from '../types';
import { 
  X, 
  Layers, 
  CheckCircle2, 
  ArrowRight, 
  Send, 
  CheckSquare, 
  Square, 
  UserCheck, 
  ShieldAlert, 
  FileText, 
  FileCheck2,
  Building2, 
  Calendar, 
  Barcode, 
  Split, 
  Printer,
  History,
  User,
  Eye,
  Paperclip,
  PauseCircle
} from 'lucide-react';

const payrollStatusLabel = (status: string) => ({
  In_Progress: 'In progress', Ready_For_Release: 'Ready for release',
  On_Hold: 'On hold', Ready_For_Recheck: 'Ready for recheck',
}[status] || status.replaceAll('_', ' '));
const payrollStatusStyle = (status: string) => status === 'On_Hold'
  ? 'bg-amber-50 text-amber-800 ring-amber-200'
  : ['Completed', 'Released'].includes(status) ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  : status === 'Ready_For_Release' ? 'bg-violet-50 text-violet-700 ring-violet-200'
  : 'bg-blue-50 text-blue-700 ring-blue-200';
const PayrollStatus: React.FC<{ status: string }> = ({ status }) => <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${payrollStatusStyle(status)}`}>{payrollStatusLabel(status)}</span>;
const payrollCount = (count: number) => `${count} payroll${count === 1 ? '' : 's'}`;
const classificationLabel = (value: string) => value === 'Job Order (JOW)' ? 'JOW/COS' : value;

interface Props {
  batch: PayrollBatch | null;
  isOpen: boolean;
  onClose: () => void;
  initialWorkGroupId?: string | null;
}

export const PayrollBatchDetailModal: React.FC<Props> = ({ 
  batch, 
  isOpen, 
  onClose, 
  initialWorkGroupId 
}) => {
  const { 
    payrollItems, 
    workGroups, 
    currentUser, 
    users,
    updatePayrollItemClassification, 
    bulkClassifyPayrollItems, 
    placePayrollItemHold,
    submitPayrollItemCompliance,
    resumePayrollItemHold,
    completeInitialCheckingAndRoute, 
    processWorkGroupItems, 
    releasePayrollBatch,
    employmentRoutingRules,
    can
  } = useApp();

  const [activeTab, setActiveTab] = useWorkspaceState<'workflow' | 'items' | 'audit'>(currentUser.id, 'payroll-batch-detail.tab', 'workflow');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [routeSelections, setRouteSelections] = useState<Record<string, string>>({});
  const [activeWorkGroupTab, setActiveWorkGroupTab] = useState<string>(initialWorkGroupId || '');
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  // Exception modal state
  const [holdingItemId, setHoldingItemId] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState('Missing DTR');
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [complianceItemId, setComplianceItemId] = useState<string | null>(null);
  const [complianceRemarks, setComplianceRemarks] = useState('');
  const [complianceFiles, setComplianceFiles] = useState<File[]>([]);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState<'all' | 'hold' | 'routing' | 'release'>('all');
  const [auditPage, setAuditPage] = useState(1);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  React.useEffect(() => { setShowReleaseModal(false); }, [isOpen, batch?.id]);

  // Release form state
  const [releasedTo, setReleasedTo] = useState(batch?.receivedFromLiaison || 'Office Liaison Officer');
  const [releaseMode, setReleaseMode] = useState<'In-Person Pick-up' | 'Official Courier' | 'Electronic Copy' | 'Internal Messenger'>('In-Person Pick-up');
  const [releaseRemarks, setReleaseRemarks] = useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const dialog = overlayRef.current?.querySelector<HTMLElement>(holdingItemId ? '[data-hold-dialog]' : complianceItemId ? '[data-compliance-dialog]' : showReleaseModal ? '[data-release-dialog]' : '[data-testid="payroll-batch-dialog"]');
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (holdingItemId) setHoldingItemId(null);
        else if (complianceItemId) setComplianceItemId(null);
        else if (showReleaseModal) setShowReleaseModal(false);
        else closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); previousFocus?.focus({ preventScroll: true }); };
  }, [isOpen, batch?.id, holdingItemId, complianceItemId, showReleaseModal]);

  React.useEffect(() => {
    if (!isOpen || !batch) {
      setActiveWorkGroupTab('');
      return;
    }
    const groups = workGroups.filter(group => group.batchId === batch.id);
    setActiveWorkGroupTab(current => {
      if (initialWorkGroupId && groups.some(group => group.id === initialWorkGroupId)) return initialWorkGroupId;
      if (groups.some(group => group.id === current)) return current;
      return groups.find(group => group.status !== 'Completed')?.id || groups[0]?.id || '';
    });
  }, [isOpen, batch?.id, initialWorkGroupId, workGroups]);

  if (!isOpen || !batch) return null;

  const items = payrollItems.filter(i => i.batchId === batch.id);
  const batchWorkGroups = workGroups.filter(w => w.batchId === batch.id);
  const progress = batch.progress;
  const initialCheckingItems = items.filter(item => (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'initial_checking');
  const initialCheckingDesk = batch.initialCheckingDesk || batch.assignedDesk;
  const canInitialCheck = can('canSupervise') || (
    initialCheckingDesk.userId
      ? initialCheckingDesk.userId === currentUser.id
      : initialCheckingDesk.assignmentType === 'Role'
        ? initialCheckingDesk.roleId === currentUser.role
        : initialCheckingDesk.assignmentType === 'Team'
          ? !!initialCheckingDesk.team && [currentUser.division, currentUser.office].includes(initialCheckingDesk.team)
          : false
  );
  const canSubmitCompliance = batch.encodedBy.userId === currentUser.id || can('canAdmin');
  const phaseAllowsHold = (phaseNumber: number) => batch.workflowStages?.find(stage => stage.stageNumber === phaseNumber)?.allowHold === true;

  // Count items by classification
  const jowCount = items.filter(i => (i.employmentClassification === 'JOW/COS' || i.employmentClassification === 'Job Order (JOW)') && i.status !== 'On_Hold').length;
  const casualCount = items.filter(i => i.employmentClassification === 'Casual' && i.status !== 'On_Hold').length;
  const regularCount = items.filter(i => i.employmentClassification === 'Regular' && i.status !== 'On_Hold').length;
  const onHoldCount = items.filter(i => i.status === 'On_Hold').length;
  const readyItems = initialCheckingItems.filter(item => item.status !== 'On_Hold' && item.verificationStatus === 'Passed' && !!item.employmentClassification);
  const unresolvedCount = initialCheckingItems.filter(item => item.status !== 'On_Hold' && (item.verificationStatus !== 'Passed' || !item.employmentClassification)).length;
  const readyForReleaseCount = items.filter(item => item.status === 'Ready_For_Release').length;
  const releasedCount = items.filter(item => item.status === 'Released').length;
  const allItemsReleased = progress.derivedStatus === 'COMPLETED';
  const processingStage = batch.workflowStages?.find(stage => stage.stageNumber === 3);
  const usesEmploymentRouting = processingStage?.payrollAssignmentSource !== 'workflow';
  const fixedProcessingAssignee = processingStage?.assignedTo.userName || processingStage?.assignedTo.roleTitle || 'Configured workflow assignee';
  const routingRuleFor = (classification: string) => employmentRoutingRules.find(rule => rule.classification === classification);
  const processorFor = (classification: string) => {
    if (!usesEmploymentRouting) return fixedProcessingAssignee;
    const rule = routingRuleFor(classification); if (!rule) return 'Not configured';
    if (rule.assignmentMode === 'pool') return 'Selected per payroll';
    if (rule.assignmentMode === 'team') return rule.assignedTeam || 'Team not configured';
    return rule.primaryProcessorName || 'Not configured';
  };
  const unresolvedPoolItems = usesEmploymentRouting ? readyItems.filter(item => {
    const classification=item.employmentClassification==='Job Order (JOW)'?'JOW/COS':item.employmentClassification || '';
    return routingRuleFor(classification)?.assignmentMode === 'pool' && !routeSelections[item.id];
  }) : [];
  const releaseDesk = batch.workflowStages?.find(stage => stage.stageNumber === 4)?.assignedTo;
  const canReleaseBatch = can('canSupervise') || !!releaseDesk && (
    releaseDesk.userId
      ? releaseDesk.userId === currentUser.id
      : releaseDesk.assignmentType === 'Role'
        ? releaseDesk.roleId === currentUser.role
        : releaseDesk.assignmentType === 'Team'
          ? !!releaseDesk.team && [currentUser.division, currentUser.office].includes(releaseDesk.team)
          : false
  );
  const lifecycleAudit = [
    ...(batch.workflowHistory || []).map(entry => ({ ...entry, itemBarcode: 'BATCH' })),
    ...items.flatMap(item => item.auditHistory.map(entry => ({ ...entry, itemBarcode: item.barcode }))),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const normalizedAuditQuery = auditQuery.trim().toLowerCase();
  const filteredAudit = lifecycleAudit.filter(entry => {
    const action = entry.action.toLowerCase();
    const matchesType = auditFilter === 'all'
      || (auditFilter === 'hold' && (action.includes('hold') || action.includes('compliance') || action.includes('exception')))
      || (auditFilter === 'routing' && (action.includes('route') || action.includes('assign') || action.includes('stage') || action.includes('group')))
      || (auditFilter === 'release' && action.includes('release'));
    const matchesQuery = !normalizedAuditQuery || [entry.actorName, entry.actorRole, entry.itemBarcode, entry.details, entry.action].some(value => String(value || '').toLowerCase().includes(normalizedAuditQuery));
    return matchesType && matchesQuery;
  });
  const auditPageCount = Math.max(1, Math.ceil(filteredAudit.length / 10));
  const visibleAudit = filteredAudit.slice((Math.min(auditPage, auditPageCount) - 1) * 10, Math.min(auditPage, auditPageCount) * 10);

  const phaseName = (number: number, fallback: string) => batch.workflowStages?.find(stage => stage.stageNumber === number)?.name || fallback;
  const phaseSummaries = [
    { number: 1, name: phaseName(1, 'Intake'), complete: true, active: false, detail: `${progress.stage1Completed} registered`, count: progress.stage1Completed },
    { number: 2, name: phaseName(2, 'Initial checking'), complete: progress.initialChecking.completed === progress.totalItems, active: progress.initialChecking.active > 0, detail: `${progress.initialChecking.completed} sorted · ${progress.initialChecking.active} remaining`, count: progress.initialChecking.completed },
    { number: 3, name: phaseName(3, 'Verification & signing'), complete: progress.management.completed === progress.totalItems, active: progress.management.active + progress.management.onHold > 0, detail: `${progress.management.active} processing · ${progress.management.onHold} on hold`, count: progress.management.completed },
    { number: 4, name: phaseName(4, 'Release'), complete: allItemsReleased, active: progress.release.ready > 0, detail: `${progress.release.ready} ready · ${progress.release.released} released`, count: progress.release.released },
  ];
  const batchStatusClass = progress.derivedStatus === 'PROCESSING_WITH_HOLDS' || progress.derivedStatus === 'ON_HOLD'
    ? 'bg-amber-100 text-amber-800'
    : progress.derivedStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800'
    : progress.derivedStatus.includes('RELEASE') ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';

  // Multi-select handlers
  const handleToggleSelect = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const initialItemIds = initialCheckingItems.map(item => item.id);
    if (initialItemIds.every(id => selectedItemIds.includes(id))) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(initialItemIds);
    }
  };

  const handleRouteInitialItems = async () => {
    if (unresolvedCount > 0 || readyItems.length === 0) return;
    if (unresolvedPoolItems.length > 0) return;
    if (!(await completeInitialCheckingAndRoute(batch.id, routeSelections))) return;
    // The routed records no longer belong to the Initial Checking selection.
    setSelectedItemIds([]);
    if (readyItems.length === initialCheckingItems.length) onClose();
  };

  const handleBulkClassify = async (classification: EmploymentClassification) => {
    if (selectedItemIds.length === 0) return;
    if (!(await bulkClassifyPayrollItems(selectedItemIds, classification, true))) return;
    setSelectedItemIds([]);
  };

  const handleOpenHoldModal = (itemId: string) => {
    setHoldingItemId(itemId);
    setExceptionReason('Missing DTR');
    setExceptionNotes('');
  };

  const handleOpenCompliance = (itemId: string) => {
    setComplianceItemId(itemId);
    setComplianceRemarks('');
    setComplianceFiles([]);
  };

  const handleConfirmHold = async () => {
    if (!holdingItemId) return;
    if (!(await placePayrollItemHold(holdingItemId, { reason: exceptionReason, remarks: exceptionNotes, files: [] }))) return;
    setHoldingItemId(null);
  };

  const handleConfirmCompliance = async () => {
    if (!complianceItemId) return;
    if (!(await submitPayrollItemCompliance(complianceItemId, { remarks: complianceRemarks, files: complianceFiles }))) return;
    setComplianceItemId(null);
  };

  const handleReleaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReleasing || !canReleaseBatch || readyForReleaseCount === 0) return;
    setIsReleasing(true);
    try {
      if (await releasePayrollBatch(batch.id, {
        releasedTo: releasedTo.trim(),
        releaseMode,
        receiptRemarks: releaseRemarks
      })) setShowReleaseModal(false);
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-xs sm:p-5">
      <div role="dialog" aria-modal="true" aria-label="Payroll batch details" data-testid="payroll-batch-dialog" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[92dvh]">
        <header className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Layers className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Payroll batch</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="break-all font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">{batch.batchNumber}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${batchStatusClass}`}>{progress.displayStatus}</span>
                </div>
                <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 sm:flex">
                  <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-slate-400" />{batch.payrollType}</span>
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="break-words">{batch.office}</span></span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => window.print()} title="Print batch transmittal" aria-label="Print batch transmittal" className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"><Printer className="h-4 w-4" /></button>
              <button type="button" onClick={onClose} aria-label="Close payroll batch" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>
            </div>
          </div>
        </header>

        <section aria-label="Batch progress" className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-6 sm:py-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:mb-3">
            <span className="font-semibold text-slate-700">Batch progress <span className="font-normal text-slate-500">&middot; {payrollCount(progress.totalItems)}</span></span>
            {items.length < progress.totalItems && <span className="text-slate-500">{items.length} visible to you</span>}
          </div>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {phaseSummaries.map(phase => <li key={phase.number} className={`min-w-0 rounded-xl border px-3 py-2.5 ${phase.active ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${phase.complete ? 'bg-emerald-100 text-emerald-700' : phase.active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{phase.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : phase.number}</span>
                <div className="min-w-0"><p title={phase.name} className="truncate text-xs font-semibold text-slate-800">{phase.name}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">{phase.detail}</p></div>
              </div>
              <div role="progressbar" aria-label={`Phase ${phase.number}: ${phase.name}`} aria-valuemin={0} aria-valuemax={progress.totalItems} aria-valuenow={phase.count} className="mt-2 hidden h-1 overflow-hidden rounded-full bg-slate-100 sm:block"><div className={`h-full rounded-full ${phase.complete ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, phase.count / Math.max(1, progress.totalItems) * 100)}%` }} /></div>
            </li>)}
          </ol>
        </section>

        <nav aria-label="Batch details" className="flex shrink-0 gap-5 overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
          {([
            { id: 'workflow', label: 'Processing', icon: Layers },
            { id: 'items', label: `Payroll items (${items.length})`, icon: FileText },
            { id: 'audit', label: 'Activity log', icon: History },
          ] as const).map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)} className={`flex shrink-0 items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}><tab.icon className="h-4 w-4" />{tab.label}</button>)}
        </nav>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-slate-50/60 p-4 sm:p-6">
          {batch.attachments.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs" aria-label="Batch attachments">
            <span className="mr-1 inline-flex items-center gap-1.5 font-semibold text-slate-600"><Paperclip className="h-4 w-4" />Attachments</span>
            {batch.attachments.map(file => file.url ? <a key={file.id} className="max-w-full break-all rounded-md bg-blue-50 px-2.5 py-1.5 text-blue-700 hover:underline" href={downloadUrl(file.id)}>{file.name}</a> : <span key={file.id} className="break-all text-slate-500">{file.name} (unavailable)</span>)}
          </div>}
          {/* TAB 1: WORKFLOW DESK & ACTIONS */}
          {activeTab === 'workflow' && (
            <div className="space-y-6">

              {/* STAGE 2: INITIAL CHECKING DESK */}
              {initialCheckingItems.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-700"><Split className="h-5 w-5" /></span>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Phase 2</p><h3 className="mt-0.5 text-base font-bold text-slate-900">{phaseName(2, 'Initial checking')}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Assigned to <strong className="text-slate-700">{initialCheckingDesk.userName}</strong>. Choose a classification and the responsible personnel for each payroll.</p></div>
                  </div>

                  {/* Classification Breakdown Summary Pill */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <p className="text-slate-500 font-medium">Total Items</p>
                      <p className="text-base font-bold text-slate-800">{items.length}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                      <p className="text-amber-800 font-medium">JOW / COS</p>
                      <p className="text-base font-bold text-amber-900">{jowCount}</p>
                      <p className="truncate text-[10px] text-amber-700">{processorFor('JOW/COS')}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200">
                      <p className="text-purple-800 font-medium">Casual</p>
                      <p className="text-base font-bold text-purple-900">{casualCount}</p>
                      <p className="truncate text-[10px] text-purple-700">{processorFor('Casual')}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                      <p className="text-emerald-800 font-medium">Regular Plantilla</p>
                      <p className="text-base font-bold text-emerald-900">{regularCount}</p>
                      <p className="truncate text-[10px] text-emerald-700">{processorFor('Regular')}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-red-50/70 border border-red-200">
                      <p className="text-red-800 font-medium">On Hold / Exceptions</p>
                      <p className="text-base font-bold text-red-900">{onHoldCount}</p>
                    </div>
                  </div>

                  {/* Bulk Classification Toolbar */}
                  {canInitialCheck && <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
                      >
                        {initialCheckingItems.every(item => selectedItemIds.includes(item.id)) ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                        <span>
                        {selectedItemIds.length > 0 
                            ? `${selectedItemIds.length} Selected` 
                            : 'Select All Items'}
                        </span>
                      </button>
                    </div>

                    {selectedItemIds.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500 font-medium">Classify selected:</span>
                        <button
                          onClick={() => handleBulkClassify('JOW/COS')}
                          className="px-3 py-2 text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg border border-amber-200 transition-colors"
                        >
                          Set JOW/COS
                        </button>
                        <button
                          onClick={() => handleBulkClassify('Casual')}
                          className="px-3 py-2 text-xs font-semibold bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg border border-purple-200 transition-colors"
                        >
                          Set Casual
                        </button>
                        <button
                          onClick={() => handleBulkClassify('Regular')}
                          className="px-3 py-2 text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg border border-emerald-200 transition-colors"
                        >
                          Set Regular
                        </button>
                      </div>
                    )}
                  </div>}

                  {/* Items List with 1-click classification */}
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                    {initialCheckingItems.map(item => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const isHeld = item.status === 'On_Hold';
                      const isReadyForRecheck = item.status === 'Ready_For_Recheck';
                      const normalizedClassification = item.employmentClassification === 'Job Order (JOW)' ? 'JOW/COS' : item.employmentClassification || '';
                      const itemRoutingRule = routingRuleFor(normalizedClassification);

                      return (
                        <div 
                          key={item.id} 
                          className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            isHeld 
                              ? 'bg-red-50/40' 
                              : isSelected 
                              ? 'bg-blue-50/40' 
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            {canInitialCheck && <button
                              type="button"
                              aria-label={`Select payroll ${item.barcode}`}
                              aria-pressed={isSelected}
                              onClick={() => handleToggleSelect(item.id)}
                              className="mt-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>}

                            <div className="min-w-0">
                              <p className="mb-2 break-words text-sm font-semibold text-slate-900">{item.title}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-900">{item.barcode}</span>
                                {item.employmentClassification ? (
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    item.employmentClassification === 'JOW/COS' || item.employmentClassification === 'Job Order (JOW)'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : item.employmentClassification === 'Casual'
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  }`}>
                                    {item.employmentClassification}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                                    Unclassified
                                  </span>
                                )}

                                {isHeld && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3" />
                                    <span>On hold</span>
                                  </span>
                                )}
                                {isReadyForRecheck && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                                    Ready for recheck
                                  </span>
                                )}
                              </div>
                              {(isHeld || isReadyForRecheck) && (item.holdReason || item.exceptionReason) && (
                                <p className="text-[11px] text-red-700 mt-0.5 font-medium">
                                  {isReadyForRecheck ? 'Previous hold' : 'Hold'}: {item.holdReason || item.exceptionReason} {item.holdRemarks || item.exceptionNotes ? `(${item.holdRemarks || item.exceptionNotes})` : ''}
                                </p>
                              )}
                              {isReadyForRecheck && item.complianceRemarks && <p className="text-[11px] text-sky-700 mt-0.5">Compliance received: {item.complianceRemarks}</p>}
                            </div>
                          </div>

                          {/* Action Buttons for this item */}
                          {canInitialCheck && <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:max-w-[55%] sm:justify-end">
                            {usesEmploymentRouting && itemRoutingRule?.assignmentMode === 'pool' && item.verificationStatus === 'Passed' && !isHeld && <select aria-label={`Assign ${item.barcode} to`} value={routeSelections[item.id] || ''} onChange={event => setRouteSelections(current => ({...current,[item.id]:event.target.value}))} className="w-full max-w-full rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-slate-700"><option value="">Choose personnel...</option>{(itemRoutingRule.eligibleProcessorIds || []).map(id => { const user=users.find(person => person.id===id); return user?<option key={id} value={id}>{user.name} — {user.roleTitle}</option>:null; })}</select>}
                            {/* Classification Quick-Pick */}
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                              <button
                                onClick={async () => await updatePayrollItemClassification(item.id, 'JOW/COS')}
                                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  item.employmentClassification === 'JOW/COS'
                                    ? 'bg-amber-500 text-white'
                                    : 'text-amber-800 hover:bg-amber-50'
                                }`}
                              >
                                JOW/COS
                              </button>
                              <div className="w-px h-4 bg-slate-200" />
                              <button
                                onClick={async () => await updatePayrollItemClassification(item.id, 'Casual')}
                                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  item.employmentClassification === 'Casual'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-purple-800 hover:bg-purple-50'
                                }`}
                              >
                                Casual
                              </button>
                              <div className="w-px h-4 bg-slate-200" />
                              <button
                                onClick={async () => await updatePayrollItemClassification(item.id, 'Regular')}
                                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  item.employmentClassification === 'Regular'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-emerald-800 hover:bg-emerald-50'
                                }`}
                              >
                                Regular
                              </button>
                            </div>

                            {/* Exception / Hold Button */}
                            {isHeld ? (
                              <div className="flex items-center gap-2">
                                {canSubmitCompliance && <button onClick={() => handleOpenCompliance(item.id)} className="px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 border border-sky-200 rounded-lg transition-colors">Submit Compliance</button>}
                                <button onClick={async () => await resumePayrollItemHold(item.id)} className="px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors">Clear Hold &amp; Resume</button>
                              </div>
                            ) : isReadyForRecheck ? (
                              <div className="flex items-center gap-2">
                                <button onClick={async () => await resumePayrollItemHold(item.id)} className="px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors">Verify / Recheck</button>
                                <button onClick={() => handleOpenHoldModal(item.id)} className="px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors">Hold Again</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenHoldModal(item.id)}
                                title="Flag item for exception / missing documents"
                                className="px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                              >
                                Hold
                              </button>
                            )}
                          </div>}
                          {!canInitialCheck && isHeld && canSubmitCompliance && (
                            <button onClick={() => handleOpenCompliance(item.id)} className="self-end sm:self-center px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 border border-sky-200 rounded-lg">Submit Compliance</button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Route & Complete Initial Checking */}
                  {canInitialCheck && <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-col gap-4">
                    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="text-xs text-slate-700 space-y-0.5">
                      <p className="font-bold text-slate-900">Send to verification & signing</p>
                      <p className="text-slate-600">
                        {unresolvedCount > 0 ? (
                          <span className="text-red-600 font-semibold">
                            {payrollCount(unresolvedCount)} still need a classification and verification.
                          </span>
                        ) : (
                          <span>
                            {payrollCount(readyItems.length)} ready to route. {initialCheckingItems.filter(item => item.status === 'On_Hold').length > 0 && `${payrollCount(initialCheckingItems.filter(item => item.status === 'On_Hold').length)} on hold will stay here.`}
                          </span>
                        )}
                      </p>
                      {unresolvedCount === 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                          {(['JOW/COS', 'Casual', 'Regular'] as const).map(classification => {
                            const count = readyItems.filter(item => classification === 'JOW/COS' ? ['JOW/COS', 'Job Order (JOW)'].includes(item.employmentClassification || '') : item.employmentClassification === classification).length;
                            return count > 0 ? <span key={classification}><strong>{classification}:</strong> {count} &rarr; {processorFor(classification)}</span> : null;
                          })}
                          {unresolvedPoolItems.length > 0 && <span className="text-amber-800">Choose personnel for {payrollCount(unresolvedPoolItems.length)}.</span>}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        await handleRouteInitialItems();
                      }}
                      disabled={unresolvedCount > 0 || readyItems.length === 0 || unresolvedPoolItems.length > 0}
                      title={unresolvedPoolItems.length > 0 ? `Choose a processor for ${unresolvedPoolItems.length} payroll item(s)` : unresolvedCount > 0 ? `${unresolvedCount} payroll item(s) still need verification and classification` : 'Route only the verified payroll items'}
                      className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center gap-2 shrink-0 transition-all"
                    >
                      <span>Complete &amp; Route {readyItems.length} Payroll{readyItems.length === 1 ? '' : 's'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    </div>
                  </div>}
                </div>
              )}

              {/* STAGE 3: PARALLEL WORK GROUPS DESK */}
              {batchWorkGroups.length > 0 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700"><UserCheck className="h-5 w-5" /></span>
                      <div><p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Phase 3</p><h3 className="mt-0.5 text-base font-bold text-slate-900">{phaseName(3, 'Verification & signing')}</h3><p className="mt-1 text-xs text-slate-500">Payrolls grouped by classification and assigned personnel.</p></div>
                    </div>
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">{batchWorkGroups.length} {batchWorkGroups.length === 1 ? 'group' : 'groups'}</span>
                  </div>

                  <div role="tablist" aria-label="Personnel groups" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {batchWorkGroups.map(wg => {
                      const isActive = activeWorkGroupTab === wg.id;
                      const groupItems = items.filter(item => wg.itemIds.includes(item.id));
                      const completedCount = groupItems.filter(item => ['Ready_For_Release', 'Released', 'Completed'].includes(item.status)).length;
                      return <button key={wg.id} type="button" role="tab" id={`group-tab-${wg.id}`} aria-controls={`group-panel-${wg.id}`} aria-selected={isActive} aria-label={`${classificationLabel(wg.classification)} \u2014 ${wg.assignedProcessorName}`} onClick={() => setActiveWorkGroupTab(wg.id)} className={`min-w-0 rounded-xl border p-3.5 text-left transition-colors ${isActive ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                        <span className="flex items-center justify-between gap-2"><span className={`text-xs font-bold ${isActive ? 'text-blue-800' : 'text-slate-700'}`}>{classificationLabel(wg.classification)}</span>{wg.status === 'Completed' ? <CheckCircle2 aria-label="Completed" className="h-4 w-4 text-emerald-600" /> : <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-blue-600' : 'bg-slate-300'}`} />}</span>
                        <span className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><User className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{wg.assignedProcessorName}</span></span>
                        <span className="mt-1.5 block text-[11px] text-slate-500">{payrollCount(groupItems.length)} &middot; {completedCount} complete</span>
                      </button>;
                    })}
                  </div>

                  {/* Active Work Group Details */}
                  {batchWorkGroups.filter(w => w.id === activeWorkGroupTab).map(wg => {
                    const wgItems = items.filter(i => wg.itemIds.includes(i.id));
                    const isUserAssigned = currentUser.id === wg.assignedProcessorId || !!wg.assignedTeam && [currentUser.division,currentUser.office].includes(wg.assignedTeam) || !!wg.assignedRoleId && wg.assignedRoleId === currentUser.role;
                    const isCompleted = wg.status === 'Completed';

                    return (
                      <div key={wg.id} role="tabpanel" id={`group-panel-${wg.id}`} aria-labelledby={`group-tab-${wg.id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:px-5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{classificationLabel(wg.classification)} payrolls</h4><PayrollStatus status={wg.status} /></div>
                            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500"><UserCheck className="h-3.5 w-3.5" /><strong className="text-slate-700">{wg.assignedProcessorName}</strong><span>&middot; {wg.assignedProcessorRoleTitle}</span></p>
                          </div>
                          {isUserAssigned && !isCompleted && wgItems.some(item => item.status === 'In_Progress') ? <button type="button" onClick={async () => await processWorkGroupItems(wg.id, wgItems.filter(item => item.status === 'In_Progress').map(i => i.id), 'complete')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" />Complete group ({wgItems.filter(item => item.status === 'In_Progress').length})</button> : !isUserAssigned && <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500"><Eye className="h-3.5 w-3.5" />View only</span>}
                        </div>

                        <div className="divide-y divide-slate-100">
                          {wgItems.map(item => (
                            <div key={item.id} className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                                <div className="min-w-0">
                                  <p className="break-words text-sm font-semibold text-slate-900">{item.title}</p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2"><span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-500"><Barcode className="h-3.5 w-3.5" />{item.barcode}</span><PayrollStatus status={item.status} /></div>
                                  {item.office && <p className="mt-1.5 break-words text-[11px] text-slate-500">{item.office}</p>}
                                  {['On_Hold', 'Ready_For_Recheck'].includes(item.status) && (item.holdReason || item.exceptionReason) && <p className="mt-2 text-xs text-amber-800">{item.holdReason || item.exceptionReason}{item.holdRemarks ? ` \u00b7 ${item.holdRemarks}` : ''}</p>}
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">

                                 {isUserAssigned && item.status === 'In_Progress' && (
                                  <>
                                  <button
                                    onClick={async () => await processWorkGroupItems(wg.id, [item.id], 'complete')}
                                    className="px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors"
                                  >
                                    Verify &amp; Sign
                                  </button>
                                  {phaseAllowsHold(3) && <button onClick={() => handleOpenHoldModal(item.id)} className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition-colors">Hold</button>}
                                  </>
                                 )}
                                {item.status === 'On_Hold' && canSubmitCompliance && <button onClick={() => handleOpenCompliance(item.id)} className="px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md border border-sky-200">Submit Compliance</button>}
                                {isUserAssigned && item.status === 'On_Hold' && <button onClick={async () => await resumePayrollItemHold(item.id)} className="px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200">Clear Hold &amp; Resume</button>}
                                {isUserAssigned && item.status === 'Ready_For_Recheck' && <button onClick={async () => await resumePayrollItemHold(item.id)} className="px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200">Recheck &amp; Resume</button>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                </div>
              )}

              {/* STAGE 4: RELEASE OF PAYROLL DESK */}
              {canReleaseBatch && items.some(item => item.currentStage === 'release' && item.status !== 'Released') && (
                <section aria-label="Release payrolls" className="space-y-4 border-t border-slate-200 pt-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700"><Send className="h-5 w-5" /></span>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Phase 4</p><h3 className="mt-0.5 text-base font-bold text-slate-900">{phaseName(4, 'Release')}</h3><p className="mt-1 text-xs text-slate-500">{payrollCount(readyForReleaseCount)} ready for release.{items.length - readyForReleaseCount - releasedCount > 0 ? ` ${payrollCount(items.length - readyForReleaseCount - releasedCount)} still being processed or on hold.` : ''}</p></div>
                  </div>
                  <div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">Payrolls at the release desk</div>
                      <div className="divide-y divide-slate-100">
                        {items.filter(item => item.currentStage === 'release' && item.status !== 'Released').map(item => <div key={item.id} className="space-y-3 p-4">
                          <div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-slate-900">{item.title}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-500">{item.barcode}</span><PayrollStatus status={item.status} /></div></div></div>
                          <div className="flex flex-wrap gap-2">
                            {item.status === 'Ready_For_Release' && phaseAllowsHold(4) && <button type="button" onClick={() => handleOpenHoldModal(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"><PauseCircle className="h-3.5 w-3.5" />Hold</button>}
                            {item.status === 'On_Hold' && canSubmitCompliance && <button type="button" onClick={() => handleOpenCompliance(item.id)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">Submit compliance</button>}
                            {item.status === 'On_Hold' && <button type="button" onClick={async () => await resumePayrollItemHold(item.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Clear hold &amp; resume</button>}
                            {item.status === 'Ready_For_Recheck' && <button type="button" onClick={async () => await resumePayrollItemHold(item.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Recheck &amp; resume</button>}
                          </div>
                        </div>)}
                      </div>
                    </div>

                  </div>
                </section>
              )}

              {/* COMPLETED STAGE */}
              {allItemsReleased && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-900">
                          Batch released
                        </h4>
                        <p className="text-xs text-emerald-700">
                          Released to <strong>{batch.releaseDetails?.releasedTo}</strong> via {batch.releaseDetails?.releaseMode} on{' '}
                          {batch.releaseDetails?.releasedAt ? new Date(batch.releaseDetails.releasedAt).toLocaleDateString() : 'N/A'}.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-2">
                    <p className="font-bold text-slate-800">Transmittal Summary</p>
                    <p>Total Items: {items.length} ({jowCount} JOW/COS, {casualCount} Casual, {regularCount} Regular)</p>
                    <p>Released by: {batch.releaseDetails?.releasedBy || 'Unknown'}</p>
                    {batch.releaseDetails?.receiptRemarks && (
                      <p>Remarks: {batch.releaseDetails.receiptRemarks}</p>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {activeTab === 'items' && <section className="space-y-4">
            <div><h3 className="text-base font-bold text-slate-900">Payroll items</h3><p className="mt-1 text-xs text-slate-500">{payrollCount(items.length)}{items.length < progress.totalItems ? ' visible to you' : ' in this batch'}</p></div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {items.map(item => <div key={item.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                <div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{item.title}</p><div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="font-mono">{item.barcode}</span><span>&middot;</span><span>{classificationLabel(item.employmentClassification || 'Unclassified')}</span></div>{item.assignedToName && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500"><User className="h-3.5 w-3.5" />{item.assignedToName}</p>}</div></div>
                <PayrollStatus status={item.status} />
              </div>)}
            </div>
          </section>}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Audit Trail</h4><p className="mt-0.5 text-[11px] text-slate-500">{filteredAudit.length} of {lifecycleAudit.length} events · newest first</p></div>
                <div className="flex flex-1 flex-col gap-2 sm:max-w-2xl sm:flex-row">
                  <input value={auditQuery} onChange={event => { setAuditQuery(event.target.value); setAuditPage(1); }} placeholder="Search person, item, or activity…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-hidden focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  <select value={auditFilter} onChange={event => { setAuditFilter(event.target.value as typeof auditFilter); setAuditPage(1); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-hidden focus:border-blue-400">
                    <option value="all">All activities</option><option value="hold">Holds &amp; compliance</option><option value="routing">Routing &amp; assignments</option><option value="release">Releases</option>
                  </select>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {visibleAudit.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">No audit events match these filters.</div> : visibleAudit.map(aud => {
                  const expanded = expandedAuditId === aud.id;
                  const isHoldEvent = /hold|compliance|exception/i.test(aud.action);
                  const isReleaseEvent = /release/i.test(aud.action);
                  return <button type="button" key={aud.id} onClick={() => setExpandedAuditId(expanded ? null : aud.id)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left text-xs last:border-b-0 hover:bg-slate-50">
                    <span className={`mt-1 h-2 w-2 rounded-full ${isHoldEvent ? 'bg-amber-500' : isReleaseEvent ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                    <span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><strong className="shrink-0 text-slate-900">{aud.actorName}</strong><span className="truncate text-[11px] text-slate-400">{aud.actorRole}</span><span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700">{aud.itemBarcode}</span></span><span className={`mt-0.5 block text-slate-600 ${expanded ? '' : 'truncate'}`}>{aud.details}</span>{expanded && <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-slate-400">{aud.action.replaceAll('_', ' ')}</span>}</span>
                    <span className="whitespace-nowrap text-[10px] text-slate-400">{new Date(aud.timestamp).toLocaleString()}</span>
                  </button>;
                })}
              </div>
              {auditPageCount > 1 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Page {Math.min(auditPage, auditPageCount)} of {auditPageCount}</span><div className="flex gap-2"><button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage(page => page - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={auditPage >= auditPageCount} onClick={() => setAuditPage(page => page + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
            </div>
          )}

        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <p className="flex min-w-0 items-center gap-2 text-[11px] leading-relaxed text-slate-500"><Calendar className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" /><span>Registered {new Date(batch.dateEncoded).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })}<span className="hidden sm:inline"> by {batch.encodedBy.userName}</span></span></p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            {canReleaseBatch && readyForReleaseCount > 0 && <button type="button" onClick={() => setShowReleaseModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"><Send className="h-4 w-4" />Release payrolls ({readyForReleaseCount})</button>}
          </div>
        </footer>
      </div>

      {showReleaseModal && canReleaseBatch && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <form onSubmit={handleReleaseSubmit} role="dialog" aria-modal="true" aria-label="Release payrolls" data-release-dialog className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Send className="h-5 w-5" /></span><div><h3 className="text-base font-bold text-slate-900">Release payrolls</h3><p className="mt-1 text-xs text-slate-500">{payrollCount(readyForReleaseCount)} ready in {batch.batchNumber}</p></div></div>
              <button type="button" aria-label="Close release form" onClick={() => setShowReleaseModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 overflow-y-auto">
                      <div className="space-y-4 p-4 sm:p-5">
                        <label className="block text-xs font-semibold text-slate-700">Recipient <span className="text-rose-500">*</span><input type="text" required value={releasedTo} onChange={e => setReleasedTo(e.target.value)} placeholder="Name of recipient or liaison" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                        <label className="block text-xs font-semibold text-slate-700">Release method<select value={releaseMode} onChange={e => setReleaseMode(e.target.value as typeof releaseMode)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="In-Person Pick-up">In-person pickup (office liaison)</option><option value="Official Courier">Official courier</option><option value="Electronic Copy">Electronic copy</option><option value="Internal Messenger">Internal messenger</option></select></label>
                        <label className="block text-xs font-semibold text-slate-700">Receipt remarks <span className="font-normal text-slate-400">(optional)</span><textarea rows={2} value={releaseRemarks} onChange={e => setReleaseRemarks(e.target.value)} placeholder="Receipt number or handover notes" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                      </div>
            </div>
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setShowReleaseModal(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={isReleasing || readyForReleaseCount === 0 || !releasedTo.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{isReleasing ? 'Releasing...' : `Release ${payrollCount(readyForReleaseCount)}`}</button>
            </footer>
          </form>
        </div>
      )}

      {/* Reason for hold Dialog */}
      {holdingItemId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-label="Place payroll on hold" data-hold-dialog className="max-h-[90dvh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-700">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Place payroll on hold</h3>
            </div>
            <p className="text-xs text-slate-500">
              This payroll stays in its current phase until the missing requirements are provided.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for hold
              </label>
              <select
                value={exceptionReason}
                onChange={e => setExceptionReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <option value="Missing DTR">Missing DTR</option>
                <option value="Missing Signature">Missing Signature</option>
                <option value="Incomplete Attachments">Incomplete Attachments</option>
                <option value="Missing Certification">Missing Certification</option>
                <option value="Incorrect Supporting Document">Incorrect Supporting Document</option>
                <option value="For Clarification">For Clarification</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Notes {exceptionReason === 'Other' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                rows={2}
                value={exceptionNotes}
                onChange={e => setExceptionNotes(e.target.value)}
                placeholder="Describe what needs to be provided or corrected."
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setHoldingItemId(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHold}
                disabled={exceptionReason === 'Other' && !exceptionNotes.trim()}
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Hold Item
              </button>
            </div>
          </div>
        </div>
      )}
      {complianceItemId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-label="Submit compliance" data-compliance-dialog className="max-h-[90dvh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-sky-700">
              <FileCheck2 className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Submit Hold Compliance</h3>
            </div>
            <p className="text-xs text-slate-500">The item remains in its current phase and is marked ready for the assigned processor to recheck.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Compliance Remarks</label>
              <textarea rows={3} value={complianceRemarks} onChange={e => setComplianceRemarks(e.target.value)} placeholder="e.g. Missing DTR submitted by liaison." className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-hidden" />
            </div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Compliance Attachment (Optional)</label><input type="file" multiple onChange={event => setComplianceFiles(Array.from(event.target.files || []))} className="block w-full text-xs text-slate-600" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setComplianceItemId(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleConfirmCompliance} disabled={!complianceRemarks.trim()} className="px-4 py-1.5 bg-sky-600 text-white text-xs font-bold rounded-lg hover:bg-sky-700 disabled:opacity-50">Submit Compliance</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
