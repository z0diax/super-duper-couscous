import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { LeaveApplicationRecord, LeaveType } from '../types';
import { CalendarClock, Eye, FileCheck2, Plus, Search, X } from 'lucide-react';

const LEAVE_TYPES: LeaveType[] = [
  'COC', 'Vacation Leave', 'Mandatory / Forced Leave', 'Sick Leave', 'Wellness Leave',
  'Maternity Leave', 'Paternity Leave', 'Special Privilege Leave', 'Solo Parent Leave',
  'Study Leave', '10-Day VAWC Leave', 'Rehabilitation Privilege',
  'Special Leave Benefits for Women', 'Special Emergency / Calamity Leave',
  'Adoption Leave', 'Others', 'Terminal Leave',
];

const statusLabel = (status: LeaveApplicationRecord['status']) => ({
  For_Computation: 'For Computation',
  For_Signature: 'For Signature',
  Released: 'Released',
  Pending: 'Pending (Legacy V2)',
  Approved: 'Approved (Legacy V2)',
  Disapproved: 'Disapproved (Legacy V2)',
  Cancelled: 'Cancelled',
}[status]);

const statusStyle = (status: LeaveApplicationRecord['status']) => {
  if (status === 'Released' || status === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'For_Signature') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (status === 'Cancelled' || status === 'Disapproved') return 'border-rose-200 bg-rose-50 text-rose-700';
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

export const LeaveContinuity: React.FC = () => {
  const { leaveApplications, users, currentUser, fileLeaveApplication, can } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<LeaveApplicationRecord | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [office, setOffice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('Vacation Leave');
  const [leaveSubtype, setLeaveSubtype] = useState('');
  const [leaveDetails, setLeaveDetails] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [workingDays, setWorkingDays] = useState(1);
  const [commutation, setCommutation] = useState<'Requested' | 'Not Requested'>('Not Requested');
  const [remarks, setRemarks] = useState('');

  const activeRecords = useMemo(() => leaveApplications.filter(record => !record.isLegacyV1), [leaveApplications]);
  const filteredRecords = useMemo(() => activeRecords.filter(record => {
    if (filterType !== 'all' && record.leaveType !== filterType) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [record.barcode, record.trackingNumber, record.employeeName, record.office, record.department, record.leaveType]
      .some(value => value?.toLowerCase().includes(query));
  }), [activeRecords, filterType, searchQuery]);
  const matchingEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return users.slice(0, 8);
    return users.filter(user => [user.name, user.office, user.division, user.position].some(value => value.toLowerCase().includes(query))).slice(0, 8);
  }, [employeeSearch, users]);
  const selectedEmployee = users.find(user => user.id === employeeId);
  const canRegister = can('canIntake') && (currentUser.role === 'admin' || currentUser.sidebarModules === undefined || currentUser.sidebarModules.includes('leave'));

  const resetForm = () => {
    setEmployeeSearch(''); setEmployeeId(''); setOffice(''); setBarcode('');
    setLeaveType('Vacation Leave'); setLeaveSubtype(''); setLeaveDetails(''); setStartDate(''); setEndDate('');
    setWorkingDays(1); setCommutation('Not Requested'); setRemarks('');
  };
  const selectEmployee = (id: string) => {
    const employee = users.find(user => user.id === id);
    if (!employee) return;
    setEmployeeId(employee.id); setEmployeeSearch(employee.name); setOffice(employee.office || employee.division);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeId || !office.trim() || !barcode.trim() || !startDate || !endDate) return;
    const saved = await fileLeaveApplication({
      employeeId, office: office.trim(), barcode: barcode.trim(), leaveType,
      leaveSubtype: leaveSubtype || null, leaveDetails: leaveDetails.trim() || null, startDate, endDate,
      workingDaysNumber: Number(workingDays), commutation, remarks: remarks.trim(),
    });
    if (!saved) return;
    setIsModalOpen(false); resetForm();
  };

  const summaries = [
    ['Total Leave Records', activeRecords.length, 'text-slate-900'],
    ['For Computation', activeRecords.filter(record => record.status === 'For_Computation').length, 'text-amber-700'],
    ['For Signature', activeRecords.filter(record => record.status === 'For_Signature').length, 'text-violet-700'],
    ['Released', activeRecords.filter(record => record.status === 'Released').length, 'text-emerald-700'],
  ];

  return <div className="space-y-5 pb-12">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Leave Management</h1>
          <p className="mt-1 text-sm text-slate-500">Register and manage official employee Leave Applications processed by HRMDO.</p>
        </div>
        {canRegister && <button id="btn-file-new-leave" onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Register Leave Application
        </button>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 lg:grid-cols-4">
        {summaries.map(([label, count, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{count}</p>
        </div>)}
      </div>
    </section>

    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input id="leave-search-input" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search employee name, barcode, office, leave type..." className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </div>
      <select id="leave-filter-type" value={filterType} onChange={event => setFilterType(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100">
        <option value="all">All Leave Types</option>
        {LEAVE_TYPES.map(type => <option key={type}>{type}</option>)}
      </select>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Barcode / Tracking No.</th><th className="px-4 py-3">Employee / Applicant</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Leave Type</th><th className="px-4 py-3">Inclusive Dates</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRecords.map(record => <tr key={record.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{record.barcode || record.trackingNumber || 'Not recorded'}</td>
              <td className="px-4 py-3"><p className="font-semibold text-slate-900">{record.employeeName}</p><p className="text-[11px] text-slate-500">{record.position || 'Position not recorded'}</p></td>
              <td className="px-4 py-3 text-xs text-slate-600">{record.office || record.department || 'Not recorded'}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{record.leaveType}</td>
              <td className="px-4 py-3 text-xs text-slate-700">{record.startDate} to {record.endDate}<p className="text-[10px] text-slate-400">{record.workingDaysNumber} working day{record.workingDaysNumber === 1 ? '' : 's'}</p></td>
              <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyle(record.status)}`}>{statusLabel(record.status)}</span></td>
              <td className="px-4 py-3 text-right"><button onClick={() => setSelectedRecord(record)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Eye className="h-3.5 w-3.5" /> View</button></td>
            </tr>)}
            {filteredRecords.length === 0 && <tr><td colSpan={7} className="px-6 py-14 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-700">No Leave Applications found</p><p className="mt-1 text-xs text-slate-400">Registered V2 Leave Applications will appear here.</p></td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3"><span className="rounded-lg bg-blue-600 p-2"><CalendarClock className="h-5 w-5" /></span><div><h2 className="font-bold">Register Leave Application</h2><p className="text-xs text-slate-300">Register an official employee application for HRMDO processing.</p></div></div>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-semibold text-slate-700">Start Date *<input id="input-filing-start-date" required type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
            <label className="font-semibold text-slate-700">End Date *<input id="input-filing-end-date" required type="date" min={startDate || undefined} value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-semibold text-slate-700">Working Days<input id="input-filing-working-days" required min={0.5} max={366} step={0.5} type="number" value={workingDays} onChange={event => setWorkingDays(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /><span className="mt-1 block text-[10px] font-normal text-slate-400">Compatibility field; automatic calculation will follow in Fix #3.</span></label>
            <label className="font-semibold text-slate-700">Commutation<select value={commutation} onChange={event => setCommutation(event.target.value as typeof commutation)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100"><option>Not Requested</option><option>Requested</option></select></label>
          </div>
          <label className="block font-semibold text-slate-700">Remarks / Additional Details<textarea value={remarks} onChange={event => setRemarks(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-slate-300 p-2.5 font-normal outline-none focus:ring-2 focus:ring-blue-100" /></label>
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">The new record will enter the Leave Registry with a <strong>For Computation</strong> status. Encoder: {currentUser.name}.</p>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button id="btn-submit-filing" type="submit" disabled={!employeeId} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Register Leave Application</button></footer>
        </form>
      </div>
    </div>}

    {selectedRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="font-mono text-xs font-bold text-blue-700">{selectedRecord.barcode || selectedRecord.trackingNumber || 'No barcode recorded'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{selectedRecord.employeeName}</h2></div><button onClick={() => setSelectedRecord(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
      <div className="grid grid-cols-2 gap-4 p-5 text-xs"><div><p className="text-slate-400">Office</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.office || selectedRecord.department}</p></div><div><p className="text-slate-400">Leave Type</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.leaveType}</p></div>{selectedRecord.leaveSubtype && <div><p className="text-slate-400">{detailLabels(selectedRecord.leaveType)[0] || 'Type Details'}</p><p className="mt-1 font-semibold text-slate-800">{subtypeLabels[selectedRecord.leaveSubtype] || selectedRecord.leaveSubtype}</p></div>}{selectedRecord.leaveDetails && <div><p className="text-slate-400">{detailLabels(selectedRecord.leaveType)[1] || 'Additional Details'}</p><p className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{selectedRecord.leaveDetails}</p></div>}<div><p className="text-slate-400">Inclusive Dates</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.startDate} to {selectedRecord.endDate}</p></div><div><p className="text-slate-400">Status</p><p className="mt-1 font-semibold text-slate-800">{statusLabel(selectedRecord.status)}</p></div><div><p className="text-slate-400">Encoded By</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.createdByName || 'Not recorded in legacy V2 record'}</p></div><div><p className="text-slate-400">Registered</p><p className="mt-1 font-semibold text-slate-800">{selectedRecord.createdAt || selectedRecord.filingDate}</p></div>{selectedRecord.remarks && <div className="col-span-2"><p className="text-slate-400">Remarks / Additional Details</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{selectedRecord.remarks}</p></div>}</div>
    </div></div>}
  </div>;
};
