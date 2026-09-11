import React, { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LoginPortal: React.FC = () => {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">HRMDO</p>
            <h1 className="text-lg font-semibold text-white">Document Tracking System</h1>
          </div>
        </div>
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-400">Use your authorized HRMDO account to continue.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email address</span>
            <input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" required className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" />
            </div>
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">
            <LogIn className="h-4 w-4" />
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
};