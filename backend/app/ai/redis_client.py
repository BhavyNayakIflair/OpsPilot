"""
Redis connection helper with transparent in-memory fallback.
Ensures zero-dependency operation in local development and tests when Redis is not running.
"""
import asyncio
import logging
import time
from typing import Any, Dict, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory storage for environments where Redis is not running
_MEMORY_KV: Dict[str, Any] = {}
_MEMORY_EXPIRES: Dict[str, float] = {}
_MEMORY_LOCK = asyncio.Lock()


class MemoryRedisFallback:
    """In-memory key-value store mirroring the basic async Redis API."""

    def __init__(self):
        self._kv = _MEMORY_KV
        self._exp = _MEMORY_EXPIRES

    def _purge_expired(self, key: str) -> bool:
        if key in self._exp and time.monotonic() > self._exp[key]:
            self._kv.pop(key, None)
            self._exp.pop(key, None)
            return True
        return False

    async def get(self, key: str) -> Optional[str]:
        if self._purge_expired(key):
            return None
        return self._kv.get(key)

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        self._kv[key] = str(value)
        if ex is not None:
            self._exp[key] = time.monotonic() + ex
        else:
            self._exp.pop(key, None)
        return True

    async def incr(self, key: str, amount: int = 1) -> int:
        self._purge_expired(key)
        val = int(self._kv.get(key, 0)) + amount
        self._kv[key] = str(val)
        return val

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self._kv:
                self._kv.pop(k, None)
                self._exp.pop(k, None)
                count += 1
        return count

    async def exists(self, key: str) -> int:
        if self._purge_expired(key):
            return 0
        return 1 if key in self._kv else 0

    async def expire(self, key: str, seconds: int) -> bool:
        if key in self._kv:
            self._exp[key] = time.monotonic() + seconds
            return True
        return False

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        pass


_redis_instance: Optional[Any] = None
_using_fallback: bool = False


async def get_redis_client():
    """
    Returns an async Redis client connected to settings.REDIS_URL.
    If Redis is unreachable or raises a connection error, transparently
    falls back to MemoryRedisFallback without interrupting operations.
    """
    global _redis_instance, _using_fallback

    if _redis_instance is not None:
        return _redis_instance

    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(
            settings.REDIS_URL,
            socket_timeout=1.0,
            socket_connect_timeout=1.0,
            decode_responses=True,
        )
        await client.ping()
        _redis_instance = client
        _using_fallback = False
        logger.info("Connected to Redis at %s", settings.REDIS_URL)
        return _redis_instance
    except Exception as exc:
        logger.debug("Redis unavailable (%s); using in-memory store fallback", exc)
        _redis_instance = MemoryRedisFallback()
        _using_fallback = True
        return _redis_instance


def reset_redis_fallback():
    """Reset the in-memory fallback store (useful in test teardowns)."""
    global _redis_instance, _using_fallback
    _MEMORY_KV.clear()
    _MEMORY_EXPIRES.clear()
    _redis_instance = None
    _using_fallback = False
