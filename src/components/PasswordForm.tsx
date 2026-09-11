import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
export function PasswordForm() {
  const { changePassword } = useApp();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  return <div className="p-3 border-t text-xs">
    <button onClick={() => setOpen(!open)} className="font-semibold text-blue-700">Change my password</button>
    {open && <form className="space-y-2 mt-2" onSubmit={async e => {
      e.preventDefault(); if (await changePassword({ currentPassword, newPassword })) { setCurrent(''); setNew(''); setOpen(false); }
    }}>
      <input aria-label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrent(e.target.value)} placeholder="Current password" className="w-full border rounded p-2" />
      <input aria-label="New password" type="password" autoComplete="new-password" required minLength={3} maxLength={72} value={newPassword} onChange={e => setNew(e.target.value)} placeholder="New password (3+ characters)" className="w-full border rounded p-2" />
      <button className="rounded bg-blue-600 text-white px-3 py-2">Update password</button>
    </form>}
  </div>;
}
