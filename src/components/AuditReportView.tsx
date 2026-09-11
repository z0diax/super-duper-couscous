import { exportCsv } from '../services/csv';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  BarChart3, 
  FileText 
} from 'lucide-react';

export const AuditReportView: React.FC = () => {
  const { auditLogs, documents, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const completedSteps = documents.flatMap(d => d.workflowSteps).filter(s => s.startedAt && s.completedAt);
  const averageHours = completedSteps.length ? completedSteps.reduce((sum, s) => sum + (Date.parse(s.completedAt!) - Date.parse(s.startedAt!)) / 3600000, 0) / completedSteps.length : 0;
  const returnedIds = new Set(auditLogs.filter(a => a.actionType === 'STEP_RETURNED').map(a => a.documentId));
  const returnRate = documents.length ? documents.filter(d => returnedIds.has(d.id)).length / documents.length * 100 : 0;
  const concludedDocuments = documents.filter(d => ['Released', 'Archived'].includes(d.status));
  const firstPassYield = concludedDocuments.length ? concludedDocuments.filter(d => !returnedIds.has(d.id)).length / concludedDocuments.length * 100 : 0;

  const filteredLogs = auditLogs.filter(log => {
    if (actionFilter !== 'all' && log.actionType !== actionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (log.trackingNumber && log.trackingNumber.toLowerCase().includes(q)) ||
        log.actorName.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleExportAuditCSV = () => {
    const headers = ['Timestamp', 'Action Type', 'Tracking Number', 'Actor Name', 'Actor Role', 'Summary', 'Details'];
    const rows = filteredLogs.map(l => [l.timestamp, l.actionType, l.trackingNumber, l.actorName, l.actorRole, l.summary, l.details]);
    exportCsv(`HRMDO_Audit_${new Date().toISOString().slice(0,10)}.csv`, [headers, ...rows]);

    showToast('success', 'Audit Exported', `Exported ${filteredLogs.length} audit trail events to CSV.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Stats */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Operational Reports & Compliance Audit Trail
              </h1>
              <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded border border-slate-200">
                {auditLogs.length} Logged Events
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Server timestamped chronological record of all document movements, claiming actions, approvals, and releases.
            </p>
          </div>

          <button
            id="btn-export-audit-csv"
            onClick={handleExportAuditCSV}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Export Audit Trail (CSV)</span>
          </button>
        </div>

        {/* Audit Analytics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Completion Rate</span>
            <div className="text-xl font-bold text-emerald-600 mt-0.5">{documents.length ? ((documents.filter(d => ['Released', 'Archived'].includes(d.status)).length / documents.length) * 100).toFixed(1) : '0'}%</div>
            <span className="text-[10px] text-slate-500">Successfully concluded actions</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Average Phase Duration</span>
            <div className="text-xl font-bold text-blue-600 mt-0.5">{averageHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span></div>
            <span className="text-[10px] text-slate-500">Average turnaround per stage</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">First-Pass Yield</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{firstPassYield.toFixed(1)}%</div>
            <span className="text-[10px] text-slate-500">Processed with zero returns</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Return Rate</span>
            <div className="text-xl font-bold text-amber-600 mt-0.5">{returnRate.toFixed(1)}%</div>
            <span className="text-[10px] text-slate-500">Returned for corrections</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="audit-search-input"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by tracking code, officer name, or action summary..."
            className="w-full text-xs sm:text-sm pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          id="audit-filter-action"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Action Types</option>
          <option value="DOCUMENT_REGISTERED">Document Registered</option>
          <option value="TASK_CLAIMED">Task Claimed</option>
          <option value="STEP_COMPLETED">Phase Completed</option>
          <option value="STEP_RETURNED">Phase Returned</option>
          <option value="TASK_REASSIGNED">Task Reassigned</option>
          <option value="DOCUMENT_APPROVED">Document Approved</option>
          <option value="DOCUMENT_RELEASED">Document Released</option>
          <option value="REMARK_ADDED">Remark Added</option>
          <option value="FILE_ATTACHED">File Attached</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action Type</th>
                <th className="py-3 px-4">Tracking Code</th>
                <th className="py-3 px-4">Officer / Role</th>
                <th className="py-3 px-4">Summary & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Timestamp */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString([], { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </td>

                  {/* Action Type */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {log.actionType}
                    </span>
                  </td>

                  {/* Tracking Number */}
                  <td className="py-3 px-4 whitespace-nowrap font-mono font-semibold text-blue-700">
                    {log.trackingNumber || '—'}
                  </td>

                  {/* Officer */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{log.actorName}</div>
                    <div className="text-[10px] text-slate-500">{log.actorRole}</div>
                  </td>

                  {/* Summary & Details */}
                  <td className="py-3 px-4 max-w-md">
                    <div className="font-medium text-slate-900 text-xs">
                      {log.summary}
                    </div>
                    {log.details && (
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                        {log.details}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
