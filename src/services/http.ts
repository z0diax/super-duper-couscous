let csrfToken = '';
export const apiEndpoint = (file: string) => {
  const state = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}../api/state.php`;
  return state.replace(/state\.php$/, file);
};
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function request(file: string, init: RequestInit = {}) {
  const response = await fetch(apiEndpoint(file), {
    ...init, credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init.body instanceof FormData ? {} : init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (payload.csrfToken) csrfToken = payload.csrfToken;
  if (!response.ok) throw new ApiError(payload.error || `Server returned ${response.status}.`, response.status);
  return payload;
}
export interface UploadedFile { id: string; name: string; sizeBytes: number; mimeType: string }
export async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const uploaded: UploadedFile[] = [];
  for (const file of files) {
    const body = new FormData(); body.append('file', file);
    uploaded.push((await request('files.php', { method: 'POST', body })).file);
  }
  return uploaded;
}
export const downloadUrl = (id: string) => `${apiEndpoint('files.php')}?id=${encodeURIComponent(id)}`;
