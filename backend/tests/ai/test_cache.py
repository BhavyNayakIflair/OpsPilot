"""Unit tests for Semantic Cache."""
import time
import pytest

from app.ai.cache import SemanticCache, make_cache_key
from app.ai.redis_client import reset_redis_fallback


@pytest.fixture(autouse=True)
def clean_redis():
    reset_redis_fallback()
    yield
    reset_redis_fallback()


def test_deterministic_cache_key():
    k1 = make_cache_key("quote_draft", "Prompt 1", "System", "AIDraftResponse")
    k2 = make_cache_key("quote_draft", "Prompt 1", "System", "AIDraftResponse")
    k3 = make_cache_key("quote_draft", "Prompt 2", "System", "AIDraftResponse")

    assert k1 == k2
    assert k1 != k3
    assert "quote_draft" in k1


@pytest.mark.asyncio
async def test_semantic_cache_set_and_get():
    cache = SemanticCache(default_ttl_seconds=60)
    key = "ai:cache:test_key_123"

    assert await cache.get(key) is None

    payload = {"data": {"title": "Website"}, "provider": "mock"}
    await cache.set(key, payload, ttl_seconds=10)

    cached = await cache.get(key)
    assert cached is not None
    assert cached["data"]["title"] == "Website"
    assert cached["provider"] == "mock"


@pytest.mark.asyncio
async def test_semantic_cache_ttl_expiry():
    cache = SemanticCache(default_ttl_seconds=1)
    key = "ai:cache:expiring_key"

    await cache.set(key, {"value": "hello"}, ttl_seconds=1)
    assert await cache.get(key) is not None

    time.sleep(1.1)
    assert await cache.get(key) is None
