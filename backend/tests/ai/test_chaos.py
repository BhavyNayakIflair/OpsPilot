"""
Chaos and Reliability Tests for OpsPilot AI Gateway.
Gate 2 Requirement: Simulate provider failures (5xx, 429, timeouts);
assert automatic failover, circuit breaker tripping, deadline preservation,
and clean typed AICapacityExhausted (never bare 502).
"""
import time
import pytest
from pydantic import BaseModel

from app.ai.errors import (
    AICapacityExhausted,
    ProviderUnavailableError,
    QuotaExceededError,
)
from app.ai.providers.base import (
    Chunk,
    EmbedResult,
    HealthStatus,
    JsonRequest,
    JsonResult,
    QuotaState,
    TextRequest,
    TextResult,
    TranscribeResult,
)
from app.ai.providers.registry import register_custom_provider, reset_provider_registry
from app.ai.redis_client import reset_redis_fallback
from app.ai.routing.breaker import circuit_breaker
from app.ai.routing.profiles import RouteCandidate, TaskProfile
from app.ai.routing.router import AIRouter


class ProposalOutput(BaseModel):
    title: str
    amount: int


class FlakyFailingProvider:
    """Mock provider configured to fail with specific errors."""

    def __init__(self, provider_id: str, error_to_raise: Exception):
        self.id = provider_id
        self.error_to_raise = error_to_raise
        self.call_count = 0

    async def generate_json(self, req: JsonRequest) -> JsonResult:
        self.call_count += 1
        raise self.error_to_raise

    async def generate_text(self, req: TextRequest) -> TextResult:
        self.call_count += 1
        raise self.error_to_raise

    def stream_text(self, req: TextRequest):
        raise self.error_to_raise

    async def embed(self, texts: list[str], model_alias: str = "default") -> EmbedResult:
        raise self.error_to_raise

    async def transcribe(self, audio: bytes, mime: str = "audio/wav") -> TranscribeResult:
        raise self.error_to_raise

    async def health(self) -> HealthStatus:
        return HealthStatus(status="degraded", provider=self.id)

    def quota_state(self) -> QuotaState:
        return QuotaState(provider=self.id)


class HealthyProvider:
    """Mock provider that always succeeds."""

    def __init__(self, provider_id: str):
        self.id = provider_id
        self.call_count = 0

    async def generate_json(self, req: JsonRequest) -> JsonResult:
        self.call_count += 1
        data = ProposalOutput(title="Chaos Fallback Proposal", amount=5000)
        return JsonResult(
            data=data,
            raw_text="{\"title\": \"Chaos Fallback Proposal\", \"amount\": 5000}",
            provider=self.id,
            model="healthy-v1",
            latency_ms=15.0,
            input_tokens=20,
            output_tokens=30,
            finish_reason="stop",
        )

    async def generate_text(self, req: TextRequest) -> TextResult:
        self.call_count += 1
        return TextResult(
            text="Chaos Fallback Text",
            provider=self.id,
            model="healthy-v1",
            latency_ms=10.0,
        )

    def stream_text(self, req: TextRequest):
        pass

    async def embed(self, texts: list[str], model_alias: str = "default") -> EmbedResult:
        return EmbedResult(embeddings=[[0.1] * 768 for _ in texts], model="embed", dimension=768, provider=self.id)

    async def transcribe(self, audio: bytes, mime: str = "audio/wav") -> TranscribeResult:
        return TranscribeResult(text="transcribed", provider=self.id)

    async def health(self) -> HealthStatus:
        return HealthStatus(status="ok", provider=self.id)

    def quota_state(self) -> QuotaState:
        return QuotaState(provider=self.id, rpm_remaining=100)


@pytest.fixture(autouse=True)
def cleanup():
    reset_redis_fallback()
    reset_provider_registry()
    yield
    reset_redis_fallback()
    reset_provider_registry()


