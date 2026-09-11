import React, { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PayrollBatch, PayrollItem } from '../types';
import { readWorkspaceValue, writeWorkspaceValue } from '../services/workspace';

interface Props {
  batch: PayrollBatch | null;
  items: PayrollItem[];
  isOpen: boolean;
  onClose: () => void;
}

interface ItemDraft {
  id: string;
  barcode: string;
  title: string;
  office: string;
  classificationType: string;
}
interface BatchEditDraft {
  batchBarcode: string;
  office: string;
  payrollType: string;
  payrollPeriod: string;
  receivedFromLiaison: string;
  remarks: string;
  itemDrafts: ItemDraft[];
}

export const EditPayrollBatchModal: React.FC<Props> = ({ batch, items, isOpen, onClose }) => {
  const { updatePayrollBatch, currentUser } = useApp();
  const [batchBarcode, setBatchBarcode] = useState('');
  const [office, setOffice] = useState('');
  const [payrollType, setPayrollType] = useState('');
  const [payrollPeriod, setPayrollPeriod] = useState('');
  const [receivedFromLiaison, setReceivedFromLiaison] = useState('');
  const [remarks, setRemarks] = useState('');
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([]);
  const [draftReadyKey, setDraftReadyKey] = useState('');

  const draftKey = batch ? `draft.edit-payroll:${batch.id}` : '';

  useEffect(() => {
    if (!isOpen || !batch) return;
    const fallback: BatchEditDraft = {
      batchBarcode: batch.batchBarcode || batch.batchNumber,
      office: batch.office,
      payrollType: batch.payrollType,
      payrollPeriod: batch.payrollPeriod || '',
      receivedFromLiaison: batch.receivedFromLiaison || '',
      remarks: batch.remarks || '',
      itemDrafts: items.map(item => ({
      id: item.id,
      barcode: item.barcode,
      title: item.title,
      office: item.office || batch.office,
      classificationType: item.classificationType || batch.payrollType
      }))
    };
    const saved = readWorkspaceValue<BatchEditDraft | null>(currentUser.id, draftKey, null);
    const draft = saved && saved.itemDrafts.length === fallback.itemDrafts.length ? saved : fallback;
    setBatchBarcode(draft.batchBarcode); setOffice(draft.office); setPayrollType(draft.payrollType); setPayrollPeriod(draft.payrollPeriod); setReceivedFromLiaison(draft.receivedFromLiaison); setRemarks(draft.remarks); setItemDrafts(draft.itemDrafts);
    setDraftReadyKey(draftKey);
  }, [isOpen, batch?.id, currentUser.id]);

  useEffect(() => {
    if (!isOpen || !draftKey || draftReadyKey !== draftKey) return;
    writeWorkspaceValue<BatchEditDraft>(currentUser.id, draftKey, { batchBarcode, office, payrollType, payrollPeriod, receivedFromLiaison, remarks, itemDrafts });
  }, [isOpen, draftKey, draftReadyKey, currentUser.id, batchBarcode, office, payrollType, payrollPeriod, receivedFromLiaison, remarks, itemDrafts]);

  if (!isOpen || !batch) return null;

  const updateItem = (id: string, field: keyof Omit<ItemDraft, 'id'>, value: string) => {
    setItemDrafts(current => current.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await updatePayrollBatch({
      id: batch.id,
      batchBarcode,
      office,
      payrollType,
      payrollPeriod,
      receivedFromLiaison,
      remarks,
      items: itemDrafts
    });
    if (saved) { writeWorkspaceValue(currentUser.id, draftKey, null); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Edit Payroll Batch</h2>
            <p className="mt-0.5 text-xs text-slate-500">Correct intake details and registered payroll items before routing to Phase 3.</p>
          </div>
          <button type="button" aria-label="Close edit payroll batch" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">
              Batch Barcode <span className="text-rose-600">*</span>
              <input required value={batchBarcode} onChange={event => setBatchBarcode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Main Office <span className="text-rose-600">*</span>
              <input required value={office} onChange={event => setOffice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Payroll Classification Type <span className="text-rose-600">*</span>
              <input required value={payrollType} onChange={event => setPayrollType(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Payroll Period
              <input value={payrollPeriod} onChange={event => setPayrollPeriod(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-xs font-semibold text-slate-700 md:col-span-2">
              Liaison / Received From
              <input value={receivedFromLiaison} onChange={event => setReceivedFromLiaison(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-xs font-semibold text-slate-700 md:col-span-2">
              Remarks
              <textarea rows={2} value={remarks} onChange={event => setRemarks(event.target.value)} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
            </label>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Registered Payroll Items ({itemDrafts.length})</h3>
              <p className="mt-0.5 text-xs text-slate-500">You can correct the barcode, title, office, and document type for each item.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {itemDrafts.map((item, index) => (
                <div key={item.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="text-xs font-bold text-slate-400 lg:col-span-4">Payroll {index + 1}</div>
                  <label className="text-xs font-semibold text-slate-700">Barcode <span className="text-rose-600">*</span>
                    <input required value={item.barcode} onChange={event => updateItem(item.id, 'barcode', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Title / Claimant <span className="text-rose-600">*</span>
                    <input required value={item.title} onChange={event => updateItem(item.id, 'title', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Office <span className="text-rose-600">*</span>
                    <input required value={item.office} onChange={event => updateItem(item.id, 'office', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Document Type <span className="text-rose-600">*</span>
                    <input required value={item.classificationType} onChange={event => updateItem(item.id, 'classificationType', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                  </label>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
          <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
            <Save className="h-4 w-4" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
