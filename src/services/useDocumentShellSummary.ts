import { useEffect, useState } from 'react';
import { getDocumentShellSummary, type DocumentShellSummary } from './documentApi';
import { useResourceInvalidation } from './resourceInvalidation';

export interface DocumentShellSnapshot {
  summary: DocumentShellSummary | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export function useDocumentShellSummary(userId: string, revision: number): DocumentShellSnapshot {
  const enabled=import.meta.env.VITE_DOCUMENT_SHELL_TARGETED_READS==='1';
  const invalidation=useResourceInvalidation('document');
  const [summary,setSummary]=useState<DocumentShellSummary | null>(null);
  const [summaryUserId,setSummaryUserId]=useState('');
  const [loading,setLoading]=useState(enabled);
  const [error,setError]=useState(false);
  const [retryCount,setRetryCount]=useState(0);
  useEffect(()=>{
    if (!enabled || !userId) return;
    setSummary(null);
    let active=true, pending=false;
    const refresh=async()=>{
      if (pending) return;
      pending=true; setLoading(true); setError(false);
      try { const result=await getDocumentShellSummary(); if(active){setSummary(result);setSummaryUserId(userId);setLoading(false);} }
      catch { if(active){setSummary(null);setError(true);setLoading(false);} }
      finally { pending=false; }
    };
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    const onResume=()=>{if(document.visibilityState==='visible') void refresh();};
    window.addEventListener('focus',onResume);
    window.addEventListener('online',onResume);
    document.addEventListener('visibilitychange',onResume);
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',onResume);window.removeEventListener('online',onResume);document.removeEventListener('visibilitychange',onResume);};
  },[enabled,userId,revision,retryCount,invalidation]);
  return {summary:enabled&&summaryUserId===userId?summary:null,loading:enabled&&loading,error:enabled&&error,retry:()=>setRetryCount(value=>value+1)};
}