@pytest.mark.asyncio
async def test_chaos_failover_when_primary_providers_fail(monkeypatch):
    """
    Scenario:
    - Candidate 1 (p1): returns HTTP 500 (ProviderUnavailableError)
    - Candidate 2 (p2): returns HTTP 429 (QuotaExceededError) with Retry-After 20s
    - Candidate 3 (p3): succeeds!
    Assert:
    - Request completes successfully via p3.
    - Result contains fallback_reason recording p1 and p2.
    - p2 circuit breaker is tripped to OPEN.
    - On immediate next request, p2 is skipped without calling!
    """
    p1 = FlakyFailingProvider("p1", ProviderUnavailableError("500 Server Error"))
    p2 = FlakyFailingProvider("p2", QuotaExceededError("Rate Limit", retry_after_seconds=20))
    p3 = HealthyProvider("p3")

    register_custom_provider("p1", p1)
    register_custom_provider("p2", p2)
    register_custom_provider("p3", p3)

    custom_profile = TaskProfile(
        name="chaos_task",
        chain=[
            RouteCandidate("p1", "model-1", timeout_seconds=2.0),
            RouteCandidate("p2", "model-2", timeout_seconds=2.0),
            RouteCandidate("p3", "model-3", timeout_seconds=2.0),
        ],
        max_total_timeout_seconds=10.0,
        cache_ttl_seconds=0,
    )

    import app.ai.routing.router as router_mod
    monkeypatch.setattr(router_mod, "get_task_profiles", lambda: {"chaos_task": custom_profile})

    router = AIRouter()
    req = JsonRequest(prompt="Draft quote", schema_model=ProposalOutput, timeout_seconds=10.0)

    # 1. First execution: should failover through p1 -> p2 -> p3
    result = await router.execute_json("chaos_task", req)

    assert result.provider == "p3"
    assert result.data.title == "Chaos Fallback Proposal"
    assert "p1:model-1" in result.fallback_reason
    assert "p2:model-2" in result.fallback_reason
    assert p1.call_count == 1
    assert p2.call_count == 1
    assert p3.call_count == 1

    # 2. Check circuit breaker state: p2 tripped OPEN
    assert await circuit_breaker.is_available("p2:model-2") is False

    # 3. Second execution: p2 should be SKIPPED directly
    p2_prev_calls = p2.call_count
    result2 = await router.execute_json("chaos_task", req)

    assert result2.provider == "p3"
    # p2 was not called again because breaker is OPEN
    assert p2.call_count == p2_prev_calls
    assert p3.call_count == 2


@pytest.mark.asyncio
async def test_chaos_all_providers_fail_raises_typed_capacity_exhausted(monkeypatch):
    """
    Scenario:
    - All providers in the failover chain fail (500s, 429s).
    Assert:
    - Router raises AICapacityExhausted (HTTP 503 equivalent).
    - NEVER raises bare 502.
    - Completes within deadline budget.
    """
    p1 = FlakyFailingProvider("p1", ProviderUnavailableError("500 Server Error"))
    p2 = FlakyFailingProvider("p2", QuotaExceededError("429 Rate Limit", retry_after_seconds=30))

    register_custom_provider("p1", p1)
    register_custom_provider("p2", p2)

    custom_profile = TaskProfile(
        name="chaos_task_all_fail",
        chain=[
            RouteCandidate("p1", "model-1", timeout_seconds=2.0),
            RouteCandidate("p2", "model-2", timeout_seconds=2.0),
        ],
        max_total_timeout_seconds=5.0,
        cache_ttl_seconds=0,
    )

    import app.ai.routing.router as router_mod
    monkeypatch.setattr(router_mod, "get_task_profiles", lambda: {"chaos_task_all_fail": custom_profile})

    router = AIRouter()
    req = JsonRequest(prompt="Draft quote", schema_model=ProposalOutput, timeout_seconds=5.0)

    start = time.monotonic()
    with pytest.raises(AICapacityExhausted) as exc_info:
        await router.execute_json("chaos_task_all_fail", req)

    elapsed = time.monotonic() - start
    assert elapsed < 5.0  # strictly bounded by deadline budget
    assert exc_info.value.retry_after_seconds == 30
    assert "AI capacity reached or routes temporarily unavailable" in str(exc_info.value)
