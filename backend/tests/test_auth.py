import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_auth_registration_and_login(async_client: AsyncClient):
    # 1. Register a new user and organization
    reg_payload = {
        "email": "alice@northwind.io",
        "password": "Password123!",
        "full_name": "Alice Director",
        "org_name": "Northwind Systems",
    }
    reg_res = await async_client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, reg_res.text
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["role"] == "owner"
    token = reg_data["access_token"]

    # 2. Duplicate registration fails
    dup_res = await async_client.post("/api/v1/auth/register", json=reg_payload)
    assert dup_res.status_code == 401

    # 3. Login with correct credentials
    login_payload = {
        "email": "alice@northwind.io",
        "password": "Password123!",
    }
    login_res = await async_client.post("/api/v1/auth/login", json=login_payload)
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data

    # 4. Login with wrong password fails
    wrong_login = {
        "email": "alice@northwind.io",
        "password": "WrongPassword!",
    }
    wrong_res = await async_client.post("/api/v1/auth/login", json=wrong_login)
    assert wrong_res.status_code == 401

    # 5. Access /me endpoint with valid token
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await async_client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "alice@northwind.io"
    assert me_data["role"] == "owner"
    assert me_data["org_name"] == "Northwind Systems"

    # 6. Access /me without token fails with 401
    unauth_res = await async_client.get("/api/v1/auth/me")
    assert unauth_res.status_code == 401
