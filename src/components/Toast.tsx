import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toast, clearToast } = useApp();

  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-blue-600 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50/95';
      case 'warning':
        return 'border-amber-200 bg-amber-50/95';
      case 'error':
        return 'border-rose-200 bg-rose-50/95';
      default:
        return 'border-blue-200 bg-blue-50/95';
    }
  };

  return (
    <aside 
      role="alert"
      aria-label="Notification alert"
      id="toast-notification-banner"
      className={`fixed bottom-5 right-5 z-[110] flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm max-w-md animate-in slide-in-from-bottom-3 duration-200 ${getBorderColor()}`}
    >
      {getIcon()}
      <div className="flex-1 text-left pr-2">
        <h4 className="text-sm font-semibold text-slate-900">{toast.title}</h4>
        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{toast.message}</p>
      </div>
      <button 
        id="btn-toast-close"
        onClick={clearToast}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </aside>
  );
};
