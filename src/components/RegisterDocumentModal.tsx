import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Upload, 
  FileText, 
  ArrowRight, 
  Layers, 
  Paperclip,
  Trash2,
  Barcode,
  Building2,
  AlertTriangle,
  Check
} from 'lucide-react';
import { resolveWorkflow } from '../services/workflow';
import { DocumentClassification } from '../types';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';
import { OFFICE_OPTIONS } from '../data/offices';

interface RegisterDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToPayroll?: () => void;
}


export const RegisterDocumentModal: React.FC<RegisterDocumentModalProps> = ({ isOpen, onClose, onSwitchToPayroll }) => {
  const { 
    classifications, 
    workflowTemplates, 
    registerDocument, 
    documents,
    setSelectedDocument,
    currentUser,
    users
  } = useApp();

  const savedDraft = readWorkspaceValue(currentUser.id, 'draft.register-document', {} as Partial<{ classification: DocumentClassification; documentType: string; employmentClassification: 'Job Order (JOW)' | 'Regular' | 'Casual'; title: string; barcode: string; sourceOffice: string; remarks: string }>);
  const [classification, setClassification] = useState<DocumentClassification>(savedDraft.classification || 'Communication');
  const [documentType, setDocumentType] = useState(savedDraft.documentType || 'Office Order');
  const [employmentClassification, setEmploymentClassification] = useState<'Job Order (JOW)' | 'Regular' | 'Casual'>(savedDraft.employmentClassification || 'Job Order (JOW)');
  const [title, setTitle] = useState(savedDraft.title || '');
  const [barcode, setBarcode] = useState(savedDraft.barcode || '');
  const [sourceOffice, setSourceOffice] = useState(savedDraft.sourceOffice || OFFICE_OPTIONS[0]);
  const [remarks, setRemarks] = useState(savedDraft.remarks || '');
  const [files, setFiles] = useState<File[]>([]);
  const [initialAssigneeId, setInitialAssigneeId] = useState('');

  useEffect(() => {
    writeWorkspaceValue(currentUser.id, 'draft.register-document', { classification, documentType, employmentClassification, title, barcode, sourceOffice, remarks });
  }, [currentUser.id, classification, documentType, employmentClassification, title, barcode, sourceOffice, remarks]);

  if (!isOpen) return null;

  // Resolved category & types
  const currentCategory = classifications.find(c => c.classification === classification) || classifications[0];
  const activeTypes = currentCategory?.types.filter(t => t.isActive) || [];

  // Update doc type when classification changes
  const handleClassificationChange = (newClass: DocumentClassification) => {
    setClassification(newClass);
    setInitialAssigneeId('');
    const cat = classifications.find(c => c.classification === newClass);
    setDocumentType(cat?.types.find(t => t.isActive)?.name || '');
  };

  const isDuplicateBarcode = barcode.trim() !== '' && documents.some(
    d => d.trackingNumber.toLowerCase() === barcode.trim().toLowerCase() ||
         (d.barcode && d.barcode.toLowerCase() === barcode.trim().toLowerCase())
  );

  // Find resolved workflow template
  const usableWorkflows = workflowTemplates.filter(wf =>
    wf.isActive && Array.isArray(wf.steps) && wf.steps.length > 0
  );
  const resolvedWorkflow = resolveWorkflow(workflowTemplates, classification, documentType, classification === 'Payroll' ? employmentClassification : undefined);
  const firstOperationalStep = resolvedWorkflow?.steps[0]?.assignmentSource === 'personnel_pool'
    ? resolvedWorkflow.steps[0]
    : resolvedWorkflow?.steps[0]?.requiredAction === 'Receive' ? resolvedWorkflow.steps[1] : resolvedWorkflow?.steps[0];
  const initialPoolUserIds = firstOperationalStep?.assignmentSource === 'personnel_pool' ? (firstOperationalStep.personnelPoolUserIds || []) : [];
  const initialPoolUsers = users.filter(user => initialPoolUserIds.includes(user.id));

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const fileList: File[] = Array.from(e.target.files);
    const uploaded = fileList;
    setFiles(prev => [...prev, ...uploaded]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !barcode.trim()) return;

    if (!resolvedWorkflow) {
      alert('No active workflow is configured. Ask an administrator to create a workflow with at least one phase before registering documents.');
      return;
    }
    if (initialPoolUserIds.length > 0 && !initialPoolUserIds.includes(initialAssigneeId)) {
      alert(`Choose the person responsible for Phase ${firstOperationalStep?.stepNumber || 1}.`);
      return;
    }

    if (isDuplicateBarcode) {
      alert('This barcode is already assigned to an existing document. Please use a unique barcode.');
      return;
    }

    const finalDocType = documentType.trim() || (classification === 'Others' ? 'General Request' : 'Standard Document');

    const newDoc = await registerDocument({
      title: title.trim(),
      subject: remarks.trim() || title.trim(),
      sourceType: sourceOffice.includes('External') ? 'External' : 'Internal',
      sourceOffice: sourceOffice.trim(),
      senderName: `${sourceOffice.trim()} Signatory`,
      classification,
      documentType: finalDocType,
      employmentClassification: classification === 'Payroll' ? employmentClassification : undefined,
      priority: 'Routine',
      description: remarks.trim() || title.trim(),
      files,
      barcode: barcode.trim(),
      initialAssigneeId: initialPoolUserIds.length > 0 ? initialAssigneeId : undefined,
    });
    if (!newDoc) return;

    setTitle(''); setBarcode(''); setRemarks(''); setFiles([]); setInitialAssigneeId('');
    onClose();
    setSelectedDocument(newDoc);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Register Incoming Document
              </h2>
              <p className="text-xs text-slate-400">
                Official docketing & automatic phase-based workflow assignment
              </p>
            </div>
          </div>
          <button
            id="btn-close-register-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 sm:space-y-5">
          
          {/* Payroll Separation Notice Banner */}
          <div className="p-3.5 bg-blue-50/90 border border-blue-200/80 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-blue-900">Looking to register Payroll?</span>
                <p className="text-blue-700 text-[11px] mt-0.5">
                  Payroll documents have a dedicated workspace for Single Vouchers &amp; Batch Transmittals.
                </p>
              </div>
            </div>
            {onSwitchToPayroll && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToPayroll();
                }}
                className="px-3 py-1.5 bg-white hover:bg-blue-100/60 text-blue-700 border border-blue-300 font-semibold rounded-lg text-xs shrink-0 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <span>Open Payroll Intake</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 1. Classification & Type */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Classification & Type
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Classification
                </label>
                <select
                  id="reg-input-classification"
                  value={classification}
                  onChange={e => handleClassificationChange(e.target.value as any)}
                  className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium cursor-pointer"
                >
                  <option value="Communication">Communication</option>
                  <option value="Request">Request</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Type {classification === 'Others' ? '*' : ''}
                </label>
                  <select
                    id="reg-input-doctype"
                    value={documentType}
                    onChange={e => { setDocumentType(e.target.value); setInitialAssigneeId(''); }}
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    {activeTypes.map(t => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Title *
            </label>
            <input
              id="reg-input-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="Enter document title..."
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Barcode, Office */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Barcode *
              </label>
              <div className="relative">
                <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="reg-input-barcode"
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  required
                  placeholder="Enter or scan barcode..."
                  className={`w-full text-xs sm:text-sm bg-white border rounded-lg pl-9 pr-3 py-2 font-mono font-semibold text-slate-900 focus:ring-2 focus:outline-none transition-colors ${
                    isDuplicateBarcode 
                      ? 'border-amber-400 focus:ring-amber-500 bg-amber-50/20' 
                      : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
              </div>

              {/* Barcode validation feedback (Room for future DB uniqueness check) */}
              {isDuplicateBarcode ? (
                <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Barcode is already registered in system records</span>
                </p>
              ) : barcode.trim() !== '' ? (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3 shrink-0" />
                  <span>Barcode available</span>
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Office
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <select
                  id="reg-input-sourceoffice"
                  value={sourceOffice}
                  onChange={e => setSourceOffice(e.target.value)}
                  className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer"
                >
                  {OFFICE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks
            </label>
            <textarea
              id="reg-input-remarks"
              rows={3}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Enter document remarks, transmittal details, or instructions..."
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </div>

          {/* File Attachments */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              File Attachments
            </label>
            <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50/60 hover:bg-slate-50 transition-colors text-center">
              <input
                id="reg-file-upload-input"
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"
                onChange={handleFileSelection}
                className="hidden"
              />
              <label
                htmlFor="reg-file-upload-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-blue-600"
              >
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-xs font-medium">Choose supporting files (up to 10 MB each)</span>
                <span className="text-[10px] text-slate-400">Attach original transmittal, endorsements, or clearances</span>
              </label>
            </div>

            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{f.name}</span>
                      <span className="text-slate-400 text-[10px]">
                        ({(f.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      id={`btn-remove-file-${idx}`}
                      onClick={() => removeFile(idx)}
                      className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Target Workflow: Standard Office Order Routing Workflow */}
          {resolvedWorkflow ? (
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-700" />
                <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                  Workflow: {resolvedWorkflow.title}
                </span>
              </div>
              <span className="text-[10px] text-blue-700 font-semibold bg-white px-2 py-0.5 rounded border border-blue-200">
                {resolvedWorkflow.steps.length} Phases Configured
              </span>
            </div>
            
            <p className="text-[11px] text-blue-800/80 mb-3">
              {resolvedWorkflow.steps[0]?.assignmentSource === 'personnel_pool'
                ? 'Choose the Phase 1 assignee below. The document will remain in Intake until that person completes it.'
                : resolvedWorkflow.steps.length > 1 && resolvedWorkflow.steps[0]?.requiredAction === 'Receive'
                ? 'Registration completes the intake phase and routes the document directly to Phase 2.'
                : 'Upon registration, the document will enter Phase 1 and be routed to the assigned queue.'}
            </p>

            {initialPoolUsers.length > 0 && <label className="mb-3 block rounded-lg border border-blue-200 bg-white p-3 text-xs font-semibold text-slate-700">
              Assign Phase {firstOperationalStep?.stepNumber} to <span className="text-rose-500">*</span>
              <select required value={initialAssigneeId} onChange={event => setInitialAssigneeId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-blue-300 bg-white p-2.5 text-sm font-normal">
                <option value="">Choose eligible personnel...</option>
                {initialPoolUsers.map(user => <option key={user.id} value={user.id}>{user.name} — {user.roleTitle}</option>)}
              </select>
              <span className="mt-1 block font-normal text-slate-500">{firstOperationalStep?.name}</span>
            </label>}

            <div className="space-y-1.5">
              {resolvedWorkflow.steps.map(step => (
                <div
                  key={step.stepNumber}
                  className="flex items-center justify-between text-xs bg-white/90 p-2 rounded-lg border border-blue-200/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                      {step.stepNumber}
                    </span>
                    <span className="font-semibold text-slate-900">{step.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-blue-700">{step.assignmentSource === 'personnel_pool' ? 'Selected from personnel pool' : step.assigneeName}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3" role="alert">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-950">No active workflow is configured</p>
                <p className="text-[11px] text-amber-800 mt-1">
                  An administrator must create a workflow with at least one phase before documents can be registered.
                </p>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              id="btn-cancel-register"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-submit-register-document"
              disabled={isDuplicateBarcode || !resolvedWorkflow || (initialPoolUsers.length > 0 && !initialAssigneeId)}
              className={`px-5 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer ${
                isDuplicateBarcode || !resolvedWorkflow || (initialPoolUsers.length > 0 && !initialAssigneeId) ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <span>Docket & Launch Workflow</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
