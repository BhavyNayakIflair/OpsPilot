const API_BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('opspilot_token');
  const orgId = localStorage.getItem('opspilot_org_id');

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (orgId) {
    headers['X-Org-ID'] = orgId;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errDetail = 'Request failed';
    let errorData: unknown;
    try {
      errorData = await res.json();
      if (typeof errorData === 'object' && errorData !== null && 'detail' in errorData) {
        const detail = errorData.detail;
        errDetail = typeof detail === 'string' ? detail : JSON.stringify(detail);
      } else if (typeof errorData === 'object' && errorData !== null && 'message' in errorData && typeof errorData.message === 'string') {
        errDetail = errorData.message;
      } else {
        errDetail = JSON.stringify(errorData);
      }
    } catch {
      errDetail = await res.text();
    }
    throw new ApiError(res.status, errDetail, errorData);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return undefined as T;
  return res.json();
}
