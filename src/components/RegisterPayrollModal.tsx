import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { createId } from '../services/id';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';
import { OFFICE_OPTIONS } from '../data/offices';
import { 
  Layers, 
  FileSpreadsheet, 
  X, 
  Plus, 
  Trash2, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  UserCheck,
  Barcode,
  ArrowRight,
  Split,
  FileText
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'single' | 'batch';
}


const PAYROLL_TYPES = [
  'Regular Semi-Monthly Salary',
  'Overtime & Night Differential',
  'Honorarium & COS Stipend',
  'Hazard Pay & Magna Carta Differential',
  'Mid-Year / Year-End Bonus & Cash Gift',
  'Terminal Leave Benefits & Separation',
  'Subsistence & Laundry Allowance',
  'Representation & Transportation Allowance (RATA)'
];

const ITEM_CLASSIFICATION_TYPES = [
  'Salary',
  'Voucher',
  'Trust fund',
  'Terminal Pay',
  'Overtime Pay',
  'Mid Year Bonus',
  'Subsistence Allowance',
  'Travel Allowance',
  'RATA',
  'Mobile Allowance',
  'Clothing Allowance'
];

interface BatchItemEntry {
  id: string;
  barcode: string;
  office: string;
  title: string;
  classificationType: string;
}

export const RegisterPayrollModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  initialMode = 'single' 
}) => {
  const { 
    classifications,
    registerSinglePayroll, 
    registerPayrollBatch, 
    documents,
    setSelectedDocument,
    currentUser,
    workflowTemplates
  } = useApp();

  const configuredPayrollTypes = classifications.find(c => c.classification === 'Payroll')?.types.filter(t => t.isActive).map(t => t.name) || [];
  const savedDraft = readWorkspaceValue(currentUser.id, 'draft.register-payroll', {} as Partial<{ mode: 'single' | 'batch'; singleOffice: string; singleClassificationType: string; singleTitle: string; singleBarcode: string; singleRemarks: string; batchOffice: string; batchPayrollType: string; batchPeriod: string; batchLiaison: string; batchBarcode: string; batchRemarks: string; items: BatchItemEntry[] }>);
  const [mode, setMode] = useState<'single' | 'batch'>(savedDraft.mode || initialMode);

  // --- Single Mode State ---
  const [singleOffice, setSingleOffice] = useState(savedDraft.singleOffice || OFFICE_OPTIONS[0]);
  const [singleClassificationType, setSingleClassificationType] = useState(savedDraft.singleClassificationType || configuredPayrollTypes[0] || '');
  const [singleTitle, setSingleTitle] = useState(savedDraft.singleTitle || '');
  const [singleBarcode, setSingleBarcode] = useState(savedDraft.singleBarcode || '');
  const [singleRemarks, setSingleRemarks] = useState(savedDraft.singleRemarks || '');
  const [singleFiles, setSingleFiles] = useState<File[]>([]);

  // --- Batch Mode State ---
  const [batchOffice, setBatchOffice] = useState(savedDraft.batchOffice || OFFICE_OPTIONS[0]);
  const [batchPayrollType, setBatchPayrollType] = useState(savedDraft.batchPayrollType || configuredPayrollTypes[0] || '');
  const [batchPeriod, setBatchPeriod] = useState(savedDraft.batchPeriod || '');
  const [batchLiaison, setBatchLiaison] = useState(savedDraft.batchLiaison || '');
  const [batchBarcode, setBatchBarcode] = useState(savedDraft.batchBarcode || `PB-${new Date().getFullYear()}-${createId().slice(0, 8).toUpperCase()}`);
  const [batchRemarks, setBatchRemarks] = useState(savedDraft.batchRemarks || '');
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [isWorkflowPreviewOpen, setIsWorkflowPreviewOpen] = useState(false);
  const [items, setItems] = useState<BatchItemEntry[]>(savedDraft.items?.length ? savedDraft.items : [
    {
      id: '1',
      barcode: '',
      office: OFFICE_OPTIONS[0],
      title: '',
      classificationType: ''
    }
  ]);

  // Payroll intake uses the same configured workflow preview for single and
  // batch entry. The document type only determines which active template wins.
  const payrollWorkflowFor = (documentType: string) => workflowTemplates
    .filter(workflow => {
      if (!workflow.isActive || workflow.classification !== 'Payroll') return false;
      const types = workflow.documentTypes || [workflow.documentType];
      return types.some(type => type === documentType || ['All', 'Default'].includes(type));
    })
    .sort((a, b) => {
      const score = (workflow: typeof a) => {
        const types = workflow.documentTypes || [workflow.documentType];
        return (types.includes(documentType) ? 2 : 0) + (workflow.employmentClassification === 'All' ? 1 : 0);
      };
      return score(b) - score(a);
    })[0];
  const selectedSingleWorkflow = payrollWorkflowFor(singleClassificationType);
  const selectedBatchTypes = Array.from(new Set(items.map(item => item.classificationType).filter(Boolean)));
  const batchWorkflowType = selectedBatchTypes.length === 1
    ? selectedBatchTypes[0]
    : selectedBatchTypes.length > 1
      ? 'All'
      : (batchPayrollType || configuredPayrollTypes[0] || 'All');
  const selectedBatchWorkflow = payrollWorkflowFor(batchWorkflowType);
  const previewWorkflow = mode === 'single' ? selectedSingleWorkflow : selectedBatchWorkflow;
  const previewDocumentType = mode === 'single' ? singleClassificationType : batchWorkflowType;

  useEffect(() => {
    writeWorkspaceValue(currentUser.id, 'draft.register-payroll', { mode, singleOffice, singleClassificationType, singleTitle, singleBarcode, singleRemarks, batchOffice, batchPayrollType, batchPeriod, batchLiaison, batchBarcode, batchRemarks, items });
  }, [currentUser.id, mode, singleOffice, singleClassificationType, singleTitle, singleBarcode, singleRemarks, batchOffice, batchPayrollType, batchPeriod, batchLiaison, batchBarcode, batchRemarks, items]);

  if (!isOpen) return null;

  // Single mode barcode collision check
  const isDuplicateSingleBarcode = singleBarcode.trim() !== '' && documents.some(
    d => d.trackingNumber.toLowerCase() === singleBarcode.trim().toLowerCase() ||
         (d.barcode && d.barcode.toLowerCase() === singleBarcode.trim().toLowerCase())
  );

  // Single mode submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleTitle.trim()) return;

    const newDoc = await registerSinglePayroll({
      office: singleOffice,
      payrollType: singleClassificationType,
      classificationType: singleClassificationType,
      payrollPeriod: '',
      title: singleTitle.trim(),
      barcode: singleBarcode.trim(),
      receivedFromLiaison: '',
      remarks: singleRemarks.trim(),
      files: singleFiles
    });
    if (!newDoc) return;

    setSingleTitle(''); setSingleBarcode(''); setSingleFiles([]); setSingleRemarks('');
    onClose();
    if (newDoc) {
      setSelectedDocument(newDoc);
    }
  };

  // Batch mode item handlers
  const addItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: String(Date.now()),
        barcode: '',
        office: batchOffice,
        title: '',
        classificationType: ''
      }
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof BatchItemEntry, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // Batch mode submit
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    const distinctOffices = Array.from(new Set(items.map(i => i.office).filter(Boolean)));
    const officeDisplay = distinctOffices.length === 1 
      ? distinctOffices[0] 
      : distinctOffices.length > 1 
        ? `${distinctOffices[0]} +${distinctOffices.length - 1} offices`
        : (batchOffice || 'General Services');

    const distinctTypes = Array.from(new Set(items.map(i => i.classificationType).filter(Boolean)));
    const typeDisplay = distinctTypes.length === 1
      ? distinctTypes[0]
      : distinctTypes.length > 1
        ? `${distinctTypes[0]} & Others (${distinctTypes.length} Types)`
        : (batchPayrollType || 'Batch Payroll');

    if (!(await registerPayrollBatch({
      office: officeDisplay,
      payrollType: typeDisplay,
      payrollPeriod: batchPeriod,
      receivedFromLiaison: batchLiaison,
      batchBarcode: batchBarcode,
      remarks: batchRemarks,
      items: items.map(i => ({ 
        barcode: i.barcode, 
        office: i.office,
        title: i.title,
        classificationType: i.classificationType
      })),
      files: batchFiles
    }))) return;

    setBatchBarcode(`PB-${new Date().getFullYear()}-${createId().slice(0, 8).toUpperCase()}`);
    setBatchFiles([]); setBatchRemarks(''); setBatchLiaison('');
    setItems([{ id: createId(), barcode: '', office: batchOffice, title: '', classificationType: '' }]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
      <section role="dialog" aria-modal="true" aria-labelledby="register-payroll-title" className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)]">
        {/* Modal Top Header */}
        <header className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 id="register-payroll-title" className="text-base sm:text-lg font-bold tracking-tight">
                Register Incoming Payroll
              </h2>
              <p className="text-xs text-slate-400">
                Choose entry mode to initiate single voucher routing or multi-item parallel batch processing
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close payroll intake"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* MODE SELECTOR (Single vs Batch Entry) */}
        <div className="px-5 pt-5 sm:px-6 sm:pt-6 shrink-0">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
            1. Payroll Entry Mode
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card 1: Single Entry */}
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 relative ${
                mode === 'single'
                  ? 'border-blue-500 bg-blue-50 shadow-xs ring-1 ring-blue-200'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className={`p-2.5 rounded-lg shrink-0 ${
                mode === 'single' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Single Payroll Entry</span>
                  {mode === 'single' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Register one payroll item for direct processing.
                </p>
                <div className="flex items-center gap-1.5 mt-2.5 text-[11px] font-semibold text-blue-700">
                  <UserCheck className="w-3.5 h-3.5" /> Direct Desk Routing &bull; Single Barcode
                </div>
              </div>
            </button>

            {/* Card 2: Batch Entry */}
            <button
              type="button"
              onClick={() => setMode('batch')}
              className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 relative ${
                mode === 'batch'
                  ? 'border-blue-500 bg-blue-50 shadow-xs ring-1 ring-blue-200'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className={`p-2.5 rounded-lg shrink-0 ${
                mode === 'batch' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Payroll Batch Entry</span>
                  {mode === 'batch' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Register multiple payroll items for parallel processing.
                </p>
                <div className="flex items-center gap-1.5 mt-2.5 text-[11px] font-semibold text-blue-700">
                  <Split className="w-3.5 h-3.5" /> Initial Checking &bull; Parallel Work Groups
                </div>
              </div>
            </button>
          </div>
          </div>
        </div>

        {/* FORM CONTENT CONTAINER */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {mode === 'single' ? (
            /* ======================================================== */
            /* SINGLE PAYROLL ENTRY FORM                                */
            /* ======================================================== */
            <form id="single-payroll-form" onSubmit={handleSingleSubmit} className="space-y-6">
              {/* Title & Barcode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter payroll title"
                    value={singleTitle}
                    onChange={e => setSingleTitle(e.target.value)}
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Barcode className="w-3.5 h-3.5 text-slate-400" /> Barcode
                  </label>
                  <input
                    type="text"
                    placeholder="Enter barcode"
                    value={singleBarcode}
                    onChange={e => setSingleBarcode(e.target.value)}
                    className={`w-full font-mono text-xs sm:text-sm px-3.5 py-2.5 border rounded-xl focus:outline-hidden ${
                      isDuplicateSingleBarcode
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : 'border-slate-200 focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  {isDuplicateSingleBarcode && (
                    <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Barcode already registered in records.
                    </p>
                  )}
                </div>
              </div>

              {/* Payroll Type & Office */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <label className="min-w-0 flex-1 text-xs font-bold text-slate-700">
                      Payroll Classification Type <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      aria-label="Show payroll workflow"
                      disabled={!selectedSingleWorkflow}
                      onClick={() => setIsWorkflowPreviewOpen(true)}
                      className="shrink-0 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                    >
                      Workflow
                    </button>
                  </div>
                  <select
                    required
                    value={singleClassificationType}
                    onChange={e => setSingleClassificationType(e.target.value)}
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {configuredPayrollTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> Office
                  </label>
                  <select
                    value={singleOffice}
                    onChange={e => setSingleOffice(e.target.value)}
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {OFFICE_OPTIONS.map(off => (
                      <option key={off} value={off}>{off}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Enter remarks"
                  value={singleRemarks}
                  onChange={e => setSingleRemarks(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none"
                />
              </div>

              {/* Supporting Attachments & Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Supporting Documents (DTR, Obligation Request, Payroll Matrix)
                </label>
                <input id="single-payroll-files" aria-label="Payroll supporting files" className="hidden" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={e => setSingleFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                <label htmlFor="single-payroll-files" className="block border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 bg-slate-50/60 rounded-xl p-4 text-center cursor-pointer transition-colors">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click to attach supporting voucher files or drag and drop
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    PDF, Scanned DTR, XLSX up to 10MB
                  </p>
                </label>

                {singleFiles.length > 0 && (
                  <div className="mt-2.5 space-y-1.5">
                    {singleFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-slate-800">{file.name}</span>
                          <span className="text-[10px] text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSingleFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </form>
          ) : (
            /* ======================================================== */
            /* PAYROLL BATCH ENTRY FORM                                 */
            /* ======================================================== */
            <form id="batch-payroll-form" onSubmit={handleBatchSubmit} className="space-y-6">
              {/* Batch Transmittal Remarks / Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Remarks
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    Batch Ref: {batchBarcode}
                  </span>
                </label>
                <textarea
                  id="batch-remarks-input"
                  rows={3}
                  placeholder="Enter transmittal remarks, special instructions, liaison details, coverage period notes, or other docketing memos..."
                  value={batchRemarks}
                  onChange={e => setBatchRemarks(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none bg-white placeholder:text-slate-400 shadow-2xs"
                />
              </div>

              {/* Items in this Batch Section */}
              <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {items.length}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Batch Items Form
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Configure barcode, office dropdown, title, and classification type (salary, voucher, etc.) for each entry
                      </p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      aria-label="Show payroll workflow"
                      disabled={!selectedBatchWorkflow}
                      onClick={() => setIsWorkflowPreviewOpen(true)}
                      className="h-8 px-2 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                    >
                      Workflow
                    </button>
                    <button
                      type="button"
                      id="btn-batch-add-item"
                      onClick={addItem}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>

                {/* Desktop Column Labels */}
                <div className="hidden lg:grid grid-cols-12 gap-2.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100/70 rounded-lg">
                  <div className="col-span-3 pl-6">Barcode</div>
                  <div className="col-span-3">Office Dropdown</div>
                  <div className="col-span-3">Title / Description</div>
                  <div className="col-span-2">Classification Type</div>
                  <div className="col-span-1 text-center">Delete</div>
                </div>

                {/* Items List */}
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                        {/* Barcode Field */}
                        <div className="lg:col-span-3">
                          <label className="block lg:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Barcode #{idx + 1}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 text-center font-bold text-slate-400 text-xs shrink-0 hidden lg:inline-block">
                              #{idx + 1}
                            </span>
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="Barcode (e.g. PAY-2026-10291)"
                                value={item.barcode}
                                onChange={e => updateItem(item.id, 'barcode', e.target.value)}
                                className="w-full font-mono text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-slate-50/50"
                                title="Barcode tracking number"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Office Dropdown */}
                        <div className="lg:col-span-3">
                          <label className="block lg:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Office Dropdown
                          </label>
                          <select
                            value={item.office}
                            onChange={e => updateItem(item.id, 'office', e.target.value)}
                            className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white truncate"
                            title="Originating Office Dropdown"
                          >
                            {OFFICE_OPTIONS.map(off => (
                              <option key={off} value={off}>{off}</option>
                            ))}
                          </select>
                        </div>

                        {/* Title Field */}
                        <div className="lg:col-span-3">
                          <label className="block lg:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Title / Description
                          </label>
                          <input
                            type="text"
                            placeholder="Title / Claimant / Description"
                            value={item.title}
                            onChange={e => updateItem(item.id, 'title', e.target.value)}
                            className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                            title="Payroll Item Title"
                          />
                        </div>

                        {/* Classification Type (Salary, Voucher, etc.) */}
                        <div className="lg:col-span-2">
                          <label className="block lg:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Classification Type (Salary, Voucher etc.)
                          </label>
                          <select
                            value={item.classificationType}
                            onChange={e => updateItem(item.id, 'classificationType', e.target.value)}
                            className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white truncate font-medium text-slate-700"
                            title="Classification Type (Salary, Voucher, etc.)"
                          >
                            <option value="" disabled>Select a document type</option>
                            {configuredPayrollTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        {/* Delete Button */}
                        <div className="lg:col-span-1 flex items-center justify-end lg:justify-center pt-1 lg:pt-0">
                          <button
                            type="button"
                            id={`btn-delete-item-${idx}`}
                            onClick={() => removeItem(item.id)}
                            disabled={items.length <= 1}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Supporting Attachments & Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Transmittal Attachments (Cover Letter, Master Summary Matrix)
                </label>
                <input id="batch-payroll-files" aria-label="Batch supporting files" className="hidden" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={e => setBatchFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                <label htmlFor="batch-payroll-files" className="block border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 bg-slate-50/60 rounded-xl p-4 text-center cursor-pointer transition-colors">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click to attach master transmittal files
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">PDF, images, DOCX, or XLSX up to 10MB</p>
                </label>

                {batchFiles.length > 0 && (
                  <div className="mt-2.5 space-y-1.5">
                    {batchFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-slate-800">{file.name}</span>
                          <span className="text-[10px] text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBatchFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </form>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="p-4 sm:px-6 border-t border-slate-200 bg-slate-50 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div className="min-w-0 flex-1 text-xs leading-5 text-slate-500 sm:pr-4">
            {mode === 'single' ? (
              <span>Employment classification is assigned by <strong>Phase 2 personnel</strong>.</span>
            ) : (
              <span>Initial checking desk: <strong>the configured Phase 2 assignee</strong> ({items.length} items)</span>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {mode === 'single' ? (
              <button
                type="submit"
                form="single-payroll-form"
                disabled={!singleTitle.trim() || isDuplicateSingleBarcode}
                className="flex items-center gap-1.5 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
              >
                <span>Register Single Payroll</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                form="batch-payroll-form"
                disabled={items.length === 0}
                className="flex items-center gap-1.5 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
              >
                <span>Register Batch ({items.length} Items)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </footer>

        {isWorkflowPreviewOpen && previewWorkflow && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
            <section role="dialog" aria-modal="true" aria-labelledby="payroll-workflow-title" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 px-5 py-4 text-white sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                    <Layers className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">Payroll workflow</p>
                    <h3 id="payroll-workflow-title" className="mt-1 text-base font-bold sm:text-lg">{previewWorkflow.title}</h3>
                    <p className="mt-1 text-xs text-slate-300">{mode === 'single' ? 'Single Payroll Entry' : 'Payroll Batch Entry'} &bull; {previewDocumentType}</p>
                  </div>
                </div>
                <button type="button" aria-label="Close payroll workflow" onClick={() => setIsWorkflowPreviewOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Configured phases</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{previewWorkflow.steps.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">After registration</p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">{previewWorkflow.steps[1]?.name || previewWorkflow.steps[0]?.name}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {previewWorkflow.steps.map((step, index) => {
                    const registrationCompletes = index === 0 && step.requiredAction === 'Receive';
                    const routing = step.assignmentSource === 'personnel_pool'
                      ? `Personnel pool (${step.personnelPoolUserIds?.length || 0} eligible)`
                      : step.assignmentSource === 'employment_routing' || step.payrollAssignmentSource === 'employment_routing'
                        ? 'Employment routing rules'
                        : step.assigneeName;
                    return (
                      <article key={step.stepNumber} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col items-center">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${registrationCompletes ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white'}`}>
                            {registrationCompletes ? <CheckCircle2 className="h-4 w-4" /> : step.stepNumber}
                          </span>
                          {index < previewWorkflow.steps.length - 1 && <span className="mt-2 h-full min-h-5 w-px bg-slate-200" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Phase {step.stepNumber}</p>
                              <h4 className="mt-0.5 text-sm font-bold text-slate-900">{step.name}</h4>
                            </div>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{step.requiredAction}</span>
                          </div>
                          {step.description && <p className="mt-2 text-xs leading-5 text-slate-500">{step.description}</p>}
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-600">
                            <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                            <span>{routing}</span>
                          </div>
                          {registrationCompletes && <p className="mt-2 text-[11px] font-medium text-emerald-700">Completed automatically during registration</p>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                <p className="text-[11px] text-slate-500">Single and batch payroll entries follow this configured workflow.</p>
                <button type="button" onClick={() => setIsWorkflowPreviewOpen(false)} className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">Done</button>
              </footer>
            </section>
          </div>
        )}
      </section>
    </div>
  );
};
