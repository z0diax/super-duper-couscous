import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LeaveApplicationRecord } from '../types';
import { 
  CalendarClock, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  X, 
  Database, 
  ShieldCheck, 
  Calendar,
  AlertCircle
} from 'lucide-react';

export const LeaveContinuity: React.FC = () => {
  const { 
    leaveApplications, 
    currentUser, 
    fileLeaveApplication, 
    approveLeaveApplication, can
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDataset, setFilterDataset] = useState<'all' | 'v2' | 'v1'>('all');
  const [isFilingModalOpen, setIsFilingModalOpen] = useState(false);

  // Filing form state
  const [leaveType, setLeaveType] = useState<any>('Vacation Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [workingDays, setWorkingDays] = useState(3);
  const [commutation, setCommutation] = useState<'Requested' | 'Not Requested'>('Not Requested');
  const [leaveRemarks, setLeaveRemarks] = useState('');

  const filteredLeaves = leaveApplications.filter(lev => {
    if (filterDataset === 'v2' && lev.isLegacyV1) return false;
    if (filterDataset === 'v1' && !lev.isLegacyV1) return false;
    if (filterType !== 'all' && lev.leaveType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        lev.employeeName.toLowerCase().includes(q) ||
        lev.department.toLowerCase().includes(q) ||
        lev.leaveType.toLowerCase().includes(q) ||
        (lev.legacyId && lev.legacyId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleFilingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    if (!(await fileLeaveApplication({
      leaveType,
      startDate,
      endDate,
      workingDaysNumber: Number(workingDays),
      commutation,
      remarks: leaveRemarks,
    }))) return;

    setIsFilingModalOpen(false);
    setLeaveRemarks('');
  };

  const isSupervisorOrApprover = can('canApprove') || can('canSupervise');

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Ledger Overview */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Leave Continuity & Employee Ledgers
              </h1>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                Continuous V1 &rarr; V2
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Unified leave credits, historical leave records preservation (Appendix B), and paperless V2 leave routing.
            </p>
          </div>

          <button
            id="btn-file-new-leave"
            onClick={() => setIsFilingModalOpen(true)}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>File New Leave</span>
          </button>
        </div>

        {/* Balance Credit Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
            <span className="text-[11px] font-semibold text-blue-900">Vacation Leave Balance</span>
            <div className="text-xl font-bold text-blue-950 mt-1">24.50 <span className="text-xs font-normal text-blue-700">days</span></div>
            <span className="text-[10px] text-blue-600">Preserved from V1 Service Record</span>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <span className="text-[11px] font-semibold text-emerald-900">Sick Leave Balance</span>
            <div className="text-xl font-bold text-emerald-950 mt-1">18.00 <span className="text-xs font-normal text-emerald-700">days</span></div>
            <span className="text-[10px] text-emerald-600">Cumulative Earned</span>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <span className="text-[11px] font-semibold text-amber-900">Special Privilege Leave</span>
            <div className="text-xl font-bold text-amber-950 mt-1">3.00 <span className="text-xs font-normal text-amber-700">days</span></div>
            <span className="text-[10px] text-amber-600">Calendar Year 2026</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-700">Mandatory Forced Leave</span>
            <div className="text-xl font-bold text-slate-900 mt-1">5.00 <span className="text-xs font-normal text-slate-500">days</span></div>
            <span className="text-[10px] text-slate-500">Must be scheduled before Dec 31</span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="leave-search-input"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by employee name, office, leave type, or V1 ID..."
            className="w-full text-xs sm:text-sm pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            id="leave-filter-dataset"
            value={filterDataset}
            onChange={e => setFilterDataset(e.target.value as any)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Datasets (V1 + V2)</option>
            <option value="v2">V2 Active Filings</option>
            <option value="v1">V1 Migrated Ledgers</option>
          </select>

          <select
            id="leave-filter-type"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Leave Types</option>
            <option value="Vacation Leave">Vacation Leave</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Maternity Leave">Maternity Leave</option>
            <option value="Paternity Leave">Paternity Leave</option>
            <option value="Special Privilege Leave">Special Privilege</option>
            <option value="Mandatory / Forced Leave">Mandatory Forced Leave</option>
          </select>
        </div>
      </div>

      {/* Leave Applications Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Employee / Requestor</th>
                <th className="py-3 px-4">Leave Type</th>
                <th className="py-3 px-4">Inclusive Dates</th>
                <th className="py-3 px-4">Days</th>
                <th className="py-3 px-4">Dataset Source</th>
                <th className="py-3 px-4">Status & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeaves.map(lev => (
                <tr key={lev.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Employee */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">
                      {lev.employeeName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {lev.position} &bull; {lev.department}
                    </div>
                  </td>

                  {/* Leave Type */}
                  <td className="py-3 px-4 font-medium text-slate-800">
                    {lev.leaveType}
                    {lev.commutation === 'Requested' && (
                      <span className="block text-[10px] text-blue-600 font-normal">
                        Commutation Requested
                      </span>
                    )}
                  </td>

                  {/* Inclusive Dates */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-medium text-slate-800">
                      {lev.startDate} to {lev.endDate}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Filed on {lev.filingDate}
                    </div>
                  </td>

                  {/* Days */}
                  <td className="py-3 px-4 font-bold text-slate-800">
                    {lev.workingDaysNumber} days
                  </td>

                  {/* Dataset Source */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {lev.isLegacyV1 ? (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                        <Database className="w-3 h-3" />
                        <span>MIGRATED V1 ({lev.legacyId})</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        <span>V2 DIGITAL TRANSACTION</span>
                      </div>
                    )}
                  </td>

                  {/* Status & Actions */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        lev.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : lev.status === 'Pending'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}>
                        {lev.status.toUpperCase()}
                      </span>

                      {lev.status === 'Pending' && isSupervisorOrApprover && (
                        <button
                          id={`btn-approve-leave-${lev.id}`}
                          onClick={async () => await approveLeaveApplication(lev.id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                    {lev.approvedBy && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        By {lev.approvedBy}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filing Modal */}
      {isFilingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in-50">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  File Official Application for Leave (V2)
                </h3>
              </div>
              <button onClick={() => setIsFilingModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFilingSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Employee / Applicant
                </label>
                <input
                  type="text"
                  disabled
                  value={`${currentUser.name} (${currentUser.position} - ${currentUser.office})`}
                  className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Type of Leave *
                </label>
                <select
                  id="select-filing-leave-type"
                  value={leaveType}
                  onChange={e => setLeaveType(e.target.value as any)}
                  className="w-full p-2 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Vacation Leave">Vacation Leave (to seek rest & recreation)</option>
                  <option value="Sick Leave">Sick Leave (medical/illness)</option>
                  <option value="Maternity Leave">Maternity Leave (RA 11210)</option>
                  <option value="Paternity Leave">Paternity Leave</option>
                  <option value="Special Privilege Leave">Special Privilege Leave (SPL)</option>
                  <option value="Mandatory / Forced Leave">Mandatory / Forced Leave</option>
                  <option value="Terminal Leave">Terminal Leave (Separation/Retirement)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    id="input-filing-start-date"
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    End Date *
                  </label>
                  <input
                    id="input-filing-end-date"
                    type="date"
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Number of Working Days *
                  </label>
                  <input
                    id="input-filing-working-days"
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={workingDays}
                    onChange={e => setWorkingDays(Number(e.target.value))}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Commutation
                  </label>
                  <select
                    id="select-filing-commutation"
                    value={commutation}
                    onChange={e => setCommutation(e.target.value as any)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Not Requested">Not Requested</option>
                    <option value="Requested">Requested (Cash Monetization)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Specific Remarks / Location Details
                </label>
                <input
                  id="input-filing-remarks"
                  type="text"
                  value={leaveRemarks}
                  onChange={e => setLeaveRemarks(e.target.value)}
                  placeholder="e.g. Vacation spent within the country"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="p-2.5 bg-blue-50 text-blue-900 rounded-lg text-[11px]">
                Upon submission, application will be logged into your leave continuity ledger and forwarded to your Division Chief for recommendation.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFilingModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-filing"
                  className="px-4 py-1.5 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                >
                  Submit Leave Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
