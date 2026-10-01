import { request } from './http';
import type { DocumentRecord,PayrollBatch, PayrollItem, WorkGroup } from '../types';

export interface PayrollPage<T> { data:T[]; pagination:{page:number;limit:number;total:number;totalPages:number} }
export interface PayrollBatchList extends PayrollPage<PayrollBatch & {_canEdit?:boolean}> {metrics:{active:number;initial:number;completed:number;workGroups:number};offices:string[]}
export interface PayrollTaskBatch extends PayrollBatch { _assignedGroup?:WorkGroup|null }
export interface PayrollTaskPage extends PayrollPage<PayrollTaskBatch> { allTaskCount:number }
export interface PayrollHeldPage extends PayrollPage<PayrollItem> { batches:PayrollBatch[] }
export interface PayrollBatchDetail {
  batch:PayrollBatch;items:PayrollItem[];workGroups:WorkGroup[];
  itemCounts:{jow:number;casual:number;regular:number;held:number;ready:number;unresolved:number;ready_release:number;released:number};
  itemPagination:PayrollPage<PayrollItem>['pagination'];groupPagination:PayrollPage<WorkGroup>['pagination'];
}
export interface PayrollSearchBatch {id:string;batchNumber:string;batchBarcode?:string;payrollType:string;office:string;totalItemsCount:number;status:string}
export interface PayrollSearchItem {id:string;batchId:string;batchNumber:string;barcode:string;title:string;office:string;classificationType:string;employmentClassification?:string|null;status:string}
export interface PayrollSearchResult {exact:{batch:PayrollSearchBatch;item:PayrollSearchItem|null}|null;batches:PayrollSearchBatch[];items:PayrollSearchItem[];total:number}
export interface PayrollShellNotification {id:string;batchId:string;title:string;message:string;timestamp:string;tone:'blue'|'amber'|'violet'}
export interface PayrollShellSummary {sidebarPayrollTaskCount:number;payrollNotifications:PayrollShellNotification[]}

export const listPayrollBatches=(filters:{owned?:boolean;office?:string;stage?:string},page=1,limit=10):Promise<PayrollBatchList>=>{
  const params=new URLSearchParams({page:String(page),limit:String(limit)});
  if(filters.owned)params.set('owned','1');if(filters.office)params.set('office',filters.office);if(filters.stage)params.set('stage',filters.stage);
  return request(`payroll_batches.php?${params}`);
};
export const listSinglePayroll=(filters:{office?:string;stage?:string},page=1,limit=10):Promise<PayrollPage<DocumentRecord>>=>{
  const params=new URLSearchParams({page:String(page),limit:String(limit)});
  if(filters.office)params.set('office',filters.office);if(filters.stage)params.set('stage',filters.stage);
  return request(`payroll_single.php?${params}`);
};
export const listPayrollTasks=(search='',page=1,limit=25):Promise<PayrollTaskPage>=>{
  const params=new URLSearchParams({page:String(page),limit:String(limit)});if(search)params.set('search',search);
  return request(`payroll_tasks.php?${params}`);
};
export const listHeldPayrollItems=(page=1,limit=25):Promise<PayrollHeldPage>=>
  request(`payroll_held.php?page=${page}&limit=${limit}`);
export const getPayrollBatchDetail=(id:string,itemPage=1,groupPage=1,limit=25):Promise<PayrollBatchDetail>=>
  request(`payroll_batch.php?id=${encodeURIComponent(id)}&itemPage=${itemPage}&groupPage=${groupPage}&limit=${limit}`);
export const searchPayroll=(query:string):Promise<PayrollSearchResult>=>
  request(`payroll_search.php?q=${encodeURIComponent(query)}`);
export const getPayrollShellSummary=():Promise<PayrollShellSummary>=>request('payroll_shell_summary.php');
