import { exportCsv } from '../services/csv';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DocumentRecord } from '../types';
import { useWorkspaceState } from '../services/workspace';
import { documentSenderLabel } from '../services/documentDisplay';
import { exportRegistryCsv, listRegistryDocuments, type RegistryCounts, type RegistryPage, type RegistryRow } from '../services/documentApi';
import { 
  FileStack, 
  Filter, 
  Download, 
  Plus, 
  Clock, 
  Database, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Trash2
} from 'lucide-react';

interface DocumentRegistryProps {
  onOpenRegisterModal: () => void;
}

export const DocumentRegistry: React.FC<DocumentRegistryProps> = ({ onOpenRegisterModal }) => {
  const { documents, setSelectedDocument, openTargetedDocument, showToast, deleteDocument, can, currentUser, stateRevision } = useApp();
  const targeted = import.meta.env.VITE_DOCUMENT_REGISTRY_TARGETED_READS === '1';
  const targetedDetail = import.meta.env.VITE_DOCUMENT_DETAIL_TARGETED_READS === '1';

  const [datasetFilter, setDatasetFilter] = useWorkspaceState<'all' | 'v2' | 'v1'>(currentUser.id, 'registry.dataset-filter', 'all');
  const [classificationFilter, setClassificationFilter] = useWorkspaceState<string>(currentUser.id, 'registry.classification-filter', 'all');
  const [statusFilter, setStatusFilter] = useWorkspaceState<string>(currentUser.id, 'registry.status-filter', 'all');
  const [priorityFilter, setPriorityFilter] = useWorkspaceState<string>(currentUser.id, 'registry.priority-filter', 'all');
  const [deleteConfirmDocumentId, setDeleteConfirmDocumentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [targetPage, setTargetPage] = useState<RegistryPage | null>(null);
  const [loading, setLoading] = useState(targeted);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  // Single payroll vouchers use the document workflow engine internally, but
  // they belong exclusively to Payroll Management in the user-facing UI.
  const registryDocuments = targeted ? [] : documents.filter(doc => doc.classification !== 'Payroll');
  const effectiveClassificationFilter = classificationFilter === 'Payroll' ? 'all' : classificationFilter;
  const filters = { dataset: datasetFilter, classification: effectiveClassificationFilter, status: statusFilter, priority: priorityFilter };
  useEffect(() => {
    if (!targeted) return;
    const id = ++requestId.current;
    setLoading(true); setError(false); setTargetPage(null);
    listRegistryDocuments(filters, page, pageSize).then(result => {
      if (id !== requestId.current) return;
      if (page > 1 && result.pagination.totalPages > 0 && page > result.pagination.totalPages) { setPage(result.pagination.totalPages); return; }
      setTargetPage(result); setLoading(false);
    }).catch(() => { if (id === requestId.current) { setTargetPage(null); setLoading(false); setError(true); } });
    return () => { requestId.current++; };
  }, [targeted, currentUser.id, datasetFilter, effectiveClassificationFilter, statusFilter, priorityFilter, page, pageSize, stateRevision, retry]);
  const updateDataset = (value: 'all' | 'v1' | 'v2') => { setPage(1); setDatasetFilter(value); };
  const updateClassification = (value: string) => { setPage(1); setClassificationFilter(value); };
  const updateStatus = (value: string) => { setPage(1); setStatusFilter(value); };
  const updatePriority = (value: string) => { setPage(1); setPriorityFilter(value); };

  const handleDeleteDocument = async (documentId: string) => {
    if (!(await deleteDocument(documentId))) return;
    setDeleteConfirmDocumentId(null);
  };

  const filteredDocs = registryDocuments.filter(doc => {
    // Dataset filter
    if (datasetFilter === 'v2' && doc.isLegacyV1) return false;
    if (datasetFilter === 'v1' && !doc.isLegacyV1) return false;

    // Classification filter
    if (effectiveClassificationFilter !== 'all' && doc.classification !== effectiveClassificationFilter) return false;

    // Status filter
    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;

    // Priority filter
    if (priorityFilter !== 'all' && doc.priority !== priorityFilter) return false;

    return true;
  });
  const rows: RegistryRow[] = targeted ? targetPage?.data || [] : filteredDocs.map(doc => ({
    id: doc.id, trackingNumber: doc.trackingNumber, title: doc.title, subject: doc.subject,
    sourceOffice: doc.sourceOffice, senderName: doc.senderName, classification: doc.classification,
    documentType: doc.documentType, employmentClassification: doc.employmentClassification,
    priority: doc.priority, status: doc.status, dateReceived: doc.dateReceived,
    currentStepNumber: doc.currentStepNumber, totalSteps: doc.totalSteps, currentLocation: doc.currentLocation,
    currentStepName: doc.workflowSteps.find(step => step.stepNumber === doc.currentStepNumber)?.name,
    isLegacyV1: !!doc.isLegacyV1,
  }));
  const counts: RegistryCounts = targeted ? targetPage?.registryCounts || { all: 0, v1: 0, v2: 0, outside: 0 } : {
    all: registryDocuments.length, v1: registryDocuments.filter(doc => doc.isLegacyV1).length,
    v2: registryDocuments.filter(doc => !doc.isLegacyV1).length,
    outside: registryDocuments.filter(doc => doc.status === 'Awaiting_External_Return').length,
  };
  const openDocument = (id: string) => {
    if (targetedDetail) { openTargetedDocument(id); return; }
    const fullDocument = documents.find(doc => doc.id === id);
    if (fullDocument) setSelectedDocument(fullDocument);
    else showToast('error', 'Document unavailable', 'Refresh the application and try opening this document again.');
  };

  const handleExportCSV = async () => {
    if (targeted) {
      try { await exportRegistryCsv(filters); showToast('success', 'Export Generated', 'The filtered registry was exported.'); }
      catch { showToast('error', 'Export unavailable', 'Could not export the registry. Please try again.'); }
      return;
    }
    const headers = ['Tracking Number', 'Title', 'Classification', 'Document Type', 'Source Office', 'Sender', 'Priority', 'Status', 'Date Received', 'Dataset'];
    const rows = filteredDocs.map(d => [d.trackingNumber, d.title, d.classification, d.documentType, d.sourceOffice, d.senderName, d.priority, d.status, d.dateReceived, d.isLegacyV1 ? 'Historical Archive' : 'Active Records']);
    exportCsv(`HRMDO_DTS_${new Date().toISOString().slice(0,10)}.csv`, [headers, ...rows]);

    showToast('success', 'Export Generated', `Exported ${filteredDocs.length} records to CSV format.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Registry Title & Stats */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><FileStack className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Records</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Document Registry</h1>
              <p className="mt-1 text-sm text-slate-500">Find active documents and archived records.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-registry-export-csv"
              onClick={() => { void handleExportCSV(); }}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              id="btn-registry-register-doc"
              onClick={onOpenRegisterModal}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Register New Doc</span>
            </button>
          </div>
        </div>

        {/* Dataset Quick Tabs */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <button
            id="tab-dataset-all"
            onClick={() => updateDataset('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              datasetFilter === 'all'
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Records ({counts.all})
          </button>
          <button
            id="tab-dataset-v2"
            onClick={() => updateDataset('v2')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              datasetFilter === 'v2'
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Active Records ({counts.v2})
          </button>
          <button
            id="tab-dataset-v1"
            onClick={() => updateDataset('v1')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              datasetFilter === 'v1'
                ? 'bg-indigo-700 text-white font-semibold'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            Historical Archive ({counts.v1})
          </button>
          <button
            id="tab-outside-hrmdo"
            onClick={() => { updateDataset('v2'); updateStatus('Awaiting_External_Return'); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              statusFilter === 'Awaiting_External_Return' ? 'bg-amber-600 text-white font-semibold' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Outside HRMDO ({counts.outside})
          </button>
        </div>
      </div>

      {/* Registry Filters */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          {/* Classification */}
          <select
            id="registry-filter-class"
            value={effectiveClassificationFilter}
            onChange={e => updateClassification(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Classification (All)</option>
            <option value="Communication">Communication</option>
            <option value="Request">Request</option>
            <option value="Others">Others</option>
          </select>

          {/* Status */}
          <select
            id="registry-filter-status"
            value={statusFilter}
            onChange={e => updateStatus(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Status (All)</option>
            <option value="In_Progress">In Progress</option>
            <option value="Pending_Approval">Pending Approval</option>
            <option value="Awaiting_External_Handoff">Awaiting External Handoff</option>
            <option value="Awaiting_External_Return">Outside HRMDO / Awaiting Return</option>
            <option value="Returned">Returned</option>
            <option value="Ready_For_Release">Ready for Release</option>
            <option value="Released">Released</option>
            <option value="Disapproved">Disapproved</option>
            <option value="Archived">Archived</option>
          </select>

          {/* Priority */}
          <select
            id="registry-filter-priority"
            value={priorityFilter}
            onChange={e => updatePriority(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Priority (All)</option>
            <option value="Routine">Routine</option>
            <option value="Priority">Priority</option>
            <option value="Urgent">Urgent</option>
          </select>
      </div>

      {/* Registry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {targeted && loading ? (
          <div role="status" className="p-10 text-center text-sm text-slate-600">Loading registry records...</div>
        ) : targeted && error ? (
          <div role="alert" className="p-10 text-center text-sm text-slate-700">
            <p>Registry records could not be loaded.</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white">Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 p-4">
            <FileStack className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-700">{counts.all === 0 ? 'No documents yet' : 'No records match these filters'}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {counts.all === 0 ? 'Registered documents will appear here.' : 'Try adjusting or clearing the registry filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Tracking Code</th>
                  <th className="py-3 px-4">Document Title & Subject</th>
                  <th className="py-3 px-4">Origin / Source</th>
                  <th className="py-3 px-4">Classification & Type</th>
                  <th className="py-3 px-4">Current Workflow Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(doc => {
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => openDocument(doc.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Tracking */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-blue-700">
                            {doc.trackingNumber}
                          </span>
                        </div>
                        {doc.isLegacyV1 ? (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                            HISTORICAL ARCHIVE
                          </span>
                        ) : (
                          <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                            Received {new Date(doc.dateReceived).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* Title & Subject */}
                      <td className="py-3 px-4 max-w-sm sm:max-w-md">
                        <div className="font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {doc.title}
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                          {doc.subject}
                        </div>
                      </td>

                      {/* Source */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800 truncate max-w-[170px]">
                          {doc.sourceOffice}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[170px]">
                          {documentSenderLabel(doc)}
                        </div>
                      </td>

                      {/* Classification */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">
                          {doc.classification}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap">
                          <span>{doc.documentType}</span>
                          {doc.employmentClassification && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 font-medium px-1.5 py-0.2 rounded border border-blue-200">
                              {doc.employmentClassification}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Workflow Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {doc.isLegacyV1 ? (
                          <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Preserved Historical Record</span>
                          </div>
                        ) : (
                          <div>
                            <div className={`text-xs font-bold ${doc.status === 'Disapproved' ? 'text-rose-700' : 'text-slate-900'}`}>
                              {doc.status === 'Disapproved' ? 'Document was disapproved' : `Phase ${doc.currentStepNumber} of ${doc.totalSteps}`}
                            </div>
                            <div className={`text-[11px] truncate max-w-[180px] ${doc.status === 'Disapproved' ? 'font-semibold text-rose-600' : 'text-blue-600'}`}>
                              {doc.status === 'Disapproved' ? 'Processing ended after external review' : doc.currentStepName}
                            </div>
                            {doc.status === 'Awaiting_External_Return' && (
                              <div className="mt-1 text-[10px] font-semibold text-amber-700">Outside HRMDO: {doc.currentLocation}</div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {can('canAdmin') && (deleteConfirmDocumentId === doc.id ? (
                            <>
                              <button type="button" onClick={event => { event.stopPropagation(); void handleDeleteDocument(doc.id); }} className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700">Confirm</button>
                              <button type="button" onClick={event => { event.stopPropagation(); setDeleteConfirmDocumentId(null); }} className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
                            </>
                          ) : (
                            <button type="button" aria-label={`Delete ${doc.trackingNumber}`} title="Delete document" onClick={event => { event.stopPropagation(); setDeleteConfirmDocumentId(doc.id); }} className="rounded p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ))}
                          <button
                            id={`btn-open-doc-reg-${doc.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              openDocument(doc.id);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {targeted && !loading && !error && targetPage && (
        <nav aria-label="Registry pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
          <span>{targetPage.pagination.total} matching records</span>
          <div className="flex items-center gap-2">
            <label htmlFor="registry-page-size">Rows per page</label>
            <select id="registry-page-size" value={pageSize} onChange={event => { setPage(1); setPageSize(Number(event.target.value)); }} className="rounded border border-slate-200 px-2 py-1">
              <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
            </select>
            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Previous</button>
            <span>Page {page} of {Math.max(1, targetPage.pagination.totalPages)}</span>
            <button type="button" onClick={() => setPage(value => Math.min(targetPage.pagination.totalPages, value + 1))} disabled={page >= targetPage.pagination.totalPages} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Next</button>
          </div>
        </nav>
      )}
    </div>
  );
};
