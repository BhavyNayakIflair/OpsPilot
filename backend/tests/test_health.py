import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "OpsPilot"
    assert data["database"] == "healthy"


@pytest.mark.asyncio
async def test_root_liveness_health(async_client: AsyncClient):
    # Verifies root /health returns 200 without dependencies, eliminating 404 log spam
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "OpsPilot"


@pytest.mark.asyncio
async def test_root_readiness_probe(async_client: AsyncClient):
    response = await async_client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["app"] == "OpsPilot"
    assert "ai_providers" in data
    assert "mock" in data["ai_providers"]

