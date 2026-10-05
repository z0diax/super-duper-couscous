import { apiEndpoint, request, ApiError } from './http';
import type { AuditEvent, DocumentClassification, DocumentRecord, DocumentStatus, PriorityLevel, PayrollItem } from '../types';
import type { UserAccount } from '../types';
import { uploadFiles, deleteUnattachedUpload, downloadUrl } from './http';
import { invalidateResource } from './resourceInvalidation';

export const getRoutingPeople = async (): Promise<UserAccount[]> => (await request('document_routing.php')).data;
export async function deleteRoutedDocument(documentId: string): Promise<boolean> {
  const result=await request('document_routing.php',{method:'POST',body:JSON.stringify({action:'delete',documentId})});
  invalidateResource('document');invalidateResource('dashboard');
  return result.data.deleted===true;
}
export async function sendRoutingAction(data: Record<string, unknown>): Promise<DocumentRecord> {
  const result=await request('document_routing.php',{method:'POST',body:JSON.stringify(data)});
  invalidateResource('document');invalidateResource('dashboard');
  return result.data;
}
export async function registerRoutedDocument(data: Record<string, unknown>, files: File[]): Promise<DocumentRecord> {
  const uploaded: Awaited<ReturnType<typeof uploadFiles>>=[];
  try {
    for(const file of files) uploaded.push(...await uploadFiles([file]));
    return await sendRoutingAction({...data,action:'register',files:uploaded});
  } catch(error) {
    if(error instanceof ApiError) await Promise.allSettled(uploaded.map(file=>deleteUnattachedUpload(file.id)));
    throw error;
  }
}

export interface DocumentDetailPayload { data: DocumentRecord; auditEvents: AuditEvent[]; payrollItem?: PayrollItem | null }
export interface ShellDocumentRow {
  id: string; trackingNumber: string; title: string; classification: DocumentClassification;
  documentType: string; sourceOffice: string; status: DocumentStatus; currentLocation?: string;
}
export interface ShellDocumentNotification {
  id: string; documentId: string; trackingNumber: string; status: DocumentStatus; currentLocation?: string;
  title: string; message: string; timestamp: string; tone: 'blue' | 'amber';
}
export interface DocumentShellSummary { sidebarDocumentTaskCount: number; documentNotifications: ShellDocumentNotification[] }
interface ShellSearchWireRow {
  id: string; tracking_number: string; title: string; classification: DocumentClassification;
  document_type: string; source_office: string; status: DocumentStatus; current_location: string | null;
}
interface ShellNotificationWireRow {
  id: string; documentId: string; trackingNumber: string; status: DocumentStatus; currentLocation: string | null;
  title: string; message: string; timestamp: string; tone: 'blue' | 'amber';
}
const shellRow = (row: ShellSearchWireRow): ShellDocumentRow => ({
  id:row.id,trackingNumber:row.tracking_number,title:row.title,classification:row.classification,
  documentType:row.document_type,sourceOffice:row.source_office,status:row.status,currentLocation:row.current_location || undefined,
});
export async function searchShellDocuments(query: string): Promise<{ exact: ShellDocumentRow | null; data: ShellDocumentRow[]; total: number }> {
  const result=await request(`document_search.php?q=${encodeURIComponent(query)}`) as { exact: ShellSearchWireRow | null; items: ShellSearchWireRow[]; total: number };
  return { exact:result.exact?shellRow(result.exact):null,data:result.items.map(shellRow),total:result.total };
}
export async function getDocumentShellSummary(): Promise<DocumentShellSummary> {
  const result=await request('document_shell_summary.php') as { sidebarDocumentTaskCount: number; documentNotifications: ShellNotificationWireRow[] };
  return { sidebarDocumentTaskCount:Number(result.sidebarDocumentTaskCount), documentNotifications:result.documentNotifications.map(item=>({...item,currentLocation:item.currentLocation || undefined})) };
}
export type DocumentTaskQueue = 'my_tasks' | 'team_queue' | 'returned' | 'waiting' | 'ready_for_release' | 'completed';
export interface DocumentTaskRow extends RegistryRow { assignedDisplayName?: string }
export interface DocumentTaskPage {
  data: DocumentTaskRow[];
  pagination: RegistryPage['pagination'];
  queueCounts: Record<DocumentTaskQueue, number>;
}

