import React from 'react';
import { useApp } from '../context/AppContext';
import { isDocumentActionableForUser } from '../services/documentTaskAssignment';
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Send, 
  Inbox, 
  Plus, 
  CalendarClock, 
  Search,
  Activity,
  AlertCircle
} from 'lucide-react';

interface DashboardProps {
  onOpenRegisterModal: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenRegisterModal }) => {
  const { 
    documents, 
    currentUser, 
    setActiveTab, 
    setSelectedDocument, 
    auditLogs 
  } = useApp();

  const activeV2Docs = documents.filter(d => !d.isLegacyV1);
  const pendingApprovalDocs = activeV2Docs.filter(d => d.status === 'Pending_Approval');
  const concludedDocs = activeV2Docs.filter(d => ['Released', 'Disapproved'].includes(d.status));
  const inFlightDocs = activeV2Docs.filter(d => !['Released', 'Archived', 'Disapproved'].includes(d.status));
  const outsideHrmdoDocs = activeV2Docs.filter(d => d.status === 'Awaiting_External_Return');

  // Tasks assigned to current active user or role
  const myActionableTasks = activeV2Docs.filter(doc => {
    if (doc.status === 'Released' || doc.status === 'Archived' || doc.status === 'Disapproved') return false;
    return isDocumentActionableForUser(doc, currentUser, true);
  });

  return (
    <div className="space-y-6 pb-12">
      
      {/* 1. Clean Operational Header */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Operational Overview
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Active desk: <strong className="text-slate-800 font-semibold">{currentUser.name}</strong> &bull; {currentUser.roleTitle} ({currentUser.division})
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              id="btn-dash-open-queues"
              onClick={() => setActiveTab('queues')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Inbox className="w-4 h-4 text-slate-500" />
              <span>My Tasks</span>
              {myActionableTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                  {myActionableTasks.length}
                </span>
              )}
            </button>
            <button
              id="btn-dash-register-new"
              onClick={onOpenRegisterModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Register Document</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Four Clean, High-Signal Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: My Desk Tasks */}
        <div 
          onClick={() => setActiveTab('queues')}
          className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              My Action Tasks
            </span>
            <Inbox className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">
            {myActionableTasks.length}
          </div>
          <div className="text-[11px] text-blue-600 font-medium mt-1 flex items-center gap-1">
            <span>Awaiting your processing</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 2: Active Pipeline */}
        <div 
          onClick={() => setActiveTab('registry')}
          className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active In-Flight
            </span>
            <FileText className="w-4 h-4 text-slate-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">
            {inFlightDocs.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Documents in routing
          </div>
        </div>

        {/* Card 3: Pending Sign-Off */}
        <div 
          onClick={() => setActiveTab('queues')}
          className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Approval
            </span>
            <Clock className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-amber-600">
            {pendingApprovalDocs.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Awaiting executive review
          </div>
        </div>

        {/* Card 4: Concluded & Released */}
        <div 
          onClick={() => setActiveTab('registry')}
          className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Released / Concluded
            </span>
            <Send className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-600">
            {concludedDocs.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Officially completed
          </div>
        </div>

      </div>

      {outsideHrmdoDocs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-amber-950">Outside HRMDO</h2><p className="text-xs text-amber-800">Documents in external custody and awaiting their return.</p></div><span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">{outsideHrmdoDocs.length} Documents</span></div>
          <div className="divide-y divide-amber-200/70">{outsideHrmdoDocs.slice(0,5).map(doc => { const step=doc.workflowSteps.find(item=>item.stepNumber===doc.currentStepNumber); return <button key={doc.id} type="button" onClick={() => setSelectedDocument(doc)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-amber-100/60"><div className="min-w-0"><p className="font-mono text-xs font-bold text-amber-900">{doc.trackingNumber}</p><p className="truncate text-xs text-slate-700">{doc.documentType} • {step?.externalHandoff?.destinationOffice || doc.currentLocation}</p></div><span className="text-[11px] font-semibold text-amber-800">View</span></button>; })}</div>
        </div>
      )}

      {/* 3. Main Streamlined Content: Tasks For You + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2/3): Actionable Tasks For Current Desk */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Documents Pending Your Action
                </h2>
                <p className="text-xs text-slate-500">
                  Transactions currently queued at your workstation
                </p>
              </div>

              <button
                id="btn-dash-all-tasks-link"
                onClick={() => setActiveTab('queues')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                <span>View Full Queue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {myActionableTasks.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-800">Your desk is clear</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No documents currently require action from {currentUser.roleTitle}. You can register incoming items or review central archives.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={onOpenRegisterModal}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    + Register Document
                  </button>
                  <button
                    onClick={() => setActiveTab('registry')}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Search Registry
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {myActionableTasks.map(doc => {
                  const currentStep = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocument(doc)}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 -mx-2 px-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {doc.trackingNumber}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {doc.documentType}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            from {doc.sourceOffice}
                          </span>
                        </div>

                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                          {doc.title}
                        </h3>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span className="font-medium text-blue-600">
                            Phase {doc.currentStepNumber} of {doc.totalSteps}: {currentStep?.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          id={`btn-dash-process-${doc.id}`}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-2xs"
                        >
                          Process Phase &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3): Clean Activity Stream & Fast Shortcuts */}
        <div className="space-y-4">
          
          {/* Quick Shortcuts */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                id="btn-dash-quick-register"
                onClick={onOpenRegisterModal}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Register Incoming Document</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                id="btn-dash-quick-registry"
                onClick={() => setActiveTab('registry')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-600" />
                  <span>Search All Records & Archives</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                id="btn-dash-quick-leave"
                onClick={() => setActiveTab('leave')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-emerald-600" />
                  <span>File or Track Leave Application</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Recent Activity Stream */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Recent Document Events
                </h3>
              </div>
              <button
                id="btn-dash-all-audit-link"
                onClick={() => setActiveTab('audit')}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Audit Log
              </button>
            </div>

            <div className="space-y-3">
              {auditLogs.slice(0, 4).map(log => (
                <div key={log.id} className="text-xs space-y-0.5 border-l-2 border-blue-500 pl-2.5 py-0.5">
                  <div className="font-semibold text-slate-900 line-clamp-1">
                    {log.summary}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>{log.actorName}</span>
                    <span className="font-mono text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
