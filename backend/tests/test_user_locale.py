from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_user_can_save_and_read_interface_locale(async_client: AsyncClient):
    registered = await async_client.post("/api/v1/auth/register", json={
        "email": f"locale_{uuid4().hex}@example.com",
        "password": "Password123!",
        "full_name": "Locale User",
        "org_name": "Locale Workspace",
    })
    assert registered.status_code == 201
    payload = registered.json()
    headers = {
        "Authorization": f"Bearer {payload['access_token']}",
        "X-Org-ID": payload["org_id"],
    }

    initial = await async_client.get("/api/v1/auth/me", headers=headers)
    assert initial.status_code == 200
    assert initial.json()["locale"] == "en"

    updated = await async_client.put(
        "/api/v1/users/profile", headers=headers, json={"locale": "fr"}
    )
    assert updated.status_code == 200
    assert updated.json()["locale"] == "fr"

    reloaded = await async_client.get("/api/v1/auth/me", headers=headers)
    assert reloaded.status_code == 200
    assert reloaded.json()["locale"] == "fr"


@pytest.mark.asyncio
async def test_user_locale_rejects_unsupported_values(async_client: AsyncClient):
    registered = await async_client.post("/api/v1/auth/register", json={
        "email": f"locale_invalid_{uuid4().hex}@example.com",
        "password": "Password123!",
        "full_name": "Locale User",
        "org_name": "Locale Workspace",
    })
    assert registered.status_code == 201
    payload = registered.json()
    headers = {
        "Authorization": f"Bearer {payload['access_token']}",
        "X-Org-ID": payload["org_id"],
    }

    response = await async_client.put(
        "/api/v1/users/profile", headers=headers, json={"locale": "nl"}
    )

    assert response.status_code == 422
