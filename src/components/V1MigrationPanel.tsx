import React, { useCallback, useEffect, useState } from 'react';
import { Archive, CalendarDays, ChevronLeft, ChevronRight, FileText, Lock, Search, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { queryArchive, type ArchiveDataset, type ArchiveResponse, type ArchiveRow } from '../services/archiveApi';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';

const datasets: Array<{ id: ArchiveDataset; label: string; description: string; icon: React.ElementType }> = [
  { id: 'document', label: 'Documents', description: 'Historical incoming and released documents', icon: FileText },
  { id: 'ewp_records', label: 'EWP Records', description: 'Employee welfare program records', icon: Users },
  { id: 'leave_requests', label: 'Leave Requests', description: 'Historical employee leave filings', icon: CalendarDays },
];
const initialPagination = { page: 1, pageSize: 25, totalRecords: 0, totalPages: 1 };
const display = (row: ArchiveRow, key: string) => row[key] == null || row[key] === '' ? '—' : String(row[key]);
const date = (raw: unknown) => {
  if (!raw) return '—';
  const parsed = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? String(raw) : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const money = (raw: unknown) => raw == null || raw === '' ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PHP' }).format(Number(raw));
const statusClass = (raw: unknown) => {
  const normalized = String(raw || '').toLowerCase();
  if (normalized.includes('release') || normalized.includes('approve') || normalized.includes('complete')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('hold') || normalized.includes('cancel') || normalized.includes('disapprove')) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
};
const Status = ({ value }: { value: string }) => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(value)}`}>{value}</span>;
const Th = ({ children }: { children: React.ReactNode }) => <th className="bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{children}</th>;
const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <td className={`max-w-[260px] px-4 py-3 align-top text-slate-600 ${className}`}>{children}</td>;
const Primary = ({ children }: { children: React.ReactNode }) => <strong className="block font-semibold text-slate-800">{children}</strong>;
const Secondary = ({ children }: { children: React.ReactNode }) => <small className="mt-0.5 block max-w-[260px] truncate text-[11px] text-slate-400">{children}</small>;

const ArchiveTable = ({ dataset, rows }: { dataset: ArchiveDataset; rows: ArchiveRow[] }) => {
  if (dataset === 'document') return <table className="w-full min-w-[980px] text-left text-xs"><thead><tr><Th>Barcode / ID</Th><Th>Document</Th><Th>Office</Th><Th>Classification</Th><Th>Status</Th><Th>Action Taken</Th><Th>Recorded</Th></tr></thead><tbody>{rows.map(row => <tr key={String(row.id)} className="border-t border-slate-100 hover:bg-slate-50/80"><Td><Primary><span className="font-mono">{display(row,'barcode')}</span></Primary><Secondary>ID {display(row,'id')}</Secondary></Td><Td><Primary>{display(row,'title')}</Primary><Secondary>{display(row,'remarks')}</Secondary></Td><Td>{display(row,'office')}</Td><Td>{display(row,'classification')}</Td><Td><Status value={display(row,'status')} /></Td><Td>{display(row,'action_taken')}</Td><Td>{date(row.timestamp)}</Td></tr>)}</tbody></table>;
  if (dataset === 'ewp_records') return <table className="w-full min-w-[930px] text-left text-xs"><thead><tr><Th>Barcode / ID</Th><Th>Employee</Th><Th>Office</Th><Th>Purpose</Th><Th>Amount</Th><Th>Status</Th><Th>Recorded</Th></tr></thead><tbody>{rows.map(row => <tr key={String(row.id)} className="border-t border-slate-100 hover:bg-slate-50/80"><Td><Primary><span className="font-mono">{display(row,'barcode')}</span></Primary><Secondary>ID {display(row,'id')}</Secondary></Td><Td><Primary>{display(row,'employee_name')}</Primary></Td><Td>{display(row,'office')}</Td><Td><Primary>{display(row,'purpose')}</Primary><Secondary>{display(row,'remarks')}</Secondary></Td><Td className="font-mono font-semibold">{money(row.amount)}</Td><Td><Status value={display(row,'status')} /></Td><Td>{date(row.created_timestamp)}</Td></tr>)}</tbody></table>;
  return <table className="w-full min-w-[1020px] text-left text-xs"><thead><tr><Th>Barcode / ID</Th><Th>Employee</Th><Th>Office</Th><Th>Leave Type</Th><Th>Leave Period</Th><Th>Status</Th><Th>Filed</Th></tr></thead><tbody>{rows.map(row => <tr key={String(row.id)} className="border-t border-slate-100 hover:bg-slate-50/80"><Td><Primary><span className="font-mono">{display(row,'barcode')}</span></Primary><Secondary>ID {display(row,'id')}</Secondary></Td><Td><Primary>{display(row,'employee_name')}</Primary></Td><Td>{display(row,'office')}</Td><Td><Primary>{display(row,'type')}</Primary><Secondary>{[row.subtype,row.subtype_detail].filter(Boolean).join(' · ') || '—'}</Secondary></Td><Td>{date(row.start_date)} – {date(row.end_date)}</Td><Td><Status value={display(row,'status')} /></Td><Td>{date(row.created_timestamp)}</Td></tr>)}</tbody></table>;
};

export const V1MigrationPanel: React.FC = () => {
  const { currentUser } = useApp();
  const [active, setActive] = useState<ArchiveDataset>(() => {
    const saved = readWorkspaceValue<ArchiveDataset>(currentUser.id, 'archive.active-dataset', 'document');
    return datasets.some(dataset => dataset.id === saved) ? saved : 'document';
  });
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<ArchiveResponse>({ items: [], counts: { document: 0, ewp_records: 0, leave_requests: 0 }, pagination: initialPagination });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectDataset = (dataset: ArchiveDataset) => {
    writeWorkspaceValue(currentUser.id, 'archive.active-dataset', dataset);
    setActive(dataset); setSearchInput(''); setQuery(''); setPage(1);
  };

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(searchInput.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await queryArchive({ table: active, q: query, page, pageSize });
      setResult(response);
      if (response.pagination.page !== page) setPage(response.pagination.page);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Historical records could not be loaded.'); }
    finally { setLoading(false); }
  }, [active, page, pageSize, query]);
  useEffect(() => { void load(); }, [load]);
  const selected = datasets.find(dataset => dataset.id === active)!;
  const start = result.pagination.totalRecords ? (result.pagination.page - 1) * result.pagination.pageSize + 1 : 0;
  const end = Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.totalRecords);

  return <div className="space-y-5 pb-12">
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><Archive className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold tracking-tight text-slate-950">Historical Archive</h1><span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700"><Lock className="h-3 w-3" />Read only</span></div><p className="mt-1 text-sm text-slate-500">Search legacy documents, EWP records, and leave requests preserved in the archive database.</p></div></div>
    </header>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="border-b border-slate-200 bg-slate-50/60 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Historical archive datasets">{datasets.map(dataset => { const Icon=dataset.icon; const isSelected=active===dataset.id; return <button key={dataset.id} type="button" role="tab" aria-selected={isSelected} onClick={() => selectDataset(dataset.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${isSelected?'border-blue-500 bg-white shadow-sm ring-2 ring-blue-100':'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected?'bg-blue-600 text-white':'bg-slate-100 text-slate-500'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900">{dataset.label}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isSelected?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}`}>{(result.counts[dataset.id] || 0).toLocaleString()}</span></span><small className="mt-0.5 block truncate text-[11px] text-slate-500">{dataset.description}</small></span></button> })}</div>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Search {selected.label}</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="archive-search-input" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={`Search ${selected.label.toLowerCase()} by barcode, name, office, status, or details`} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />{searchInput && <button type="button" aria-label="Clear archive search" onClick={() => setSearchInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200"><X className="h-3.5 w-3.5" /></button>}</span></label>
        <p className="shrink-0 text-xs text-slate-500"><strong className="text-slate-800">{result.pagination.totalRecords.toLocaleString()}</strong> matching records</p>
      </div>

      {error ? <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : <div className="relative overflow-x-auto">{loading && <div className="absolute inset-0 z-10 flex min-h-56 items-center justify-center bg-white/75 text-sm font-semibold text-slate-500">Loading historical records…</div>}{result.items.length ? <ArchiveTable dataset={active} rows={result.items} /> : <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center"><Search className="h-8 w-8 text-slate-300" /><strong className="mt-3 text-sm text-slate-800">No matching records</strong><p className="mt-1 text-xs text-slate-500">Try a different keyword or clear the search.</p></div>}</div>}

      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>{result.pagination.totalRecords ? <>Showing <strong>{start.toLocaleString()}–{end.toLocaleString()}</strong> of <strong>{result.pagination.totalRecords.toLocaleString()}</strong></> : 'Showing 0 records'}</span><div className="flex items-center gap-2"><select aria-label="Archive rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value={10}>10 per page</option><option value={25}>25 per page</option><option value={50}>50 per page</option></select><button type="button" aria-label="Previous archive page" disabled={page<=1||loading} onClick={() => setPage(current => current-1)} className="rounded-lg border border-slate-200 bg-white p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><strong className="min-w-20 text-center">{result.pagination.page} / {result.pagination.totalPages}</strong><button type="button" aria-label="Next archive page" disabled={page>=result.pagination.totalPages||loading} onClick={() => setPage(current => current+1)} className="rounded-lg border border-slate-200 bg-white p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></footer>
    </section>
  </div>;
};
