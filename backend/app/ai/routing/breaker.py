"""
Circuit Breaker for AI Provider Routes.
Shared state across workers via Redis (with transparent in-memory fallback).
Tracks CLOSED, OPEN, and HALF_OPEN states.
"""
import enum
import json
import logging
import time
from typing import Any, Dict, Optional, Tuple

from app.ai.redis_client import get_redis_client

logger = logging.getLogger(__name__)


class BreakerState(str, enum.Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    Circuit breaker per provider route.
    Default policy:
    - 3 consecutive failures trips to OPEN.
    - Default cooldown: 30 seconds (or Retry-After header if supplied).
    - 401/403 authentication/authorization error trips for 3600 seconds.
    - In HALF_OPEN state, one success restores to CLOSED, one failure re-trips.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        default_cooldown_seconds: int = 30,
        prefix: str = "ai:breaker:",
    ):
        self.failure_threshold = failure_threshold
        self.default_cooldown_seconds = default_cooldown_seconds
        self.prefix = prefix

    def _key(self, route_id: str) -> str:
        return f"{self.prefix}{route_id}"

    async def get_state_info(self, route_id: str) -> Tuple[BreakerState, Dict[str, Any]]:
        client = await get_redis_client()
        raw = await client.get(self._key(route_id))
        now = time.time()

        if not raw:
            return BreakerState.CLOSED, {"failures": 0, "state": "closed", "cooldown_until": 0}

        try:
            data = json.loads(raw)
        except Exception:
            return BreakerState.CLOSED, {"failures": 0, "state": "closed", "cooldown_until": 0}

        cooldown_until = data.get("cooldown_until", 0)
        state_str = data.get("state", "closed")

        if state_str == BreakerState.OPEN.value:
            if now >= cooldown_until:
                # Transition to HALF_OPEN for a single canary probe
                data["state"] = BreakerState.HALF_OPEN.value
                await client.set(self._key(route_id), json.dumps(data), ex=300)
                return BreakerState.HALF_OPEN, data
            return BreakerState.OPEN, data

        if state_str == BreakerState.HALF_OPEN.value:
            return BreakerState.HALF_OPEN, data

        return BreakerState.CLOSED, data

    async def is_available(self, route_id: str) -> bool:
        """
        Returns True if the route is eligible to receive traffic.
        Returns False if the breaker is OPEN.
        """
        state, _ = await self.get_state_info(route_id)
        return state in (BreakerState.CLOSED, BreakerState.HALF_OPEN)

    async def record_success(self, route_id: str) -> None:
        """Record successful call: resets failures and closes the breaker."""
        client = await get_redis_client()
        key = self._key(route_id)
        await client.delete(key)
        logger.debug("Circuit breaker for route %s reset to CLOSED", route_id)

    async def record_failure(
        self,
        route_id: str,
        cooldown_seconds: Optional[int] = None,
        is_fatal: bool = False,
        reason: str = "",
    ) -> None:
        """
        Record failed attempt.
        If is_fatal=True (e.g. 429 rate limit or 401/403 authorization), immediately trip OPEN.
        Otherwise increment failure count; trip if threshold reached.
        """
        client = await get_redis_client()
        key = self._key(route_id)
        now = time.time()
        cooldown = cooldown_seconds or self.default_cooldown_seconds

        _, data = await self.get_state_info(route_id)
        failures = data.get("failures", 0) + 1
        data["failures"] = failures
        data["last_reason"] = reason[:200]
        data["last_failure_at"] = now

        if is_fatal or failures >= self.failure_threshold:
            data["state"] = BreakerState.OPEN.value
            data["cooldown_until"] = now + cooldown
            await client.set(key, json.dumps(data), ex=int(cooldown) + 60)
            logger.warning(
                "Circuit breaker for route %s TRIPPED to OPEN for %ds (failures=%d, reason=%s)",
                route_id,
                cooldown,
                failures,
                reason,
            )
        else:
            data["state"] = BreakerState.CLOSED.value
            await client.set(key, json.dumps(data), ex=120)
            logger.debug(
                "Circuit breaker for route %s recorded failure %d/%d (%s)",
                route_id,
                failures,
                self.failure_threshold,
                reason,
            )

    async def trip(self, route_id: str, cooldown_seconds: int, reason: str = "") -> None:
        """Explicitly trip the circuit breaker into OPEN state."""
        await self.record_failure(
            route_id,
            cooldown_seconds=cooldown_seconds,
            is_fatal=True,
            reason=reason,
        )


circuit_breaker = CircuitBreaker()
