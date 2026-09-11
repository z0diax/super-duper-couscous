import React, { useState } from 'react';
import { downloadUrl } from '../services/http';
import { useApp } from '../context/AppContext';
import { useWorkspaceState } from '../services/workspace';
import { 
  PayrollBatch, 
  PayrollItem, 
  WorkGroup, 
  EmploymentClassification, 
  PayrollItemVerificationStatus 
} from '../types';
import { 
  X, 
  Layers, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  Send, 
  CheckSquare, 
  Square, 
  UserCheck, 
  ShieldAlert, 
  FileText, 
  Building2, 
  Calendar, 
  Barcode, 
  Split, 
  ChevronRight,
  Printer,
  History,
  Info,
  User,
  ExternalLink
} from 'lucide-react';

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
    markPayrollItemException, 
    clearPayrollItemException, 
    completeInitialCheckingAndRoute, 
    processWorkGroupItems, 
    releasePayrollBatch,
    employmentRoutingRules,
    can
  } = useApp();

  const [activeTab, setActiveTab] = useWorkspaceState<'workflow' | 'items' | 'audit'>(currentUser.id, 'payroll-batch-detail.tab', 'workflow');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [activeWorkGroupTab, setActiveWorkGroupTab] = useState<string>(initialWorkGroupId || '');

  // Exception modal state
  const [holdingItemId, setHoldingItemId] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState('Missing or incomplete Daily Time Record (DTR)');
  const [exceptionNotes, setExceptionNotes] = useState('');

  // Release form state
  const [releasedTo, setReleasedTo] = useState(batch?.receivedFromLiaison || 'Office Liaison Officer');
  const [releaseMode, setReleaseMode] = useState<'In-Person Pick-up' | 'Official Courier' | 'Electronic Copy' | 'Internal Messenger'>('In-Person Pick-up');
  const [releaseRemarks, setReleaseRemarks] = useState('');

  if (!isOpen || !batch) return null;

  const items = payrollItems.filter(i => i.batchId === batch.id);
  const batchWorkGroups = workGroups.filter(w => w.batchId === batch.id);
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

  // Set default active workgroup tab if not set
  if (!activeWorkGroupTab && batchWorkGroups.length > 0) {
    setActiveWorkGroupTab(batchWorkGroups[0].id);
  }

  // Count items by classification
  const jowCount = items.filter(i => (i.employmentClassification === 'JOW/COS' || i.employmentClassification === 'Job Order (JOW)') && i.status !== 'On_Hold').length;
  const casualCount = items.filter(i => i.employmentClassification === 'Casual' && i.status !== 'On_Hold').length;
  const regularCount = items.filter(i => i.employmentClassification === 'Regular' && i.status !== 'On_Hold').length;
  const onHoldCount = items.filter(i => i.status === 'On_Hold').length;
  const unclassifiedCount = items.filter(i => !i.employmentClassification && i.status !== 'On_Hold').length;
  const readyItems = initialCheckingItems.filter(item => item.status !== 'On_Hold' && item.verificationStatus === 'Passed' && !!item.employmentClassification);
  const unresolvedCount = initialCheckingItems.filter(item => item.status !== 'On_Hold' && (item.verificationStatus !== 'Passed' || !item.employmentClassification)).length;
  const processingCount = items.filter(item => (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'verification_signing').length;
  const readyForReleaseCount = items.filter(item => item.status === 'Ready_For_Release').length;
  const releasedCount = items.filter(item => item.status === 'Released').length;
  const stage3CompletedCount = items.filter(item => ['Ready_For_Release', 'Released'].includes(item.status)).length;
  const processorFor = (classification: string) => employmentRoutingRules.find(rule => rule.classification === classification)?.primaryProcessorName || 'Processor not configured';
  const releaseDesk = batch.workflowStages?.find(stage => stage.stageNumber === 4)?.assignedTo;
  const lifecycleAudit = [
    ...(batch.workflowHistory || []).map(entry => ({ ...entry, itemBarcode: 'BATCH' })),
    ...items.flatMap(item => item.auditHistory.map(entry => ({ ...entry, itemBarcode: item.barcode }))),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const allWorkGroupsCompleted = batchWorkGroups.length > 0 && batchWorkGroups.every(w => w.status === 'Completed');
  const hasConcurrentStages = initialCheckingItems.length > 0 && (processingCount > 0 || readyForReleaseCount > 0 || releasedCount > 0);
  const batchStageLabel = hasConcurrentStages
    ? `Concurrent processing: ${initialCheckingItems.length} in Initial Checking`
    : batch.currentStageName;

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
    if (!(await completeInitialCheckingAndRoute(batch.id))) return;
    // The routed records no longer belong to the Initial Checking selection.
    setSelectedItemIds([]);
  };

  const handleBulkClassify = async (classification: EmploymentClassification) => {
    if (selectedItemIds.length === 0) return;
    if (!(await bulkClassifyPayrollItems(selectedItemIds, classification, true))) return;
    setSelectedItemIds([]);
  };

  const handleOpenHoldModal = (itemId: string) => {
    setHoldingItemId(itemId);
    setExceptionReason('Missing or incomplete Daily Time Record (DTR)');
    setExceptionNotes('');
  };

  const handleConfirmHold = async () => {
    if (!holdingItemId) return;
    if (!(await markPayrollItemException(holdingItemId, exceptionReason, exceptionNotes))) return;
    setHoldingItemId(null);
  };

  const handleReleaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await releasePayrollBatch(batch.id, {
      releasedTo,
      releaseMode,
      receiptRemarks: releaseRemarks
    }))) return;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[94vh]">
        
        {batch.attachments.length > 0 && <div className="p-3 bg-blue-50 flex flex-wrap gap-3 text-xs" aria-label="Batch attachments">
          {batch.attachments.map(file => file.url ? <a key={file.id} className="text-blue-700 underline" href={downloadUrl(file.id)}>{file.name}</a> : <span key={file.id}>{file.name} (original file unavailable)</span>)}
        </div>}
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm text-slate-900">{batch.batchNumber}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  batch.currentStage === 'initial_checking' 
                    ? 'bg-amber-100 text-amber-800'
                    : batch.currentStage === 'verification_signing'
                    ? 'bg-blue-100 text-blue-800'
                    : batch.currentStage === 'release'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {batchStageLabel}
                </span>
                <span className="text-xs text-slate-400">&bull;</span>
                <span className="text-xs text-slate-600 font-medium truncate">{batch.office}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {batch.payrollType} &bull; Total: {items.length} &bull; Processing: {processingCount} &bull; On hold at Initial Checking: {onHoldCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              title="Print Batch Transmittal"
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors hidden sm:inline-flex"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4-Stage Lifecycle Stepper */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200/80">
          <div className="grid grid-cols-4 gap-2">
            {/* Stage 1: Docketing */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">1. Docketing</p>
                <p className="text-[10px] text-emerald-600 truncate">Completed by {batch.encodedBy.userName}</p>
              </div>
            </div>

            {/* Stage 2: Initial Checking */}
            <div className="flex items-center gap-2">
              <div className={`relative isolate w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                initialCheckingItems.length > 0
                  ? 'bg-amber-500 text-white ring-2 ring-amber-400/30'
                  : 'bg-emerald-600 text-white'
              }`}>
                {initialCheckingItems.length > 0 && <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-amber-400 opacity-60 animate-ping motion-reduce:animate-none" />}
                <span className="relative">{initialCheckingItems.length > 0 ? '2' : <CheckCircle2 className="w-3.5 h-3.5" />}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">2. Initial Checking</p>
                <p className="text-[10px] text-slate-500 truncate">Assigned to {initialCheckingDesk.userName}</p>
              </div>
            </div>

            {/* Stage 3: Verification & Signing */}
            <div className="flex items-center gap-2">
              <div className={`relative isolate w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                processingCount > 0
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400/30'
                  : stage3CompletedCount > 0
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {processingCount > 0 && <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-blue-500 opacity-60 animate-ping motion-reduce:animate-none" />}
                <span className="relative">{stage3CompletedCount > 0 && processingCount === 0 ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  '3'
                )}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">3. Parallel Groups</p>
                <p className="text-[10px] text-slate-500 truncate">Dynamic assignment by employment classification</p>
              </div>
            </div>

            {/* Stage 4: Release */}
            <div className="flex items-center gap-2">
              <div className={`relative isolate w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                batch.currentStage === 'completed' || (releasedCount > 0 && readyForReleaseCount === 0)
                  ? 'bg-emerald-600 text-white'
                  : readyForReleaseCount > 0
                  ? 'bg-purple-600 text-white ring-2 ring-purple-400/30'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {readyForReleaseCount > 0 && <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-purple-500 opacity-60 animate-ping motion-reduce:animate-none" />}
                <span className="relative">{batch.currentStage === 'completed' || (releasedCount > 0 && readyForReleaseCount === 0) ? <CheckCircle2 className="w-3.5 h-3.5" /> : '4'}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">4. Release</p>
                <p className="text-[10px] text-slate-500 truncate">Assigned to {releaseDesk?.userName || 'Release desk'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('workflow')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'workflow'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Workflow Desk &amp; Actions</span>
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'items'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Items Masterlist ({items.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Trail</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: WORKFLOW DESK & ACTIONS */}
          {activeTab === 'workflow' && (
            <div className="space-y-6">

              {/* STAGE 2: INITIAL CHECKING DESK */}
              {initialCheckingItems.length > 0 && batch.currentStage !== 'completed' && (
                <div className="space-y-4">
                  {/* Desk Info Banner */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-900">
                          Stage 2: Initial Checking Workspace
                        </h4>
                        <p className="text-xs text-amber-700">
                          Assigned to <strong>{initialCheckingDesk.userName}</strong> ({initialCheckingDesk.roleTitle}). Review all payroll items, designate employment classification, and verify completeness before auto-routing to parallel workgroups.
                        </p>
                      </div>
                    </div>

                    {/* Quick Switch to Karl button if not currently Karl */}
                    {false && (
                      <></>
                    )}
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
                    </div>
                    <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200">
                      <p className="text-purple-800 font-medium">Casual</p>
                      <p className="text-base font-bold text-purple-900">{casualCount}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                      <p className="text-emerald-800 font-medium">Regular Plantilla</p>
                      <p className="text-base font-bold text-emerald-900">{regularCount}</p>
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
                        {selectedItemIds.length === items.length ? (
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
                        <span className="text-xs text-slate-500 font-medium">Bulk Designate:</span>
                        <button
                          onClick={() => handleBulkClassify('JOW/COS')}
                          className="px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg border border-amber-200 transition-colors"
                        >
                          Set JOW/COS
                        </button>
                        <button
                          onClick={() => handleBulkClassify('Casual')}
                          className="px-2.5 py-1 text-xs font-semibold bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg border border-purple-200 transition-colors"
                        >
                          Set Casual
                        </button>
                        <button
                          onClick={() => handleBulkClassify('Regular')}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg border border-emerald-200 transition-colors"
                        >
                          Set Regular
                        </button>
                      </div>
                    )}
                  </div>}

                  {/* Items List with 1-click classification */}
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                    {initialCheckingItems.map((item, idx) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const isHeld = item.status === 'On_Hold';

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
                            <button
                              onClick={() => handleToggleSelect(item.id)}
                              className="mt-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>

                            <div className="min-w-0">
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
                                    <span>ON HOLD</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-slate-700 mt-0.5">{item.title}</p>
                              {isHeld && item.exceptionReason && (
                                <p className="text-[11px] text-red-700 mt-0.5 font-medium">
                                  Exception: {item.exceptionReason} {item.exceptionNotes ? `(${item.exceptionNotes})` : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons for this item */}
                          {canInitialCheck && <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
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
                              <button
                                onClick={async () => await clearPayrollItemException(item.id)}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                              >
                                Clear Hold
                              </button>
                            ) : (
                              <button
                                onClick={() => handleOpenHoldModal(item.id)}
                                title="Flag item for exception / missing documents"
                                className="px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                              >
                                Hold
                              </button>
                            )}
                          </div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Route & Complete Initial Checking */}
                  {canInitialCheck && <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-700 space-y-0.5">
                      <p className="font-bold text-slate-900">Ready to Split into Parallel Work Groups?</p>
                      <p className="text-slate-600">
                        {unresolvedCount > 0 ? (
                          <span className="text-red-600 font-semibold">
                            {unresolvedCount} payroll item(s) still require verification and a classification.
                          </span>
                        ) : (
                          <span>
                            {readyItems.length} payroll(s) ready to route. {onHoldCount} payroll(s) on hold will remain in Initial Checking and can resume independently.
                          </span>
                        )}
                      </p>
                      {unresolvedCount === 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                          {(['JOW/COS', 'Casual', 'Regular'] as const).map(classification => {
                            const count = readyItems.filter(item => classification === 'JOW/COS' ? ['JOW/COS', 'Job Order (JOW)'].includes(item.employmentClassification || '') : item.employmentClassification === classification).length;
                            return count > 0 ? <span key={classification}><strong>{classification}:</strong> {count} &rarr; {processorFor(classification)}</span> : null;
                          })}
                          {onHoldCount > 0 && <span><strong>On Hold:</strong> {onHoldCount} &rarr; remains in Initial Checking</span>}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        await handleRouteInitialItems();
                      }}
                      disabled={unresolvedCount > 0 || readyItems.length === 0}
                      title={unresolvedCount > 0 ? `${unresolvedCount} payroll item(s) still need verification and classification` : 'Route only the verified payroll items'}
                      className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center gap-2 shrink-0 transition-all"
                    >
                      <span>Complete &amp; Route {readyItems.length} Payroll{readyItems.length === 1 ? '' : 's'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>}
                </div>
              )}

              {/* STAGE 3: PARALLEL WORK GROUPS DESK */}
              {batchWorkGroups.length > 0 && batch.currentStage !== 'completed' && (
                <div className="space-y-5">
                  {/* Stage Header Info */}
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Split className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-blue-900">
                          Stage 3: Employee Verification &amp; Signing (Parallel Work Groups)
                        </h4>
                        <p className="text-xs text-blue-800">
                          Items have been segmented by employment classification. Processors verify attendance, check claims, certify signatures, and conclude work groups in parallel.
                        </p>
                      </div>
                    </div>

                    {allWorkGroupsCompleted && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-300 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>All Groups Completed</span>
                      </div>
                    )}
                  </div>

                  {/* Work Groups Tabs */}
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
                    {batchWorkGroups.map(wg => {
                      const isActive = activeWorkGroupTab === wg.id;
                      const isComplete = wg.status === 'Completed';

                      return (
                        <button
                          key={wg.id}
                          onClick={() => setActiveWorkGroupTab(wg.id)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <span>{wg.code}</span>
                          <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                            isComplete
                              ? isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'
                              : isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isComplete ? 'Done' : `${wg.itemIds.length} items`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Work Group Details */}
                  {batchWorkGroups.filter(w => w.id === activeWorkGroupTab).map(wg => {
                    const wgItems = items.filter(i => wg.itemIds.includes(i.id));
                    const assignedUser = users.find(u => u.id === wg.assignedProcessorId);
                    const isUserAssigned = currentUser.id === wg.assignedProcessorId;
                    const isCompleted = wg.status === 'Completed';

                    return (
                      <div key={wg.id} className="space-y-4 border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
                        {/* Workgroup metadata & processor switcher */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900">{wg.code}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {wg.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Assigned Desk: <strong className="text-slate-800">{wg.assignedProcessorName}</strong> ({wg.assignedProcessorRoleTitle})
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {!isUserAssigned && (
                              <></>
                            )}

                            {!isCompleted && wgItems.some(item => item.status === 'In_Progress') && (
                              <button
                                onClick={async () => await processWorkGroupItems(wg.id, wgItems.filter(item => item.status === 'In_Progress').map(i => i.id), 'complete')}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-xs transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Complete Work Group</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Items in this Work Group */}
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                          {wgItems.map(item => (
                            <div key={item.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-slate-900">{item.barcode}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    ['Ready_For_Release', 'Released'].includes(item.status)
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {item.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 mt-0.5 truncate">{item.title}</p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {item.status === 'In_Progress' && (
                                  <button
                                    onClick={async () => await processWorkGroupItems(wg.id, [item.id], 'complete')}
                                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors"
                                  >
                                    Verify &amp; Sign
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Ready for Release Banner when all groups complete */}
                  {allWorkGroupsCompleted && (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-purple-950">
                          Parallel Processing Completed
                        </h4>
                        <p className="text-xs text-purple-700">
                          {readyForReleaseCount} payroll(s) are ready for release. {onHoldCount > 0 ? `${onHoldCount} payroll(s) remain on hold at Initial Checking.` : 'Eligible payrolls were forwarded to the Release Desk automatically.'}
                        </p>
                      </div>

                      <div className="px-3 py-2 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">Work Group Completed</div>
                    </div>
                  )}
                </div>
              )}

              {/* STAGE 4: RELEASE OF PAYROLL DESK */}
              {readyForReleaseCount > 0 && (
                <div className="space-y-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Send className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-purple-900">
                        Stage 4: Release of Payroll Transmittal
                      </h4>
                      <p className="text-xs text-purple-700">
                        {readyForReleaseCount} payroll(s) have completed Stage 3 and are ready for official dispatch. Earlier-stage holds remain in this batch.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleReleaseSubmit} className="space-y-4 border border-slate-200 rounded-xl p-5 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Released To (Liaison / Recipient)
                        </label>
                        <input
                          type="text"
                          required
                          value={releasedTo}
                          onChange={e => setReleasedTo(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Release Mode
                        </label>
                        <select
                          value={releaseMode}
                          onChange={e => setReleaseMode(e.target.value as any)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                        >
                          <option value="In-Person Pick-up">In-Person Pick-up (Office Liaison)</option>
                          <option value="Official Courier">Official Courier</option>
                          <option value="Electronic Copy">Electronic Transmittal</option>
                          <option value="Internal Messenger">Internal Messenger Dispatch</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Official Transmittal / Receipt Remarks
                        </label>
                        <textarea
                          rows={2}
                          value={releaseRemarks}
                          onChange={e => setReleaseRemarks(e.target.value)}
                          placeholder="e.g. Acknowledged receipt of original signed payroll transmittal with complete vouchers."
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 shadow-sm transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Release {readyForReleaseCount} Ready Payroll{readyForReleaseCount === 1 ? '' : 's'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* COMPLETED STAGE */}
              {batch.currentStage === 'completed' && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-900">
                          Payroll Batch Concluded &amp; Dispatched
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

          {/* TAB 2: ITEMS MASTERLIST */}
          {activeTab === 'items' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                {items.map((item, idx) => (
                  <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{item.barcode}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.employmentClassification === 'JOW/COS' || item.employmentClassification === 'Job Order (JOW)'
                            ? 'bg-amber-100 text-amber-800'
                            : item.employmentClassification === 'Casual'
                            ? 'bg-purple-100 text-purple-800'
                            : item.employmentClassification === 'Regular'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.employmentClassification || 'Unclassified'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'On_Hold'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-700 mt-0.5">{item.title}</p>
                      {item.assignedToName && (
                        <p className="text-[11px] text-slate-400">
                          Assigned to: {item.assignedToName}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-[11px] text-slate-400 shrink-0">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Full Lifecycle History &amp; Transition Log
              </h4>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                {lifecycleAudit.map(aud => (
                  <div key={aud.id} className="p-3 text-xs flex items-start gap-3 hover:bg-slate-50">
                    <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{aud.actorName}</span>
                        <span className="text-slate-400 text-[11px]">({aud.actorRole})</span>
                        <span className="font-mono text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded-sm">{aud.itemBarcode}</span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{aud.details}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(aud.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <div>
            Docketed on {new Date(batch.dateEncoded).toLocaleDateString()} by {batch.encodedBy.userName}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Exception Reason Dialog */}
      {holdingItemId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-700">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Flag Exception / Place On Hold</h3>
            </div>
            <p className="text-xs text-slate-500">
              Held items will remain in the batch without blocking valid items from progressing through parallel workgroups.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Exception Reason
              </label>
              <select
                value={exceptionReason}
                onChange={e => setExceptionReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <option value="Missing or incomplete Daily Time Record (DTR)">Missing or incomplete Daily Time Record (DTR)</option>
                <option value="Missing Department Head / Supervisor signature">Missing Department Head / Supervisor signature</option>
                <option value="Discrepancy in reported hours / Overtime claim">Discrepancy in reported hours / Overtime claim</option>
                <option value="Missing supporting accomplishment reports">Missing supporting accomplishment reports</option>
                <option value="Invalid or expired Contract of Service attachment">Invalid or expired Contract of Service attachment</option>
                <option value="Other administrative discrepancy">Other administrative discrepancy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={exceptionNotes}
                onChange={e => setExceptionNotes(e.target.value)}
                placeholder="Specific details about the deficiency..."
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
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700"
              >
                Hold Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
