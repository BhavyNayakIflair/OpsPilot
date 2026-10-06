# OpsPilot AI Gateway Architecture & Runbook

OpsPilot features a **provider-neutral, zero-cost, production-grade AI gateway** that chains seven free no-card LLM services with automatic failover, quota awareness, semantic caching, structured-output validation, privacy classification, and full observability.

---

## 1. Gateway Architecture

```mermaid
flowchart TD
    Client[Application Service / User Request] --> Router[AIRouter]
    
    subgraph PrivacyLayer [Privacy & Security Layer]
        Router --> Classifier[Data Classifier (classify_data)]
        Classifier --> Injection[PromptInjectionGuard]
        Classifier --> PIIRedactor[PIIRedactor (Tier Internal Redaction)]
    end
    
    subgraph ReliabilityCore [Reliability & Headroom Core]
        PIIRedactor --> Cache{Semantic Cache (Redis)}
        Cache -- Cache Hit --> CachedReturn[Return Cached Response]
        Cache -- Cache Miss --> Profiles[Task Profile Candidate Chain]
        
        Profiles --> QuotaCheck{Quota Ledger (RPM/RPD/TPM)}
        QuotaCheck -- Limit >= 85% --> SkipRoute[Skip to Next Route]
        QuotaCheck -- Headroom OK --> BreakerCheck{Circuit Breaker}
        BreakerCheck -- Open --> SkipRoute
        BreakerCheck -- Closed / Half-Open --> Dispatch[Provider Dispatch]
    end
    
    subgraph FreeTierProviders [Free-Tier Provider Pool ($0.00 Forever)]
        Dispatch --> P_Gemini["Google Gemini 2.5 Flash / Embeddings"]
        Dispatch --> P_Groq["Groq (Llama 3.3 70B / 3.1 8B)"]
        Dispatch --> P_CF["Cloudflare Workers AI (Llama 3.1 8B / BGE)"]
        Dispatch --> P_Mistral["Mistral (Mistral Small / Codestral)"]
        Dispatch --> P_OpenRouter["OpenRouter (:free Models Only)"]
        Dispatch --> P_Ollama["Ollama Local (qwen2.5:3b / nomic-embed)"]
        Dispatch --> P_Mock["Deterministic Mock Adapter"]
    end
    
    subgraph ValidationAndObservability [Validation & Observability]
        P_Gemini & P_Groq & P_CF & P_Mistral & P_OpenRouter & P_Ollama & P_Mock --> OutputVal[Structured Pydantic Validation]
        OutputVal --> DecimalCheck[Rule R5: Decimal Arithmetic Verification]
        DecimalCheck --> PIIRestore[PII Restoration for Caller]
        PIIRestore --> Observability[Observability Engine]
        Observability --> Log[Structured JSON Logger]
        Observability --> Metrics[AIMetricsCollector (p50 / p95)]
        Observability --> Trace[Langfuse Tracing (Privacy Guarded)]
    end
    
    Observability --> ReturnResult[Validated Result / 503 Capacity Exhausted]
```

---

## 2. Hard Budget Guarantee ($0.00 Forever)

OpsPilot enforces strict cost guardrails in code:
- **Rule R3 Enforcement**: Zero paid accounts, no credit cards required, zero pay-as-you-go overflow.
- **Provider Refusals**: OpenRouter adapter refuses any model slug that does not strictly end in `:free`.
- **Pre-flight Quota Headroom**: The Redis-backed Quota Ledger refuses routing to any provider that has consumed ≥ 85% of its free-tier RPM, RPD, or TPM limits.
- **Automatic Degradation**: When cloud quotas are exhausted, requests automatically fall back to local offline Ollama models or deterministic fallback services.

---

## 3. Supported Free Providers & Setup Instructions

All supported providers offer completely free tiers without requiring a credit card:

