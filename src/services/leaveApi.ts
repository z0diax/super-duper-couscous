import { request } from './http';
import type { LeaveApplicationRecord, LeaveType, EwpRecord, AuditEvent } from '../types';

export type LeaveSuggestionCategory = 'medical' | 'destination';
export interface LeaveSuggestion { id: string; value: string }
export const leaveSuggestionCategory = (type: LeaveType): LeaveSuggestionCategory | undefined =>
  type === 'Sick Leave' ? 'medical' : type === 'Vacation Leave' || type === 'Special Privilege Leave' ? 'destination' : undefined;
export const searchLeaveSuggestions = (category: LeaveSuggestionCategory, q: string, locationType: string, signal?: AbortSignal): Promise<{ items: LeaveSuggestion[] }> =>
  request(`leave_suggestions.php?${new URLSearchParams({ category, q, locationType })}`, { signal });
export const saveLeaveSuggestion = (category: LeaveSuggestionCategory, value: string, locationType: string): Promise<{ item: LeaveSuggestion; created: boolean }> =>
  request('leave_suggestions.php', { method: 'POST', body: JSON.stringify({ category, value, locationType }) });

export interface LeaveRegistryResponse {
  items: LeaveApplicationRecord[];
  pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number };
  summary: { total: number; forComputation: number; processing: number; forSignature: number; onHold: number; released: number };
  taskCount: number;
  offices: string[];
  leaveTypes: LeaveType[];
  statuses: string[];
}
export interface LeaveRegistryQuery { q?: string; status?: string; leaveType?: string; office?: string; filedFrom?: string; filedTo?: string; leaveDate?: string; page?: number; pageSize?: number; sort?: string }
export const queryLeaveRegistry = (query: LeaveRegistryQuery): Promise<LeaveRegistryResponse> => {
  const params=new URLSearchParams();
  for (const [key,value] of Object.entries(query)) if (value!==undefined && value!=='') params.set(key,String(value));
  return request(`leave.php?${params.toString()}`);
};
export const getLeaveDetail=(id:string):Promise<{record:LeaveApplicationRecord}>=>request(`leave_detail.php?id=${encodeURIComponent(id)}`);
export interface LeaveAuditPage { data:AuditEvent[];pagination:{page:number;limit:number;total:number;totalPages:number} }
export const getLeaveAudit=(id:string,page:number):Promise<LeaveAuditPage>=>request(`leave_audit.php?id=${encodeURIComponent(id)}&page=${page}&limit=10`);
export interface EwpPage { data:EwpRecord[];pagination:{page:number;limit:number;total:number;totalPages:number};summary:{total:number;amount:number;offices:number} }
export const queryEwp=(q:string,page:number,limit=10):Promise<EwpPage>=>{const params=new URLSearchParams({page:String(page),limit:String(limit)});if(q.trim())params.set('q',q.trim());return request(`ewp.php?${params}`);};
