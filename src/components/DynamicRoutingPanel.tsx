import React, { useEffect, useState } from 'react';
import type { DocumentRecord, UserAccount } from '../types';
import { getRoutingPeople, sendRoutingAction } from '../services/documentApi';

export const DynamicRoutingPanel: React.FC<{document: DocumentRecord; currentUser: UserAccount; onSaved: () => void}> = ({document: doc, currentUser, onSaved}) => {
  const [people,setPeople]=useState<UserAccount[]>([]);
  const [action,setAction]=useState<'forward'|'complete'|null>(null);
  const [target,setTarget]=useState('');
  const [remarks,setRemarks]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [actionRevision,setActionRevision]=useState<number>();
  const current=doc.workflowSteps.find(step=>step.stepNumber===doc.currentStepNumber);
  const canAct=doc.status==='In_Progress' && current?.assignedTo.userId===currentUser.id;
  useEffect(()=>{
    let active=true;
    getRoutingPeople().then(data=>{if(active)setPeople(data);}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[doc.id]);
  const open=(value:'forward'|'complete')=>{setTarget('');setRemarks('');setError('');setActionRevision(doc.routingRevision);setAction(value);};
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy || !remarks.trim() || (action==='forward' && !target))return;
    setBusy(true);setError('');
    try {
      await sendRoutingAction({documentId:doc.id,action,targetUserId:target,remarks:remarks.trim(),routingRevision:actionRevision});
      setAction(null);onSaved();
    } catch(error) {setError(error instanceof Error?error.message:'Could not save the document.');onSaved();}
    finally {setBusy(false);}
  };
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-bold text-slate-800">Routing History</h3>
    <p className="text-sm text-slate-600">{doc.status==='Archived'?'Completed':`Person in Charge: ${current?.assignedTo.displayName}`}</p>
    {canAct && <div className="flex gap-2"><button type="button" onClick={()=>open('complete')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Complete</button><button type="button" onClick={()=>open('forward')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Forward</button></div>}
    {error && !action && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <ol className="space-y-3">{doc.custodyHistory?.map(move=><li key={move.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>{move.movementType==='DOCKETED_SENT'?'Docketed / Sent':move.movementType==='FORWARDED'?'Forwarded':'Completed'}</strong><p>{move.fromLocation}{move.movementType!=='COMPLETED' && ` → ${move.toLocation}`}</p><p className="mt-1 text-xs text-slate-500">{new Date(move.timestamp).toLocaleString()}</p>{move.remarks && <p className="mt-2 whitespace-pre-wrap">{move.remarks}</p>}</li>)}</ol>
    {action && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"><form role="dialog" aria-modal="true" aria-label={action==='forward'?'Forward Document':'Complete Document'} onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-2xl">
      <h3 className="text-base font-bold text-slate-900">{action==='forward'?'Forward Document':'Complete Document'}</h3>
      {action==='forward' && <label className="block text-sm font-semibold text-slate-700">Forward to *<select required value={target} onChange={e=>setTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"><option value="">Select employee...</option>{people.filter(person=>person.id!==currentUser.id).map(person=><option key={person.id} value={person.id}>{person.name} — {person.roleTitle}</option>)}</select></label>}
      <label className="block text-sm font-semibold text-slate-700">{action==='forward'?'Remarks / Instructions *':'Action / Remarks *'}<textarea required maxLength={10000} value={remarks} onChange={e=>setRemarks(e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 p-2" /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setAction(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={busy || !canAct || !remarks.trim() || (action==='forward' && !target)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Saving...':action==='forward'?'Forward Document':'Complete Document'}</button></div>
    </form></div>}
  </section>;
};
