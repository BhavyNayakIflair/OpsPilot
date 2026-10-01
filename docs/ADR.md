# Architecture Decision Records (ADR) - OpsPilot

## ADR 001: Backend Framework & Asynchronous Architecture
- **Status:** Accepted
- **Context:** OpsPilot is a high-throughput, agentic AI-native business operations platform for small IT services and software companies (5-50 employees). Workflows involve concurrent SSE streaming, background LLM agent tasks, vector search, and transactional ERP data.
- **Decision:** Use **FastAPI (async)** with **Python 3.12**, **Pydantic v2**, and **SQLAlchemy 2.x (async)**.
- **Consequences:** Provides native async I/O throughout, automatic OpenAPI generation, fast schema validation with Rust-backed Pydantic Core, and clean separation between API route handlers, service layer, and database repositories.

---

## ADR 002: Background Worker and Job Scheduler (arq vs Celery)
- **Status:** Accepted
- **Context:** The system needs scheduled tasks (weekly project health assessments, collections reminders, timesheet approval alerts) and asynchronous background agent runs. The choice was between `arq` and `Celery + Celery Beat`.
- **Decision:** Adopt **arq** (Async Redis Queue) for background jobs and cron scheduling.
- **Justification:**
  1. **Async-native:** OpsPilot is 100% async (`async`/`await`). `arq` runs directly on `asyncio` and `redis-py` (async), eliminating the need for synchronous thread pools or awkward `async_to_sync` bridges required by Celery.
  2. **Lightweight & Low Footprint:** Target customers are small IT companies (5-50 seats) who find Odoo too heavy and resource-intensive. `arq` uses a fraction of the RAM of Celery + Kombu + Celery Beat.
  3. **Built-in Cron Scheduling:** `arq` provides native in-process cron definitions (`cron(hour=..., minute=...)`) without needing a separate Beat scheduler daemon.
  4. **Job checkpointing:** Integrates directly with LangGraph async checkpointers.
- **Consequences:** All task functions must be `async def`. Redis is required for queue and pub/sub.

---

## ADR 003: Multi-Tenancy Strategy & Data Isolation
- **Status:** Accepted
- **Context:** OpsPilot is a multi-tenant SaaS serving independent IT organizations. Strict data isolation is required to prevent cross-tenant data leakage.
- **Decision:** Implement **row-level tenant isolation using `org_id`** on every tenant-scoped entity, enforced systematically at the repository and service layer.
- **Rules:**
  1. Every business query must include `org_id = current_user.org_id`.
  2. The service layer extracts `tenant_id` from authenticated session context and injects it into every read/write operation.
  3. Automated integration tests verify that cross-tenant access attempts return HTTP 404 or 403.
  4. No raw SQL or un-scoped queries permitted in route handlers.

---

## ADR 004: Money and Currency Representation
- **Status:** Accepted
- **Context:** The system handles quotes, invoices, expenses, payments, and multi-currency billing (USD, EUR, INR, GBP). Floating-point inaccuracies in currency calculations are unacceptable.
- **Decision:** Store all monetary amounts as **integer minor units** (e.g., cents, pence, paise) alongside an ISO 4217 currency code (e.g., `USD`, `EUR`, `INR`, `GBP`).
- **Consequences:** \$100.50 is stored as `10050` with currency `'USD'`. Display formatting is handled deterministically via helper utilities and frontend formatters.

---

## ADR 005: AI Model Gateway and Deterministic Mocking
- **Status:** Accepted
- **Context:** Agent workflows require multi-model routing (fast extraction vs. deep reasoning vs. independent review), cost budgeting, token tracking, and local development/testing without requiring paid API keys.
- **Decision:** Build a centralized **Model Gateway** abstraction with support for live LLM providers and a deterministic **Mock Provider**.
- **Justification:** The entire CI test suite, developer onboarding, and local evaluation must run 100% deterministically and offline when configured in mock mode.
- **Consequences:** Every LLM call logs latency, prompt/completion tokens, and USD cost into `model_requests`.

---

## ADR 006: LangGraph Agent Workflows with Human-in-the-Loop
- **Status:** Accepted
- **Context:** AI agents automate repetitive admin tasks (drafting invoices from timesheets, qualifying leads, flagging at-risk projects), but consequential actions (sending invoices, altering rates, client communications) must require human confirmation.
- **Decision:** Use **LangGraph** with a Postgres checkpointer. Agents produce draft entities and create pending approval records. High-risk actions interrupt the state machine, which resumes only upon human approval via SSE and REST endpoints.

---

## ADR 007: Database & Vector Search
- **Status:** Accepted
- **Context:** Need relational storage for ERP business records and semantic search for SOWs, contracts, and policies.
- **Decision:** **PostgreSQL 16 with pgvector extension** as the unified data store.
- **Justification:** Avoids running a separate vector database (e.g. Pinecone/Qdrant), keeping infrastructure simple, cohesive, and easily backup-able via standard Postgres tools.
