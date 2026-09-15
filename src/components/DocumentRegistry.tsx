import { exportCsv } from '../services/csv';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DocumentRecord } from '../types';
import { useWorkspaceState } from '../services/workspace';
import { documentSenderLabel } from '../services/documentDisplay';
import { 
  FileStack, 
  Search, 
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
  const { documents, setSelectedDocument, showToast, deleteDocument, can, currentUser } = useApp();

  const [searchQuery, setSearchQuery] = useWorkspaceState(currentUser.id, 'registry.search', '');
  const [datasetFilter, setDatasetFilter] = useWorkspaceState<'all' | 'v2' | 'v1'>(currentUser.id, 'registry.dataset-filter', 'all');
  const [classificationFilter, setClassificationFilter] = useWorkspaceState<string>(currentUser.id, 'registry.classification-filter', 'all');
  const [statusFilter, setStatusFilter] = useWorkspaceState<string>(currentUser.id, 'registry.status-filter', 'all');
  const [priorityFilter, setPriorityFilter] = useWorkspaceState<string>(currentUser.id, 'registry.priority-filter', 'all');
  const [deleteConfirmDocumentId, setDeleteConfirmDocumentId] = useState<string | null>(null);

  const handleDeleteDocument = async (documentId: string) => {
    if (!(await deleteDocument(documentId))) return;
    setDeleteConfirmDocumentId(null);
  };

  const filteredDocs = documents.filter(doc => {
    // Dataset filter
    if (datasetFilter === 'v2' && doc.isLegacyV1) return false;
    if (datasetFilter === 'v1' && !doc.isLegacyV1) return false;

    // Classification filter
    if (classificationFilter !== 'all' && doc.classification !== classificationFilter) return false;

    // Status filter
    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;

    // Priority filter
    if (priorityFilter !== 'all' && doc.priority !== priorityFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesTracking = doc.trackingNumber.toLowerCase().includes(q);
      const matchesTitle = doc.title.toLowerCase().includes(q);
      const matchesSubject = doc.subject.toLowerCase().includes(q);
      const matchesSource = doc.sourceOffice.toLowerCase().includes(q);
      const matchesSender = doc.senderName.toLowerCase().includes(q);
      const matchesLegacy = doc.legacyId ? doc.legacyId.toLowerCase().includes(q) : false;
      return matchesTracking || matchesTitle || matchesSubject || matchesSource || matchesSender || matchesLegacy;
    }

    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Tracking Number', 'Title', 'Classification', 'Document Type', 'Source Office', 'Sender', 'Priority', 'Status', 'Date Received', 'Dataset'];
    const rows = filteredDocs.map(d => [d.trackingNumber, d.title, d.classification, d.documentType, d.sourceOffice, d.senderName, d.priority, d.status, d.dateReceived, d.isLegacyV1 ? 'Historical Archive' : 'Active Records']);
    exportCsv(`HRMDO_DTS_${new Date().toISOString().slice(0,10)}.csv`, [headers, ...rows]);

    showToast('success', 'Export Generated', `Exported ${filteredDocs.length} records to CSV format.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Registry Title & Stats */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Central Document Registry & Archives
              </h1>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-semibold">
                {documents.length} Records Total
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Central repository for active documents and preserved historical records.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-registry-export-csv"
              onClick={handleExportCSV}
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
            onClick={() => setDatasetFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              datasetFilter === 'all'
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Records ({documents.length})
          </button>
          <button
            id="tab-dataset-v2"
            onClick={() => setDatasetFilter('v2')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              datasetFilter === 'v2'
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Active Records ({documents.filter(d => !d.isLegacyV1).length})
          </button>
          <button
            id="tab-dataset-v1"
            onClick={() => setDatasetFilter('v1')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              datasetFilter === 'v1'
                ? 'bg-indigo-700 text-white font-semibold'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            Historical Archive ({documents.filter(d => d.isLegacyV1).length})
          </button>
          <button
            id="tab-outside-hrmdo"
            onClick={() => { setDatasetFilter('v2'); setStatusFilter('Awaiting_External_Return'); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              statusFilter === 'Awaiting_External_Return' ? 'bg-amber-600 text-white font-semibold' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Outside HRMDO ({documents.filter(d => d.status === 'Awaiting_External_Return').length})
          </button>
        </div>
      </div>

      {/* Search & Multiple Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="registry-search-input"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tracking number, title, subject, office, or archive ID..."
            className="w-full text-xs sm:text-sm pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Classification */}
          <select
            id="registry-filter-class"
            value={classificationFilter}
            onChange={e => setClassificationFilter(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Classification (All)</option>
            <option value="Communication">Communication</option>
            <option value="Payroll">Payroll</option>
            <option value="Request">Request</option>
            <option value="Others">Others</option>
          </select>

          {/* Status */}
          <select
            id="registry-filter-status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
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
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Priority (All)</option>
            <option value="Routine">Routine</option>
            <option value="Priority">Priority</option>
            <option value="Urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Registry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-12 p-4">
            <FileStack className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-700">No records found</h3>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search criteria or clearing filters.
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
                {filteredDocs.map(doc => {
                  const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDocument(doc)}
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
                              {doc.status === 'Disapproved' ? 'Processing ended after external review' : currentStep?.name}
                            </div>
                            {doc.status === 'Awaiting_External_Return' && (
                              <div className="mt-1 text-[10px] font-semibold text-amber-700">Outside HRMDO: {doc.currentLocation || currentStep?.externalHandoff?.destinationOffice}</div>
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
                              setSelectedDocument(doc);
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
    </div>
  );
};
