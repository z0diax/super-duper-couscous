import { useEffect,useState } from 'react';
import { getPayrollShellSummary,type PayrollShellSummary } from './payrollApi';

export interface PayrollShellSnapshot {summary:PayrollShellSummary|null;loading:boolean;error:boolean;retry:()=>void}
export function usePayrollShellSummary(userId:string,revision:number):PayrollShellSnapshot {
  const enabled=import.meta.env.VITE_PAYROLL_TARGETED_READS==='1';
  const [summary,setSummary]=useState<PayrollShellSummary|null>(null);
  const [summaryUser,setSummaryUser]=useState('');
  const [loading,setLoading]=useState(enabled);const [error,setError]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!enabled||!userId)return;
    let active=true,pending=false;
    const refresh=async()=>{
      if(pending)return;pending=true;setLoading(true);setError(false);
      try{const value=await getPayrollShellSummary();if(active){setSummary(value);setSummaryUser(userId);setLoading(false);}}
      catch{if(active){setSummary(null);setError(true);setLoading(false);}}
      finally{pending=false;}
    };
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);
    const resume=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[enabled,userId,revision,retry]);
  return {summary:enabled&&summaryUser===userId?summary:null,loading:enabled&&loading,error:enabled&&error,retry:()=>setRetry(value=>value+1)};
}
