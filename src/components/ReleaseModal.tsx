import React, { useState } from 'react';
import { Send, X } from 'lucide-react';
import type { SystemRoleDefinition, UserAccount } from '../types';

export type ReleaseMode = 'HRMDO Liaison' | 'External Liaison' | 'In-Person Pickup' | 'Others';

export interface ReleaseDetails {
  releasedToUserId?: string;
  releasedTo: string;
  releaseMode: ReleaseMode;
  otherReleaseMode?: string;
  receiptRemarks?: string;
}

interface Props {
  title: string;
  subtitle: string;
  submitLabel: string;
  users: UserAccount[];
  systemRoles: SystemRoleDefinition[];
  onClose: () => void;
  onSubmit: (details: ReleaseDetails) => Promise<unknown>;
}

const releaseModes: ReleaseMode[] = ['HRMDO Liaison', 'External Liaison', 'In-Person Pickup', 'Others'];

export const ReleaseModal: React.FC<Props> = ({ title, subtitle, submitLabel, users, systemRoles, onClose, onSubmit }) => {
  const [liaisonId, setLiaisonId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>('HRMDO Liaison');
  const [otherReleaseMode, setOtherReleaseMode] = useState('');
  const [receiptRemarks, setReceiptRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const liaisonRoles = new Set(systemRoles.filter(role => /liaison|liason/i.test(`${role.id} ${role.name}`)).map(role => role.id));
  liaisonRoles.add('liaison');
  const liaisons = users.filter(user => liaisonRoles.has(user.role)).sort((a, b) => a.name.localeCompare(b.name));
  const isHrmdoLiaison = releaseMode === 'HRMDO Liaison';
  const hasRecipient = isHrmdoLiaison ? !!liaisonId : !!recipientName.trim();
  const hasReleaseMethod = releaseMode !== 'Others' || !!otherReleaseMode.trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    const liaison = isHrmdoLiaison ? liaisons.find(user => user.id === liaisonId) : undefined;
    if (!hasRecipient || (isHrmdoLiaison && !liaison) || !hasReleaseMethod) return;
    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        ...(liaison ? { releasedToUserId: liaison.id } : {}),
        releasedTo: liaison?.name ?? recipientName.trim(),
        releaseMode,
        otherReleaseMode: releaseMode === 'Others' ? otherReleaseMode.trim() : undefined,
        receiptRemarks: receiptRemarks.trim(),
      });
      if (result) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={title} data-release-dialog className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Send className="h-5 w-5" /></span><div><h3 className="text-base font-bold text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div></div>
        <button type="button" aria-label="Close release form" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        <label className="block text-xs font-semibold text-slate-700">Release method <span className="text-rose-500">*</span>
          <select autoFocus required value={releaseMode} onChange={event => { setReleaseMode(event.target.value as ReleaseMode); setLiaisonId(''); setRecipientName(''); setOtherReleaseMode(''); }} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            {releaseModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </label>
        {isHrmdoLiaison ? <>
          <label className="block text-xs font-semibold text-slate-700">Liaison officer <span className="text-rose-500">*</span>
            <select required value={liaisonId} onChange={event => setLiaisonId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="">Select liaison officer</option>
              {liaisons.map(user => <option key={user.id} value={user.id}>{user.name}{user.office ? ` — ${user.office}` : ''}</option>)}
            </select>
          </label>
          {liaisons.length === 0 && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">No users have the LIAISON role. Assign a liaison officer in User Management before releasing.</p>}
        </> : <label className="block text-xs font-semibold text-slate-700">{releaseMode === 'External Liaison' ? 'External liaison name' : releaseMode === 'In-Person Pickup' ? 'Pickup recipient name' : 'Recipient name'} <span className="text-rose-500">*</span>
          <input required value={recipientName} onChange={event => setRecipientName(event.target.value)} placeholder="Enter recipient name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" />
        </label>}
        {releaseMode === 'Others' && <label className="block text-xs font-semibold text-slate-700">Specify release method <span className="text-rose-500">*</span><input required value={otherReleaseMode} onChange={event => setOtherReleaseMode(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>}
        <label className="block text-xs font-semibold text-slate-700">Receipt remarks <span className="font-normal text-slate-400">(optional)</span><textarea rows={2} value={receiptRemarks} onChange={event => setReceiptRemarks(event.target.value)} placeholder="Receipt number or handover notes" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" disabled={isSubmitting || !hasRecipient || !hasReleaseMethod || (isHrmdoLiaison && liaisons.length === 0)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{isSubmitting ? 'Releasing...' : submitLabel}</button>
      </footer>
    </form>
  </div>;
};
