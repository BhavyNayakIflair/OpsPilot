# Persistent Background Jobs

## Overview

OpsPilot employs an asynchronous, durable background jobs architecture for all long-running AI operations (such as AI Quote Drafting and Quote Agent Workflow runs). The system replaces ephemeral in-memory tasks with a database-backed state machine, Redis-backed worker queues via ARQ, heartbeat-driven crash recovery, idempotency protection, and Server-Sent Events (SSE) streaming for real-time frontend updates.

---

## Architecture

```
[ Client Browser ]
  │   ▲
  │   │ SSE (/jobs/stream)
  │   │
  ▼   │
[ FastAPI API ] ──(Transactional Write)──► [ PostgreSQL: background_jobs ]
  │                                                   ▲
  ├──(Enqueue Job ID)──► [ Redis / ARQ ]              │
                               │                      │
                               ▼                      │
                        [ ARQ Worker ] ───────────────┤ (Claim & Progress)
                        [ Reaper Task ] ──────────────┘ (Heartbeat Recovery)
```

1. **API Layer (`app/api/v1/endpoints/jobs.py`, `quotes.py`, `workflows.py`):**
   - Validates client requests and user permissions.
   - Enforces idempotency via `Idempotency-Key` headers and active fingerprint deduplication.
   - Writes new `BackgroundJob` record to PostgreSQL in `queued` state.
   - Enqueues job ID to Redis queue via ARQ.
   - Streams job state changes to connected clients via `/api/v1/jobs/stream`.

2. **Durable Storage (`app/models/job.py`):**
   - Single source of truth in PostgreSQL (`background_jobs` table).
   - Tracks job lifecycle, inputs, results, error metadata, subject association, attempt counters, and heartbeats.

3. **Worker Layer (`app/workers/main.py`, `runner.py`, `handlers/`):**
   - Independent worker process executing jobs asynchronously.
   - Atomically claims queued jobs via SQL row update (`queued` -> `running`).
   - Periodically updates `heartbeat_at` timestamp and reports step progress.
   - Executes domain-specific handler (`quote_draft` or `quote_agent`).

4. **Reaper Service (`app/workers/reaper.py`):**
   - Periodically scans for stale running jobs whose heartbeats have expired (`JOBS_STALE_HEARTBEAT_SECONDS`).
   - If attempts < `max_attempts`, requeues the job.
   - If attempts >= `max_attempts`, marks job as failed with `error_code="worker_lost"`.
   - If work was already committed (e.g. `result_ref_id` present), completes the job cleanly.
   - Purges terminal jobs older than `JOBS_RETENTION_DAYS`.

---

## State Machine

```
              ┌───────────────────────────┐
              │          Queued           │
              └─────────────┬─────────────┘
                            │ claim_job()
                            ▼
              ┌───────────────────────────┐
              │          Running          │
              └─────┬───────┬───────┬─────┘
                    │       │       │
    flagged/review  │       │ error │ completed
                    ▼       │       ▼
┌─────────────────────────┐ │ ┌───────────┐
│  waiting_for_approval   │ │ │ Completed │
└───────────┬─────────────┘ │ └───────────┘
            │ approved/     │
            │ rejected      ▼
            │         ┌───────────┐
            └────────►│  Failed   │
                      └───────────┘
```

| Status | Description | Is Active? |
| --- | --- | --- |
| `queued` | Submitted and waiting for an available worker | Yes |
| `running` | Worker claimed job and is executing steps | Yes |
| `waiting_for_approval` | Agent completed draft and requires human review | Yes |
| `completed` | Successfully finished with result payload | No (Terminal) |
| `failed` | Terminated with error code and description | No (Terminal) |
| `cancelled` | Cancelled by user or administrative action | No (Terminal) |

---

## Deduplication & Idempotency

OpsPilot protects against redundant LLM consumption and duplicate resource creation through a dual-guard mechanism:

1. **Client-side Double-Click Guard:**
   - Both `Quotes.tsx` and `Operations.tsx` track `inFlight` request locks via `useRef(false)` to prevent parallel button clicks.
2. **Idempotency-Key Header:**
   - Client generates a unique UUID or timestamped token per user intent.
   - A unique index on `(org_id, idempotency_key)` guarantees that resubmissions with identical keys return the original job immediately.
   - Resubmission with the same key but different request payload returns HTTP 422.
3. **Active Request Fingerprinting:**
   - SHA-256 hash computed over `(job_type, org_id, user_id, input)`.
   - A partial unique index prevents concurrent active jobs (`queued`, `running`, `waiting_for_approval`) with identical fingerprints.

---

## API Reference

### 1. List Jobs
- **Endpoint:** `GET /api/v1/jobs`
- **Query Params:**
  - `active`: boolean (filters for queued, running, waiting_for_approval)
  - `mine`: boolean (filters by current authenticated user)
  - `include_acknowledged`: boolean (includes dismissed jobs)
  - `job_type`: string
  - `status`: string
  - `limit`: integer (max 100)
- **Response:** `BackgroundJob[]`

### 2. Get Job Details
- **Endpoint:** `GET /api/v1/jobs/{job_id}`
- **Response:** `BackgroundJob`

### 3. Acknowledge / Dismiss Job
- **Endpoint:** `POST /api/v1/jobs/{job_id}/ack`
- **Response:** `BackgroundJob` with `acknowledged_at` set.

### 4. Retry Failed Job
- **Endpoint:** `POST /api/v1/jobs/{job_id}/retry`
- **Response:** `JobSubmission` containing new `job_id`.

### 5. Real-Time SSE Stream
- **Endpoint:** `GET /api/v1/jobs/stream`
- **Headers:** `Authorization: Bearer <token>`, `X-Org-ID: <org_id>`
- **Events:**
  - `snapshot`: Initial array of active/unacknowledged jobs for tenant.
  - `job`: Emitted whenever a job status, progress, or message changes.
  - `ping`: Keepalive heartbeat every 15 seconds.

---

## Frontend Integration

### `JobsProvider` (`frontend/src/context/JobsContext.tsx`)
Mounted globally in `AppLayout.tsx`. Connects to `/api/v1/jobs/stream`, caches jobs in a reactive `Map<string, BackgroundJob>`, and handles automatic reconnects with exponential backoff.

### Custom Hooks
- `useJobs()`: Access the full jobs map, loading state, and helper actions (`acknowledge`, `retry`, `refreshJob`).
- `useJobForSubject(jobType, subjectId)`: Retrieves the latest unacknowledged active or completed job associated with a specific subject (e.g. `leadId`).

### Components
- `ActivityCenter` (`frontend/src/components/layout/ActivityCenter.tsx`):
  - Accessible from top navigation header.
  - Displays dynamic badge with active job count.
  - Lists real-time progress bars, elapsed timers, and action buttons ("View", "Open approvals", "Retry", "Dismiss").
- `AIProgress` (`frontend/src/components/ui/AIProgress.tsx`):
  - In-page progress bar showing multi-step agent workflow progress, completion badges, and interactive result previews.

---

## Configuration Settings

| Environment Variable | Default | Description |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL for ARQ and PubSub |
| `JOBS_MAX_ACTIVE_PER_ORG` | `5` | Maximum concurrent active background jobs per tenant |
| `JOBS_STALE_HEARTBEAT_SECONDS` | `45` | Seconds of missing heartbeat before reaper considers job dead |
| `JOBS_RETENTION_DAYS` | `14` | Days before terminal jobs are permanently purged |
