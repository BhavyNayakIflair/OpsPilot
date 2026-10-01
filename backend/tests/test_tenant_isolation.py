import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_tenant_isolation_and_rbac(async_client: AsyncClient):
    # 1. Register Tenant A
    org_a_user = {
        "email": "owner_a@acme.dev",
        "password": "Password123!",
        "full_name": "Owner A",
        "org_name": "Acme Development",
    }
    res_a = await async_client.post("/api/v1/auth/register", json=org_a_user)
    assert res_a.status_code == 201
    token_a = res_a.json()["access_token"]
    org_a_id = res_a.json()["org_id"]

    # 2. Register Tenant B
    org_b_user = {
        "email": "owner_b@globex.dev",
        "password": "Password123!",
        "full_name": "Owner B",
        "org_name": "Globex Solutions",
    }
    res_b = await async_client.post("/api/v1/auth/register", json=org_b_user)
    assert res_b.status_code == 201
    token_b = res_b.json()["access_token"]
    org_b_id = res_b.json()["org_id"]

    assert org_a_id != org_b_id

    # 3. User A gets Org A details
    headers_a = {"Authorization": f"Bearer {token_a}"}
    curr_a = await async_client.get("/api/v1/organizations/current", headers=headers_a)
    assert curr_a.status_code == 200
    assert curr_a.json()["name"] == "Acme Development"
    assert curr_a.json()["id"] == org_a_id

    # 4. User B gets Org B details
    headers_b = {"Authorization": f"Bearer {token_b}"}
    curr_b = await async_client.get("/api/v1/organizations/current", headers=headers_b)
    assert curr_b.status_code == 200
    assert curr_b.json()["name"] == "Globex Solutions"
    assert curr_b.json()["id"] == org_b_id

    # 5. User A attempts cross-tenant access to Org B using X-Org-ID -> Must be rejected with 403
    forged_headers = {
        "Authorization": f"Bearer {token_a}",
        "X-Org-ID": org_b_id,
    }
    cross_res = await async_client.get("/api/v1/organizations/current", headers=forged_headers)
    assert cross_res.status_code == 403

    # 6. Test RBAC: Create an employee user
    emp_user = {
        "email": "employee@acme.dev",
        "password": "Password123!",
        "full_name": "Acme Employee",
    }
    emp_res = await async_client.post("/api/v1/auth/register", json=emp_user)
    assert emp_res.status_code == 201
    emp_token = emp_res.json()["access_token"]

    # Org A Owner invites employee to Org A with 'employee' role
    invite_res = await async_client.post(
        "/api/v1/organizations/members",
        headers=headers_a,
        json={"email": "employee@acme.dev", "role": "employee"},
    )
    assert invite_res.status_code == 201

    # Employee accesses Org A with X-Org-ID
    emp_headers = {
        "Authorization": f"Bearer {emp_token}",
        "X-Org-ID": org_a_id,
    }
    emp_org_res = await async_client.get("/api/v1/organizations/current", headers=emp_headers)
    assert emp_org_res.status_code == 200

    # Employee attempts to update Org settings (owner-only) -> Must fail with 403
    forbidden_update = await async_client.put(
        "/api/v1/organizations/current",
        headers=emp_headers,
        json={"name": "Hacked Org Name"},
    )
    assert forbidden_update.status_code == 403
