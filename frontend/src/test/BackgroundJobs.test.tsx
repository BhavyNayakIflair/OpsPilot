import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityCenter } from '../components/layout/ActivityCenter';
import type { BackgroundJob } from '../lib/jobs';
import { submitQuoteAgentJob, submitQuoteDraftJob } from '../lib/jobs';
import * as apiModule from '../lib/api';

const mockNavigate = vi.fn();
const mockAcknowledge = vi.fn();
const mockRetry = vi.fn();
const mockRefreshJob = vi.fn();
const mockUpsertJob = vi.fn();

let mockJobsMap = new Map<string, BackgroundJob>();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'test@example.com', role: 'owner' } }),
}));

vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({
    jobs: mockJobsMap,
    loading: false,
    error: '',
    acknowledge: mockAcknowledge,
    retry: mockRetry,
    refreshJob: mockRefreshJob,
    upsertJob: mockUpsertJob,
  }),
}));

const sampleRunningJob: BackgroundJob = {
  id: 'job-run-1',
  org_id: 'org-1',
  user_id: 'u-1',
  job_type: 'quote_draft',
  status: 'running',
  progress: 50,
  message: 'Drafting quote items',
  input: { lead_id: 'lead-100' },
  result_ref_type: null,
  result_ref_id: null,
  error_code: null,
  error_message: null,
  subject_type: 'lead',
  subject_id: 'lead-100',
  subject_label: 'Lead Acme',
  workflow_run_id: null,
  retry_of_job_id: null,
  attempts: 1,
  max_attempts: 2,
  version: 2,
  queued_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: null,
  heartbeat_at: new Date().toISOString(),
  acknowledged_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleApprovalJob: BackgroundJob = {
  id: 'job-app-2',
  org_id: 'org-1',
  user_id: 'u-1',
  job_type: 'quote_agent',
  status: 'waiting_for_approval',
  progress: 100,
  message: 'Quote flagged for high discount',
  input: { lead_id: 'lead-200' },
  result_ref_type: null,
  result_ref_id: null,
  error_code: null,
  error_message: null,
  subject_type: 'lead',
  subject_id: 'lead-200',
  subject_label: 'Lead Beta',
  workflow_run_id: 'wf-1',
  retry_of_job_id: null,
  attempts: 1,
  max_attempts: 2,
  version: 3,
  queued_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: null,
  heartbeat_at: new Date().toISOString(),
  acknowledged_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleCompletedJob: BackgroundJob = {
  id: 'job-done-3',
  org_id: 'org-1',
  user_id: 'u-1',
  job_type: 'quote_draft',
  status: 'completed',
  progress: 100,
  message: 'Draft created successfully',
  input: { lead_id: 'lead-300' },
  result_ref_type: 'quote',
  result_ref_id: 'q-300',
  error_code: null,
  error_message: null,
  subject_type: 'lead',
  subject_id: 'lead-300',
  subject_label: 'Lead Gamma',
  workflow_run_id: null,
  retry_of_job_id: null,
  attempts: 1,
  max_attempts: 2,
  version: 4,
  queued_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  heartbeat_at: new Date().toISOString(),
  acknowledged_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleFailedJob: BackgroundJob = {
  id: 'job-fail-4',
  org_id: 'org-1',
  user_id: 'u-1',
  job_type: 'quote_agent',
  status: 'failed',
  progress: 100,
  message: 'Worker timeout',
  input: { lead_id: 'lead-400' },
  result_ref_type: null,
  result_ref_id: null,
  error_code: 'worker_timeout',
  error_message: 'Worker process stopped unexpectedly',
  subject_type: 'lead',
  subject_id: 'lead-400',
  subject_label: 'Lead Delta',
  workflow_run_id: null,
  retry_of_job_id: null,
  attempts: 2,
  max_attempts: 2,
  version: 4,
  queued_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  heartbeat_at: new Date().toISOString(),
  acknowledged_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ActivityCenter Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobsMap = new Map();
  });

  it('renders correct badge count for active jobs', () => {
    mockJobsMap.set(sampleRunningJob.id, sampleRunningJob);
    mockJobsMap.set(sampleApprovalJob.id, sampleApprovalJob);
    mockJobsMap.set(sampleCompletedJob.id, sampleCompletedJob);

    render(
      <MemoryRouter>
        <ActivityCenter />
      </MemoryRouter>
    );

    // active jobs = running (1) + waiting_for_approval (1) = 2
    const badge = screen.getByText('2');
    expect(badge).toBeInTheDocument();
  });

  it('does not render badge number when no active jobs exist', () => {
    mockJobsMap.set(sampleCompletedJob.id, sampleCompletedJob);

    render(
      <MemoryRouter>
        <ActivityCenter />
      </MemoryRouter>
    );

    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('navigates to /approvals when clicking open approvals on a waiting_for_approval job', async () => {
    mockJobsMap.set(sampleApprovalJob.id, sampleApprovalJob);

    render(
      <MemoryRouter>
        <ActivityCenter />
      </MemoryRouter>
    );

    // Open activity center panel
    const toggleBtn = screen.getByRole('button', { name: /Background jobs/i });
    fireEvent.click(toggleBtn);

    // Click the open approvals button
    const approvalsBtn = await screen.findByRole('button', { name: /Open approvals/i });
    fireEvent.click(approvalsBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/approvals');
  });

  it('navigates to /quotes?job=id when clicking view on a standard job', async () => {
    mockJobsMap.set(sampleRunningJob.id, sampleRunningJob);

    render(
      <MemoryRouter>
        <ActivityCenter />
      </MemoryRouter>
    );

    const toggleBtn = screen.getByRole('button', { name: /Background jobs/i });
    fireEvent.click(toggleBtn);

    const viewBtn = await screen.findByRole('button', { name: /View/i });
    fireEvent.click(viewBtn);

    expect(mockNavigate).toHaveBeenCalledWith(`/quotes?job=${encodeURIComponent(sampleRunningJob.id)}`);
  });

  it('handles dismiss action on completed jobs by calling acknowledge', async () => {
    mockJobsMap.set(sampleCompletedJob.id, sampleCompletedJob);

    render(
      <MemoryRouter>
        <ActivityCenter />
      </MemoryRouter>
    );

    const toggleBtn = screen.getByRole('button', { name: /Background jobs/i });
    fireEvent.click(toggleBtn);

    const dismissBtn = await screen.findByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissBtn);

    expect(mockAcknowledge).toHaveBeenCalledWith(sampleCompletedJob.id);
  });

  it('handles retry action on failed jobs by calling retry', async () => {
    mockRetry.mockResolvedValueOnce({
      job_id: 'job-fail-4-retry',
      status: 'queued',
      message: 'Retrying job',
      deduplicated: false,
    });
    mockJobsMap.set(sampleFailedJob.id, sampleFailedJob);

    render(
      <MemoryRouter>
        <ActivityCenter />
      </MemoryRouter>
    );

    const toggleBtn = screen.getByRole('button', { name: /Background jobs/i });
    fireEvent.click(toggleBtn);

    const retryBtn = await screen.findByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    expect(mockRetry).toHaveBeenCalledWith(sampleFailedJob.id);
  });
});

describe('Double-click idempotency & Job Submission Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits quote draft job with Idempotency-Key header', async () => {
    const apiSpy = vi.spyOn(apiModule, 'apiRequest').mockResolvedValueOnce({
      job_id: 'job-new-1',
      status: 'queued',
      message: 'Job queued',
      deduplicated: false,
    });

    const key = 'test-idemp-key-1';
    const payload = { lead_id: 'lead-test-1', currency: 'USD' };

    const submission = await submitQuoteDraftJob(payload, key);

    expect(apiSpy).toHaveBeenCalledWith(
      '/quotes/draft-async',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      })
    );
    expect(submission.job_id).toBe('job-new-1');
  });

  it('submits quote agent job with Idempotency-Key header', async () => {
    const apiSpy = vi.spyOn(apiModule, 'apiRequest').mockResolvedValueOnce({
      job_id: 'job-agent-new-1',
      status: 'queued',
      message: 'Agent job queued',
      deduplicated: false,
    });

    const key = 'test-idemp-agent-key-2';
    const payload = { lead_id: 'lead-test-2' };

    const submission = await submitQuoteAgentJob(payload, key);

    expect(apiSpy).toHaveBeenCalledWith(
      '/workflows/quote-agent/run-async',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      })
    );
    expect(submission.job_id).toBe('job-agent-new-1');
  });

  it('prevents double submission through active request lock guard', async () => {
    let callCount = 0;
    const apiSpy = vi.spyOn(apiModule, 'apiRequest').mockImplementation(async () => {
      callCount++;
      // Simulate delay in network call
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        job_id: 'job-single-1',
        status: 'queued',
        message: 'Job queued',
        deduplicated: false,
      };
    });

    // Emulate the in-flight guard pattern used in Quotes.tsx and Operations.tsx
    let inFlight = false;
    async function guardedSubmit() {
      if (inFlight) return null;
      inFlight = true;
      try {
        return await submitQuoteDraftJob({ lead_id: 'lead-guarded' }, 'key-guard-1');
      } finally {
        inFlight = false;
      }
    }

    // Trigger rapid concurrent clicks
    const [first, second] = await Promise.all([
      guardedSubmit(),
      guardedSubmit(),
    ]);

    expect(callCount).toBe(1);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});
