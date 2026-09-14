import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ChevronDown, KeyRound } from 'lucide-react';
export function PasswordForm() {
  const { changePassword } = useApp();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  return <div className="px-2 py-1.5 text-xs">
    <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
      <KeyRound className="h-3.5 w-3.5 text-slate-500" />
      <span className="flex-1 text-left">Change password</span>
      <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <form className="mx-1 mb-1 mt-1 space-y-2 rounded-lg bg-slate-50 p-2.5" onSubmit={async e => {
      e.preventDefault(); if (await changePassword({ currentPassword, newPassword })) { setCurrent(''); setNew(''); setOpen(false); }
    }}>
      <input aria-label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrent(e.target.value)} placeholder="Current password" className="w-full rounded-lg border border-slate-200 bg-white p-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      <input aria-label="New password" type="password" autoComplete="new-password" required minLength={3} maxLength={72} value={newPassword} onChange={e => setNew(e.target.value)} placeholder="New password (3+ characters)" className="w-full rounded-lg border border-slate-200 bg-white p-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      <button className="w-full rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white transition-colors hover:bg-blue-700">Update password</button>
    </form>}
  </div>;
}