export interface RegistryRow {
  routingMode?: 'dynamic';
  id: string; trackingNumber: string; title: string; subject: string;
  sourceOffice: string; senderName: string; classification: DocumentClassification;
  documentType: string; employmentClassification?: string; priority: PriorityLevel;
  status: DocumentStatus; dateReceived: string; currentStepNumber: number;
  totalSteps: number; currentLocation?: string; currentStepName?: string; isLegacyV1: boolean;
}
interface RegistryWireRow {
  routing_mode?: 'dynamic' | null;
  id: string; tracking_number: string; title: string; subject: string | null;
  source_office: string; sender_name: string; classification: DocumentClassification;
  document_type: string; employment_classification: string | null; priority: PriorityLevel;
  status: DocumentStatus; date_received: string; current_step_number: number;
  total_steps: number; current_location: string | null; current_step_name: string | null;
  is_legacy_v1: number | null;
}
interface TaskWireRow extends RegistryWireRow { assigned_display_name: string | null }
export interface RegistryFilters {
  dataset: 'all' | 'v1' | 'v2'; classification: string; status: string; priority: string;
}
export interface RegistryCounts { all: number; v1: number; v2: number; outside: number }
export interface RegistryPage {
  data: RegistryRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  registryCounts: RegistryCounts;
}
const paramsFor = (filters: RegistryFilters) => {
  const params = new URLSearchParams({ registry: '1' });
  if (filters.dataset !== 'all') params.set('isLegacyV1', filters.dataset === 'v1' ? '1' : '0');
  for (const [key, value] of [['classification', filters.classification], ['status', filters.status], ['priority', filters.priority]]) {
    if (value !== 'all') params.set(key, value);
  }
  return params;
};
export async function listRegistryDocuments(filters: RegistryFilters, page = 1, limit = 25): Promise<RegistryPage> {
  const params = paramsFor(filters); params.set('page', String(page)); params.set('limit', String(limit));
  const result = await request(`documents.php?${params}`) as { data: RegistryWireRow[]; pagination: RegistryPage['pagination']; registryCounts: RegistryCounts };
  return { pagination: result.pagination, registryCounts: result.registryCounts, data: result.data.map(row => ({
    routingMode:row.routing_mode || undefined, id: row.id, trackingNumber: row.tracking_number, title: row.title, subject: row.subject || '',
    sourceOffice: row.source_office, senderName: row.sender_name, classification: row.classification,
    documentType: row.document_type, employmentClassification: row.employment_classification || undefined,
    priority: row.priority, status: row.status, dateReceived: row.date_received,
    currentStepNumber: Number(row.current_step_number), totalSteps: Number(row.total_steps),
    currentLocation: row.current_location || undefined, currentStepName: row.current_step_name || undefined,
    isLegacyV1: Number(row.is_legacy_v1) === 1,
  })) };
}
export async function listMyDocumentTasks(queue: DocumentTaskQueue, filters: { classification?: string; search?: string } = {}, page = 1, limit = 25): Promise<DocumentTaskPage> {
  const params=new URLSearchParams({ queue, page:String(page), limit:String(limit) });
  if (filters.classification) params.set('classification',filters.classification);
  if (filters.search?.trim()) params.set('search',filters.search);
  const result=await request(`document_tasks.php?${params}`) as { data: TaskWireRow[]; pagination: DocumentTaskPage['pagination']; queueCounts: DocumentTaskPage['queueCounts'] };
  return { pagination:result.pagination, queueCounts:result.queueCounts, data:result.data.map(row=>({
    routingMode:row.routing_mode || undefined, id:row.id, trackingNumber:row.tracking_number, title:row.title, subject:row.subject || '',
    sourceOffice:row.source_office, senderName:row.sender_name, classification:row.classification,
    documentType:row.document_type, employmentClassification:row.employment_classification || undefined,
    priority:row.priority, status:row.status, dateReceived:row.date_received,
    currentStepNumber:Number(row.current_step_number), totalSteps:Number(row.total_steps),
    currentLocation:row.current_location || undefined, currentStepName:row.current_step_name || undefined,
    assignedDisplayName:row.assigned_display_name || undefined, isLegacyV1:Number(row.is_legacy_v1)===1,
  })) };
}
const documentDetail = async (query: string): Promise<DocumentDetailPayload> => {
  const payload: DocumentDetailPayload = await request(`documents.php?${query}`);
  if(payload.data.routingMode==='dynamic') payload.data.attachments=payload.data.attachments.map(file=>({...file,url:downloadUrl(file.id)}));
  return payload;
};
export const getDocumentDetailById = (id: string): Promise<DocumentDetailPayload> =>
  documentDetail(`id=${encodeURIComponent(id)}`);
export const getDocumentDetailByTrackingNumber = (value: string): Promise<DocumentDetailPayload> =>
  documentDetail(`trackingNumber=${encodeURIComponent(value)}`);
export const getDocumentDetailByBarcode = (value: string): Promise<DocumentDetailPayload> =>
  documentDetail(`barcode=${encodeURIComponent(value)}`);
export async function exportRegistryCsv(filters: RegistryFilters): Promise<void> {
  const response = await fetch(`${apiEndpoint('document_registry_export.php')}?${paramsFor(filters)}`, { credentials: 'same-origin', headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new ApiError('Could not export the registry. Please try again.', response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = `HRMDO_DTS_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
