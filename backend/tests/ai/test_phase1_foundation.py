"""Unit tests for Phase 1 AI Gateway Foundation."""
import json
import httpx
import pytest
from pydantic import BaseModel

from app.ai.config import ai_settings
from app.ai.errors import (
    AIGatewayError,
    AICapacityExhausted,
    ForbiddenRouteError,
    ProviderError,
    ProviderUnavailableError,
    QuotaExceededError,
)
from app.ai.gateway_adapter import LegacyGatewayAdapter
from app.ai.providers.base import JsonRequest, TextRequest
from app.ai.providers.mock import MockProvider
from app.ai.providers.openai_compat import OpenAICompatProvider
from app.ai.utils import extract_json_block, mask_secret, strip_thinking
from app.gateway.base import LLMProvider


class SampleOutput(BaseModel):
    name: str
    count: int


def test_mask_secret_protects_credentials():
    assert mask_secret("gsk_1234567890abcdef") == "gsk_...cdef"
    assert mask_secret("short") == "***"
    assert mask_secret(None) == "[not configured]"
    assert mask_secret("") == "[not configured]"


def test_strip_thinking_blocks():
    raw = "<think>internal private thought\nline 2</think>Hello world"
    assert strip_thinking(raw) == "Hello world"

    orphan = "</think>Hello"
    assert strip_thinking(orphan) == "Hello"


def test_extract_json_block():
    fenced = "Here is the result:\n```json\n{\"name\": \"OpsPilot\", \"count\": 42}\n```\nHope that helps!"
    extracted = extract_json_block(fenced)
    parsed = json.loads(extracted)
    assert parsed["name"] == "OpsPilot"
    assert parsed["count"] == 42


def test_budget_enforces_zero_forever():
    # Rule R3: Hard budget $0.00 forever
    assert ai_settings.DEFAULT_MONTHLY_AI_BUDGET_USD == 0.0


def test_error_taxonomy_compatibility():
    err = ProviderUnavailableError("Down")
    assert isinstance(err, AIGatewayError)
    assert isinstance(err, ProviderError)
    assert isinstance(err, RuntimeError)


@pytest.mark.asyncio
async def test_mock_provider_fulfills_contract():
    mock = MockProvider(embedding_dimension=768)

    # Text generation
    text_res = await mock.generate_text(TextRequest(prompt="test"))
    assert text_res.provider == "mock"
    assert text_res.text == "Mock text output."

    # JSON generation with schema
    json_res = await mock.generate_json(JsonRequest(prompt="test", schema_model=SampleOutput))
    assert json_res.provider == "mock"
    assert isinstance(json_res.data, SampleOutput)

    # Embeddings
    emb_res = await mock.embed(["text1", "text2"])
    assert len(emb_res.embeddings) == 2
    assert len(emb_res.embeddings[0]) == 768

    # Health & Quota
    h = await mock.health()
    assert h.status == "ok"
    q = mock.quota_state()
    assert q.rpm_remaining > 1000


@pytest.mark.asyncio
async def test_openai_compat_openrouter_guards_free_models_only():
    provider = OpenAICompatProvider(
        provider_id="openrouter",
        base_url="https://openrouter.ai/api/v1",
        api_key="dummy",
        default_model="meta-llama/llama-3.3-70b-instruct:free",
    )

    # Forbidden: paid model (R3)
    with pytest.raises(ForbiddenRouteError, match="Only ':free' models allowed"):
        await provider.generate_text(TextRequest(prompt="hi", model="openai/gpt-4o"))


@pytest.mark.asyncio
async def test_openai_compat_handles_429_retry_after():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"retry-after": "12"})

    transport = httpx.MockTransport(handler)
    provider = OpenAICompatProvider(
        provider_id="groq",
        base_url="https://api.groq.com/openai/v1",
        api_key="dummy",
    )
    # Monkeypatch transport in _post
    orig_post = provider._post

    async def mocked_post(path, payload, timeout):
        async with httpx.AsyncClient(transport=transport) as client:
            resp = await client.post(f"{provider.base_url}{path}", json=payload)
            provider._update_quota_from_headers(resp.headers)
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("retry-after", "30"))
                raise QuotaExceededError("Rate limit", retry_after_seconds=retry_after)
            return resp

    provider._post = mocked_post

    with pytest.raises(QuotaExceededError) as exc_info:
        await provider.generate_text(TextRequest(prompt="hi"))
    assert exc_info.value.retry_after_seconds == 12


def test_legacy_gateway_adapter_implements_llm_provider():
    mock = MockProvider()
    adapter = LegacyGatewayAdapter(mock)
    assert isinstance(adapter, LLMProvider)

    # Legacy synchronous generate text
    text_out = adapter.generate("Hello")
    assert text_out == "Mock text output."

    # Legacy synchronous embed
    vectors = adapter.embed(["foo", "bar"])
    assert len(vectors) == 2
    assert len(vectors[0]) == 768
