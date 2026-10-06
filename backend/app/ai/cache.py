"""
Redis-backed Semantic Key Cache for AI Responses.
Avoids re-querying models for identical inputs.
Ensures zero cost and low latency for repeated requests.
"""
import hashlib
import json
import logging
from typing import Any, Dict, Optional

from app.ai.redis_client import get_redis_client

logger = logging.getLogger(__name__)


def make_cache_key(
    task_type: str,
    prompt: str,
    system: str = "",
    schema_name: str = "",
    prompt_version: str = "v1",
    org_id: Optional[str] = None,
) -> str:
    """Create a deterministic hash key for caching."""
    body = f"{task_type}:{schema_name}:{prompt_version}:{system}:{prompt}"
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()[:32]
    org_prefix = f"{org_id}:" if org_id else "global:"
    return f"ai:cache:{org_prefix}{task_type}:{digest}"


class SemanticCache:
    """Redis-backed response cache with transparent fallback."""

    def __init__(self, default_ttl_seconds: int = 3600):
        self.default_ttl = default_ttl_seconds

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        client = await get_redis_client()
        raw = await client.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        client = await get_redis_client()
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl
        try:
            if hasattr(value, "model_dump"):
                payload = value.model_dump()
            elif isinstance(value, dict):
                payload = value
            else:
                payload = {"value": value}
            await client.set(key, json.dumps(payload, default=str), ex=ttl)
        except Exception as exc:
            logger.debug("Failed to write to cache key %s: %exc", key, exc)


semantic_cache = SemanticCache()
