import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { LeaveApplicationRecord, LeaveDateRange, LeaveType } from '../types';
import { CalendarClock, Eye, FileCheck2, Filter, Pencil, Plus, RefreshCcw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { queryLeaveRegistry } from '../services/leaveApi';
import { OFFICE_OPTIONS } from '../data/offices';
import { LeaveDateRangePicker } from './LeaveDateRangePicker';

const LEAVE_TYPES: LeaveType[] = [
  'COC', 'Vacation Leave', 'Mandatory / Forced Leave', 'Sick Leave', 'Wellness Leave',
  'Maternity Leave', 'Paternity Leave', 'Special Privilege Leave', 'Solo Parent Leave',
  'Study Leave', '10-Day VAWC Leave', 'Rehabilitation Privilege',
  'Special Leave Benefits for Women', 'Special Emergency / Calamity Leave',
  'Adoption Leave', 'Others', 'Terminal Leave',
];

const statusLabel = (status: LeaveApplicationRecord['status']) => ({
  For_Computation: 'For Computation',
  For_Processing: 'Processing',
  For_Signature: 'For Signature',
  On_Hold: 'On Hold / For Compliance',
  Released: 'Released',
  Pending: 'Pending',
  Approved: 'Approved',
  Disapproved: 'Disapproved',
  Cancelled: 'Cancelled',
}[status]);

const statusStyle = (status: LeaveApplicationRecord['status']) => {
  if (status === 'Released' || status === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'For_Signature') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (status === 'For_Processing') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'On_Hold') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (status === 'Cancelled' || status === 'Disapproved') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const subtypeLabels: Record<string, string> = {
  WITHIN_PHILIPPINES: 'Within the Philippines', ABROAD: 'Abroad',
  IN_HOSPITAL: 'In Hospital', OUT_PATIENT: 'Out Patient',
  MASTERS_COMPLETION: "Completion of Master's Degree", BOARD_BAR_REVIEW: 'BAR / Board Examination Review',
  MONETIZATION: 'Monetization of Leave Credits', TERMINAL_LEAVE: 'Terminal Leave', OTHER: 'Other',
};
const detailLabels = (type: LeaveType) => {
  if (type === 'Vacation Leave' || type === 'Special Privilege Leave') return ['Location Type', 'Location / Destination'];
  if (type === 'Sick Leave') return ['Medical Setting', 'Illness / Medical Details'];
  if (type === 'Study Leave') return ['Study Leave Purpose', 'Additional Details'];
  if (type === 'Others') return ['Other Leave Purpose', 'Specified Purpose / Details'];
  if (type === 'Special Leave Benefits for Women') return ['', 'Specific Details / Reason'];
  if (type === 'Special Emergency / Calamity Leave') return ['', 'Emergency / Calamity Details'];
  if (type === 'Rehabilitation Privilege') return ['', 'Rehabilitation Details'];
  if (['Wellness Leave','Maternity Leave','Paternity Leave','Solo Parent Leave','10-Day VAWC Leave'].includes(type)) return ['', 'Additional Details'];
  return ['', ''];
};
type DateRangeDraft = Pick<LeaveDateRange, 'id' | 'startDate' | 'endDate'> & { dayType: 'WHOLE_DAY' | 'AM_HALF_DAY' | 'PM_HALF_DAY' };
type ChangeableLeaveStatus = 'For_Computation'|'On_Hold'|'For_Signature'|'Released';
const emptyDateRange = (): DateRangeDraft => ({ startDate: '', endDate: '', dayType: 'WHOLE_DAY' });
const rangesForRecord = (record: LeaveApplicationRecord): DateRangeDraft[] => record.dateRanges?.length
  ? [...record.dateRanges].sort((a,b) => a.startDate.localeCompare(b.startDate)).map(range => ({ id: range.id, startDate: range.startDate, endDate: range.endDate, dayType: range.dayType || 'WHOLE_DAY' }))
  : [{ startDate: record.startDate, endDate: record.endDate, dayType: 'WHOLE_DAY' }];
const calculatedDays = (ranges: DateRangeDraft[]) => ranges.reduce((total, range) => {
  if (!range.startDate || !range.endDate || range.startDate > range.endDate) return total;
  if (range.dayType !== 'WHOLE_DAY') return total + (range.startDate === range.endDate ? 0.5 : 0);
  return total + Math.floor((new Date(`${range.endDate}T00:00:00Z`).getTime() - new Date(`${range.startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
}, 0);
const dayTypeLabel = (type?: LeaveDateRange['dayType']) => type ? ({ WHOLE_DAY: 'Whole Day', AM_HALF_DAY: 'AM Half-Day', PM_HALF_DAY: 'PM Half-Day' }[type]) : 'Archived Date Range';
const formatDays = (days: number) => `${days} day${days === 1 ? '' : 's'}`;
const rangeDays = (range: LeaveDateRange) => range.leaveDayUnits !== undefined ? range.leaveDayUnits / 2 : range.dayType && range.dayType !== 'WHOLE_DAY' ? 0.5 : Math.floor((new Date(`${range.endDate}T00:00:00Z`).getTime() - new Date(`${range.startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
const displayDate = (date: string) => new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
const displayDateTime = (value: string) => {
  const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
};
const compactDates = (record: LeaveApplicationRecord) => {
  if (!record.dateRanges?.length) return `${displayDate(record.startDate)} – ${displayDate(record.endDate)}`;
  const ranges=[...record.dateRanges].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const first=ranges[0].startDate===ranges[0].endDate?displayDate(ranges[0].startDate):`${displayDate(ranges[0].startDate)} – ${displayDate(ranges[0].endDate)}`;
  return ranges.length===1?first:`${first} + ${ranges.length-1} more range${ranges.length===2?'':'s'}`;
};
const selectedDates = (record: LeaveApplicationRecord) => {
  const ranges = record.dateRanges?.length ? record.dateRanges : [{ startDate: record.startDate, endDate: record.endDate, dayType: 'WHOLE_DAY' as const }];
  return ranges.flatMap(range => {
    const start = parseDateValue(range.startDate); const end = parseDateValue(range.endDate);
    if (!start || !end || start > end) return [];
    const dates: { date: string; dayType: LeaveDateRange['dayType'] }[] = [];
    for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) dates.push({ date: current.toISOString().slice(0,10), dayType: range.dayType || 'WHOLE_DAY' });
    return dates;
  }).sort((a,b) => a.date.localeCompare(b.date));
};
const parseDateValue = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return value && !Number.isNaN(date.getTime()) ? date : null;
};

export const LeaveContinuity: React.FC = () => {
  const { auditLogs, currentUser, fileLeaveApplication, updateLeaveApplication, deleteLeaveApplication, changeLeaveApplicationStatus, can } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOffice, setFilterOffice] = useState('');
  const [filedFrom, setFiledFrom] = useState(''); const [filedTo, setFiledTo] = useState(''); const [leaveDate, setLeaveDate] = useState('');
  const [sort, setSort] = useState('registered_desc'); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [records, setRecords] = useState<LeaveApplicationRecord[]>([]); const [summary, setSummary] = useState({total:0,forComputation:0,processing:0,forSignature:0,onHold:0,released:0});
  const [pagination, setPagination] = useState({page:1,pageSize:10,totalRecords:0,totalPages:1}); const [offices,setOffices]=useState<string[]>([]); const [queryError,setQueryError]=useState(''); const [isQuerying,setIsQuerying]=useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LeaveApplicationRecord | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<LeaveApplicationRecord | null>(null);
  const [datesRecord, setDatesRecord] = useState<LeaveApplicationRecord | null>(null);
  const [statusRecord, setStatusRecord] = useState<LeaveApplicationRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<LeaveApplicationRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<ChangeableLeaveStatus|''>('');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [office, setOffice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('Vacation Leave');
  const [leaveSubtype, setLeaveSubtype] = useState('');
  const [leaveDetails, setLeaveDetails] = useState('');
  const [dateRanges, setDateRanges] = useState<DateRangeDraft[]>([emptyDateRange()]);
  const [remarks, setRemarks] = useState('');

  const canViewLeave = currentUser.role === 'admin' || currentUser.sidebarModules === undefined || currentUser.sidebarModules.includes('leave');
  const loadRegistry=useCallback(async()=>{ setIsQuerying(true); setQueryError(''); try { const result=await queryLeaveRegistry({q:searchQuery,status:filterStatus==='all'?'':filterStatus,leaveType:filterType==='all'?'':filterType,office:filterOffice,filedFrom,filedTo,leaveDate,page,pageSize,sort}); setRecords(result.items); setSummary(result.summary); setPagination(result.pagination); setOffices(result.offices); if(result.pagination.page!==page)setPage(result.pagination.page); } catch(error){setQueryError(error instanceof Error?error.message:'Leave records could not be loaded.');} finally {setIsQuerying(false);}},[filedFrom,filedTo,filterOffice,filterStatus,filterType,leaveDate,page,pageSize,searchQuery,sort]);
  useEffect(()=>{if(!canViewLeave)return;const timer=setTimeout(()=>void loadRegistry(),300);return()=>clearTimeout(timer);},[canViewLeave,loadRegistry]);
  const canRegister = can('canIntake') && canViewLeave;
  const canChangeStatus = canViewLeave && (can('canProcess') || can('canApprove') || can('canRelease') || can('canSupervise'));
  const canModifyRecord = (record: LeaveApplicationRecord) => !record.isLegacyV1 && record.status==='For_Computation' && canRegister && (record.createdByUserId===currentUser.id || can('canSupervise') || can('canAdmin'));
  const openStatusChange = (record: LeaveApplicationRecord) => { setStatusRecord(record); setNextStatus(''); setStatusRemarks(''); };
  const submitStatusChange = async (event: React.FormEvent) => {
    event.preventDefault(); if (!statusRecord || !nextStatus) return;
    const saved = await changeLeaveApplicationStatus(statusRecord.id,{status:nextStatus,remarks:statusRemarks.trim()}) as LeaveApplicationRecord | null;
    if (saved) { if (selectedRecord?.id===saved.id) setSelectedRecord(saved); setStatusRecord(null); setNextStatus(''); setStatusRemarks(''); await loadRegistry(); }
  };
  const confirmDelete = async () => {
    if (!deleteRecord) return; const deleted = await deleteLeaveApplication(deleteRecord.id);
    if (deleted) { setDeleteRecord(null); setPage(1); await loadRegistry(); }
  };

  const resetForm = () => {
    setEmployeeName(''); setOffice(''); setBarcode('');
    setLeaveType('Vacation Leave'); setLeaveSubtype(''); setLeaveDetails(''); setDateRanges([emptyDateRange()]);
    setRemarks(''); setEditingRecord(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeName.trim() || !office.trim() || dateRanges.some(range => !range.startDate || !range.endDate)) return;
    const payload = {
      ...(editingRecord ? { id: editingRecord.id } : {}),
      employeeId: editingRecord?.employeeId || '', employeeName: employeeName.trim(), office: office.trim(), barcode: barcode.trim() || 'N/A', leaveType,
      leaveSubtype: leaveSubtype || null, leaveDetails: leaveDetails.trim() || null, dateRanges,
      calculatedLeaveDays: calculatedDays(dateRanges), remarks: remarks.trim(),
    };
    const saved = editingRecord ? await updateLeaveApplication(payload) : await fileLeaveApplication(payload);
    if (!saved) return;
    setIsModalOpen(false); resetForm(); setPage(1); await loadRegistry();
  };
  const openEdit = (record: LeaveApplicationRecord) => {
    setEditingRecord(record); setEmployeeName(record.employeeName);
    setOffice(record.office || record.department || '');
    const existingBarcode = record.barcode || record.trackingNumber || '';
    setBarcode(existingBarcode === 'N/A' ? '' : existingBarcode);
    setLeaveType(record.leaveType); setLeaveSubtype(record.leaveSubtype || ''); setLeaveDetails(record.leaveDetails || '');
    setDateRanges(rangesForRecord(record)); setRemarks(record.remarks || ''); setIsModalOpen(true);
  };
  const changeRange = (index: number, field: keyof DateRangeDraft, value: string) => setDateRanges(previous => previous.map((range,i) => i===index ? { ...range, [field]: value, ...(field==='dayType' && value!=='WHOLE_DAY' ? { endDate: range.startDate } : {}), ...(field==='startDate' && range.dayType!=='WHOLE_DAY' ? { endDate: value } : {}) } as DateRangeDraft : range));

  const summaries = [
    ['Total Leave Records', summary.total, 'text-slate-900'], ['For Computation', summary.forComputation, 'text-amber-700'], ['Processing', summary.processing, 'text-blue-700'], ['For Signature', summary.forSignature, 'text-violet-700'], ['On Hold', summary.onHold, 'text-orange-700'], ['Released', summary.released, 'text-emerald-700'],
  ];
  const hasActiveFilters=!!(searchQuery||filterType!=='all'||filterStatus!=='all'||filterOffice||filedFrom||filedTo||leaveDate||sort!=='registered_desc');

  return <div className="space-y-4 pb-12">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-4 px-5 pb-5 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase leading-none tracking-widest text-blue-600">HRMDO Registry</p><h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">Leave Records</h1>
          <p className="mt-1 text-sm text-slate-500">Register and track employee Leave Applications through HRMDO processing.</p>
        </div>
        {canRegister && <button id="btn-file-new-leave" aria-label="Register Leave Application" onClick={() => { resetForm(); setIsModalOpen(true); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Register Leave
        </button>}
      </div>
      <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-3 lg:grid-cols-6">
        {summaries.map(([label, count, color]) => <div key={String(label)} className="min-w-0 overflow-hidden border-r border-slate-100 px-5 py-4 last:border-r-0">
          <p title={String(label)} className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{count}</p>
        </div>)}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Filter className="h-4 w-4 text-slate-500"/><h2 className="text-sm font-bold text-slate-800">Find Leave Applications</h2></div>{hasActiveFilters&&<button onClick={()=>{setSearchQuery('');setFilterType('all');setFilterStatus('all');setFilterOffice('');setFiledFrom('');setFiledTo('');setLeaveDate('');setSort('registered_desc');setPage(1);}} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><RotateCcw className="h-3.5 w-3.5"/>Reset filters</button>}</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <label className="md:col-span-2 xl:col-span-5"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Search</span><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input id="leave-search-input" value={searchQuery} onChange={event=>{setSearchQuery(event.target.value);setPage(1);}} placeholder="Employee, barcode, office, leave type or status" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/></div></label>
        <label className="xl:col-span-3"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Leave Type</span><select id="leave-filter-type" value={filterType} onChange={event=>{setFilterType(event.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">All Leave Types</option>{LEAVE_TYPES.map(type=><option key={type}>{type}</option>)}</select></label>
        <label className="xl:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</span><select id="leave-filter-status" value={filterStatus} onChange={event=>{setFilterStatus(event.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">All Statuses</option><option value="For_Computation">For Computation</option><option value="For_Processing">Processing</option><option value="For_Signature">For Signature</option><option value="On_Hold">On Hold</option><option value="Released">Released</option><option value="Cancelled">Cancelled</option></select></label>
        <label className="xl:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Sort By</span><select aria-label="Sort Leave Records" value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="registered_desc">Newest Registered</option><option value="registered_asc">Oldest Registered</option><option value="employee_asc">Employee A–Z</option><option value="employee_desc">Employee Z–A</option><option value="status_asc">Status</option><option value="type_asc">Leave Type</option></select></label>
        <label className="xl:col-span-5"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Office</span><select aria-label="Office" value={filterOffice} onChange={e=>{setFilterOffice(e.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">All Offices</option>{offices.map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="xl:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Filed From</span><input aria-label="Filed From" type="date" value={filedFrom} onChange={e=>{setFiledFrom(e.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
        <label className="xl:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Filed To</span><input aria-label="Filed To" type="date" value={filedTo} onChange={e=>{setFiledTo(e.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
        <label className="xl:col-span-3"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Leave Date Covered</span><input aria-label="Leave Date" type="date" value={leaveDate} onChange={e=>{setLeaveDate(e.target.value);setPage(1);}} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><div><h2 className="text-sm font-bold text-slate-900">Leave Registry</h2><p className="mt-0.5 text-[11px] text-slate-500">{pagination.totalRecords} matching {pagination.totalRecords===1?'record':'records'}</p></div>{isQuerying&&<span className="text-xs font-semibold text-blue-600">Updating…</span>}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-3">Tracking Number</th><th className="px-4 py-3">Employee / Applicant</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Leave Type</th><th className="px-4 py-3">Inclusive Dates</th><th className="px-4 py-3 text-center">Days</th><th className="min-w-[132px] whitespace-nowrap px-4 py-3">Status</th><th className="min-w-[112px] whitespace-nowrap px-5 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map(record => <tr key={record.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{record.barcode || record.trackingNumber || 'Not recorded'}</td>
              <td className="px-4 py-3"><p className="font-semibold text-slate-900">{record.employeeName}</p><p className="text-[11px] text-slate-500">{record.position || 'Position not recorded'}</p></td>
              <td className="px-4 py-3 text-xs text-slate-600">{record.office || record.department || 'Not recorded'}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{record.leaveType}</td>
              <td className="px-4 py-3 text-xs font-medium text-slate-700">{selectedDates(record).length > 1 ? <button type="button" onClick={() => setDatesRecord(record)} className="inline-flex whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 transition hover:border-blue-300 hover:bg-blue-100">Multiple Dates Selected</button> : compactDates(record)}</td><td className="px-4 py-3 text-center font-bold text-slate-800">{record.totalLeaveDays ?? record.workingDaysNumber}</td>
              <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold leading-none ${statusStyle(record.status)}`}>{statusLabel(record.status)}</span></td>
              <td className="px-5 py-3 text-right"><div className="inline-flex items-center gap-1.5"><button type="button" aria-label="View Leave Application" title="View Leave Application" onClick={() => setSelectedRecord(record)} className="rounded-lg border border-blue-200 bg-white p-2 text-blue-700 shadow-xs hover:bg-blue-50"><Eye className="h-4 w-4" /></button>{canChangeStatus&&!record.isLegacyV1&&<button type="button" aria-label="Change Leave Status" title="Change Leave Status" onClick={()=>openStatusChange(record)} className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-700 hover:bg-violet-100"><RefreshCcw className="h-4 w-4" /></button>}{canModifyRecord(record)&&<button type="button" aria-label="Edit Leave Application" title="Edit Leave Application" onClick={()=>openEdit(record)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Pencil className="h-4 w-4" /></button>}{canModifyRecord(record)&&<button type="button" aria-label="Delete Leave Application" title="Delete Leave Application" onClick={()=>setDeleteRecord(record)} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100"><Trash2 className="h-4 w-4" /></button>}</div></td>
            </tr>)}
            {!isQuerying && records.length === 0 && <tr><td colSpan={8} className="px-6 py-14 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-700">No Leave Applications found</p><p className="mt-1 text-xs text-slate-400">{searchQuery||filterType!=='all'||filterStatus!=='all'||filterOffice||filedFrom||filedTo||leaveDate?'No Leave Applications match the current search/filters.':'Registered Leave Applications will appear here.'}</p></td></tr>}
            {isQuerying&&<tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-blue-600">Loading Leave Applications…</td></tr>}
          </tbody>
        </table>
      </div>
      {queryError&&<div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{queryError}</div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600"><span>{pagination.totalRecords?`Showing ${(pagination.page-1)*pagination.pageSize+1}–${Math.min(pagination.page*pagination.pageSize,pagination.totalRecords)} of ${pagination.totalRecords}`:'Showing 0 records'}</span><div className="flex items-center gap-2"><select aria-label="Page Size" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}} className="rounded border border-slate-200 px-2 py-1"><option>10</option><option>25</option><option>50</option></select><button disabled={page<=1||isQuerying} onClick={()=>setPage(value=>value-1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><strong>Page {pagination.page} of {pagination.totalPages}</strong><button disabled={page>=pagination.totalPages||isQuerying} onClick={()=>setPage(value=>value+1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div></footer>
    </section>

    {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3"><span className="rounded-lg bg-blue-600 p-2"><CalendarClock className="h-5 w-5" /></span><div><h2 className="font-bold">{editingRecord ? 'Edit Leave Application' : 'Register Leave Application'}</h2><p className="text-xs text-slate-300">{editingRecord ? 'Update the official record and recalculate its Leave Days.' : 'Register an official employee application for HRMDO processing.'}</p></div></div>
          <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-semibold text-slate-700">Barcode / Tracking No. <span className="font-normal text-slate-400">(optional)</span><input id="leave-input-barcode" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Leave blank to use N/A" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="font-semibold text-slate-700">Employee / Applicant *<input id="leave-input-applicant" required value={employeeName} onChange={event => setEmployeeName(event.target.value)} placeholder="Enter employee or applicant name" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-semibold text-slate-700">Office *<select id="leave-select-office" required value={office} onChange={event => setOffice(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="">Select applicant office</option>{office && !(OFFICE_OPTIONS as readonly string[]).includes(office) && <option value={office}>{office}</option>}{OFFICE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="font-semibold text-slate-700">Leave Type *<select id="select-filing-leave-type" value={leaveType} onChange={event => { setLeaveType(event.target.value as LeaveType); setLeaveSubtype(''); setLeaveDetails(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100">{LEAVE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          </div>
          {(detailLabels(leaveType)[0] || detailLabels(leaveType)[1]) && <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">Leave Details</p>
            {detailLabels(leaveType)[0] && <label className="block font-semibold text-slate-700">{detailLabels(leaveType)[0]} *
              <select id="select-leave-subtype" required value={leaveSubtype} onChange={event => { setLeaveSubtype(event.target.value); if (leaveType === 'Others' && event.target.value !== 'OTHER') setLeaveDetails(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">Select {detailLabels(leaveType)[0].toLowerCase()}</option>
                {(leaveType === 'Vacation Leave' || leaveType === 'Special Privilege Leave') && <><option value="WITHIN_PHILIPPINES">Within the Philippines</option><option value="ABROAD">Abroad</option></>}
                {leaveType === 'Sick Leave' && <><option value="IN_HOSPITAL">In Hospital</option><option value="OUT_PATIENT">Out Patient</option></>}
                {leaveType === 'Study Leave' && <><option value="MASTERS_COMPLETION">Completion of Master's Degree</option><option value="BOARD_BAR_REVIEW">BAR / Board Examination Review</option></>}
                {leaveType === 'Others' && <><option value="MONETIZATION">Monetization of Leave Credits</option><option value="TERMINAL_LEAVE">Terminal Leave</option><option value="OTHER">Other</option></>}
              </select>
            </label>}
            {detailLabels(leaveType)[1] && <label className={`${detailLabels(leaveType)[0] ? 'mt-3' : ''} block font-semibold text-slate-700`}>{detailLabels(leaveType)[1]}{(leaveType === 'Sick Leave' || (leaveType === 'Others' && leaveSubtype === 'OTHER')) && ' *'}
              <textarea id="input-leave-specific-details" required={leaveType === 'Sick Leave' || (leaveType === 'Others' && leaveSubtype === 'OTHER')} value={leaveDetails} onChange={event => setLeaveDetails(event.target.value)} rows={2} placeholder={leaveType === 'Vacation Leave' ? 'e.g. Cebu City or Japan' : leaveType === 'Sick Leave' ? 'Brief business-required illness information' : ''} className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" />
            </label>}
          </section>}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-800">Leave Dates</h3><p className="text-[10px] text-slate-500">Select the first and last date on the calendar. Add another range only for non-consecutive dates.</p></div><button id="btn-add-leave-range" type="button" onClick={() => setDateRanges(previous => [...previous, emptyDateRange()])} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" /> Add Range</button></div>
            <div className="mt-3 space-y-3">{dateRanges.map((range,index) => <div key={range.id || index} data-testid={`leave-date-range-${index}`} className="rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between"><span className="font-bold text-slate-600">Date Range {index+1}</span>{dateRanges.length>1 && <button aria-label={`Remove date range ${index+1}`} type="button" onClick={() => setDateRanges(previous => previous.filter((_,i)=>i!==index))} className="rounded-md p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>}</div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <label className="min-w-0 font-semibold text-slate-700">Date Range *<div className="mt-1"><LeaveDateRangePicker startDate={range.startDate} endDate={range.endDate} dayType={range.dayType} onChange={(startDate,endDate) => setDateRanges(previous => previous.map((item,i) => i===index ? { ...item, startDate, endDate } : item))} /></div></label>
              <label className="font-semibold text-slate-700">Duration *<select value={range.dayType} onChange={event => changeRange(index,'dayType',event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100"><option value="WHOLE_DAY">Whole Day</option><option value="AM_HALF_DAY">AM Half-Day</option><option value="PM_HALF_DAY">PM Half-Day</option></select></label>
            </div></div>)}</div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2"><span className="font-semibold text-blue-800">Calculated Leave Days</span><strong id="calculated-leave-days" className="text-base text-blue-900">{formatDays(calculatedDays(dateRanges))}</strong></div>
          </section>
          <label className="block font-semibold text-slate-700">Remarks<textarea value={remarks} onChange={event => setRemarks(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">The new record will enter the Leave Registry with a <strong>For Computation</strong> status. Encoder: {currentUser.name}.</p>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button id="btn-submit-filing" type="submit" disabled={!employeeName.trim()} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{editingRecord ? 'Save Changes' : 'Register Leave Application'}</button></footer>
        </form>
      </div>
    </div>}

    {datesRecord && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="leave-dates-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white"><div><p className="font-mono text-[10px] font-bold text-blue-300">{datesRecord.barcode || datesRecord.trackingNumber || 'N/A'}</p><h2 id="leave-dates-title" className="mt-1 text-base font-bold">Inclusive Dates</h2><p className="mt-0.5 text-xs text-slate-300">{datesRecord.employeeName}</p></div><button type="button" aria-label="Close Inclusive Dates" onClick={() => setDatesRecord(null)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></header>
        <div className="max-h-[60vh] overflow-y-auto p-5"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Selected leave dates</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{selectedDates(datesRecord).length} dates</span></div><div className="grid gap-2 sm:grid-cols-2">{selectedDates(datesRecord).map(({date,dayType}) => <div key={`${date}-${dayType}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><div><p className="text-xs font-bold text-slate-800">{displayDate(date)}</p><p className="mt-0.5 text-[10px] text-slate-500">{dayTypeLabel(dayType)}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{dayType === 'WHOLE_DAY' ? '1 day' : '½ day'}</span></div>)}</div></div>
        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3"><button type="button" onClick={() => setDatesRecord(null)} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Close</button></footer>
      </div>
    </div>}

    {selectedRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-xs sm:p-6" role="dialog" aria-modal="true" aria-labelledby="leave-record-title"><div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between bg-slate-900 px-5 py-4 text-white sm:px-6 sm:py-5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600"><CalendarClock className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-bold text-blue-300">{selectedRecord.barcode || selectedRecord.trackingNumber || 'N/A'}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle(selectedRecord.status)}`}>{statusLabel(selectedRecord.status)}</span></div><h2 id="leave-record-title" className="mt-1 truncate text-lg font-bold">{selectedRecord.employeeName}</h2><p className="mt-0.5 truncate text-xs text-slate-300">Leave application record</p></div></div><button type="button" aria-label="Close Leave Record" onClick={() => setSelectedRecord(null)} className="ml-3 rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button></header>
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto bg-slate-50/70 p-4 text-xs sm:grid-cols-2 sm:p-6 [&>div]:rounded-xl [&>div]:border [&>div]:border-slate-200 [&>div]:bg-white [&>div]:p-4 [&>div>p:first-child]:text-[10px] [&>div>p:first-child]:font-bold [&>div>p:first-child]:uppercase [&>div>p:first-child]:tracking-wider [&>div>p:first-child]:text-slate-400"><div><p>Office</p><p className="mt-1.5 text-sm font-semibold leading-5 text-slate-800">{selectedRecord.office || selectedRecord.department}</p></div><div><p>Leave Type</p><p className="mt-1.5 text-sm font-semibold text-slate-800">{selectedRecord.leaveType}</p></div>{selectedRecord.leaveSubtype && <div><p>{detailLabels(selectedRecord.leaveType)[0] || 'Type Details'}</p><p className="mt-1.5 text-sm font-semibold text-slate-800">{subtypeLabels[selectedRecord.leaveSubtype] || selectedRecord.leaveSubtype}</p></div>}{selectedRecord.leaveDetails && <div><p>{detailLabels(selectedRecord.leaveType)[1] || 'Additional Details'}</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">{selectedRecord.leaveDetails}</p></div>}<div className="col-span-full"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leave Dates</p><span className="rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-700">{formatDays(selectedRecord.totalLeaveDays ?? selectedRecord.workingDaysNumber)} total</span></div>{selectedRecord.dateRanges?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{[...selectedRecord.dateRanges].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map((range,index)=><div key={range.id || index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"><div><p className="font-semibold text-slate-800">{displayDate(range.startDate)}{range.endDate!==range.startDate?` – ${displayDate(range.endDate)}`:''}</p><p className="mt-0.5 text-[10px] text-slate-500">{dayTypeLabel(range.dayType)}</p></div><strong className="rounded-full bg-white px-2 py-1 text-slate-700 ring-1 ring-slate-200">{formatDays(rangeDays(range))}</strong></div>)}</div> : <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5"><p className="font-semibold text-slate-800">{displayDate(selectedRecord.startDate)} – {displayDate(selectedRecord.endDate)}</p><p className="text-[10px] text-slate-500">Archived date range · preserved total</p></div>}</div><div><p>Status</p><span className={`mt-1.5 inline-flex rounded-full border px-2.5 py-1 font-bold ${statusStyle(selectedRecord.status)}`}>{statusLabel(selectedRecord.status)}</span></div><div><p>Encoded By</p><p className="mt-1.5 text-sm font-semibold text-slate-800">{selectedRecord.createdByName || 'Not recorded in the archived record'}</p></div><div><p>Registered</p><p className="mt-1.5 text-sm font-semibold text-slate-800">{displayDateTime(selectedRecord.createdAt || selectedRecord.filingDate)}</p></div>{selectedRecord.remarks && <div><p>Remarks</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">{selectedRecord.remarks}</p></div>}{selectedRecord.computationRemarks && <div className="col-span-full"><p>Computation Remarks</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">{selectedRecord.computationRemarks}</p></div>}{selectedRecord.status==='On_Hold' && <div className="col-span-full !border-orange-200 !bg-orange-50"><p className="!text-orange-700">On Hold · previously {statusLabel(selectedRecord.heldFromStatus!)}</p><p className="mt-1.5 text-sm font-semibold text-orange-900">{selectedRecord.holdReason}</p>{selectedRecord.complianceReceivedAt&&<p className="mt-2 text-emerald-700">Compliance received: {selectedRecord.complianceRemarks}</p>}</div>}{selectedRecord.releasedAt&&<div className="col-span-full"><p>Release Details</p><p className="mt-1.5 text-sm font-semibold text-slate-800">{selectedRecord.releasedByName} · {displayDateTime(selectedRecord.releasedAt)}</p><p className="mt-1 text-slate-600">{selectedRecord.releaseRemarks}</p></div>}{selectedRecord.cancelledAt&&<div className="col-span-full !border-rose-200 !bg-rose-50"><p className="!text-rose-700">Cancelled</p><p className="mt-1.5 font-semibold">{selectedRecord.cancelledByName} · {displayDateTime(selectedRecord.cancelledAt)}</p><p className="mt-1">{selectedRecord.cancellationReason}</p></div>}
        <section className="col-span-full rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Processing History</p><p className="mt-1 text-xs text-slate-500">Newest activity first</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{auditLogs.filter(event=>event.documentId===selectedRecord.id).length} events</span></div><div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{auditLogs.filter(event=>event.documentId===selectedRecord.id).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).map(event=><div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3"><span className="mt-1 h-2 w-2 rounded-full bg-blue-500"/><div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-1"><p className="font-semibold text-slate-800">{event.summary}</p><time className="text-[10px] text-slate-400">{displayDateTime(event.timestamp)}</time></div><p className="mt-0.5 text-[10px] font-medium text-slate-500">{event.actorName}</p>{event.details&&<p className="mt-1 text-[11px] leading-5 text-slate-600">{event.details}</p>}</div></div>)}</div></section>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3"><p className="hidden text-[11px] text-slate-400 sm:block">Official HRMDO Leave Application record</p><button type="button" onClick={() => setSelectedRecord(null)} className="ml-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Close</button></footer>
    </div></div>}
    {statusRecord&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="leave-status-title"><form onSubmit={submitStatusChange} className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><header className="bg-slate-900 px-5 py-4 text-white"><h3 id="leave-status-title" className="font-bold">Change Leave Status</h3><p className="mt-1 text-xs text-slate-300">{statusRecord.employeeName} · {statusRecord.barcode || statusRecord.trackingNumber || 'N/A'}</p></header><div className="space-y-4 p-5 text-xs"><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><span className="text-slate-500">Current status</span><strong className="ml-2 text-slate-800">{statusLabel(statusRecord.status)}</strong></div><label className="block font-semibold text-slate-700">New Status *<select required autoFocus value={nextStatus} onChange={event=>{setNextStatus(event.target.value as ChangeableLeaveStatus);setStatusRemarks('');}} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="">Select a new status</option><option value="For_Computation" disabled={statusRecord.status==='For_Computation'}>For Computation</option><option value="On_Hold" disabled={statusRecord.status==='On_Hold'}>Hold</option><option value="For_Signature" disabled={statusRecord.status==='For_Signature'}>For Signature</option><option value="Released" disabled={statusRecord.status==='Released'}>Released</option></select></label>{nextStatus&&nextStatus!=='For_Computation'&&<label className="block font-semibold text-slate-700">Remarks <span className="font-normal text-slate-400">(optional)</span><textarea value={statusRemarks} onChange={event=>setStatusRemarks(event.target.value)} rows={4} placeholder={`Add remarks for ${statusLabel(nextStatus)}...`} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/></label>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>{setStatusRecord(null);setNextStatus('');setStatusRemarks('');}} className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button type="submit" disabled={!nextStatus} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Save Status</button></div></div></form></div>}
    {deleteRecord&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="delete-leave-title"><div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><header className="bg-slate-900 px-5 py-4 text-white"><h3 id="delete-leave-title" className="font-bold">Delete Leave Application</h3><p className="mt-1 text-xs text-slate-300">{deleteRecord.employeeName} · {deleteRecord.barcode || deleteRecord.trackingNumber || 'N/A'}</p></header><div className="p-5 text-xs"><div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900"><p className="font-bold">This Leave Application will be permanently deleted.</p><p className="mt-1 leading-5 text-rose-700">Its audit event will remain as part of the system history.</p></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setDeleteRecord(null)} className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={confirmDelete} className="rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700">Delete Application</button></div></div></div></div>}
  </div>;
};
