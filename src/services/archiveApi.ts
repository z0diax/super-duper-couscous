import { request } from './http';

export type ArchiveDataset = 'document' | 'ewp_records' | 'leave_requests';
export type ArchiveRow = Record<string, string | number | null>;

export interface ArchiveResponse {
  items: ArchiveRow[];
  counts: Record<ArchiveDataset, number>;
  pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number };
}

export const queryArchive = (query: { table: ArchiveDataset; q?: string; page?: number; pageSize?: number }): Promise<ArchiveResponse> => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return request(`archive.php?${params.toString()}`);
};
