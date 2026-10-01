import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { isDocumentActionableForUser } from '../services/documentTaskAssignment';
import { getDashboardSummary, type DashboardSummary } from '../services/dashboardApi';
import { useResourceInvalidation } from '../services/resourceInvalidation';
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
  canRegisterDocument: boolean;
  canViewRegistry: boolean;
  canViewLeave: boolean;
  canViewAudit: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenRegisterModal, canRegisterDocument, canViewRegistry, canViewLeave, canViewAudit }) => {
  const { 
    documents, 
    currentUser, 
    setActiveTab, 
    setSelectedDocument, openTargetedDocument, stateRevision,
    auditLogs, showToast
  } = useApp();
  const targeted=import.meta.env.VITE_DASHBOARD_TARGETED_READS==='1';
  const invalidation=useResourceInvalidation('dashboard');
  const [summary,setSummary]=useState<DashboardSummary|null>(null);
  const [summaryError,setSummaryError]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!targeted)return;
    let active=true,pending=false;
    const refresh=async()=>{if(pending)return;pending=true;try{const value=await getDashboardSummary();if(active){setSummary(value);setSummaryError(false);}}catch{if(active){setSummary(null);setSummaryError(true);}}finally{pending=false;}};
    void refresh();const focus=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setInterval(focus,30000);
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[targeted,currentUser.id,stateRevision,retry,invalidation]);
  const openDashboardDocument=(id:string)=>{
    if(targeted&&import.meta.env.VITE_DOCUMENT_DETAIL_TARGETED_READS==='1'){openTargetedDocument(id);return;}
    const record=documents.find(item=>item.id===id);if(record)setSelectedDocument(record);
  };
  const openRestricted = (allowed: boolean, tab: 'registry' | 'leave' | 'audit', label: string) => {
    if (allowed) setActiveTab(tab);
    else showToast('warning', 'Access restricted', `You are not authorized to access ${label}. Ask an administrator to enable this section for your account.`);
  };

  const activeV2Docs = targeted?[]:documents.filter(d => !d.isLegacyV1);
  const pendingApprovalDocs = activeV2Docs.filter(d => d.status === 'Pending_Approval');
  const concludedDocs = activeV2Docs.filter(d => ['Released', 'Disapproved'].includes(d.status));
  const inFlightDocs = activeV2Docs.filter(d => !['Released', 'Archived', 'Disapproved'].includes(d.status));
  const outsideHrmdoDocs = activeV2Docs.filter(d => d.status === 'Awaiting_External_Return');

  // Tasks assigned to current active user or role
  const myActionableTasks = activeV2Docs.filter(doc => {
    if (doc.status === 'Released' || doc.status === 'Archived' || doc.status === 'Disapproved') return false;
    return isDocumentActionableForUser(doc, currentUser, true);
  });
  const actionableCount=targeted?summary?.metrics.actionable??0:myActionableTasks.length;
  const inFlightCount=targeted?summary?.metrics.in_flight??0:inFlightDocs.length;
  const pendingCount=targeted?summary?.metrics.pending??0:pendingApprovalDocs.length;
  const concludedCount=targeted?summary?.metrics.concluded??0:concludedDocs.length;
  const outsideCount=targeted?summary?.metrics.outside??0:outsideHrmdoDocs.length;
  const taskRows=targeted?summary?.tasks??[]:myActionableTasks.map(doc=>({id:doc.id,tracking_number:doc.trackingNumber,title:doc.title,document_type:doc.documentType,source_office:doc.sourceOffice,status:doc.status,current_step_number:doc.currentStepNumber,total_steps:doc.totalSteps,current_step_name:doc.workflowSteps.find(step=>step.stepNumber===doc.currentStepNumber)?.name??null}));
  const outsideRows=targeted?summary?.outside??[]:outsideHrmdoDocs.slice(0,5).map(doc=>({id:doc.id,trackingNumber:doc.trackingNumber,documentType:doc.documentType,currentLocation:doc.currentLocation,destinationOffice:doc.workflowSteps.find(step=>step.stepNumber===doc.currentStepNumber)?.externalHandoff?.destinationOffice??null}));
  const activityRows=targeted?summary?.activity??[]:auditLogs.slice(0,4);

  return (
    <div className="space-y-6 pb-12">
      {targeted&&!summary&&!summaryError&&<div role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Loading Dashboard summary...</div>}
      {targeted&&summaryError&&<div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Dashboard summary could not be loaded. <button type="button" className="underline" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
      
      {/* 1. Clean Operational Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Activity className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Operations</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">
                Signed in as <strong className="font-semibold text-slate-700">{currentUser.name}</strong> &bull; {currentUser.roleTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              id="btn-dash-open-queues"
              onClick={() => setActiveTab('queues')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Inbox className="w-4 h-4 text-slate-500" />
              <span>My Tasks</span>
              {actionableCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                  {actionableCount}
                </span>
              )}
            </button>
            {canRegisterDocument && <button
              id="btn-dash-register-new"
              onClick={onOpenRegisterModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Register Document</span>
            </button>}
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
            {actionableCount}
          </div>
          <div className="text-[11px] text-blue-600 font-medium mt-1 flex items-center gap-1">
            <span>Awaiting your processing</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 2: Active Pipeline */}
        <div 
          onClick={() => openRestricted(canViewRegistry, 'registry', 'Document Registry')}
          className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active In-Flight
            </span>
            <FileText className="w-4 h-4 text-slate-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900">
            {inFlightCount}
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
            {pendingCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Awaiting executive review
          </div>
        </div>

        {/* Card 4: Concluded & Released */}
        <div 
          onClick={() => openRestricted(canViewRegistry, 'registry', 'Document Registry')}
          className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Released / Concluded
            </span>
            <Send className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-600">
            {concludedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Officially completed
          </div>
        </div>

      </div>

      {outsideCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-amber-950">Outside HRMDO</h2><p className="text-xs text-amber-800">Documents in external custody and awaiting their return.</p></div><span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">{outsideCount} Documents</span></div>
          <div className="divide-y divide-amber-200/70">{outsideRows.map(doc => <button key={doc.id} type="button" onClick={() => openDashboardDocument(doc.id)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-amber-100/60"><div className="min-w-0"><p className="font-mono text-xs font-bold text-amber-900">{doc.trackingNumber}</p><p className="truncate text-xs text-slate-700">{doc.documentType} • {doc.destinationOffice || doc.currentLocation}</p></div><span className="text-[11px] font-semibold text-amber-800">View</span></button>)}</div>
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

            {actionableCount === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-800">Your desk is clear</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No documents currently require action from {currentUser.roleTitle}. You can register incoming items or review central archives.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  {canRegisterDocument && <button
                    onClick={onOpenRegisterModal}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    + Register Document
                  </button>}
                  <button
                    onClick={() => openRestricted(canViewRegistry, 'registry', 'Document Registry')}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Search Registry
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {taskRows.map(doc => {
                  return (
                    <div
                      key={doc.id}
                      onClick={() => openDashboardDocument(doc.id)}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 -mx-2 px-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {doc.tracking_number}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {doc.document_type}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            from {doc.source_office}
                          </span>
                        </div>

                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                          {doc.title}
                        </h3>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span className="font-medium text-blue-600">
                            Phase {doc.current_step_number} of {doc.total_steps}: {doc.current_step_name}
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
              {canRegisterDocument && <button
                id="btn-dash-quick-register"
                onClick={onOpenRegisterModal}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Register Incoming Document</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>}

              <button
                id="btn-dash-quick-registry"
                onClick={() => openRestricted(canViewRegistry, 'registry', 'Document Registry')}
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
                onClick={() => openRestricted(canViewLeave, 'leave', 'Leave Records')}
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
                onClick={() => openRestricted(canViewAudit, 'audit', 'Audit Trail & Reports')}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Audit Log
              </button>
            </div>

            <div className="space-y-3">
              {activityRows.map(log => (
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
