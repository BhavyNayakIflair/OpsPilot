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


@pytest.mark.asyncio
async def test_forgot_and_reset_password_flow(async_client: AsyncClient):
    # 1. Register a user
    user_payload = {
        "email": "reset_user@northwind.io",
        "password": "InitialPassword123!",
        "full_name": "Reset Test User",
        "org_name": "Reset Testing Org",
    }
    reg_res = await async_client.post("/api/v1/auth/register", json=user_payload)
    assert reg_res.status_code == 201

    # 2. Request forgot password for an unknown email -> 200 without token leaked
    unknown_res = await async_client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nonexistent@northwind.io"},
    )
    assert unknown_res.status_code == 200
    assert unknown_res.json()["reset_token"] is None

    # 3. Request forgot password for the registered user
    forgot_res = await async_client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset_user@northwind.io"},
    )
    assert forgot_res.status_code == 200
    token = forgot_res.json()["reset_token"]
    assert token is not None

    # 4. Verify valid token
    verify_res = await async_client.post(
        "/api/v1/auth/verify-reset-token",
        json={"token": token},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True
    assert verify_res.json()["email"] == "reset_user@northwind.io"

    # 5. Verify invalid token
    invalid_verify = await async_client.post(
        "/api/v1/auth/verify-reset-token",
        json={"token": "invalid.jwt.token"},
    )
    assert invalid_verify.status_code == 200
    assert invalid_verify.json()["valid"] is False

    # 6. Reset password with too short password fails
    short_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "short"},
    )
    assert short_res.status_code == 400

    # 7. Reset password with valid token and strong new password
    new_pass = "BrandNewSuperSecret2026!"
    reset_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": new_pass},
    )
    assert reset_res.status_code == 200
    assert "successfully updated" in reset_res.json()["message"]

    # 8. Old password no longer works
    old_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reset_user@northwind.io", "password": "InitialPassword123!"},
    )
    assert old_login.status_code == 401

    # 9. New password works
    new_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reset_user@northwind.io", "password": new_pass},
    )
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()

    # 10. Re-using the same reset token is now rejected
    reused_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "AnotherNewPassword123!"},
    )
    assert reused_res.status_code == 400

