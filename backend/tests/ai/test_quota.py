"""Unit tests for Quota Ledger and Headroom Guard."""
import pytest

from app.ai.redis_client import reset_redis_fallback
from app.ai.routing.quota import QuotaLedger


@pytest.fixture(autouse=True)
def clean_redis():
    reset_redis_fallback()
    yield
    reset_redis_fallback()


@pytest.mark.asyncio
async def test_quota_admits_normal_traffic():
    ledger = QuotaLedger()
    admit = await ledger.can_admit("groq", "llama-3.1-8b", estimated_input_tokens=100, estimated_output_tokens=100)
    assert admit is True


@pytest.mark.asyncio
async def test_quota_refuses_when_headroom_exceeded():
    ledger = QuotaLedger()
    # Published limit for groq RPM is 30.
    # 15% headroom means max allowed is 85% of 30 = 25.
    route = "test-route"

    # Simulate 26 calls in the same minute
    for _ in range(26):
        await ledger.record_usage("groq", route, input_tokens=10, output_tokens=10)

    # Next call should be refused to protect headroom for failover
    admit = await ledger.can_admit("groq", route, estimated_input_tokens=50, estimated_output_tokens=50)
    assert admit is False


@pytest.mark.asyncio
async def test_quota_remaining_capacity():
    ledger = QuotaLedger()
    route = "route-cap"
    await ledger.record_usage("groq", route, input_tokens=50, output_tokens=50)

    cap = await ledger.get_remaining_capacity("groq", route)
    assert cap["rpm_remaining"] == 29
    assert cap["rpd_remaining"] == 999
