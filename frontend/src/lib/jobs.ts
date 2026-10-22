import { apiRequest } from './api';

export type JobStatus = 'queued' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled';

export interface JobQuote {
  id: string;
  title: string;
  description?: string | null;
  lead_id: string;
  rate_card_id?: string | null;
  currency: string;
  discount_bps: number;
  tax_bps: number;
  terms?: string | null;
  line_items: { description: string; quantity: number; unit_price_cents: number }[];
}

export interface BackgroundJob {
  id: string;
  org_id: string;
  user_id: string | null;
  job_type: 'quote_draft' | 'quote_agent' | string;
  status: JobStatus;
  progress: number;
  message: string;
  input: Record<string, unknown>;
  result?: {
    quote?: JobQuote;
    assumptions?: string[];
    provider?: string;
    is_degraded?: boolean;
    outcome?: string;
    quote_id?: string;
    [key: string]: unknown;
  } | null;
  result_ref_type: string | null;
  result_ref_id: string | null;
  error_code: string | null;
  error_message: string | null;
  subject_type: string | null;
  subject_id: string | null;
  subject_label: string | null;
  workflow_run_id: string | null;
  retry_of_job_id: string | null;
  attempts: number;
  max_attempts: number;
  version: number;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
  steps?: { node_name: string; status: string; result_summary: string }[];
  originPath?: string;
}

export interface JobSubmission {
  job_id: string;
  status: JobStatus;
  message: string;
  deduplicated: boolean;
}

export async function listJobs(query = ''): Promise<BackgroundJob[]> {
  return apiRequest<BackgroundJob[]>(`/jobs${query ? `?${query}` : ''}`);
}

export async function getJob(jobId: string): Promise<BackgroundJob> {
  return apiRequest<BackgroundJob>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function submitQuoteDraftJob(
  data: Record<string, unknown>,
  idempotencyKey: string,
): Promise<JobSubmission> {
  return apiRequest<JobSubmission>('/quotes/draft-async', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(data),
  });
}

export async function submitQuoteAgentJob(
  data: Record<string, unknown>,
  idempotencyKey: string,
): Promise<JobSubmission> {
  return apiRequest<JobSubmission>('/workflows/quote-agent/run-async', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(data),
  });
}

export async function acknowledgeJob(jobId: string): Promise<BackgroundJob> {
  return apiRequest<BackgroundJob>(`/jobs/${encodeURIComponent(jobId)}/ack`, { method: 'POST' });
}

export async function retryJob(jobId: string): Promise<JobSubmission> {
  return apiRequest<JobSubmission>(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
}

export interface JobStreamCallbacks {
  onSnapshot: (jobs: BackgroundJob[]) => void;
  onJob: (job: BackgroundJob) => void;
  onReconnect: () => void;
}

export async function streamJobs(
  signal: AbortSignal,
  callbacks: JobStreamCallbacks,
): Promise<void> {
  const token = localStorage.getItem('opspilot_token');
  const orgId = localStorage.getItem('opspilot_org_id');
  const response = await fetch('/api/v1/jobs/stream', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'X-Org-ID': orgId } : {}),
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Job stream failed (${response.status})`);
  }
  if (!response.body) {
    throw new Error('Streaming responses are not supported by this browser');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reconnect = false;

  const handleBlock = (block: string) => {
    let eventName = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const parsed: unknown = JSON.parse(data.join('\n'));
    if (eventName === 'snapshot' && Array.isArray(parsed)) {
      callbacks.onSnapshot(parsed as BackgroundJob[]);
    } else if (eventName === 'job') {
      callbacks.onJob(parsed as BackgroundJob);
    } else if (eventName === 'reconnect') {
      reconnect = true;
    }
  };

  try {
    while (!signal.aborted && !reconnect) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) handleBlock(block);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (reconnect && !signal.aborted) callbacks.onReconnect();
}
