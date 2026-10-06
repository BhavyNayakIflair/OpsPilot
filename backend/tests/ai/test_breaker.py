"""Unit tests for Circuit Breaker."""
import time
import pytest

from app.ai.redis_client import reset_redis_fallback
from app.ai.routing.breaker import BreakerState, CircuitBreaker


@pytest.fixture(autouse=True)
def clean_redis():
    reset_redis_fallback()
    yield
    reset_redis_fallback()


@pytest.mark.asyncio
async def test_circuit_breaker_closed_initially():
    cb = CircuitBreaker(failure_threshold=3, default_cooldown_seconds=10)
    assert await cb.is_available("groq:test") is True


@pytest.mark.asyncio
async def test_circuit_breaker_trips_after_consecutive_failures():
    cb = CircuitBreaker(failure_threshold=3, default_cooldown_seconds=10)
    route = "groq:model-a"

    # 1 failure: stays closed
    await cb.record_failure(route, reason="timeout")
    assert await cb.is_available(route) is True

    # 2 failures: stays closed
    await cb.record_failure(route, reason="timeout")
    assert await cb.is_available(route) is True

    # 3 failures: trips OPEN
    await cb.record_failure(route, reason="timeout")
    assert await cb.is_available(route) is False

    state, data = await cb.get_state_info(route)
    assert state == BreakerState.OPEN
    assert data["failures"] == 3


@pytest.mark.asyncio
async def test_circuit_breaker_trips_immediately_on_fatal_429():
    cb = CircuitBreaker(failure_threshold=5, default_cooldown_seconds=10)
    route = "gemini:model-b"

    # Trip immediately with 429 Retry-After of 15 seconds
    await cb.trip(route, cooldown_seconds=15, reason="429 Rate Limit")
    assert await cb.is_available(route) is False

    state, data = await cb.get_state_info(route)
    assert state == BreakerState.OPEN


@pytest.mark.asyncio
async def test_circuit_breaker_half_open_recovery():
    cb = CircuitBreaker(failure_threshold=2, default_cooldown_seconds=1)
    route = "mistral:model-c"

    # Trip to OPEN with 1s cooldown
    await cb.trip(route, cooldown_seconds=1, reason="500 Error")
    assert await cb.is_available(route) is False

    # Wait for cooldown to expire
    time.sleep(1.1)

    # Should transition to HALF_OPEN
    assert await cb.is_available(route) is True
    state, _ = await cb.get_state_info(route)
    assert state == BreakerState.HALF_OPEN

    # Success restores to CLOSED
    await cb.record_success(route)
    assert await cb.is_available(route) is True
    state, _ = await cb.get_state_info(route)
    assert state == BreakerState.CLOSED
