"""
Unit tests for Model Discovery and Deprecation Defense (Rule R8).
"""
import pytest
import httpx
from app.ai.discovery import ModelDiscoveryService, STATIC_ALIAS_DEFAULTS


@pytest.mark.asyncio
async def test_discovery_maps_aliases_from_catalog():
    service = ModelDiscoveryService()

    fake_catalog = {
        "groq": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "other-model"],
        "gemini": ["gemma-4-26b-a4b-it", "gemini-embedding-001"],
        "openrouter": ["test-model:free", "paid-model"],
        "cloudflare": ["@cf/meta/llama-3.1-8b-instruct"],
        "ollama": ["qwen2.5:3b-instruct"],
        "mock": ["mock-v1"],
    }

    alias_map = service._compute_alias_map(fake_catalog)

    assert alias_map["groq"]["quality"] == "openai/gpt-oss-120b"
    assert alias_map["groq"]["fast"] == "openai/gpt-oss-20b"
    assert alias_map["gemini"]["quality"] == "gemma-4-26b-a4b-it"
    assert alias_map["gemini"]["embed"] == "gemini-embedding-001"
    assert alias_map["openrouter"]["quality"] == "test-model:free"


@pytest.mark.asyncio
async def test_deprecation_defense_falls_back_to_static_defaults():
    service = ModelDiscoveryService()

    # Empty catalog simulate outage or discovery network failure
    empty_catalog = {}
    alias_map = service._compute_alias_map(empty_catalog)

    # Must fall back to safe static defaults
    assert alias_map["groq"]["quality"] == STATIC_ALIAS_DEFAULTS["groq"]["quality"]
    assert alias_map["gemini"]["quality"] == STATIC_ALIAS_DEFAULTS["gemini"]["quality"]
    assert alias_map["gemini"]["embed"] == STATIC_ALIAS_DEFAULTS["gemini"]["embed"]
    assert alias_map["cloudflare"]["fast"] == STATIC_ALIAS_DEFAULTS["cloudflare"]["fast"]


@pytest.mark.asyncio
async def test_get_model_for_alias_with_fallback():
    service = ModelDiscoveryService()
    model = await service.get_model_for_alias("groq", "fast")
    assert model in ["openai/gpt-oss-20b", "llama-3.1-8b-instant"]
