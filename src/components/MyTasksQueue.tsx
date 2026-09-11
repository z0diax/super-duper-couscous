import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DocumentRecord, PayrollBatch } from '../types';
import { 
  Inbox, 
  Users, 
  RotateCcw, 
  Hourglass, 
  FileCheck2, 
  CheckCircle2, 
  Search, 
  Filter, 
  ArrowRight, 
  Clock, 
  AlertCircle,
  Tag,
  Layers
} from 'lucide-react';

export const MyTasksQueue: React.FC = () => {
  const { documents, currentUser, can, setSelectedDocument, claimTask, payrollBatches, payrollItems, workGroups, setActiveTab, openBatchModal, recordPayrollItemCompliance, recheckPayrollItem, completePayrollItemInitialCheckingAndRoute } = useApp();

  const [activeQueue, setActiveQueue] = useState<'my_tasks' | 'team_queue' | 'returned' | 'waiting' | 'ready_for_release' | 'completed'>('my_tasks');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [complianceRemarks, setComplianceRemarks] = useState<Record<string, string>>({});

  const isInitialCheckingAssignee = (batchId: string) => {
    const batch = payrollBatches.find(item => item.id === batchId);
    if (!batch) return false;
    const desk = batch.initialCheckingDesk || batch.assignedDesk;
    return can('canSupervise') || (desk.userId ? desk.userId === currentUser.id : desk.assignmentType === 'Role' ? desk.roleId === currentUser.role : desk.assignmentType === 'Team' && !!desk.team && [currentUser.division, currentUser.office].includes(desk.team));
  };
  const heldPayrollItems = payrollItems.filter(item => item.batchId !== 'SINGLE_ENTRY' && (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'initial_checking' && (['On_Hold', 'Ready_For_Recheck'].includes(item.status) || (item.status === 'Ready' && !!item.holdResolvedAt)) && isInitialCheckingAssignee(item.batchId));

  // Active payroll batches relevant to user desk
  const myPayrollBatches = payrollBatches.filter(b => {
    if (b.progress.derivedStatus === 'COMPLETED') return false;
    const hasInitialItems = payrollItems.some(item => item.batchId === b.id && (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'initial_checking');
    const initialDesk = b.initialCheckingDesk || b.assignedDesk;
    const assignedToInitialChecking = can('canSupervise') || (initialDesk.userId ? initialDesk.userId === currentUser.id : initialDesk.assignmentType === 'Role' ? initialDesk.roleId === currentUser.role : initialDesk.assignmentType === 'Team' && !!initialDesk.team && [currentUser.division, currentUser.office].includes(initialDesk.team));
    if (hasInitialItems && assignedToInitialChecking) return true;
    const myWorkGroup = workGroups.find(w => w.batchId === b.id && w.assignedProcessorId === currentUser.id && w.status === 'In_Progress');
    if (myWorkGroup || (currentUser.role === 'admin' && workGroups.some(w => w.batchId === b.id && w.status === 'In_Progress'))) return true;
    if (payrollItems.some(item => item.batchId === b.id && item.status === 'Ready_For_Release') && can('canRelease')) return true;
    return false;
  });

  // 1. My Tasks (assigned to user specifically or role)
  const myTasks = documents.filter(doc => {
    if (doc.isLegacyV1 || doc.status === 'Released' || doc.status === 'Archived') return false;
    const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
    if (!currentStep) return false;
    return currentStep.assignedTo.userId === currentUser.id || (!currentStep.assignedTo.userId && currentStep.assignedTo.role === currentUser.role);
  });

  // 2. Team Queue (assigned to user's division/team, can be claimed)
  const teamTasks = documents.filter(doc => {
    if (doc.isLegacyV1 || doc.status === 'Released' || doc.status === 'Archived') return false;
    const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
    if (!currentStep) return false;
    // If not already explicitly claimed by current user, but belongs to user's division/team or general queue
    const matchesTeam = (currentStep.assignedTo.type === 'Team' && !!currentStep.assignedTo.team && [currentUser.division, currentUser.office].includes(currentStep.assignedTo.team)) || currentStep.assignedTo.role === currentUser.role;
    return !currentStep.assignedTo.userId && matchesTeam;
  });

  // 3. Returned / Rework
  const returnedTasks = documents.filter(doc => !doc.isLegacyV1 && doc.status === 'Returned');

  // 4. Waiting / In-progress (tracked by user who participated in previous steps)
  const waitingTasks = documents.filter(doc => {
    if (doc.isLegacyV1 || doc.status === 'Released' || doc.status === 'Archived') return false;
    // Check if user was encoder or participated in earlier steps
    const isEncoder = doc.encodedBy.userId === currentUser.id;
    const participatedInStep = doc.workflowSteps.some(
      s => s.stepNumber < doc.currentStepNumber && s.completedBy?.userId === currentUser.id
    );
    return isEncoder || participatedInStep;
  });

  // 5. Ready for Release
  const readyForReleaseTasks = documents.filter(doc => !doc.isLegacyV1 && doc.status === 'Ready_For_Release');

  // 6. Completed / Released
  const completedTasks = documents.filter(doc => !doc.isLegacyV1 && doc.status === 'Released');

  // Select which set to show
  let currentList: DocumentRecord[] = [];
  switch (activeQueue) {
    case 'my_tasks':
      currentList = myTasks;
      break;
    case 'team_queue':
      currentList = teamTasks;
      break;
    case 'returned':
      currentList = returnedTasks;
      break;
    case 'waiting':
      currentList = waitingTasks;
      break;
    case 'ready_for_release':
      currentList = readyForReleaseTasks;
      break;
    case 'completed':
      currentList = completedTasks;
      break;
  }

  // Filter
  const filteredList = currentList.filter(doc => {
    if (filterPriority !== 'all' && doc.priority !== filterPriority) return false;
    if (filterClass !== 'all' && doc.classification !== filterClass) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        doc.trackingNumber.toLowerCase().includes(q) ||
        doc.title.toLowerCase().includes(q) ||
        doc.sourceOffice.toLowerCase().includes(q) ||
        doc.senderName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Payroll batches are operational tasks too. Keep them in My Tasks rather than
  // requiring the assigned desk to discover work through Payroll Management.
  const filteredPayrollTasks: PayrollBatch[] = activeQueue === 'my_tasks' ? myPayrollBatches.filter(batch => {
    if (filterClass !== 'all' && filterClass !== 'Payroll') return false;
    if (filterPriority !== 'all') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return batch.batchNumber.toLowerCase().includes(q) || batch.payrollType.toLowerCase().includes(q) || batch.office.toLowerCase().includes(q);
  }) : [];

  interface QueueTabItem {
    id: 'my_tasks' | 'team_queue' | 'returned' | 'waiting' | 'ready_for_release' | 'completed';
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    isAlert?: boolean;
  }

  const queueTabs: QueueTabItem[] = [
    { id: 'my_tasks', label: 'My Tasks', count: myTasks.length + myPayrollBatches.length, icon: Inbox },
    { id: 'team_queue', label: 'Team Queue', count: teamTasks.length, icon: Users },
    { id: 'returned', label: 'Returned / Rework', count: returnedTasks.length, icon: RotateCcw, isAlert: returnedTasks.length > 0 },
    { id: 'waiting', label: 'Waiting / Tracked', count: waitingTasks.length, icon: Hourglass },
    { id: 'ready_for_release', label: 'Ready for Release', count: readyForReleaseTasks.length, icon: FileCheck2 },
    { id: 'completed', label: 'Released / Concluded', count: completedTasks.length, icon: CheckCircle2 },
  ];

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Urgent':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Priority':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Returned':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Pending_Approval':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Ready_For_Release':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'Released':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Active Payroll Task Banner if assigned to user */}
      {myPayrollBatches.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-900">
                  Payroll Action Required
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-blue-200 text-blue-800">
                  {myPayrollBatches.length} {myPayrollBatches.length === 1 ? 'batch' : 'batches'}
                </span>
              </div>
              <p className="text-xs text-blue-700 mt-0.5">
                Your desk has active payroll batches in Initial Checking or Parallel Work Groups.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('payroll')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-2xs transition-colors shrink-0"
          >
            <span>Open Payroll Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {heldPayrollItems.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-bold text-amber-950">Held / For Compliance</h2><p className="text-xs text-amber-800">Resolve and recheck individual payroll items without reopening the batch.</p></div>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">{heldPayrollItems.length}</span>
          </div>
          <div className="space-y-2">
            {heldPayrollItems.map(item => {
              const batch = payrollBatches.find(record => record.id === item.batchId);
              const isHeld = item.status === 'On_Hold';
              const isReadyForRecheck = item.status === 'Ready_For_Recheck';
              return <div key={item.id} className="rounded-lg border border-amber-200 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono font-bold text-slate-900">{item.barcode}</p><p className="mt-0.5 text-slate-600">Batch: <strong>{batch?.batchNumber || item.batchNumber}</strong> &bull; {item.office || batch?.office}</p><p className="mt-1 text-amber-800">Initial Checking &bull; {isHeld ? `On hold: ${item.holdReason || item.exceptionReason}` : isReadyForRecheck ? 'Compliance received — ready for recheck' : 'Recheck completed — ready to route'}</p>{item.heldAt && <p className="mt-0.5 text-slate-400">Held since {new Date(item.heldAt).toLocaleString()}</p>}</div><span className={`rounded-full px-2 py-0.5 font-bold ${isHeld ? 'bg-red-100 text-red-800' : isReadyForRecheck ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>{isHeld ? 'ON HOLD' : isReadyForRecheck ? 'READY FOR RECHECK' : 'READY TO ROUTE'}</span></div>
                {isHeld ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={complianceRemarks[item.id] || ''} onChange={event => setComplianceRemarks(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Compliance remarks (optional)" className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5" /><button onClick={async () => { if (await recordPayrollItemCompliance(item.id, complianceRemarks[item.id] || '')) setComplianceRemarks(current => ({ ...current, [item.id]: '' })); }} className="rounded-md bg-sky-600 px-3 py-1.5 font-bold text-white hover:bg-sky-700">Record Compliance</button></div> : isReadyForRecheck ? <div className="mt-3"><button onClick={async () => await recheckPayrollItem(item.id)} className="rounded-md bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700">Verify / Recheck</button></div> : <div className="mt-3"><button onClick={async () => await completePayrollItemInitialCheckingAndRoute(item.id)} className="rounded-md bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-700">Complete &amp; Route</button></div>}
              </div>;
            })}
          </div>
        </div>
      )}

      {/* Title & Queue Description */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Task Queues & Routing Inbox
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Role-authorized queues with phase accountability, automatic advancing, and return rules.
            </p>
          </div>
          <div className="text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
            Active Desk: <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.roleTitle})
          </div>
        </div>

        {/* Queue Switcher Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4 pt-4 border-t border-slate-100">
          {queueTabs.map(tab => {
            const Icon = tab.icon;
            const isSelected = activeQueue === tab.id;
            return (
              <button
                key={tab.id}
                id={`queue-tab-${tab.id}`}
                onClick={() => setActiveQueue(tab.id as any)}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-300 ring-1 ring-blue-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold px-1.5 py-0.2 rounded-full ${
                    tab.isAlert
                      ? 'bg-rose-100 text-rose-700'
                      : isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                </div>
                <span className={`text-xs font-semibold truncate w-full ${
                  isSelected ? 'text-blue-900' : 'text-slate-700'
                }`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="queue-search-input"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter by tracking #, payroll batch, subject, sender, or office..."
            className="w-full text-xs sm:text-sm pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          <select
            id="queue-filter-priority"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="Routine">Routine</option>
            <option value="Priority">Priority</option>
            <option value="Urgent">Urgent</option>
          </select>

          <select
            id="queue-filter-classification"
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Classifications</option>
            <option value="Communication">Communication</option>
            <option value="Payroll">Payroll</option>
            <option value="Request">Request</option>
            <option value="Others">Others</option>
          </select>
        </div>
      </div>

      {/* Tasks Table / Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredList.length === 0 && filteredPayrollTasks.length === 0 ? (
          <div className="text-center py-12 p-4">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-700">No tasks in this queue</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no document or payroll tasks matching your active queue and search filters.
            </p>
          </div>
        ) : (
          <>
          {filteredPayrollTasks.length > 0 && (
            <div className="border-b border-slate-200 bg-blue-50/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Payroll tasks</h2>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">{filteredPayrollTasks.length}</span>
              </div>
              <div className="space-y-2">
                {filteredPayrollTasks.map(batch => {
                  const initialDesk = batch.initialCheckingDesk || batch.assignedDesk;
                  const initialItems = payrollItems.filter(item => item.batchId === batch.id && (item.currentStage || (item.workGroupId ? 'verification_signing' : 'initial_checking')) === 'initial_checking');
                  const assignedGroup = workGroups.find(group => group.batchId === batch.id && group.assignedProcessorId === currentUser.id && group.status === 'In_Progress');
                  const phaseLabel = initialItems.length > 0 && isInitialCheckingAssignee(batch.id)
                    ? `Phase 2: ${batch.workflowStages?.find(stage => stage.stageNumber === 2)?.name || 'Initial Checking'}`
                    : assignedGroup ? `Phase 3: ${assignedGroup.classification} Work Group` : batch.progress.release.ready > 0 ? 'Phase 4: Release' : batch.progress.displayStatus;
                  const assignee = assignedGroup?.assignedProcessorName || initialDesk.userName || initialDesk.roleTitle || 'Configured desk';
                  return <div key={batch.id} className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-blue-700">{batch.batchNumber}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">{batch.payrollType} payroll - {batch.progress.totalItems} item{batch.progress.totalItems === 1 ? '' : 's'}</p>
                      <p className="mt-1 text-xs text-slate-600"><strong>{phaseLabel}</strong> &bull; Assigned to {assignee}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{batch.office} &bull; {batch.progress.displayStatus}</p>
                    </div>
                    <button
                      id={`btn-open-payroll-task-${batch.id}`}
                      type="button"
                      onClick={() => openBatchModal(batch, assignedGroup?.id)}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      Open &amp; Process <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>;
                })}
              </div>
            </div>
          )}
          {filteredList.length > 0 && <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Tracking Number</th>
                  <th className="py-3 px-4">Subject & Details</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Current Phase & Assignee</th>
                  <th className="py-3 px-4">Priority / Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map(doc => {
                  const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedDocument(doc)}
                    >
                      {/* Tracking Number */}
                      <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {doc.trackingNumber}
                        <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5">
                          Recv: {new Date(doc.dateReceived).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Subject & Details */}
                      <td className="py-3 px-4 max-w-xs sm:max-w-md">
                        <div className="font-semibold text-slate-900 line-clamp-1">
                          {doc.title}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {doc.subject}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Source: <strong className="text-slate-700">{doc.sourceOffice}</strong> &bull; Sender: {doc.senderName}
                        </div>
                      </td>

                      {/* Classification & Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">
                          {doc.documentType}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {doc.classification}
                        </span>
                      </td>

                      {/* Current Step & Assignee */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-blue-700 flex items-center gap-1.5">
                          <span>Phase {doc.currentStepNumber}/{doc.totalSteps}:</span>
                          <span className="truncate max-w-[160px]">{currentStep?.name}</span>
                        </div>
                        <div className="text-xs text-slate-600 truncate max-w-[180px] mt-0.5">
                          {currentStep?.assignedTo.displayName}
                        </div>
                      </td>

                      {/* Priority & Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getPriorityBadge(doc.priority)}`}>
                            {doc.priority.toUpperCase()}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getStatusBadge(doc.status)}`}>
                            {doc.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          {activeQueue === 'team_queue' && (
                            <button
                              id={`btn-claim-${doc.id}`}
                              onClick={async () => await claimTask(doc.id)}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                            >
                              Claim
                            </button>
                          )}
                          <button
                            id={`btn-open-task-${doc.id}`}
                            onClick={() => setSelectedDocument(doc)}
                            className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open & Process</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
          </>
        )}
      </div>
    </div>
  );
};
