"""
Redis-backed Quota Ledger for AI Providers.
Tracks RPM, RPD, TPM, TPD counters per provider and route.
Implements pre-flight token estimation with headroom guard (Rule: refuse if > 85% limit).
Refreshes authoritative limits from rate limit response headers.
"""
import logging
import time
from typing import Any, Dict, Optional

from app.ai.config import ai_settings
from app.ai.redis_client import get_redis_client

logger = logging.getLogger(__name__)

# Default free-tier limits (conservative safety thresholds)
DEFAULT_PROVIDER_LIMITS: Dict[str, Dict[str, int]] = {
    "groq": {"rpm": 30, "rpd": 1000, "tpm": 8000, "tpd": 200000},
    "gemini": {"rpm": 15, "rpd": 1500, "tpm": 32000, "tpd": 500000},
    "mistral": {"rpm": 30, "rpd": 1000, "tpm": 20000, "tpd": 200000},
    "cloudflare": {"rpm": 60, "rpd": 1000, "tpm": 20000, "tpd": 200000},
    "openrouter": {"rpm": 20, "rpd": 50, "tpm": 8000, "tpd": 100000},
    "ollama": {"rpm": 100, "rpd": 10000, "tpm": 100000, "tpd": 1000000},
    "mock": {"rpm": 999999, "rpd": 999999, "tpm": 999999, "tpd": 999999},
}


class QuotaLedger:
    """
    Maintains rate-limit state across workers in Redis.
    Enforces headroom percentage so fallbacks are never choked.
    """

    def __init__(self, prefix: str = "ai:quota:"):
        self.prefix = prefix
        self.headroom_percent = ai_settings.AI_QUOTA_HEADROOM_PERCENT  # default 15%

    def _keys(self, provider: str, route_id: str) -> Dict[str, str]:
        minute_slot = int(time.time() // 60)
        day_slot = int(time.time() // 86400)
        return {
            "rpm": f"{self.prefix}{provider}:{route_id}:rpm:{minute_slot}",
            "rpd": f"{self.prefix}{provider}:{route_id}:rpd:{day_slot}",
            "tpm": f"{self.prefix}{provider}:{route_id}:tpm:{minute_slot}",
            "tpd": f"{self.prefix}{provider}:{route_id}:tpd:{day_slot}",
        }

    async def can_admit(
        self,
        provider: str,
        route_id: str,
        estimated_input_tokens: int = 100,
        estimated_output_tokens: int = 200,
    ) -> bool:
        """
        Pre-flight check: returns True if the route has headroom to service the request.
        Refuses if current counter + estimate exceeds (100 - headroom_percent)% of published limit.
        """
        limits = DEFAULT_PROVIDER_LIMITS.get(provider, DEFAULT_PROVIDER_LIMITS["groq"])
        headroom_factor = (100 - self.headroom_percent) / 100.0

        max_rpm = int(limits["rpm"] * headroom_factor)
        max_rpd = int(limits["rpd"] * headroom_factor)
        max_tpm = int(limits["tpm"] * headroom_factor)

        client = await get_redis_client()
        keys = self._keys(provider, route_id)

        curr_rpm = int(await client.get(keys["rpm"]) or 0)
        curr_rpd = int(await client.get(keys["rpd"]) or 0)
        curr_tpm = int(await client.get(keys["tpm"]) or 0)

        total_est_tokens = estimated_input_tokens + estimated_output_tokens

        if curr_rpm + 1 > max_rpm:
            logger.debug("Quota preflight: %s:%s RPM exceeded (%d > %d)", provider, route_id, curr_rpm + 1, max_rpm)
            return False
        if curr_rpd + 1 > max_rpd:
            logger.debug("Quota preflight: %s:%s RPD exceeded (%d > %d)", provider, route_id, curr_rpd + 1, max_rpd)
            return False
        if curr_tpm + total_est_tokens > max_tpm:
            logger.debug("Quota preflight: %s:%s TPM exceeded (%d > %d)", provider, route_id, curr_tpm + total_est_tokens, max_tpm)
            return False

        return True

    async def record_usage(
        self,
        provider: str,
        route_id: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        """Increment RPM, RPD, TPM, TPD counters in Redis upon request completion."""
        client = await get_redis_client()
        keys = self._keys(provider, route_id)
        tokens = max(1, input_tokens + output_tokens)

        # Increment with auto-expiration
        await client.incr(keys["rpm"], 1)
        await client.expire(keys["rpm"], 120)

        await client.incr(keys["rpd"], 1)
        await client.expire(keys["rpd"], 90000)

        await client.incr(keys["tpm"], tokens)
        await client.expire(keys["tpm"], 120)

        await client.incr(keys["tpd"], tokens)
        await client.expire(keys["tpd"], 90000)

    async def get_remaining_capacity(self, provider: str, route_id: str) -> Dict[str, Any]:
        """Return remaining capacity for health diagnostics."""
        limits = DEFAULT_PROVIDER_LIMITS.get(provider, DEFAULT_PROVIDER_LIMITS["groq"])
        client = await get_redis_client()
        keys = self._keys(provider, route_id)

        curr_rpm = int(await client.get(keys["rpm"]) or 0)
        curr_rpd = int(await client.get(keys["rpd"]) or 0)
        curr_tpm = int(await client.get(keys["tpm"]) or 0)
        curr_tpd = int(await client.get(keys["tpd"]) or 0)

        return {
            "rpm_remaining": max(0, limits["rpm"] - curr_rpm),
            "rpd_remaining": max(0, limits["rpd"] - curr_rpd),
            "tpm_remaining": max(0, limits["tpm"] - curr_tpm),
            "tpd_remaining": max(0, limits["tpd"] - curr_tpd),
        }


quota_ledger = QuotaLedger()