| Provider | Supported Models | Free Tier Limits | API Key Dashboard |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `gemini-2.5-flash`, `text-embedding-004` (768d) | 15 RPM, 1M TPM, 1,500 RPD | [Google AI Studio](https://aistudio.google.com/) |
| **Groq** | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | 30 RPM, 14,400 RPD | [Groq Console](https://console.groq.com/) |
| **Cloudflare Workers AI** | `@cf/meta/llama-3.1-8b-instruct`, `@cf/baai/bge-base-en-v1.5` | 10,000 neurons / day | [Cloudflare Dashboard](https://dash.cloudflare.com/) |
| **Mistral AI** | `mistral-small-latest`, `codestral-latest` | 1 RPS, 500k TPM | [Mistral Console](https://console.mistral.ai/) |
| **OpenRouter** | Any `:free` model (e.g. `meta-llama/llama-3.3-70b-instruct:free`) | Model-specific free rate limits | [OpenRouter Keys](https://openrouter.ai/keys) |
| **Ollama (Local)** | `qwen2.5:3b-instruct`, `qwen3:4b`, `nomic-embed-text` | Unlimited (Local CPU / GPU) | `ollama run qwen2.5:3b-instruct` |
| **Mock** | Deterministic Mock Provider | Unlimited (in-memory test harness) | Built-in |

### Quick Configuration (`.env`)
```bash
# Gateway Selection
AI_ENABLED=true
LLM_PROVIDER=router

# Provide one or more free keys (the gateway will chain whatever is present)
GEMINI_API_KEY="your-gemini-key"
GROQ_API_KEY="your-groq-key"
CF_ACCOUNT_ID="your-cloudflare-account-id"
CF_API_TOKEN="your-cloudflare-token"
MISTRAL_API_KEY="your-mistral-key"
OPENROUTER_API_KEY="your-openrouter-key"

# Local Ollama URL
OLLAMA_BASE_URL="http://127.0.0.1:11434"
```

---

## 4. Task Profile Fallback Matrix

Each business operation is registered under an explicit task profile with tuned timeouts, schemas, and fallback chains:

| Task Profile | Primary Route | Failover Route 1 | Failover Route 2 | Local / Safe Fallback |
| :--- | :--- | :--- | :--- | :--- |
| **`quote_draft`** | Gemini 2.5 Flash | Groq Llama 3.3 70B | Cloudflare Llama 3.1 8B | Ollama `qwen2.5:3b-instruct` |
| **`extract_json`** | Groq Llama 3.1 8B | Gemini 2.5 Flash | Cloudflare Llama 3.1 8B | Ollama `qwen2.5:3b-instruct` |
| **`billing_explain`** | Gemini 2.5 Flash | Groq Llama 3.3 70B | Mistral Small | Ollama `qwen2.5:3b-instruct` |
| **`migration_map`** | Deterministic Fuzzy | Groq Llama 3.1 8B | Gemini 2.5 Flash | Mock / Passthrough |
| **`rag_answer`** | Gemini 2.5 Flash | Groq Llama 3.3 70B | Mistral Small | Degraded Lexical Search |
| **`rag_embed`** | Gemini `text-embedding-004` (768d) | Cloudflare `bge-base-en-v1.5` (768d) | Ollama `nomic-embed-text` | Deterministic Hash Vector |
| **`summarize_long`**| Gemini 2.5 Flash | Mistral Small | Ollama `qwen3:4b` | Ollama `qwen2.5:3b-instruct` |

---

## 5. Privacy & Safety Matrix (Rule R9 & Section 7.7)

OpsPilot classifies all requests into 3 data tiers:

```
+-------------------+-----------------------------------------+------------------------------------------+
| Data Tier         | Example Contents                        | Routing & Tracing Policy                 |
+-------------------+-----------------------------------------+------------------------------------------+
| CONFIDENTIAL      | Salaries, bank details, passwords       | LOCAL ONLY (Ollama / Mock). Never sent   |
|                   |                                         | to cloud providers. Tracing omitted.     |
+-------------------+-----------------------------------------+------------------------------------------+
| INTERNAL          | Quotes, client emails, phone numbers    | Redact PII ({{EMAIL_1}}) before cloud;   |
|                   |                                         | restore for caller. Tracing masked.      |
+-------------------+-----------------------------------------+------------------------------------------+
| PUBLIC_DEMO       | Generic prompts, help searches          | Standard multi-provider routing.         |
+-------------------+-----------------------------------------+------------------------------------------+
```

### Prompt Injection Defense
All inbound prompts pass through `PromptInjectionGuard`, which intercepts common jailbreak attempts (system prompt extraction, roleplay overrides, delimiter manipulation) and either sanitizes or halts the execution.

### Rule R5: Deterministic Business Arithmetic
LLMs are **never** trusted to compute totals, subtotals, tax, discounts, or line item totals. All numbers are parsed into Python `Decimal` objects and verified in code. Any discrepancy between model arithmetic and computed arithmetic is automatically reconciled in favor of deterministic code.

---

## 6. Operational Runbooks

### Runbook 1: Rotating an Expired or Compromised API Key
1. Generate a new key in the respective provider console.
2. Update the environment variable in your production environment or `.env` file:
   ```bash
   export GEMINI_API_KEY="new-key-value"
   ```
3. Restart the backend service:
   ```bash
   docker compose restart backend
   ```
4. Verify connectivity using the live smoke test script:
   ```bash
   python scripts/ai_smoke.py
   ```

### Runbook 2: Model Deprecation Defense
Providers periodically deprecate model slugs. OpsPilot includes a dynamic discovery service (`ModelDiscoveryService`):
1. On startup, the service queries provider catalog endpoints (e.g. `/v1/models`).
2. If a configured model is deprecated or unavailable, the discovery service automatically remaps task profiles to the latest compatible model alias.
3. If offline, the gateway safely falls back to hardcoded static defaults in `backend/app/ai/config.py`.

### Runbook 3: Provider Outage or Rate Limit Flapping
- **Circuit Breaker**: If any provider experiences 3 consecutive failures or an outright 429 quota exhaustion, its circuit breaker trips to **OPEN** for 60 seconds.
- **Failover**: Traffic immediately skips to the next candidate in the task profile chain.
- **Half-Open Probe**: After 60 seconds, a single request probes the provider. If successful, the breaker resets to **CLOSED**.

### Runbook 4: Inspecting Gateway Health & Metrics
- Query the readiness probe:
  ```bash
  curl http://localhost:8000/ready
  ```
- The response returns a detailed `ai_metrics` breakdown:
  ```json
  {
    "status": "ready",
    "subsystems": {
      "database": "connected",
      "redis": "connected",
      "ai_gateway": "ready"
    },
    "ai_metrics": {
      "total_attempts": 142,
      "successful_attempts": 140,
      "failed_attempts": 2,
      "success_rate": 0.9859,
      "p50_latency_ms": 420.5,
      "p95_latency_ms": 1150.2,
      "cache_hits": 45,
      "cache_misses": 97
    }
  }
  ```

---

## 7. Automated Test Verification

Run the complete test suite to ensure gateway integrity:
```bash
# Backend pytest suite (81 tests including chaos, privacy, quota, breaker, & golden evals)
PYTHONPATH=backend pytest backend/tests -v

# Frontend Vitest suite (15 tests including UI gateway states)
cd frontend && npx vitest run

# Live Provider Smoke Test (verifies active cloud API keys)
python scripts/ai_smoke.py
```
