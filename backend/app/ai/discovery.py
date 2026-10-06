"""
Model Discovery and Alias Mapping Service.
Implements Rule R8: Model Deprecation Defense.
- Queries provider model catalogs at startup with bounded 5s timeout.
- Caches discovered catalog for 24 hours in Redis (with in-memory fallback).
- Maps high-level aliases (quote_draft_quality, extract_fast, rag_answer, embed)
  to the best currently active free model.
- Falls back safely to static defaults if discovery fails or provider is offline.
"""
import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional
import httpx

from app.ai.config import ai_settings
from app.ai.redis_client import get_redis_client

logger = logging.getLogger(__name__)

DISCOVERY_CACHE_KEY = "ai:models:discovered:v1"
DISCOVERY_TTL_SECONDS = 86400  # 24 hours


# Static fallback defaults when offline or discovery fails (2026 calibrated)
STATIC_ALIAS_DEFAULTS: Dict[str, Dict[str, str]] = {
    "groq": {
        "quality": "openai/gpt-oss-120b",
        "fast": "openai/gpt-oss-20b",
        "extract": "openai/gpt-oss-20b",
        "rag": "openai/gpt-oss-20b",
    },
    "gemini": {
        "quality": "gemma-4-26b-a4b-it",
        "fast": "gemma-4-26b-a4b-it",
        "embed": "gemini-embedding-001",
    },
    "cloudflare": {
        "quality": "@cf/meta/llama-3.1-8b-instruct",
        "fast": "@cf/meta/llama-3.1-8b-instruct",
    },
    "openrouter": {
        "quality": "apodex/apodex-1.1-mini:free",
        "fast": "inclusionai/ling-3.0-flash-sante:free",
    },
    "ollama": {
        "quality": ai_settings.OLLAMA_CHAT_MODEL,
        "fast": ai_settings.OLLAMA_FAST_MODEL,
        "embed": ai_settings.OLLAMA_EMBEDDING_MODEL,
    },
    "mock": {
        "quality": "mock-v1",
        "fast": "mock-v1",
        "embed": "mock-embed-v1",
    },
}


