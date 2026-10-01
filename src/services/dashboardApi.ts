import { request } from './http';
export interface DashboardTask { id:string; tracking_number:string; title:string; document_type:string; source_office:string; status:string; current_step_number:number; total_steps:number; current_step_name:string|null }
export interface DashboardOutside { id:string; trackingNumber:string; documentType:string; currentLocation:string; destinationOffice:string|null }
export interface DashboardActivity { id:string; summary:string; actorName:string; timestamp:string }
export interface DashboardSummary { metrics:{total:number;in_flight:number;pending:number;concluded:number;outside:number;actionable:number};tasks:DashboardTask[];outside:DashboardOutside[];activity:DashboardActivity[] }
export const getDashboardSummary=():Promise<DashboardSummary>=>request('dashboard.php');
