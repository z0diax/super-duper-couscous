import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  PayrollBatch, 
  PayrollBatchStage, 
  EmploymentClassification 
} from '../types';
import { 
  Layers, 
  Plus, 
  Search, 
  Filter, 
  Sliders, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Split, 
  Barcode, 
  Building2, 
  Calendar, 
  UserCheck, 
  Send, 
  Sparkles,
  ChevronRight,
  ShieldAlert,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  List,
  Pencil,
  Trash2
} from 'lucide-react';
import { EmploymentRoutingRulesModal } from './EmploymentRoutingRulesModal';
import { EditPayrollBatchModal } from './EditPayrollBatchModal';
import { useWorkspaceState } from '../services/workspace';

interface Props {
  onOpenRegisterBatchModal: () => void;
}

const BATCH_LIST_PAGE_SIZE = 10;

export const PayrollManagement: React.FC<Props> = ({ onOpenRegisterBatchModal }) => {
  const { 
    payrollBatches, 
    payrollItems, 
    workGroups, 
    openBatchModal, 
    currentUser,
    documents,
    setSelectedDocument,
    deletePayrollBatch,
    deleteDocument,
    can
  } = useApp();

  const [searchQuery, setSearchQuery] = useWorkspaceState(currentUser.id, 'payroll.search', '');
  const [stageFilter, setStageFilter] = useWorkspaceState<string>(currentUser.id, 'payroll.stage-filter', 'all');
  const [officeFilter, setOfficeFilter] = useWorkspaceState<string>(currentUser.id, 'payroll.office-filter', 'all');
  const [isRulesModalOpen, setIsRulesModalOpen] = useWorkspaceState(currentUser.id, 'payroll.modal.routing-rules', false);
  const [viewMode, setViewMode] = useWorkspaceState<'batches' | 'single_entries' | 'workgroups' | 'items'>(currentUser.id, 'payroll.view', 'batches');
  // A new key makes list the default for existing users who were previously given the grid fallback.
  const [batchDisplay, setBatchDisplay] = useWorkspaceState<'grid' | 'list'>(currentUser.id, 'payroll.batch-display.v2', 'list');
  const [batchListPage, setBatchListPage] = useWorkspaceState<number>(currentUser.id, 'payroll.batch-list-page', 1);
  const [editingBatchId, setEditingBatchId] = useWorkspaceState<string | null>(currentUser.id, 'payroll.editing-batch', null);
  const [deleteConfirmBatchId, setDeleteConfirmBatchId] = useState<string | null>(null);
  const [deleteConfirmSingleDocumentId, setDeleteConfirmSingleDocumentId] = useState<string | null>(null);
  // Payroll Management is an entry register. Processors receive work through
  // My Tasks; they do not browse or edit entries registered by another employee.
  // The System Administrator keeps the administrative view for support and deletion.
  const ownsPayrollEntry = (entry: { encodedBy?: { userId?: string } }) => currentUser.role === 'admin' || entry.encodedBy?.userId === currentUser.id;
  const ownedPayrollBatches = payrollBatches.filter(ownsPayrollEntry);
  const editingBatch = ownedPayrollBatches.find(batch => batch.id === editingBatchId) || null;

  useEffect(() => {
    if (!['batches', 'single_entries'].includes(viewMode)) setViewMode('batches');
  }, [viewMode, setViewMode]);

  const canEditBatch = (batch: PayrollBatch) => {
    const batchItems = payrollItems.filter(item => item.batchId === batch.id);
    const hasStarted = batchItems.some(item => (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) !== 'initial_checking');
    const hasWorkGroups = workGroups.some(group => group.batchId === batch.id);
    return batch.encodedBy?.userId === currentUser.id && !hasStarted && !hasWorkGroups;
  };

  const handleDeleteBatch = async (batch: PayrollBatch) => {
    if (!(await deletePayrollBatch(batch.id))) return;
    setDeleteConfirmBatchId(null);
  };

  const handleDeleteSinglePayroll = async (documentId: string) => {
    if (!(await deleteDocument(documentId))) return;
    setDeleteConfirmSingleDocumentId(null);
  };
  const matchesAggregateStage = (batch: PayrollBatch, stage: string) => {
    const progress = batch.progress;
    if (stage === 'initial_checking') return progress.initialChecking.active > 0;
    if (stage === 'verification_signing') return progress.management.active > 0 || progress.management.onHold > 0;
    if (stage === 'release') return progress.release.ready > 0;
    if (stage === 'completed') return progress.derivedStatus === 'COMPLETED';
    return true;
  };
  const batchStatusTone = (batch: PayrollBatch) => {
    const status = batch.progress.derivedStatus;
    return status === 'PROCESSING_WITH_HOLDS' || status === 'ON_HOLD' ? 'bg-amber-100 text-amber-800' : status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : status.includes('RELEASE') ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  };

  // Filter batches
  const filteredBatches = ownedPayrollBatches.filter(batch => {
    const matchesSearch = 
      batch.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      batch.office.toLowerCase().includes(searchQuery.toLowerCase()) ||
      batch.payrollType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStage = stageFilter === 'all' || matchesAggregateStage(batch, stageFilter);
    const matchesOffice = officeFilter === 'all' || batch.office === officeFilter;

    return matchesSearch && matchesStage && matchesOffice;
  });
  const batchListPageCount = Math.max(1, Math.ceil(filteredBatches.length / BATCH_LIST_PAGE_SIZE));
  const currentBatchListPage = Math.min(Math.max(batchListPage, 1), batchListPageCount);
  const paginatedBatches = filteredBatches.slice(
    (currentBatchListPage - 1) * BATCH_LIST_PAGE_SIZE,
    currentBatchListPage * BATCH_LIST_PAGE_SIZE
  );

  useEffect(() => {
    if (batchListPage !== currentBatchListPage) setBatchListPage(currentBatchListPage);
  }, [batchListPage, currentBatchListPage, setBatchListPage]);

  // Single payroll vouchers from documents
  const singlePayrollDocs = documents.filter(d => d.classification === 'Payroll' && ownsPayrollEntry(d));
  const filteredSingleDocs = singlePayrollDocs.filter(doc => {
    const matchesSearch = 
      doc.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.barcode && doc.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      doc.sourceOffice.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.documentType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOffice = officeFilter === 'all' || doc.sourceOffice === officeFilter;
    return matchesSearch && matchesOffice;
  });

  // Calculate metrics
  const totalActiveBatches = ownedPayrollBatches.filter(b => b.progress.derivedStatus !== 'COMPLETED').length;
  const initialCheckingBatches = ownedPayrollBatches.filter(b => b.progress.initialChecking.active > 0).length;
  const activeWorkGroupsCount = workGroups.filter(w => ownedPayrollBatches.some(batch => batch.id === w.batchId) && w.status === 'In_Progress').length;
  const releasedBatchesCount = ownedPayrollBatches.filter(b => b.progress.derivedStatus === 'COMPLETED').length;

  // Unique offices for filter
  const offices = Array.from(new Set(ownedPayrollBatches.map(b => b.office)));

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><FileSpreadsheet className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Payroll records</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Payroll Management</h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">Register and track individual and batch payroll records.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsRulesModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors shadow-2xs"
            >
              <Sliders className="w-4 h-4 text-slate-500" />
              <span>Routing Rules</span>
            </button>

            <button
              onClick={onOpenRegisterBatchModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Register Payroll</span>
            </button>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <p className="text-xs font-semibold text-slate-500">Batch Transmittals</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalActiveBatches}</p>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/70">
            <p className="text-xs font-semibold text-blue-800">Single Vouchers</p>
            <p className="text-2xl font-bold text-blue-900 mt-0.5">{singlePayrollDocs.length}</p>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/70">
            <p className="text-xs font-semibold text-amber-800">Initial Checking</p>
            <p className="text-2xl font-bold text-amber-900 mt-0.5">{initialCheckingBatches}</p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70">
            <p className="text-xs font-semibold text-emerald-800">Concluded / Released</p>
            <p className="text-2xl font-bold text-emerald-900 mt-0.5">{releasedBatchesCount}</p>
          </div>
        </div>
      </div>

      {/* View Switcher & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Subtabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            <button
              onClick={() => setViewMode('batches')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                viewMode === 'batches'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Batch Payroll Entry ({ownedPayrollBatches.length})
            </button>
            <button
              onClick={() => setViewMode('single_entries')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                viewMode === 'single_entries'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Single Payroll Entry ({singlePayrollDocs.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'batches' && (
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Batch display mode">
                <button type="button" aria-label="Grid view" title="Grid view" onClick={() => setBatchDisplay('grid')} className={`rounded-md p-1.5 transition-colors ${batchDisplay === 'grid' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}>
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button type="button" aria-label="List view" title="List view" onClick={() => setBatchDisplay('list')} className={`rounded-md p-1.5 transition-colors ${batchDisplay === 'list' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}>
                  <List className="h-4 w-4" />
                </button>
              </div>
            )}
            {/* Search bar */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setBatchListPage(1);
                }}
                placeholder="Search barcode, office..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter Stage:
          </span>

          <button
            onClick={() => {
              setStageFilter('all');
              setBatchListPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              stageFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Stages
          </button>
          <button
            onClick={() => {
              setStageFilter('initial_checking');
              setBatchListPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              stageFilter === 'initial_checking'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Stage 2: Initial Checking
          </button>
          <button
            onClick={() => {
              setStageFilter('verification_signing');
              setBatchListPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              stageFilter === 'verification_signing'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            Stage 3: Parallel Groups
          </button>
          <button
            onClick={() => {
              setStageFilter('release');
              setBatchListPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              stageFilter === 'release'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            Stage 4: Release
          </button>
          <button
            onClick={() => {
              setStageFilter('completed');
              setBatchListPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              stageFilter === 'completed'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* VIEW 1: BATCHES OVERVIEW */}
      {viewMode === 'batches' && (
        <>
        {batchDisplay === 'grid' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map(batch => {
            const batchItems = payrollItems.filter(i => i.batchId === batch.id);
            const bWorkGroups = workGroups.filter(w => w.batchId === batch.id);
            const progress = batch.progress;

            return (
              <div
                key={batch.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* Card Top */}
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                          {batch.batchNumber}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${batchStatusTone(batch)}`}>
                          {progress.displayStatus}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1.5 line-clamp-1">
                        {batch.office}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {batch.payrollType}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-semibold">
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Initial: {progress.initialChecking.active}</span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">Processing: {progress.management.active}</span>
                    <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-800">Ready: {progress.release.ready}</span>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">Released: {progress.release.released}</span>
                    {progress.onHoldTotal > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-800">On hold: {progress.onHoldTotal}</span>}
                  </div>

                  {/* Details grid */}
                  <div className="bg-slate-50/70 rounded-xl p-3 text-xs space-y-1.5 border border-slate-100">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-3.5 h-3.5" /> Period
                      </span>
                      <span className="font-medium text-slate-800 truncate max-w-[140px]">
                        {batch.payrollPeriod || 'Not specified'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Barcode className="w-3.5 h-3.5" /> Total Items
                      </span>
                      <span className="font-bold text-slate-900">
                        {batchItems.length} {batchItems.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    {bWorkGroups.length > 0 && (
                      <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/50">
                        <span className="text-slate-400">Parallel Groups</span>
                        <div className="flex items-center gap-1">
                          {bWorkGroups.map(w => (
                            <span
                              key={w.id}
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                w.status === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {w.classification}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                    {batch.assignedDesk?.userName || 'Releasing Desk'}
                  </span>

                  <div className="flex items-center gap-1">
                    {canEditBatch(batch) && (
                      <button type="button" aria-label={`Edit ${batch.batchNumber}`} title="Edit payroll batch" onClick={() => setEditingBatchId(batch.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {can('canAdmin') && (deleteConfirmBatchId === batch.id ? (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleDeleteBatch(batch)} className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700">Confirm</button>
                        <button type="button" onClick={() => setDeleteConfirmBatchId(null)} className="rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-200">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" aria-label={`Delete ${batch.batchNumber}`} title="Delete payroll batch" onClick={() => setDeleteConfirmBatchId(batch.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ))}
                    <button
                      onClick={() => openBatchModal(batch)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <span>Open</span><ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>}
        {batchDisplay === 'list' && (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="hidden grid-cols-[minmax(170px,1.25fr)_minmax(140px,1fr)_120px_80px_120px_190px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
                <span>Batch / Office</span><span>Payroll Type</span><span>Period</span><span>Items</span><span>Stage</span><span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-slate-100">
                {paginatedBatches.map(batch => {
                const batchItems = payrollItems.filter(item => item.batchId === batch.id);
                const editable = canEditBatch(batch);
                const progress = batch.progress;
                return (
                  <div key={batch.id} className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-slate-50 lg:grid-cols-[minmax(170px,1.25fr)_minmax(140px,1fr)_120px_80px_120px_190px] lg:items-center lg:gap-4">
                    <div><p className="font-mono text-xs font-bold text-blue-700">{batch.batchNumber}</p><p className="mt-1 truncate text-xs font-medium text-slate-800">{batch.office}</p></div>
                    <p className="truncate text-xs text-slate-600">{batch.payrollType}</p>
                    <p className="truncate text-xs text-slate-600">{batch.payrollPeriod || 'Not specified'}</p>
                    <p className="text-xs font-semibold text-slate-800">{batchItems.length} item{batchItems.length === 1 ? '' : 's'}</p>
                    <div className="space-y-1"><span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${batchStatusTone(batch)}`}>{progress.displayStatus}</span><p className="text-[10px] text-slate-500">{progress.release.ready} ready &bull; {progress.onHoldTotal} hold</p></div>
                    <div className="flex items-center justify-start gap-1 lg:justify-end">
                      {editable && <button type="button" aria-label={`Edit ${batch.batchNumber}`} onClick={() => setEditingBatchId(batch.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>}
                      {can('canAdmin') && (deleteConfirmBatchId === batch.id ? <><button type="button" onClick={() => handleDeleteBatch(batch)} className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white">Confirm</button><button type="button" onClick={() => setDeleteConfirmBatchId(null)} className="rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-200">Cancel</button></> : <button type="button" aria-label={`Delete ${batch.batchNumber}`} onClick={() => setDeleteConfirmBatchId(batch.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>)}
                      <button type="button" onClick={() => openBatchModal(batch)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50">Open</button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            {filteredBatches.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-500">
                <span>
                  Showing {(currentBatchListPage - 1) * BATCH_LIST_PAGE_SIZE + 1}&ndash;{Math.min(currentBatchListPage * BATCH_LIST_PAGE_SIZE, filteredBatches.length)} of {filteredBatches.length} batch entries
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchListPage(currentBatchListPage - 1)}
                    disabled={currentBatchListPage === 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Previous
                  </button>
                  <span className="font-medium text-slate-600">Page {currentBatchListPage} of {batchListPageCount}</span>
                  <button
                    type="button"
                    onClick={() => setBatchListPage(currentBatchListPage + 1)}
                    disabled={currentBatchListPage === batchListPageCount}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </>
      )}

      {/* VIEW: SINGLE VOUCHERS OVERVIEW */}
      {viewMode === 'single_entries' && (
        <div className="space-y-4">
          {filteredSingleDocs.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-2xs space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Single Payroll Vouchers Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Single payroll vouchers are individual employee or department salary claims docketed with dedicated 5-phase routing to specialized processors.
              </p>
              <button
                onClick={onOpenRegisterBatchModal}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register Single Payroll</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSingleDocs.map(doc => {
                const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
                const isCompleted = doc.status === 'Archived' || doc.status === 'Released';

                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                  >
                    <div className="p-5 space-y-3.5">
                      {/* Top Bar: Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                            <Barcode className="w-3.5 h-3.5 text-slate-500" />
                            {doc.barcode || doc.trackingNumber}
                          </span>

                          {doc.employmentClassification && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              doc.employmentClassification.includes('Job Order') || doc.employmentClassification.includes('JOW')
                                ? 'bg-amber-100 text-amber-800'
                                : doc.employmentClassification.includes('Casual')
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {doc.employmentClassification}
                            </span>
                          )}
                        </div>

                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800'
                            : doc.status === 'Ready_For_Release'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {doc.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Title & Office */}
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2" title={doc.title}>
                          {doc.title}
                        </h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{doc.sourceOffice}</span>
                        </p>
                      </div>

                      {/* Workflow Step & Assignee */}
                      <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Workflow Phase:</span>
                          <span className="font-semibold text-slate-800">
                            {doc.currentStepNumber} of {doc.totalSteps}
                          </span>
                        </div>
                        <div className="font-medium text-slate-700 truncate">
                          {currentStep?.name || 'Routing in progress'}
                        </div>

                        {currentStep?.assignedTo && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-slate-500">
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              Assigned Desk:
                            </span>
                            <span className="font-bold text-slate-800 truncate max-w-[140px]">
                              {currentStep.assignedTo.displayName}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Metadata row */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(doc.dateReceived).toLocaleDateString()}
                        </span>
                        <span className="font-medium text-slate-500">
                          {doc.documentType}
                        </span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {currentStep?.assignedTo?.role || 'Accounting Office'}
                      </span>
                      <div className="flex items-center gap-1">
                        {can('canAdmin') && (deleteConfirmSingleDocumentId === doc.id ? (
                          <>
                            <button type="button" onClick={() => handleDeleteSinglePayroll(doc.id)} className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700">Confirm</button>
                            <button type="button" onClick={() => setDeleteConfirmSingleDocumentId(null)} className="rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-200">Cancel</button>
                          </>
                        ) : (
                          <button type="button" aria-label={`Delete ${doc.trackingNumber}`} title="Delete single payroll voucher" onClick={() => setDeleteConfirmSingleDocumentId(doc.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ))}
                        <button
                          onClick={() => setSelectedDocument(doc)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <span>Inspect Voucher</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {viewMode === 'workgroups' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workGroups.map(wg => {
              const batch = payrollBatches.find(b => b.id === wg.batchId);
              const wgItems = payrollItems.filter(i => wg.itemIds.includes(i.id));
              const isCompleted = wg.status === 'Completed';

              return (
                <div key={wg.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        wg.classification === 'JOW/COS'
                          ? 'bg-amber-100 text-amber-800'
                          : wg.classification === 'Casual'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {wg.classification}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-1">{wg.code}</h3>
                      <p className="text-xs text-slate-500">{batch?.office}</p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {wg.status}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span className="text-slate-400">Assigned Desk:</span>
                      <span className="font-semibold text-slate-800">{wg.assignedProcessorName}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="text-slate-400">Items:</span>
                      <span className="font-bold text-slate-800">{wgItems.length} items</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <></>

                    {batch && (
                      <button
                        onClick={() => openBatchModal(batch, wg.id)}
                        className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-blue-600"
                      >
                        <span>Open Workspace</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: ITEMS MASTERLIST */}
      {viewMode === 'items' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">All Master Payroll Items</h3>
            <span className="text-xs text-slate-500 font-medium">{payrollItems.length} total registered items</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto">
            {payrollItems.map(item => {
              const batch = payrollBatches.find(b => b.id === item.batchId);

              return (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-sm">
                        {item.barcode}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">({item.batchNumber})</span>
                      {item.classificationType && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {item.classificationType}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
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
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        item.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'On_Hold'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-slate-800 mt-1">{item.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {item.office || batch?.office} &bull; Assigned: {item.assignedToName || 'Initial Checking'}
                    </p>
                  </div>

                  {batch && (
                    <button
                      onClick={() => openBatchModal(batch)}
                      className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shrink-0"
                    >
                      View Batch
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      <EmploymentRoutingRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />
      <EditPayrollBatchModal
        batch={editingBatch}
        items={editingBatch ? payrollItems.filter(item => item.batchId === editingBatch.id) : []}
        isOpen={!!editingBatch}
        onClose={() => setEditingBatchId(null)}
      />
    </div>
  );
};
