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
  Clock, 
  AlertCircle,
  Building2,
  UserCheck,
  Barcode,
  ArrowRight,
  ShieldCheck,
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
    currentUser
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
  const [items, setItems] = useState<BatchItemEntry[]>(savedDraft.items?.length ? savedDraft.items : [
    {
      id: '1',
      barcode: '',
      office: OFFICE_OPTIONS[0],
      title: '',
      classificationType: ''
    }
  ]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Register Incoming Payroll
              </h2>
              <p className="text-xs text-slate-500">
                Choose entry mode to initiate single voucher routing or multi-item parallel batch processing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODE SELECTOR (Single vs Batch Entry) */}
        <div className="p-4 sm:p-6 bg-slate-50/40 border-b border-slate-100 shrink-0">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Select Payroll Intake Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card 1: Single Entry */}
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3.5 relative ${
                mode === 'single'
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
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
              className={`p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3.5 relative ${
                mode === 'batch'
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Payroll Classification Type <span className="text-rose-500">*</span>
                  </label>
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
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 rounded-xl p-4 text-center cursor-pointer transition-colors">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click to attach supporting voucher files or drag and drop
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    PDF, Scanned DTR, XLSX up to 10MB
                  </p>
                  <input aria-label="Payroll supporting files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={e => setSingleFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                </div>

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

              {/* Sequential 5-Step Workflow Roadmap */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80">
                <div className="text-xs font-bold text-slate-800 mb-3 flex items-center justify-between">
                  <span>Prescribed Single Payroll 5-Phase Pipeline</span>
                  <span className="text-[11px] font-normal text-slate-500">Live Stage Preview</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  {[
                    { step: '1', name: 'Intake Docketing', role: 'Receiving Desk', state: 'Complete on Submit' },
                    { step: '2', name: 'Verification & Signing', role: 'Assigned Personnel', state: 'Classify during checking', highlight: true },
                    { step: '3', name: 'Chief Review', role: 'Atty. Bautista', state: 'Queue 3' },
                    { step: '4', name: 'Director Approval', role: 'Dr. Mendoza', state: 'Queue 4' },
                    { step: '5', name: 'Release & Archive', role: 'Records Custodian', state: 'Queue 5' },
                  ].map((s, idx) => (
                    <div key={idx} className={`p-2.5 rounded-lg border text-left ${s.highlight ? 'bg-blue-50/90 border-blue-200' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>PHASE {s.step}</span>
                        {s.highlight && <span className="text-blue-600 font-bold">&bull; Next</span>}
                      </div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5 line-clamp-1">{s.name}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{s.role}</div>
                    </div>
                  ))}
                </div>
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
                  <div className="flex items-center gap-2">
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
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 rounded-xl p-4 text-center cursor-pointer transition-colors">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click to attach master transmittal files
                  </p>
                  <input aria-label="Batch supporting files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={e => setBatchFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                </div>

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

              {/* Batch 4-Stage Lifecycle Alert */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-900">4-Stage Batch Lifecycle:</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900">
                        1. Docketing &rarr; 2. Initial Checking Desk (the receiving officer)
                      </span>
                    </div>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Batch is routed to the receiving officer for verification, then automatically split into parallel work groups by employment classification.
                    </p>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {mode === 'single' ? (
              <span>Employment classification is assigned by <strong>Phase 2 personnel</strong>.</span>
            ) : (
              <span>Initial checking desk: <strong>the receiving officer</strong> ({items.length} items)</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Cancel
            </button>
            {mode === 'single' ? (
              <button
                type="submit"
                form="single-payroll-form"
                disabled={!singleTitle.trim() || isDuplicateSingleBarcode}
                className="flex items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
              >
                <span>Register Single Payroll</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                form="batch-payroll-form"
                disabled={items.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
              >
                <span>Register Batch ({items.length} Items)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
