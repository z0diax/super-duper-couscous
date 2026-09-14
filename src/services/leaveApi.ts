import { request } from './http';
import type { LeaveApplicationRecord, LeaveType } from '../types';

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
