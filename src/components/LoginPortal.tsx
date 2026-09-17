import React, { FormEvent, useState } from 'react';
import { Archive, LockKeyhole, LogIn, Mail, ShieldCheck, Workflow } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from './BrandLogo';

export const LoginPortal: React.FC = () => {
  const { login } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(identifier, password);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050b1c] px-4 py-8 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-slate-700/70 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] lg:min-h-[580px] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-[#0d1933] to-blue-950 px-7 py-9 text-white sm:px-10 lg:px-12 lg:py-12">
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full border-[42px] border-blue-500/10" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-12 w-12 shrink-0 drop-shadow-lg" title="HRMDO Records Management System" />
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">City Government of Tacloban</p><p className="mt-1 text-xs text-slate-300">Human Resource Management and Development Office</p></div>
            </div>

            <div className="my-10 max-w-lg lg:my-auto">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/40 bg-blue-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200"><ShieldCheck className="h-3.5 w-3.5" />Secure records access</span>
              <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">HRMDO<br className="hidden sm:block" /> Records Management System</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">A secure workspace for document routing, payroll processing, leave records, and archives.</p>
              <div className="mt-8 hidden grid-cols-2 gap-3 sm:grid lg:grid">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><Workflow className="h-5 w-5 text-blue-300" /><p className="mt-2 text-xs font-semibold">Controlled workflows</p><p className="mt-1 text-[11px] leading-4 text-slate-400">Clear phase ownership and routing.</p></div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><Archive className="h-5 w-5 text-blue-300" /><p className="mt-2 text-xs font-semibold">Up-to-date records</p><p className="mt-1 text-[11px] leading-4 text-slate-400">Traceable history in one system.</p></div>
              </div>
            </div>

            <p className="hidden items-center gap-2 text-xs text-slate-400 lg:flex"><ShieldCheck className="h-4 w-4 text-blue-300" />Authorized HRMDO personnel only</p>
          </div>
        </div>

        <div className="flex items-center bg-white px-7 py-10 sm:px-10 lg:px-12">
          <div className="w-full">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-600">Sign in</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">System access</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter your registered email address or username and password to continue.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-700">Email address or username</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input value={identifier} onChange={event => setIdentifier(event.target.value)} type="text" autoComplete="username" required placeholder="Username or name@hrmdo.gov.ph" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-700">Password</span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required placeholder="Enter your password" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </div>
              </label>
              {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
              <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60">
                <LogIn className="h-4 w-4" />
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-5 text-center"><p className="text-xs text-slate-400">Access is managed by the HRMDO system administrator.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
};
