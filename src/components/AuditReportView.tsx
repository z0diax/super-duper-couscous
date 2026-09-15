import { exportCsv } from '../services/csv';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ChevronDown, ChevronLeft, ChevronRight, Download, History, Search, X } from 'lucide-react';

const actionLabel = (value: string) => value.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const formatTimestamp = (timestamp: string) => new Date(timestamp).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const AuditReportView: React.FC = () => {
  const { auditLogs, documents, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const completedSteps = documents.flatMap(document => document.workflowSteps).filter(step => step.startedAt && step.completedAt);
  const averageHours = completedSteps.length ? completedSteps.reduce((sum, step) => sum + (Date.parse(step.completedAt!) - Date.parse(step.startedAt!)) / 3600000, 0) / completedSteps.length : 0;
  const returnedIds = new Set(auditLogs.filter(event => event.actionType === 'STEP_RETURNED').map(event => event.documentId));
  const concludedDocuments = documents.filter(document => ['Released', 'Archived', 'Disapproved'].includes(document.status));
  const firstPassYield = concludedDocuments.length ? concludedDocuments.filter(document => !returnedIds.has(document.id)).length / concludedDocuments.length * 100 : 0;
  const actionTypes = useMemo(() => [...new Set(auditLogs.map(log => log.actionType))].sort(), [auditLogs]);
  const filteredLogs = useMemo(() => auditLogs.filter(log => {
    if (actionFilter !== 'all' && log.actionType !== actionFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    return !query || [log.trackingNumber, log.actorName, log.actorRole, log.summary, log.details, log.actionType].some(value => String(value || '').toLowerCase().includes(query));
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)), [actionFilter, auditLogs, searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisible = filteredLogs.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(currentPage * pageSize, filteredLogs.length);
  useEffect(() => { setPage(1); setExpandedId(null); }, [actionFilter, searchQuery, pageSize]);

  const handleExportAuditCSV = () => {
    const headers = ['Timestamp', 'Action Type', 'Tracking Number', 'Actor Name', 'Actor Role', 'Summary', 'Details'];
    const rows = filteredLogs.map(log => [log.timestamp, log.actionType, log.trackingNumber, log.actorName, log.actorRole, log.summary, log.details]);
    exportCsv(`HRMDO_Audit_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
    showToast('success', 'Audit Exported', `Exported ${filteredLogs.length} audit events to CSV.`);
  };

  return <div className="space-y-5 pb-12">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><History className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Compliance history</p><h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Audit Trail & Reports</h1><p className="mt-1 text-sm text-slate-500">Search and review recorded system activity.</p></div></div>
        <button id="btn-export-audit-csv" onClick={handleExportAuditCSV} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"><Download className="h-4 w-4" />Export CSV</button>
      </div>
      <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70 sm:grid-cols-4">
        <div className="border-b border-r border-slate-200 px-5 py-3 sm:border-b-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Events</p><p className="mt-0.5 text-lg font-bold text-slate-900">{auditLogs.length}</p></div>
        <div className="border-b border-slate-200 px-5 py-3 sm:border-b-0 sm:border-r"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completion</p><p className="mt-0.5 text-lg font-bold text-emerald-700">{documents.length ? (concludedDocuments.length / documents.length * 100).toFixed(1) : '0'}%</p></div>
        <div className="border-r border-slate-200 px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Average Phase</p><p className="mt-0.5 text-lg font-bold text-blue-700">{averageHours.toFixed(1)} <span className="text-xs font-semibold text-slate-400">hrs</span></p></div>
        <div className="px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">First Pass</p><p className="mt-0.5 text-lg font-bold text-slate-900">{firstPassYield.toFixed(1)}%</p></div>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="audit-search-input" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search tracking number, officer, action, or details" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />{searchQuery && <button type="button" aria-label="Clear audit search" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200"><X className="h-3.5 w-3.5" /></button>}</div>
        <select id="audit-filter-action" aria-label="Filter by action" value={actionFilter} onChange={event => setActionFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="all">All actions</option>{actionTypes.map(type => <option key={type} value={type}>{actionLabel(type)}</option>)}</select>
      </div>

      <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="w-44 px-4 py-3">Date & Time</th><th className="w-52 px-4 py-3">Activity</th><th className="w-44 px-4 py-3">Record</th><th className="w-56 px-4 py-3">Officer</th><th className="px-4 py-3">Summary</th><th className="w-12 px-2 py-3"><span className="sr-only">Details</span></th></tr></thead><tbody className="divide-y divide-slate-100">{visibleLogs.map(log => <React.Fragment key={log.id}><tr className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-slate-500">{formatTimestamp(log.timestamp)}</td><td className="px-4 py-3"><span className="inline-flex max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{actionLabel(log.actionType)}</span></td><td className="truncate px-4 py-3 font-mono font-semibold text-blue-700">{log.trackingNumber || '—'}</td><td className="px-4 py-3"><p className="truncate font-semibold text-slate-900">{log.actorName}</p><p className="truncate text-[10px] text-slate-500">{log.actorRole}</p></td><td className="px-4 py-3"><p className="truncate font-medium text-slate-900">{log.summary}</p>{log.details && <p className="mt-0.5 truncate text-[10px] text-slate-500">{log.details}</p>}</td><td className="px-2 py-3 text-right">{log.details && <button type="button" aria-label={`Toggle details for ${log.summary}`} aria-expanded={expandedId === log.id} onClick={() => setExpandedId(expandedId === log.id ? null : log.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-700"><ChevronDown className={`h-4 w-4 transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} /></button>}</td></tr>{expandedId === log.id && log.details && <tr><td colSpan={6} className="bg-blue-50/50 px-4 py-3"><div className="ml-40 rounded-lg border border-blue-100 bg-white p-3 text-xs leading-5 text-slate-700"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">Event details</p>{log.details}</div></td></tr>}</React.Fragment>)}</tbody></table></div>

      <div className="divide-y divide-slate-100 md:hidden">{visibleLogs.map(log => <article key={log.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{actionLabel(log.actionType)}</span><span className="font-mono text-[10px] text-slate-400">{formatTimestamp(log.timestamp)}</span></div><p className="mt-2 font-semibold text-slate-900">{log.summary}</p><p className="mt-1 text-[11px] text-slate-500">{log.actorName} · {log.actorRole}</p>{log.trackingNumber && <p className="mt-1 font-mono text-[11px] font-semibold text-blue-700">{log.trackingNumber}</p>}</div>{log.details && <button type="button" aria-label={`Toggle details for ${log.summary}`} onClick={() => setExpandedId(expandedId === log.id ? null : log.id)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><ChevronDown className={`h-4 w-4 transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} /></button>}</div>{expandedId === log.id && log.details && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{log.details}</p>}</article>)}</div>
      {visibleLogs.length === 0 && <div className="px-6 py-16 text-center"><History className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">No audit events found</p><p className="mt-1 text-xs text-slate-400">Adjust the search or action filter.</p></div>}
      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><p>Showing <strong>{firstVisible}–{lastVisible}</strong> of <strong>{filteredLogs.length}</strong> events</p><div className="flex items-center gap-2"><select aria-label="Audit events per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value={10}>10 per page</option><option value={15}>15 per page</option><option value={25}>25 per page</option><option value={50}>50 per page</option></select><button type="button" aria-label="Previous audit page" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-16 text-center font-semibold">{currentPage} / {pageCount}</span><button type="button" aria-label="Next audit page" disabled={currentPage >= pageCount} onClick={() => setPage(value => value + 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></footer>
    </section>
  </div>;
};
