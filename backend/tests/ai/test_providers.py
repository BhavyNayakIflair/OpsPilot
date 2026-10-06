"""
Unit tests for Provider Adapters (Gemini, Cloudflare, OpenRouter, Mock).
"""
import httpx
import pytest
from pydantic import BaseModel

from app.ai.errors import ProviderUnavailableError, QuotaExceededError, SchemaValidationError
from app.ai.providers.cloudflare import CloudflareProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.base import JsonRequest, TextRequest


class SimpleOutput(BaseModel):
    message: str
    count: int


@pytest.mark.asyncio
async def test_gemini_provider_generate_json(monkeypatch):
    provider = GeminiProvider(api_key="test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert "key=test-key" in str(request.url)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": '{"message": "pong", "count": 42}'}]}}
                ],
                "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5},
            },
        )

    # Monkeypatch transport in httpx.AsyncClient
    orig_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return orig_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", mock_client)

    req = JsonRequest(
        prompt="give answer",
        schema_model=SimpleOutput,
    )
    result = await provider.generate_json(req)
    assert isinstance(result.data, SimpleOutput)
    assert result.data.message == "pong"
    assert result.data.count == 42
    assert result.input_tokens == 10
    assert result.output_tokens == 5


@pytest.mark.asyncio
async def test_gemini_provider_embed_768_dim(monkeypatch):
    provider = GeminiProvider(api_key="test-key", embedding_dimension=768)

    def handler(request: httpx.Request) -> httpx.Response:
        assert "embedContent" in str(request.url)
        return httpx.Response(
            200,
            json={"embedding": {"values": [0.1] * 768}},
        )

    orig_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return orig_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", mock_client)

    res = await provider.embed(["sample chunk"])
    assert res.dimension == 768
    assert len(res.embeddings) == 1
    assert len(res.vectors[0]) == 768


@pytest.mark.asyncio
async def test_cloudflare_provider_generate_json(monkeypatch):
    provider = CloudflareProvider(account_id="acc-123", api_token="tok-456")

    def handler(request: httpx.Request) -> httpx.Response:
        assert "acc-123" in str(request.url)
        assert request.headers.get("authorization") == "Bearer tok-456"
        return httpx.Response(
            200,
            json={"result": {"response": '```json\n{"message": "cf-ok", "count": 7}\n```'}},
        )

    orig_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return orig_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", mock_client)

    req = JsonRequest(prompt="parse", schema_model=SimpleOutput)
    res = await provider.generate_json(req)
    assert isinstance(res.data, SimpleOutput)
    assert res.data.message == "cf-ok"
    assert res.data.count == 7
