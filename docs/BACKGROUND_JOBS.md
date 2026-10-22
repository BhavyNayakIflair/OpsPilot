# Persistent Background Jobs

## Audit

Checked against the source on 2026-10-22 before implementation. Findings F1–F15
are confirmed, with one clarification: `docker-compose.yml` already runs Redis
but the backend requirements do not install the Redis client or ARQ, so the
current `get_redis_client()` path falls back to process-local memory. The
existing async quote test expects HTTP 202 and accepts the queued/running/
completed status contract. The junk `backend/=4.0` file was removed.

The current async quote route starts an unretained `asyncio.create_task`; job
state is Redis-or-memory in `app/ai/jobs.py`, and its event generator is capped
at 120 half-second polls. Both legacy status endpoints read that state without
checking its `meta.org_id`. The draft worker persists ORM line-item objects,
serializes with `default=str`, and omits provider/degraded metadata; quote
persistence commits internally. The synchronous quote and quote-agent routes
await their full generation. Quote-agent approval checks pending state before
resuming without a conditional update, and graph execution starts from the
initial state whenever no approval decision is provided.

The frontend keeps quote draft/agent status in page-local state, calls the
synchronous endpoints, uses artificial provider-attempt timers, and does not
use EventSource. `AppLayout` places the keyed page outlet below its persistent
navbar, which is an appropriate mount point for shared job state. The nginx
configuration has no API read timeout or SSE buffering directives. Compose
does not pass provider configuration identically to the API and worker, and
CI has no Redis service.

Baseline results (commands run before implementation):

| Suite | Result |
| --- | --- |
| `PYTHONPATH=backend .venv/bin/pytest backend/tests -q` | 107 passed |
| `cd frontend && npx vitest run` | 44 passed, 1 failed (leave-day text assertion in `OperationsManagement.test.tsx`) |
| `cd frontend && npm run lint` | Exit 0; existing lint warnings |
| `cd frontend && npm run build` | Failed: TS6133, unused `AvatarStack` in `OperationsManagement.tsx` |

### Manual verification

Start PostgreSQL, Redis, the API, and a worker with a deliberately slow test
provider. Submit a quote draft, navigate to another page and perform ordinary
CRUD, return to Quotes, refresh during execution, and restart the API. Kill the
worker during a job and verify recovery; double-submit and confirm one job and
one quote; finally verify another organization cannot read the job. Record any
scenarios that cannot be run in the implementation report.
