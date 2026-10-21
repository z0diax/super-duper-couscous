import React, { useEffect, useRef, useState } from 'react';
import { FilePenLine, Trash2, X } from 'lucide-react';
import type { DocumentRecord } from '../types';
import { getDocumentForManagement, manageDocument } from '../services/documentApi';
import { ApiError } from '../services/http';
import { invalidateResource } from '../services/resourceInvalidation';

const textFields = [
  ['title','Title',300,true], ['subject','Subject',2000,false],
  ['sourceOffice','Source office',190,true], ['senderName','Sender name',190,false],
  ['senderContact','Sender contact',190,false],
] as const;
const fieldsFrom = (doc: DocumentRecord): Record<string,string> => ({
  title:doc.title, subject:doc.subject || '', description:doc.description || '',
  sourceOffice:doc.sourceOffice, senderName:doc.senderName || '', senderContact:doc.senderContact || '',
  sourceType:doc.sourceType, priority:doc.priority,
});

export function DocumentManagementModal({ documentId, intent, onClose, onSaved }: {
  documentId: string; intent: 'edit' | 'delete'; onClose: () => void; onSaved: () => void;
}) {
  const [doc,setDoc]=useState<DocumentRecord|null>(null);
  const [fields,setFields]=useState<Record<string,string>>({});
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0);
  const [saving,setSaving]=useState(false);
  const [conflict,setConflict]=useState(false);
  const pending=useRef(false);
  const dialogRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previousFocus=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return()=>{document.body.style.overflow=previousOverflow;previousFocus?.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');setConflict(false);
    getDocumentForManagement(documentId).then(value=>{
      if(active){setDoc(value);setFields(fieldsFrom(value));setReason('');setFieldErrors({});setLoading(false);}
    }).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:'Could not load the document.');setLoading(false);}});
    return()=>{active=false;};
  },[documentId,retry]);
  const correction=doc?.management?.mode==='correction';
  const allowed=intent==='delete'?doc?.management?.canDelete:doc?.management?.canEdit;
  const title=intent==='delete'?'Delete Document':correction?'Administrator Correction':'Edit Document';
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(pending.current || !doc?.management || !allowed || conflict)return;
    const invalid:Record<string,string>={};
    if(intent==='edit'){
      for(const [key,label,max,required] of textFields){
        if(required && !fields[key]?.trim())invalid[key]=`${label} is required.`;
        else if((fields[key]||'').length>max)invalid[key]=`Use at most ${max} characters.`;
      }
      if((fields.description||'').length>10000)invalid.description='Use at most 10000 characters.';
      if(correction && !reason.trim())invalid.reason='Explain why this correction is needed.';
    }
    if(reason.length>2000)invalid.reason='Use at most 2000 characters.';
    setFieldErrors(invalid);if(Object.keys(invalid).length)return;
    pending.current=true;setSaving(true);setError('');
    try {
      await manageDocument({action:intent==='delete'?'delete':correction?'correct':'edit',documentId,
        expectedVersion:doc.management.version,reason:reason.trim(),...(intent==='edit'?{fields}:{})});
      onSaved();
    }catch(cause){
      setError(cause instanceof Error?cause.message:'The change was not saved.');
      if(cause instanceof ApiError && [403,404,409].includes(cause.status)){
        setConflict(true);invalidateResource('document');
      }
    }finally{pending.current=false;setSaving(false);}
  };
  const fieldError=(key:string)=>fieldErrors[key]&&<span id={`edit-error-${key}`} className="mt-1 block text-xs text-rose-700">{fieldErrors[key]}</span>;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:p-6">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="document-management-title" tabIndex={-1} onKeyDown={event=>{
      if(event.key==='Escape' && !pending.current){event.preventDefault();onClose();}
      if(event.key==='Tab'){
        const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:enabled,input:enabled,select:enabled,textarea:enabled,[tabindex="0"]')||[]).filter(element=>element.getClientRects().length>0);
        const first=items[0],last=items[items.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }} className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 bg-slate-900 p-5 text-white">
        <div className="flex items-center gap-3">{intent==='delete'?<Trash2 className="h-5 w-5"/>:<FilePenLine className="h-5 w-5"/>}<div><h2 id="document-management-title" className="font-bold">{title}</h2><p className="mt-1 text-xs text-slate-300">{intent==='delete'?'Confirm removal of an unprocessed record':correction?'Restricted metadata correction with an audit reason':'Update document information before processing begins'}</p></div></div>
        <button type="button" aria-label="Close document management" disabled={saving} onClick={onClose} className="rounded p-1 hover:bg-slate-700 disabled:opacity-50"><X className="h-5 w-5"/></button>
      </header>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-5 overflow-y-auto p-5">
          {loading?<p role="status">Loading document…</p>:doc&&<>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><label className="block text-xs font-semibold text-slate-600">Tracking number<input readOnly value={doc.trackingNumber} className="mt-1 w-full bg-transparent font-mono text-sm text-slate-900"/></label>{intent==='delete'&&<p className="mt-2 font-semibold text-slate-900">{doc.title}</p>}</div>
            {!allowed&&<p role="alert" className="text-sm text-amber-800">{doc.management?.restriction || 'You are not authorized to change this document.'}</p>}
            {intent==='delete'?<p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Deletion removes this record from the registry and active queues and revokes access to its attachments. The deletion audit is retained.</p>:<>
              <fieldset disabled={saving || !allowed || conflict} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Document information</legend>
                {textFields.map(([key,label,max,required])=><label key={key} className="text-xs font-semibold text-slate-700">{label}{required?' *':''}<input value={fields[key]||''} maxLength={max} required={required} aria-label={label+(required?' *':'')} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key]?`edit-error-${key}`:undefined} onChange={event=>setFields(previous=>({...previous,[key]:event.target.value}))} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm font-normal"/>{fieldError(key)}</label>)}
                <label className="text-xs font-semibold text-slate-700">Source type<select aria-label="Source type" value={fields.sourceType||'Internal'} onChange={event=>setFields(previous=>({...previous,sourceType:event.target.value}))} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm"><option>Internal</option><option>External</option></select></label>
                <label className="text-xs font-semibold text-slate-700">Priority<select aria-label="Priority" value={fields.priority||'Routine'} onChange={event=>setFields(previous=>({...previous,priority:event.target.value}))} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm"><option>Routine</option><option>Priority</option><option>Urgent</option></select></label>
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Description<textarea aria-label="Description" aria-describedby={fieldErrors.description?'edit-error-description':undefined} rows={3} maxLength={10000} value={fields.description||''} aria-invalid={!!fieldErrors.description} onChange={event=>setFields(previous=>({...previous,description:event.target.value}))} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm font-normal"/>{fieldError('description')}</label>
              </fieldset>
              <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600"><p><strong>Classification:</strong> {doc.classification} · <strong>Document type:</strong> {doc.documentType}</p><p className="mt-1">Classification, document type and workflow assignments stay read-only to preserve the registered workflow and routing history.</p></div>
            </>}
            <label className="block text-xs font-semibold text-slate-700">{intent==='delete'?'Deletion reason (optional)':correction?'Correction reason *':'Edit reason (optional)'}<textarea aria-label={intent==='delete'?'Deletion reason (optional)':correction?'Correction reason *':'Edit reason (optional)'} aria-describedby={fieldErrors.reason?'edit-error-reason':undefined} value={reason} maxLength={2000} rows={2} disabled={saving || !allowed || conflict} aria-invalid={!!fieldErrors.reason} onChange={event=>setReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm font-normal"/>{fieldError('reason')}</label>
          </>}
          {error&&<div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}{(!doc || conflict)&&<button type="button" onClick={()=>setRetry(value=>value+1)} className="ml-2 font-semibold underline">Reload latest document</button>}</div>}
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-700">Cancel</button><button type="submit" disabled={loading || saving || !allowed || conflict} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${intent==='delete'?'bg-rose-600':'bg-blue-600'}`}>{saving?'Saving…':intent==='delete'?'Delete Document':correction?'Save Correction':'Save Changes'}</button></footer>
      </form>
    </section>
  </div>;
}
