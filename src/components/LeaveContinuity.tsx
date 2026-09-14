import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { LeaveApplicationRecord, LeaveDateRange, LeaveType } from '../types';
import { CalendarClock, Eye, FileCheck2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { queryLeaveRegistry } from '../services/leaveApi';

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
  Pending: 'Pending (Legacy V2)',
  Approved: 'Approved (Legacy V2)',
  Disapproved: 'Disapproved (Legacy V2)',
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
const emptyDateRange = (): DateRangeDraft => ({ startDate: '', endDate: '', dayType: 'WHOLE_DAY' });
const rangesForRecord = (record: LeaveApplicationRecord): DateRangeDraft[] => record.dateRanges?.length
  ? [...record.dateRanges].sort((a,b) => a.startDate.localeCompare(b.startDate)).map(range => ({ id: range.id, startDate: range.startDate, endDate: range.endDate, dayType: range.dayType || 'WHOLE_DAY' }))
  : [{ startDate: record.startDate, endDate: record.endDate, dayType: 'WHOLE_DAY' }];
const calculatedDays = (ranges: DateRangeDraft[]) => ranges.reduce((total, range) => {
  if (!range.startDate || !range.endDate || range.startDate > range.endDate) return total;
  if (range.dayType !== 'WHOLE_DAY') return total + (range.startDate === range.endDate ? 0.5 : 0);
  return total + Math.floor((new Date(`${range.endDate}T00:00:00Z`).getTime() - new Date(`${range.startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
}, 0);
const dayTypeLabel = (type?: LeaveDateRange['dayType']) => type ? ({ WHOLE_DAY: 'Whole Day', AM_HALF_DAY: 'AM Half-Day', PM_HALF_DAY: 'PM Half-Day' }[type]) : 'Legacy Date Range';
const formatDays = (days: number) => `${days} day${days === 1 ? '' : 's'}`;
const rangeDays = (range: LeaveDateRange) => range.leaveDayUnits !== undefined ? range.leaveDayUnits / 2 : range.dayType && range.dayType !== 'WHOLE_DAY' ? 0.5 : Math.floor((new Date(`${range.endDate}T00:00:00Z`).getTime() - new Date(`${range.startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
const compactDates = (record: LeaveApplicationRecord) => {
  if (!record.dateRanges?.length) return `${record.startDate} to ${record.endDate}`;
  const ranges=[...record.dateRanges].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const first=ranges[0].startDate===ranges[0].endDate?ranges[0].startDate:`${ranges[0].startDate} to ${ranges[0].endDate}`;
  return ranges.length===1?first:`${first} + ${ranges.length-1} more range${ranges.length===2?'':'s'}`;
};

export const LeaveContinuity: React.FC = () => {
  const { users, auditLogs, currentUser, fileLeaveApplication, updateLeaveApplication, completeLeaveComputation, sendLeaveForSignature, releaseLeaveApplication, placeLeaveOnHold, recordLeaveCompliance, resumeLeaveProcessing, cancelLeaveApplication, can } = useApp();
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
  const [workflowAction, setWorkflowAction] = useState<'compute'|'signature'|'release'|'hold'|'compliance'|'resume'|'cancel'|null>(null);
  const [actionRemarks, setActionRemarks] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [office, setOffice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('Vacation Leave');
  const [leaveSubtype, setLeaveSubtype] = useState('');
  const [leaveDetails, setLeaveDetails] = useState('');
  const [dateRanges, setDateRanges] = useState<DateRangeDraft[]>([emptyDateRange()]);
  const [commutation, setCommutation] = useState<'Requested' | 'Not Requested'>('Not Requested');
  const [remarks, setRemarks] = useState('');

  const canViewLeave = currentUser.role === 'admin' || currentUser.sidebarModules === undefined || currentUser.sidebarModules.includes('leave');
  const loadRegistry=useCallback(async()=>{ setIsQuerying(true); setQueryError(''); try { const result=await queryLeaveRegistry({q:searchQuery,status:filterStatus==='all'?'':filterStatus,leaveType:filterType==='all'?'':filterType,office:filterOffice,filedFrom,filedTo,leaveDate,page,pageSize,sort}); setRecords(result.items); setSummary(result.summary); setPagination(result.pagination); setOffices(result.offices); if(result.pagination.page!==page)setPage(result.pagination.page); } catch(error){setQueryError(error instanceof Error?error.message:'Leave records could not be loaded.');} finally {setIsQuerying(false);}},[filedFrom,filedTo,filterOffice,filterStatus,filterType,leaveDate,page,pageSize,searchQuery,sort]);
  useEffect(()=>{if(!canViewLeave)return;const timer=setTimeout(()=>void loadRegistry(),300);return()=>clearTimeout(timer);},[canViewLeave,loadRegistry]);
  const matchingEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return users.slice(0, 8);
    return users.filter(user => [user.name, user.office, user.division, user.position].some(value => value.toLowerCase().includes(query))).slice(0, 8);
  }, [employeeSearch, users]);
  const selectedEmployee = users.find(user => user.id === employeeId);
  const canRegister = can('canIntake') && canViewLeave;
  const runWorkflowAction = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedRecord || !workflowAction) return;
    const calls = {
      compute: () => completeLeaveComputation(selectedRecord.id,{remarks:actionRemarks}), signature: () => sendLeaveForSignature(selectedRecord.id,{remarks:actionRemarks}),
      release: () => releaseLeaveApplication(selectedRecord.id,{remarks:actionRemarks}), hold: () => placeLeaveOnHold(selectedRecord.id,{reason:actionRemarks}),
      compliance: () => recordLeaveCompliance(selectedRecord.id,{remarks:actionRemarks}), resume: () => resumeLeaveProcessing(selectedRecord.id,{}),
      cancel: () => cancelLeaveApplication(selectedRecord.id,{reason:actionRemarks}),
    };
    const saved = await calls[workflowAction]() as LeaveApplicationRecord | null;
    if (saved) { setSelectedRecord(saved); setWorkflowAction(null); setActionRemarks(''); await loadRegistry(); }
  };

  const resetForm = () => {
    setEmployeeSearch(''); setEmployeeId(''); setOffice(''); setBarcode('');
    setLeaveType('Vacation Leave'); setLeaveSubtype(''); setLeaveDetails(''); setDateRanges([emptyDateRange()]);
    setCommutation('Not Requested'); setRemarks(''); setEditingRecord(null);
  };
  const selectEmployee = (id: string) => {
    const employee = users.find(user => user.id === id);
    if (!employee) return;
    setEmployeeId(employee.id); setEmployeeSearch(employee.name); setOffice(employee.office || employee.division);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeId || !office.trim() || !barcode.trim() || dateRanges.some(range => !range.startDate || !range.endDate)) return;
    const payload = {
      ...(editingRecord ? { id: editingRecord.id } : {}),
      employeeId, office: office.trim(), barcode: barcode.trim(), leaveType,
      leaveSubtype: leaveSubtype || null, leaveDetails: leaveDetails.trim() || null, dateRanges,
      calculatedLeaveDays: calculatedDays(dateRanges), commutation, remarks: remarks.trim(),
    };
    const saved = editingRecord ? await updateLeaveApplication(payload) : await fileLeaveApplication(payload);
    if (!saved) return;
    setIsModalOpen(false); resetForm(); setPage(1); await loadRegistry();
  };
  const openEdit = (record: LeaveApplicationRecord) => {
    setEditingRecord(record); setEmployeeId(record.employeeId); setEmployeeSearch(record.employeeName);
    setOffice(record.office || record.department || ''); setBarcode(record.barcode || record.trackingNumber || '');
    setLeaveType(record.leaveType); setLeaveSubtype(record.leaveSubtype || ''); setLeaveDetails(record.leaveDetails || '');
    setDateRanges(rangesForRecord(record)); setCommutation(record.commutation); setRemarks(record.remarks || ''); setIsModalOpen(true);
  };
  const changeRange = (index: number, field: keyof DateRangeDraft, value: string) => setDateRanges(previous => previous.map((range,i) => i===index ? { ...range, [field]: value, ...(field==='dayType' && value!=='WHOLE_DAY' ? { endDate: range.startDate } : {}), ...(field==='startDate' && range.dayType!=='WHOLE_DAY' ? { endDate: value } : {}) } as DateRangeDraft : range));

  const summaries = [
    ['Total Leave Records', summary.total, 'text-slate-900'], ['For Computation', summary.forComputation, 'text-amber-700'], ['Processing', summary.processing, 'text-blue-700'], ['For Signature', summary.forSignature, 'text-violet-700'], ['On Hold', summary.onHold, 'text-orange-700'], ['Released', summary.released, 'text-emerald-700'],
  ];

  return <div className="space-y-5 pb-12">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Leave Management</h1>
          <p className="mt-1 text-sm text-slate-500">Register and manage official employee Leave Applications processed by HRMDO.</p>
        </div>
        {canRegister && <button id="btn-file-new-leave" onClick={() => { resetForm(); setIsModalOpen(true); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Register Leave Application
        </button>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 lg:grid-cols-6">
        {summaries.map(([label, count, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{count}</p>
        </div>)}
      </div>
    </section>

    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input id="leave-search-input" value={searchQuery} onChange={event => {setSearchQuery(event.target.value);setPage(1);}} placeholder="Search employee, barcode, office, leave type, status..." className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </div>
      <select id="leave-filter-type" value={filterType} onChange={event => {setFilterType(event.target.value);setPage(1);}} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100">
        <option value="all">All Leave Types</option>
        {LEAVE_TYPES.map(type => <option key={type}>{type}</option>)}
      </select>
      <select id="leave-filter-status" value={filterStatus} onChange={event => {setFilterStatus(event.target.value);setPage(1);}} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"><option value="all">All Statuses</option><option value="For_Computation">For Computation</option><option value="For_Processing">Processing</option><option value="For_Signature">For Signature</option><option value="On_Hold">On Hold</option><option value="Released">Released</option><option value="Cancelled">Cancelled</option></select>
      <select aria-label="Office" value={filterOffice} onChange={e=>{setFilterOffice(e.target.value);setPage(1);}} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">All Offices</option>{offices.map(value=><option key={value}>{value}</option>)}</select>
      <input aria-label="Filed From" title="Filed From" type="date" value={filedFrom} onChange={e=>{setFiledFrom(e.target.value);setPage(1);}} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"/><input aria-label="Filed To" title="Filed To" type="date" value={filedTo} onChange={e=>{setFiledTo(e.target.value);setPage(1);}} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"/>
      <input aria-label="Leave Date" title="Leave Date" type="date" value={leaveDate} onChange={e=>{setLeaveDate(e.target.value);setPage(1);}} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"/>
      <select aria-label="Sort Leave Records" value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="registered_desc">Newest Registered</option><option value="registered_asc">Oldest Registered</option><option value="employee_asc">Employee A–Z</option><option value="employee_desc">Employee Z–A</option><option value="status_asc">Status</option><option value="type_asc">Leave Type</option></select>
      <button onClick={()=>{setSearchQuery('');setFilterType('all');setFilterStatus('all');setFilterOffice('');setFiledFrom('');setFiledTo('');setLeaveDate('');setSort('registered_desc');setPage(1);}} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Clear Filters</button>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Barcode / Tracking No.</th><th className="px-4 py-3">Employee / Applicant</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Leave Type</th><th className="px-4 py-3">Inclusive Dates</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map(record => <tr key={record.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{record.barcode || record.trackingNumber || 'Not recorded'}</td>
              <td className="px-4 py-3"><p className="font-semibold text-slate-900">{record.employeeName}</p><p className="text-[11px] text-slate-500">{record.position || 'Position not recorded'}</p></td>
              <td className="px-4 py-3 text-xs text-slate-600">{record.office || record.department || 'Not recorded'}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{record.leaveType}</td>
              <td className="px-4 py-3 text-xs text-slate-700">{compactDates(record)}<p className="text-[10px] text-slate-400">{formatDays(record.totalLeaveDays ?? record.workingDaysNumber)}</p></td>
              <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyle(record.status)}`}>{statusLabel(record.status)}</span></td>
              <td className="px-4 py-3 text-right"><div className="inline-flex items-center gap-1"><button aria-label="View" onClick={() => setSelectedRecord(record)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Eye className="h-3.5 w-3.5" /> View & Process</button>{canRegister && record.status === 'For_Computation' && !!record.dateRanges?.length && <button aria-label={`Edit ${record.barcode || record.trackingNumber}`} onClick={() => openEdit(record)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"><Pencil className="h-3.5 w-3.5" /></button>}</div></td>
            </tr>)}
            {!isQuerying && records.length === 0 && <tr><td colSpan={7} className="px-6 py-14 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-700">No Leave Applications found</p><p className="mt-1 text-xs text-slate-400">{searchQuery||filterType!=='all'||filterStatus!=='all'||filterOffice||filedFrom||filedTo||leaveDate?'No Leave Applications match the current search/filters.':'Registered V2 Leave Applications will appear here.'}</p></td></tr>}
            {isQuerying&&<tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-blue-600">Loading Leave Applications…</td></tr>}
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
          <div className="relative"><label className="mb-1 block font-semibold text-slate-700">Employee / Applicant *</label>
            <input required value={employeeSearch} onChange={event => { setEmployeeSearch(event.target.value); setEmployeeId(''); setOffice(''); }} placeholder="Search employee name, office, or position..." className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            {!employeeId && employeeSearch.trim() && <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
              {matchingEmployees.map(employee => <button type="button" key={employee.id} onClick={() => selectEmployee(employee.id)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-blue-50"><strong className="block text-slate-800">{employee.name}</strong><span className="text-[11px] text-slate-500">{employee.position} · {employee.office}</span></button>)}
              {matchingEmployees.length === 0 && <p className="px-3 py-3 text-slate-500">No personnel directory match.</p>}
            </div>}
            {selectedEmployee && <p className="mt-1 text-[11px] text-emerald-700">Selected: {selectedEmployee.name} · {selectedEmployee.position}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-semibold text-slate-700">Office *<input required value={office} onChange={event => setOffice(event.target.value)} placeholder="Applicant office" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
            <label className="font-semibold text-slate-700">Barcode / Tracking No. *<input required value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Enter or scan barcode..." className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
          </div>
          <label className="block font-semibold text-slate-700">Leave Type *<select id="select-filing-leave-type" value={leaveType} onChange={event => { setLeaveType(event.target.value as LeaveType); setLeaveSubtype(''); setLeaveDetails(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100">{LEAVE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          {(detailLabels(leaveType)[0] || detailLabels(leaveType)[1]) && <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">{leaveType} Details</p>
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
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-800">Leave Dates</h3><p className="text-[10px] text-slate-500">Add each continuous whole-day range or individual half-day.</p></div><button id="btn-add-leave-range" type="button" onClick={() => setDateRanges(previous => [...previous, emptyDateRange()])} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" /> Add Date Range</button></div>
            <div className="mt-3 space-y-3">{dateRanges.map((range,index) => <div key={range.id || index} data-testid={`leave-date-range-${index}`} className="rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between"><span className="font-bold text-slate-600">Date Range {index+1}</span>{dateRanges.length>1 && <button aria-label={`Remove date range ${index+1}`} type="button" onClick={() => setDateRanges(previous => previous.filter((_,i)=>i!==index))} className="rounded-md p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>}</div><div className="grid gap-3 sm:grid-cols-3">
              <label className="font-semibold text-slate-700">Start Date *<input required type="date" value={range.startDate} onChange={event => changeRange(index,'startDate',event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
              <label className="font-semibold text-slate-700">End Date *<input required type="date" min={range.startDate || undefined} value={range.endDate} onChange={event => changeRange(index,'endDate',event.target.value)} disabled={range.dayType!=='WHOLE_DAY'} className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" /></label>
              <label className="font-semibold text-slate-700">Duration Type *<select value={range.dayType} onChange={event => changeRange(index,'dayType',event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal outline-none focus:ring-2 focus:ring-blue-100"><option value="WHOLE_DAY">Whole Day</option><option value="AM_HALF_DAY">AM Half-Day</option><option value="PM_HALF_DAY">PM Half-Day</option></select></label>
            </div></div>)}</div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2"><span className="font-semibold text-blue-800">Calculated Leave Days</span><strong id="calculated-leave-days" className="text-base text-blue-900">{formatDays(calculatedDays(dateRanges))}</strong></div>
          </section>
          <label className="block font-semibold text-slate-700">Commutation<select value={commutation} onChange={event => setCommutation(event.target.value as typeof commutation)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100"><option>Not Requested</option><option>Requested</option></select></label>
          <label className="block font-semibold text-slate-700">Remarks / Additional Details<textarea value={remarks} onChange={event => setRemarks(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">The new record will enter the Leave Registry with a <strong>For Computation</strong> status. Encoder: {currentUser.name}.</p>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button id="btn-submit-filing" type="submit" disabled={!employeeId} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{editingRecord ? 'Save Changes' : 'Register Leave Application'}</button></footer>
        </form>
      </div>
    </div>}

    {selectedRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="font-mono text-xs font-bold text-blue-700">{selectedRecord.barcode || selectedRecord.trackingNumber || 'No barcode recorded'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{selectedRecord.employeeName}</h2></div><button onClick={() => setSelectedRecord(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
      <div className="grid grid-cols-2 gap-4 p-5 text-xs"><div><p className="text-slate-400">Office</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.office || selectedRecord.department}</p></div><div><p className="text-slate-400">Leave Type</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.leaveType}</p></div>{selectedRecord.leaveSubtype && <div><p className="text-slate-400">{detailLabels(selectedRecord.leaveType)[0] || 'Type Details'}</p><p className="mt-1 font-semibold text-slate-800">{subtypeLabels[selectedRecord.leaveSubtype] || selectedRecord.leaveSubtype}</p></div>}{selectedRecord.leaveDetails && <div><p className="text-slate-400">{detailLabels(selectedRecord.leaveType)[1] || 'Additional Details'}</p><p className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{selectedRecord.leaveDetails}</p></div>}<div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="mb-2 font-bold uppercase tracking-wide text-slate-500">Leave Dates</p>{selectedRecord.dateRanges?.length ? <div className="space-y-2">{[...selectedRecord.dateRanges].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map((range,index)=><div key={range.id || index} className="flex items-center justify-between rounded-lg bg-white px-3 py-2"><div><p className="font-semibold text-slate-800">{range.startDate}{range.endDate!==range.startDate?` to ${range.endDate}`:''}</p><p className="text-[10px] text-slate-500">{dayTypeLabel(range.dayType)}</p></div><strong className="text-slate-700">{formatDays(rangeDays(range))}</strong></div>)}</div> : <div className="rounded-lg bg-white px-3 py-2"><p className="font-semibold text-slate-800">{selectedRecord.startDate} to {selectedRecord.endDate}</p><p className="text-[10px] text-slate-500">Legacy Date Range · preserved total</p></div>}<div className="mt-3 flex justify-between border-t border-slate-200 pt-2"><strong className="text-slate-600">Total Leave Days</strong><strong className="text-blue-700">{formatDays(selectedRecord.totalLeaveDays ?? selectedRecord.workingDaysNumber)}</strong></div></div><div><p className="text-slate-400">Status</p><p className="mt-1 font-semibold text-slate-800">{statusLabel(selectedRecord.status)}</p></div><div><p className="text-slate-400">Encoded By</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.createdByName || 'Not recorded in legacy V2 record'}</p></div><div><p className="text-slate-400">Registered</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.createdAt || selectedRecord.filingDate}</p></div>{selectedRecord.remarks && <div className="col-span-2"><p className="text-slate-400">Remarks / Additional Details</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{selectedRecord.remarks}</p></div>}{selectedRecord.computationRemarks && <div className="col-span-2"><p className="text-slate-400">Computation Remarks</p><p className="mt-1 whitespace-pre-wrap">{selectedRecord.computationRemarks}</p></div>}{selectedRecord.status==='On_Hold' && <div className="col-span-2 rounded-lg border border-orange-200 bg-orange-50 p-3"><strong>Held from {statusLabel(selectedRecord.heldFromStatus!)}</strong><p>{selectedRecord.holdReason}</p>{selectedRecord.complianceReceivedAt&&<p className="mt-2 text-emerald-700">Compliance received: {selectedRecord.complianceRemarks}</p>}</div>}{selectedRecord.releasedAt&&<div className="col-span-2"><p className="text-slate-400">Released</p><p className="font-semibold">{selectedRecord.releasedByName} · {selectedRecord.releasedAt}</p><p>{selectedRecord.releaseRemarks}</p></div>}{selectedRecord.cancelledAt&&<div className="col-span-2"><p className="text-slate-400">Cancelled</p><p className="font-semibold">{selectedRecord.cancelledByName} · {selectedRecord.cancelledAt}</p><p>{selectedRecord.cancellationReason}</p></div>}
        {!selectedRecord.isLegacyV1 && !['Released','Approved','Disapproved','Cancelled','Pending'].includes(selectedRecord.status) && <section className="col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="font-bold uppercase tracking-wide text-blue-900">Available Actions</p><div className="mt-2 flex flex-wrap gap-2">{selectedRecord.status==='For_Computation'&&(can('canProcess')||can('canSupervise'))&&<button id="btn-complete-leave-computation" onClick={()=>setWorkflowAction('compute')} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white">Complete Computation</button>}{selectedRecord.status==='For_Processing'&&(can('canProcess')||can('canSupervise'))&&<button id="btn-send-leave-signature" onClick={()=>setWorkflowAction('signature')} className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white">Send for Signature</button>}{selectedRecord.status==='For_Signature'&&(can('canRelease')||can('canSupervise'))&&<button id="btn-release-leave" onClick={()=>setWorkflowAction('release')} className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white">Release</button>}{['For_Computation','For_Processing','For_Signature'].includes(selectedRecord.status)&&((['For_Computation','For_Processing'].includes(selectedRecord.status)&&can('canProcess'))||(selectedRecord.status==='For_Signature'&&can('canApprove'))||can('canSupervise'))&&<button id="btn-hold-leave" onClick={()=>setWorkflowAction('hold')} className="rounded-lg border border-orange-300 bg-white px-3 py-2 font-semibold text-orange-700">Place On Hold</button>}{selectedRecord.status==='On_Hold'&&((['For_Computation','For_Processing'].includes(selectedRecord.heldFromStatus||'')&&can('canProcess'))||(selectedRecord.heldFromStatus==='For_Signature'&&can('canApprove'))||can('canSupervise'))&&(!selectedRecord.complianceReceivedAt?<button id="btn-record-leave-compliance" onClick={()=>setWorkflowAction('compliance')} className="rounded-lg bg-orange-600 px-3 py-2 font-semibold text-white">Record Compliance Received</button>:<button id="btn-resume-leave" onClick={()=>setWorkflowAction('resume')} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white">Resume Processing</button>)}{can('canSupervise')&&<button id="btn-cancel-leave" onClick={()=>setWorkflowAction('cancel')} className="rounded-lg border border-rose-300 bg-white px-3 py-2 font-semibold text-rose-700">Cancel Record</button>}</div></section>}
        <section className="col-span-2 rounded-xl border border-slate-200 p-3"><p className="font-bold uppercase tracking-wide text-slate-500">Processing History</p><div className="mt-2 max-h-44 space-y-2 overflow-y-auto">{auditLogs.filter(event=>event.documentId===selectedRecord.id).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).map(event=><div key={event.id} className="border-l-2 border-blue-200 pl-3"><p className="font-semibold">{event.summary}</p><p className="text-[10px] text-slate-500">{event.timestamp} · {event.actorName}</p>{event.details&&<p className="text-slate-600">{event.details}</p>}</div>)}</div></section>
      </div>
      {workflowAction&&<div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/55 p-4"><form onSubmit={runWorkflowAction} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><h3 className="font-bold">{{compute:'Complete Computation',signature:'Send for Signature',release:'Release Leave Application',hold:'Place On Hold',compliance:'Record Compliance Received',resume:'Resume Processing',cancel:'Cancel Leave Application'}[workflowAction]}</h3>{workflowAction!=='resume'&&<label className="mt-4 block font-semibold text-slate-700">{workflowAction==='hold'||workflowAction==='cancel'?'Reason *':workflowAction==='compliance'?'Compliance Remarks *':'Remarks (optional)'}<textarea autoFocus required={['hold','compliance','cancel'].includes(workflowAction)} value={actionRemarks} onChange={event=>setActionRemarks(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal"/></label>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>{setWorkflowAction(null);setActionRemarks('');}} className="rounded-lg px-3 py-2 font-semibold text-slate-600">Back</button><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Confirm Action</button></div></form></div>}
    </div></div>}
  </div>;
};
