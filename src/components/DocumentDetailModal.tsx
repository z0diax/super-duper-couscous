import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, Download, FileText, Paperclip, Printer, RotateCcw, Send, Upload, UserCheck, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { OFFICE_OPTIONS } from '../data/offices';

type Tab = 'workflow' | 'details' | 'attachments' | 'audit' | 'slip';
type Dialog = 'claim' | 'complete' | 'hold' | 'compliance' | 'recheck' | 'return' | 'approve' | 'release' | 'reassign' | 'remark' | 'upload' | 'handoff' | 'external-return' | null;

export const DocumentDetailModal: React.FC = () => {
  const {
    selectedDocument: doc, setSelectedDocument, currentUser, users, payrollItems, auditLogs, can,
    claimTask, completeStep, returnStep, reassignTask, approveDocument, releaseDocument, placeDocumentHold, submitDocumentCompliance, recheckDocumentHold,
    addDocumentRemark, uploadSupportingFile, updatePayrollItemClassification,
    recordExternalHandoff, recordExternalReturn,
  } = useApp();
  const [tab, setTab] = useState<Tab>('workflow');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [remarks, setRemarks] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [releasedTo, setReleasedTo] = useState('');
  const [releaseMode, setReleaseMode] = useState<'In-Person Pick-up' | 'Official Courier' | 'Electronic Copy' | 'Internal Messenger'>('Electronic Copy');
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [handoffDestination, setHandoffDestination] = useState('');
  const [handoffTo, setHandoffTo] = useState('');
  const [returnedBy, setReturnedBy] = useState('');
  const [externalResult, setExternalResult] = useState('');
  const [handoffFile, setHandoffFile] = useState<File | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [employmentClassification, setEmploymentClassification] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdFile, setHoldFile] = useState<File | null>(null);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState<'all' | 'hold' | 'routing' | 'release'>('all');
  const [auditPage, setAuditPage] = useState(1);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const current = doc?.workflowSteps.find(step => step.stepNumber === doc.currentStepNumber);
  const isExternal = current?.stageType === 'EXTERNAL_HANDOFF_REVIEW';
  const isAssigned = !!current && (current.assignedTo.userId === currentUser.id || (!current.assignedTo.userId && current.assignedTo.role === currentUser.role));
  const isAdmin = currentUser.role === 'admin' || can('canAdmin');
  const canProcess = isAssigned;
  const canClaim = !!current && !doc?.isLegacyV1 && !current.assignedTo.userId && !isAssigned && current.status !== 'Completed' && ((current.assignedTo.type === 'Team' && !!current.assignedTo.team && [currentUser.division, currentUser.office].includes(current.assignedTo.team)) || current.assignedTo.role === currentUser.role);
  const canManage = canProcess && !isExternal && can('canSupervise');
  const canExternal = !!isExternal && (current?.handoffOwner?.userId === currentUser.id || can('canIntake') || can('canSupervise') || isAdmin);
  const canSeeControls = canProcess || canClaim || canManage || canExternal || (!!doc && ['On_Hold','Ready_For_Recheck'].includes(doc.status) && (doc.encodedBy.userId === currentUser.id || isAdmin));
  const audit = useMemo(() => doc ? auditLogs.filter(event => event.documentId === doc.id) : [], [auditLogs, doc]);
  const normalizedAuditQuery = auditQuery.trim().toLowerCase();
  const filteredAudit = [...audit].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).filter(event => {
    const action = event.actionType.toLowerCase();
    const matchesType = auditFilter === 'all'
      || (auditFilter === 'hold' && (action.includes('hold') || action.includes('compliance') || action.includes('return')))
      || (auditFilter === 'routing' && (action.includes('step') || action.includes('task') || action.includes('route') || action.includes('assign') || action.includes('handoff')))
      || (auditFilter === 'release' && (action.includes('release') || action.includes('approve')));
    const matchesQuery = !normalizedAuditQuery || [event.actorName, event.actorRole, event.trackingNumber, event.summary, event.details, event.actionType].some(value => String(value || '').toLowerCase().includes(normalizedAuditQuery));
    return matchesType && matchesQuery;
  });
  const auditPageCount = Math.max(1, Math.ceil(filteredAudit.length / 10));
  const visibleAudit = filteredAudit.slice((Math.min(auditPage, auditPageCount) - 1) * 10, Math.min(auditPage, auditPageCount) * 10);
  const payrollItem = doc ? payrollItems.find(item => item.documentId === doc.id) : undefined;

  if (!doc || !current) return null;

  const close = () => { setDialog(null); setSelectedDocument(null); };
  const resetDialog = () => { setDialog(null); setRemarks(''); setActionTaken(''); setReturnReason(''); setReleasedTo(''); setReassignUserId(''); setReassignReason(''); setAttachmentFile(null); setHandoffFile(null); setReturnFile(null); setEmploymentClassification(''); setHoldReason(''); setHoldFile(null); };
  const saved = async (operation: () => Promise<unknown>) => { const result = await operation(); if (result) resetDialog(); };
  const phaseLabel = `Phase ${doc.currentStepNumber}`;
  const requiresPayrollClassification = !!payrollItem && doc.classification === 'Payroll' && current.requiredAction === 'Verify & Process';
  const selectedClassification = employmentClassification || payrollItem?.employmentClassification || '';
  const isHeld = doc.status === 'On_Hold';
  const isReadyForRecheck = doc.status === 'Ready_For_Recheck';
  const execute = async () => {
    if (requiresPayrollClassification) {
      if (!selectedClassification) return;
      if (selectedClassification !== payrollItem?.employmentClassification && !(await updatePayrollItemClassification(payrollItem!.id, selectedClassification))) return;
    }
    await saved(() => completeStep(doc.id, remarks, actionTaken.trim() || current.requiredAction || 'Processed'));
  };
  const dialogTitle: Record<Exclude<Dialog, null>, string> = {
    claim: 'Claim task', complete: 'Complete and advance', hold: 'Place document on hold', compliance: 'Submit compliance', recheck: 'Recheck and resume', return: 'Return for rework', approve: 'Approve and sign', release: 'Release document', reassign: 'Reassign task', remark: 'Add remark', upload: 'Upload file', handoff: 'Record external handoff', 'external-return': 'Record return to HRMDO',
  };
  const submitDialog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dialog === 'claim') await saved(() => claimTask(doc.id));
    if (dialog === 'complete') await execute();
    if (dialog === 'hold' && holdReason.trim()) await saved(() => placeDocumentHold(doc.id, { reason: holdReason, remarks, files: holdFile ? [holdFile] : [] }));
    if (dialog === 'compliance' && remarks.trim()) await saved(() => submitDocumentCompliance(doc.id, { remarks, files: holdFile ? [holdFile] : [] }));
    if (dialog === 'recheck') await saved(() => recheckDocumentHold(doc.id));
    if (dialog === 'return' && returnReason.trim()) await saved(() => returnStep(doc.id, returnReason));
    if (dialog === 'approve') await saved(() => approveDocument(doc.id, remarks || 'Approved'));
    if (dialog === 'release' && releasedTo.trim()) await saved(() => releaseDocument(doc.id, { releasedTo, releaseMode, receiptRemarks: remarks }));
    if (dialog === 'reassign' && reassignUserId) await saved(() => reassignTask(doc.id, reassignUserId, '', reassignReason || 'Administrative reassignment'));
    if (dialog === 'remark' && remarks.trim()) await saved(() => addDocumentRemark(doc.id, remarks));
    if (dialog === 'upload' && attachmentFile) await saved(() => uploadSupportingFile(doc.id, attachmentFile));
    if (dialog === 'handoff' && handoffTo && (handoffDestination || current.externalDestinationOffice)) await saved(() => recordExternalHandoff(doc.id, { destinationOffice: handoffDestination || current.externalDestinationOffice, purpose: current.externalPurpose || 'Approval', handedTo: handoffTo, files: handoffFile ? [handoffFile] : [] }));
    if (dialog === 'external-return') await saved(() => recordExternalReturn(doc.id, { returnedFrom: current.externalHandoff?.destinationOffice || '', returnedBy, result: externalResult, files: returnFile ? [returnFile] : [] }));
  };
  const printSlip = () => window.print();
  const actionButtons = <div className="flex flex-wrap items-center gap-2">
    {canClaim && <button type="button" onClick={() => setDialog('claim')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Claim task</button>}
    {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.status !== 'Completed' && current.requiredAction !== 'Approve & Sign' && current.requiredAction !== 'Release & Archive' && <button type="button" onClick={() => setDialog('complete')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" />Complete and advance</button>}
    {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.requiredAction === 'Approve & Sign' && <button type="button" onClick={() => setDialog('approve')} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white">Approve and sign</button>}
    {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.requiredAction === 'Release & Archive' && <button type="button" onClick={() => setDialog('release')} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white">Release document</button>}
    {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.allowReturn && doc.currentStepNumber > 1 && <button type="button" onClick={() => setDialog('return')} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"><RotateCcw className="h-4 w-4" />Return for rework</button>}
    {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.allowHold && <button type="button" onClick={() => setDialog('hold')} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Place on hold</button>}
    {isHeld && (doc.encodedBy.userId === currentUser.id || isAdmin) && <button type="button" onClick={() => setDialog('compliance')} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">Submit compliance</button>}
    {isReadyForRecheck && (canProcess || isAdmin) && <button type="button" onClick={() => setDialog('recheck')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Recheck and resume</button>}
    {(canProcess || doc.encodedBy.userId === currentUser.id) && <button type="button" onClick={() => setDialog('remark')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Add remark</button>}
    {(canProcess || doc.encodedBy.userId === currentUser.id) && <button type="button" onClick={() => setDialog('upload')} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><Upload className="h-4 w-4" />Upload file</button>}
    {canManage && <button type="button" onClick={() => setDialog('reassign')} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><UserCheck className="h-4 w-4" />Reassign</button>}
    {isExternal && current.externalStatus === 'PENDING_HANDOFF' && canExternal && <button type="button" onClick={() => setDialog('handoff')} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">Record external handoff</button>}
    {isExternal && current.externalStatus === 'OUTSIDE_HRMDO' && canExternal && <button type="button" onClick={() => setDialog('external-return')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Record return to HRMDO</button>}
  </div>;

  const navTabs: Array<[Tab, string]> = [
    ['workflow', 'Workflow Phases & Actions'], ['details', 'Document Details'], ['attachments', `Attachments (${doc.attachments.length})`], ['audit', `Audit Trail (${audit.length})`], ['slip', 'Official Routing Slip'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300"><span className="rounded bg-blue-700 px-2 py-1 font-mono font-bold text-blue-100">{doc.trackingNumber}</span><span>{doc.classification} / {doc.documentType}</span></div>
              <h2 className="mt-2 truncate text-lg font-bold">{doc.title}</h2>
              <p className="mt-1 text-xs text-slate-300">Current phase: <strong className="text-white">{phaseLabel} - {current.name}</strong></p>
            </div>
            <div className="flex items-center gap-1"><button type="button" onClick={printSlip} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Print routing slip" title="Print routing slip"><Printer className="h-5 w-5" /></button><button id="btn-close-detail-modal" type="button" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close document"><X className="h-5 w-5" /></button></div>
          </div>
        </header>

        <nav className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4">
          {navTabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold ${tab === value ? 'border-blue-600 bg-white text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{label}</button>)}
        </nav>

        <main className="flex-1 overflow-y-auto p-5">
          {tab === 'workflow' && <div className="space-y-5">
            {isExternal && <div className={`rounded-xl border p-4 text-sm ${current.externalStatus === 'OUTSIDE_HRMDO' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}><strong>{current.externalStatus === 'OUTSIDE_HRMDO' ? 'Outside HRMDO - awaiting return' : 'External handoff pending'}</strong><p className="mt-1 text-xs">Current location: {doc.currentLocation || 'HRMDO'}{current.externalHandoff ? ` - Sent to ${current.externalHandoff.destinationOffice}` : ''}</p></div>}
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ordered workflow progress</h3><span className="text-xs text-slate-500">{doc.currentStepNumber} of {doc.totalSteps} phases</span></div>
              <div className="space-y-3">{doc.workflowSteps.map(step => {
                const active = step.isCurrent;
                const completed = step.status === 'Completed';
                return <div key={step.stepNumber} className={`flex gap-3 rounded-xl border p-3 ${active ? 'border-blue-400 bg-white ring-2 ring-blue-100' : completed ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white/70'}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${completed ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{completed ? <Check className="h-4 w-4" /> : step.stepNumber}</div>
                  <div className="min-w-0 flex-1"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{step.name}</strong>{active && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">CURRENT ACTIVE PHASE</span>}</div><p className="mt-1 text-xs text-slate-600">{step.stageType === 'EXTERNAL_HANDOFF_REVIEW' ? `External custody: ${step.externalHandoff?.destinationOffice || step.externalDestinationOffice || 'Destination chosen at handoff'}` : `Assigned to: ${step.assignedTo.displayName}`}</p>{step.actionTaken && <p className="mt-1 text-xs text-slate-600">Action: {step.actionTaken}</p>}{active && (isHeld || isReadyForRecheck) && <p className="mt-1 text-xs font-medium text-amber-800">{isHeld ? 'On hold — awaiting compliance' : 'Compliance submitted — ready for recheck'}{doc.holdReason ? `: ${doc.holdReason}` : ''}</p>}</div>{active && !doc.isLegacyV1 && doc.status !== 'Released' && canSeeControls && actionButtons}</div></div>
                </div>;
              })}</div>
            </section>

            {false && !doc.isLegacyV1 && doc.status !== 'Released' && canSeeControls && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Workflow actions</h3><p className="mt-1 text-xs text-slate-500">Actions available for {phaseLabel} ({current.name})</p></div>
              {(isHeld || isReadyForRecheck) && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>{isHeld ? 'On hold — awaiting compliance' : 'Compliance submitted — ready for recheck'}</strong><p className="mt-1">{doc.holdReason}{doc.holdRemarks ? ` — ${doc.holdRemarks}` : ''}</p></div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {canClaim && <button type="button" onClick={() => setDialog('claim')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Claim task</button>}
                {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.status !== 'Completed' && current.requiredAction !== 'Approve & Sign' && current.requiredAction !== 'Release & Archive' && <button type="button" onClick={() => setDialog('complete')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" />Complete and advance</button>}
                {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.requiredAction === 'Approve & Sign' && <button type="button" onClick={() => setDialog('approve')} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white">Approve and sign</button>}
                {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.requiredAction === 'Release & Archive' && <button type="button" onClick={() => setDialog('release')} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white">Release document</button>}
                {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.allowReturn && doc.currentStepNumber > 1 && <button type="button" onClick={() => setDialog('return')} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"><RotateCcw className="h-4 w-4" />Return for rework</button>}
                {canProcess && !isExternal && !isHeld && !isReadyForRecheck && current.allowHold && <button type="button" onClick={() => setDialog('hold')} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Place on hold</button>}
                {isHeld && (doc.encodedBy.userId === currentUser.id || isAdmin) && <button type="button" onClick={() => setDialog('compliance')} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Submit compliance</button>}
                {isReadyForRecheck && (canProcess || isAdmin) && <button type="button" onClick={() => setDialog('recheck')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Recheck and resume</button>}
                {(canProcess || doc.encodedBy.userId === currentUser.id) && <button type="button" onClick={() => setDialog('remark')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Add remark</button>}
                {(canProcess || doc.encodedBy.userId === currentUser.id) && <button type="button" onClick={() => setDialog('upload')} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><Upload className="h-4 w-4" />Upload file</button>}
                {canManage && <button type="button" onClick={() => setDialog('reassign')} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"><UserCheck className="h-4 w-4" />Reassign</button>}
              </div>
              {isExternal && current.externalStatus === 'PENDING_HANDOFF' && canExternal && <div className="mt-4"><button type="button" onClick={() => setDialog('handoff')} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Record external handoff</button></div>}
              {isExternal && current.externalStatus === 'OUTSIDE_HRMDO' && canExternal && <div className="mt-4"><button type="button" onClick={() => setDialog('external-return')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Record return to HRMDO</button></div>}
            </section>}
          </div>}

          {tab === 'details' && <section className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2"><p><span className="text-slate-500">Tracking number</span><br /><strong>{doc.trackingNumber}</strong></p><p><span className="text-slate-500">Source office</span><br /><strong>{doc.sourceOffice}</strong></p><p><span className="text-slate-500">Sender</span><br /><strong>{doc.senderName}</strong></p><p><span className="text-slate-500">Received</span><br /><strong>{new Date(doc.dateReceived).toLocaleString()}</strong></p><p className="sm:col-span-2"><span className="text-slate-500">Subject</span><br /><strong>{doc.subject}</strong></p><p className="sm:col-span-2"><span className="text-slate-500">Current location</span><br /><strong>{doc.currentLocation || 'HRMDO'}</strong></p>{doc.description && <p className="sm:col-span-2"><span className="text-slate-500">Description</span><br />{doc.description}</p>}</section>}
          {tab === 'attachments' && <section className="space-y-2">{doc.attachments.length ? doc.attachments.map(file => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm text-blue-700 hover:bg-slate-50"><span><Paperclip className="mr-2 inline h-4 w-4" />{file.name}</span><Download className="h-4 w-4" /></a>) : <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No attachments.</p>}</section>}
          {tab === 'audit' && <section className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Audit Trail</h3><p className="mt-0.5 text-[11px] text-slate-500">{filteredAudit.length} of {audit.length} events · newest first</p></div>
              <div className="flex flex-1 flex-col gap-2 sm:max-w-2xl sm:flex-row"><input value={auditQuery} onChange={event => { setAuditQuery(event.target.value); setAuditPage(1); }} placeholder="Search person, action, or details…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-hidden focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><select value={auditFilter} onChange={event => { setAuditFilter(event.target.value as typeof auditFilter); setAuditPage(1); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-hidden focus:border-blue-400"><option value="all">All activities</option><option value="hold">Holds &amp; returns</option><option value="routing">Routing &amp; assignments</option><option value="release">Approvals &amp; releases</option></select></div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {visibleAudit.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">No audit events match these filters.</div> : visibleAudit.map(event => {
                const expanded = expandedAuditId === event.id;
                const isHoldEvent = /hold|compliance|return/i.test(event.actionType);
                const isReleaseEvent = /release|approve/i.test(event.actionType);
                return <button type="button" key={event.id} onClick={() => setExpandedAuditId(expanded ? null : event.id)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left text-xs last:border-b-0 hover:bg-slate-50"><span className={`mt-1 h-2 w-2 rounded-full ${isHoldEvent ? 'bg-amber-500' : isReleaseEvent ? 'bg-emerald-500' : 'bg-blue-500'}`} /><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><strong className="truncate text-slate-900">{event.summary}</strong><span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{event.actorName}</span></span>{event.details && <span className={`mt-0.5 block text-slate-600 ${expanded ? '' : 'truncate'}`}>{event.details}</span>}{expanded && <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-slate-400">{event.actionType.replaceAll('_', ' ')} · {event.actorRole}</span>}</span><span className="whitespace-nowrap text-[10px] text-slate-400">{new Date(event.timestamp).toLocaleString()}</span></button>;
              })}
            </div>
            {auditPageCount > 1 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Page {Math.min(auditPage, auditPageCount)} of {auditPageCount}</span><div className="flex gap-2"><button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage(page => page - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={auditPage >= auditPageCount} onClick={() => setAuditPage(page => page + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
          </section>}
          {tab === 'slip' && <section className="rounded-xl border-2 border-slate-700 p-5"><div className="flex justify-end"><button type="button" onClick={printSlip} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs"><Printer className="h-4 w-4" />Print slip</button></div><h3 className="text-center text-base font-bold">OFFICIAL ROUTING SLIP</h3><p className="mt-1 text-center text-xs">{doc.trackingNumber} - {doc.title}</p><table className="mt-4 w-full border-collapse text-xs"><thead><tr><th className="border border-slate-700 p-2">Phase</th><th className="border border-slate-700 p-2">Action / assignee</th><th className="border border-slate-700 p-2">Status</th></tr></thead><tbody>{doc.workflowSteps.map(step => <tr key={step.stepNumber}><td className="border border-slate-700 p-2">{step.stepNumber}</td><td className="border border-slate-700 p-2">{step.name}<br />{step.assignedTo.displayName}</td><td className="border border-slate-700 p-2">{step.status}</td></tr>)}</tbody></table></section>}
        </main>
      </section>

      {dialog && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
        <form onSubmit={submitDialog} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-base font-bold text-slate-900">{dialogTitle[dialog]}</h3><p className="mt-1 text-xs text-slate-500">{phaseLabel}: {current.name}</p></div>
            <button type="button" onClick={resetDialog} className="text-slate-400 hover:text-slate-700" aria-label="Close action dialog"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 space-y-3">
            {dialog === 'claim' && <p className="text-sm text-slate-600">Claim this task and make yourself responsible for its current phase.</p>}
            {dialog === 'complete' && <>
              {requiresPayrollClassification && <label className="block text-sm font-semibold text-slate-700">Employment Classification<select autoFocus required value={selectedClassification} onChange={event => setEmploymentClassification(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="">Select employment classification</option><option value="JOW/COS">Job Order (JOW) / COS</option><option value="Casual">Casual Personnel</option><option value="Regular">Regular Plantilla</option></select></label>}
              <input autoFocus={!requiresPayrollClassification} value={actionTaken} onChange={event => setActionTaken(event.target.value)} placeholder={`Action taken (defaults to ${current.requiredAction || 'complete'})`} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
              <textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Remarks (optional)" className="min-h-24 w-full rounded-lg border border-slate-300 p-2 text-sm" />
            </>}
            {dialog === 'hold' && <><input autoFocus required value={holdReason} onChange={event => setHoldReason(event.target.value)} placeholder="Hold reason or missing requirement" className="w-full rounded-lg border border-amber-300 p-2 text-sm" /><textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Details and required action" className="min-h-24 w-full rounded-lg border border-amber-300 p-2 text-sm" /><label className="block rounded-lg border border-dashed border-amber-300 p-3 text-sm">Supporting file (optional)<input type="file" className="mt-2 block w-full text-xs" onChange={event => setHoldFile(event.target.files?.[0] || null)} /></label></>}
            {dialog === 'compliance' && <><textarea autoFocus required value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Describe the submitted compliance" className="min-h-24 w-full rounded-lg border border-amber-300 p-2 text-sm" /><label className="block rounded-lg border border-dashed border-amber-300 p-3 text-sm">Compliance attachment (optional)<input type="file" className="mt-2 block w-full text-xs" onChange={event => setHoldFile(event.target.files?.[0] || null)} /></label></>}
            {dialog === 'recheck' && <p className="text-sm text-slate-600">Confirm that the compliance is sufficient. The document will resume in {phaseLabel} with the same assigned processor.</p>}
            {dialog === 'return' && <textarea autoFocus required value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder="Reason for return" className="min-h-24 w-full rounded-lg border border-rose-300 p-2 text-sm" />}
            {dialog === 'approve' && <textarea autoFocus value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Approval remarks" className="min-h-24 w-full rounded-lg border border-slate-300 p-2 text-sm" />}
            {dialog === 'release' && <><input autoFocus required value={releasedTo} onChange={event => setReleasedTo(event.target.value)} placeholder="Released to" className="w-full rounded-lg border border-slate-300 p-2 text-sm" /><select value={releaseMode} onChange={event => setReleaseMode(event.target.value as typeof releaseMode)} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm">{['In-Person Pick-up','Official Courier','Electronic Copy','Internal Messenger'].map(option => <option key={option}>{option}</option>)}</select><textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Receipt remarks (optional)" className="min-h-20 w-full rounded-lg border border-slate-300 p-2 text-sm" /></>}
            {dialog === 'reassign' && <><select autoFocus required value={reassignUserId} onChange={event => setReassignUserId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="">Select new assignee</option>{users.filter(user => user.id !== currentUser.id).map(user => <option key={user.id} value={user.id}>{user.name} - {user.roleTitle}</option>)}</select><textarea value={reassignReason} onChange={event => setReassignReason(event.target.value)} placeholder="Reason for reassignment" className="min-h-20 w-full rounded-lg border border-slate-300 p-2 text-sm" /></>}
            {dialog === 'remark' && <textarea autoFocus required value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Add a document remark" className="min-h-24 w-full rounded-lg border border-slate-300 p-2 text-sm" />}
            {dialog === 'upload' && <label className="block rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700">Select a supporting file<input autoFocus required type="file" className="mt-2 block w-full text-xs" onChange={event => setAttachmentFile(event.target.files?.[0] || null)} /></label>}
            {dialog === 'handoff' && <><select aria-label="External destination office" autoFocus value={handoffDestination || current.externalDestinationOffice || ''} onChange={event => setHandoffDestination(event.target.value)} disabled={current.externalDestinationMode === 'FIXED_DESTINATION'} className="w-full rounded-lg border border-amber-300 bg-white p-2 text-sm"><option value="">Select destination office</option>{OFFICE_OPTIONS.map(office => <option key={office} value={office}>{office}</option>)}</select><input required value={handoffTo} onChange={event => setHandoffTo(event.target.value)} placeholder="Handed over to" className="w-full rounded-lg border border-amber-300 p-2 text-sm" /><label className="block rounded-lg border border-dashed border-amber-300 p-3 text-sm">Attach file (optional)<input type="file" className="mt-2 block w-full text-xs" onChange={event => setHandoffFile(event.target.files?.[0] || null)} /></label></>}
            {dialog === 'external-return' && <><input autoFocus value={returnedBy} onChange={event => setReturnedBy(event.target.value)} placeholder="Returned by / representative" className="w-full rounded-lg border border-blue-300 p-2 text-sm" /><select value={externalResult} onChange={event => setExternalResult(event.target.value)} className="w-full rounded-lg border border-blue-300 bg-white p-2 text-sm"><option value="">Select result</option>{['Approved','Approved with Comments','Returned with Comments','Signed','Reviewed','Disapproved','No Action','Other'].map(value => <option key={value}>{value}</option>)}</select><label className="block rounded-lg border border-dashed border-blue-300 p-3 text-sm">Attach returned file<input type="file" className="mt-2 block w-full text-xs" onChange={event => setReturnFile(event.target.files?.[0] || null)} /></label></>}
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={resetDialog} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Send className="h-4 w-4" />{dialog === 'claim' ? 'Claim task' : dialog === 'upload' ? 'Upload file' : 'Save action'}</button></div>
        </form>
      </div>}
    </div>
  );
};
