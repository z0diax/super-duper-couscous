import { useEffect, useState } from 'react';

export type OperationalResource = 'document' | 'payroll' | 'leave' | 'ewp' | 'dashboard';
const eventName='hrmdo:refresh-resource';

export function invalidateResource(resource: OperationalResource): void {
  window.dispatchEvent(new CustomEvent<OperationalResource>(eventName,{detail:resource}));
}

export function useResourceInvalidation(resource: OperationalResource): number {
  const [generation,setGeneration]=useState(0);
  useEffect(()=>{
    const listener=(event:Event)=>{if((event as CustomEvent<OperationalResource>).detail===resource)setGeneration(value=>value+1);};
    window.addEventListener(eventName,listener);
    return()=>window.removeEventListener(eventName,listener);
  },[resource]);
  return generation;
}