class ModelDiscoveryService:
    """Discovers and caches available models across configured providers."""

    def __init__(self):
        self._cached_catalog: Optional[Dict[str, List[str]]] = None
        self._resolved_aliases: Optional[Dict[str, Dict[str, str]]] = None

    async def discover_all(self, force_refresh: bool = False) -> Dict[str, List[str]]:
        """Query all configured providers with 5s timeout each and return model catalog."""
        if not force_refresh:
            cached = await self._get_cached()
            if cached:
                self._cached_catalog = cached
                self._resolved_aliases = self._compute_alias_map(cached)
                return cached

        catalog: Dict[str, List[str]] = {}
        tasks = []

        if ai_settings.GROQ_API_KEY:
            tasks.append(("groq", self._discover_groq()))
        if ai_settings.GEMINI_API_KEY:
            tasks.append(("gemini", self._discover_gemini()))
        if ai_settings.CF_ACCOUNT_ID and ai_settings.CF_API_TOKEN:
            tasks.append(("cloudflare", self._discover_cloudflare()))
        if ai_settings.OPENROUTER_API_KEY:
            tasks.append(("openrouter", self._discover_openrouter()))
        tasks.append(("ollama", self._discover_ollama()))
        tasks.append(("mock", self._discover_mock()))

        results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)

        for (provider, _), res in zip(tasks, results):
            if isinstance(res, Exception) or not res:
                logger.debug("Discovery for %s returned empty/failed: %s", provider, res)
                catalog[provider] = []
            else:
                catalog[provider] = res

        await self._save_cached(catalog)
        self._cached_catalog = catalog
        self._resolved_aliases = self._compute_alias_map(catalog)
        return catalog

    async def _discover_groq(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {ai_settings.GROQ_API_KEY}"},
                )
                if r.status_code == 200:
                    data = r.json().get("data", [])
                    return [m["id"] for m in data if m.get("id")]
        except Exception:
            pass
        return []

    async def _discover_gemini(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={ai_settings.GEMINI_API_KEY}"
                )
                if r.status_code == 200:
                    models = r.json().get("models", [])
                    return [m["name"].replace("models/", "") for m in models if "name" in m]
        except Exception:
            pass
        return []

    async def _discover_cloudflare(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(
                    f"https://api.cloudflare.com/client/v4/accounts/{ai_settings.CF_ACCOUNT_ID}/ai/models/search",
                    headers={"Authorization": f"Bearer {ai_settings.CF_API_TOKEN}"},
                )
                if r.status_code == 200 and r.json().get("success"):
                    results = r.json().get("result", [])
                    return [m["name"] for m in results if "name" in m]
        except Exception:
            pass
        return []

    async def _discover_openrouter(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {ai_settings.OPENROUTER_API_KEY}"},
                )
                if r.status_code == 200:
                    data = r.json().get("data", [])
                    # Only free models (Rule R3: Hard budget $0.00 forever)
                    return [m["id"] for m in data if ":free" in m.get("id", "")]
        except Exception:
            pass
        return []

    async def _discover_ollama(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{ai_settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
                if r.status_code == 200:
                    models = r.json().get("models", [])
                    return [m["name"] for m in models if "name" in m]
        except Exception:
            pass
        return [ai_settings.OLLAMA_FAST_MODEL, ai_settings.OLLAMA_CHAT_MODEL]

    async def _discover_mock(self) -> List[str]:
        return ["mock-v1", "mock-embed-v1"]

    def _compute_alias_map(self, catalog: Dict[str, List[str]]) -> Dict[str, Dict[str, str]]:
        resolved: Dict[str, Dict[str, str]] = {}
        for provider, static_map in STATIC_ALIAS_DEFAULTS.items():
            resolved[provider] = dict(static_map)
            available = catalog.get(provider, [])
            if not available:
                continue

            # Provider-specific selection heuristics
            if provider == "groq":
                for candidate in ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3.8-27b"]:
                    if candidate in available:
                        resolved["groq"]["quality"] = candidate
                        break
                for candidate in ["openai/gpt-oss-20b", "llama-3.1-8b-instant"]:
                    if candidate in available:
                        resolved["groq"]["fast"] = candidate
                        resolved["groq"]["extract"] = candidate
                        resolved["groq"]["rag"] = candidate
                        break

            elif provider == "gemini":
                for candidate in ["gemma-4-26b-a4b-it", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]:
                    if candidate in available:
                        resolved["gemini"]["quality"] = candidate
                        resolved["gemini"]["fast"] = candidate
                        break
                for candidate in ["gemini-embedding-001", "gemini-embedding-2", "text-embedding-004"]:
                    if candidate in available:
                        resolved["gemini"]["embed"] = candidate
                        break

            elif provider == "openrouter":
                free_available = [m for m in available if ":free" in m]
                if free_available:
                    resolved["openrouter"]["quality"] = free_available[0]
                    resolved["openrouter"]["fast"] = free_available[-1]

        return resolved

    async def get_model_for_alias(self, provider: str, alias: str) -> str:
        """Resolve a logical alias (quality, fast, extract, embed) to the active model."""
        if not self._resolved_aliases:
            await self.discover_all()
        provider_map = (self._resolved_aliases or {}).get(provider) or STATIC_ALIAS_DEFAULTS.get(provider, {})
        return provider_map.get(alias) or STATIC_ALIAS_DEFAULTS.get(provider, {}).get(alias, "default")

    async def _get_cached(self) -> Optional[Dict[str, List[str]]]:
        try:
            client = await get_redis_client()
            raw = await client.get(DISCOVERY_CACHE_KEY)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
        return None

    async def _save_cached(self, catalog: Dict[str, List[str]]) -> None:
        try:
            client = await get_redis_client()
            await client.set(DISCOVERY_CACHE_KEY, json.dumps(catalog), ex=DISCOVERY_TTL_SECONDS)
        except Exception:
            pass


discovery_service = ModelDiscoveryService()
