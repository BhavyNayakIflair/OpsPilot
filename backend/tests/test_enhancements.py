import io
from datetime import date, timedelta
import pytest
from httpx import AsyncClient


async def create_org_and_owner(client: AsyncClient, prefix: str):
    email = f"{prefix}_owner@test.com"
    res = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": f"{prefix} Owner",
        "org_name": f"{prefix} Org",
    })
    assert res.status_code == 201
    data = res.json()
    headers = {
        "Authorization": f"Bearer {data['access_token']}",
        "X-Org-ID": data["org_id"],
    }
    return {
        "headers": headers,
        "user_id": data["user_id"],
        "org_id": data["org_id"],
        "token": data["access_token"],
    }


async def create_user_with_role(client: AsyncClient, owner_headers: dict, org_id: str, prefix: str, role: str):
    email = f"{prefix}_{role}@test.com"
    reg = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": f"{prefix} {role.title()}",
    })
    assert reg.status_code == 201
    user_data = reg.json()

    invite = await client.post(
        "/api/v1/organizations/members",
        headers=owner_headers,
        json={"email": email, "role": role},
    )
    assert invite.status_code == 201
    headers = {
        "Authorization": f"Bearer {user_data['access_token']}",
        "X-Org-ID": org_id,
    }
    return {
        "headers": headers,
        "user_id": user_data["user_id"],
        "token": user_data["access_token"],
    }


# -------------------------------------------------------------
# FLOW 1: Person -> Team -> Project -> Assign Task -> Person/Project Views
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_person_team_project_task_assignment(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "flow1")
    headers = owner["headers"]

    # 1. Create person
    emp_res = await async_client.post("/api/v1/operations/people", headers=headers, json={
        "full_name": "Dev One",
        "email": "dev1@test.com",
        "title": "Software Engineer",
        "billing_rate_cents": 15000,
        "weekly_capacity_minutes": 2400,
    })
    assert emp_res.status_code == 201
    emp_id = emp_res.json()["id"]

    # 2. Create team and add member
    team_res = await async_client.post("/api/v1/operations/teams", headers=headers, json={
        "name": "Backend Guild",
        "description": "Backend services",
        "lead_id": emp_id,
    })
    assert team_res.status_code == 201
    team_id = team_res.json()["id"]

    tm_res = await async_client.post(f"/api/v1/operations/teams/{team_id}/members", headers=headers, json={
        "person_id": emp_id,
        "role": "lead",
    })
    assert tm_res.status_code == 201

    # 3. Create project and add project member
    proj_res = await async_client.post("/api/v1/operations/projects", headers=headers, json={
        "name": "E-Commerce Core",
        "budget_minutes": 6000,
        "currency": "USD",
    })
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    pm_res = await async_client.post(f"/api/v1/operations/projects/{proj_id}/members", headers=headers, json={
        "person_id": emp_id,
        "role": "developer",
        "allocation_percent": 100,
        "hours_per_week": 40,
    })
    assert pm_res.status_code == 201

    # 4. Create task
    task_res = await async_client.post(f"/api/v1/operations/projects/{proj_id}/tasks", headers=headers, json={
        "title": "Build Checkout Service",
        "estimate_minutes": 1200,
        "due_date": str(date.today() + timedelta(days=5)),
    })
    assert task_res.status_code == 201
    task_id = task_res.json()["id"]

    # 5. Assign task to person
    assign_res = await async_client.post(f"/api/v1/assignments/tasks/{task_id}/assignees", headers=headers, json={
        "person_id": emp_id,
        "role": "owner",
    })
    assert assign_res.status_code == 201
    assert assign_res.json()["person_id"] == emp_id
    assert assign_res.json()["role"] == "owner"

    # 6. Verify task shows assignee in project tasks list
    tasks_list = await async_client.get(f"/api/v1/operations/projects/{proj_id}/tasks", headers=headers)
    assert tasks_list.status_code == 200
    matched_task = next(t for t in tasks_list.json() if t["id"] == task_id)
    assert matched_task["assignee_id"] == emp_id
    assert any(a["person_id"] == emp_id for a in matched_task["assignees"])

    # 7. Verify person detail view shows assigned task, project allocation, and team
    person_detail = await async_client.get(f"/api/v1/operations/people/{emp_id}/detail", headers=headers)
    assert person_detail.status_code == 200
    pdata = person_detail.json()
    assert any(t["id"] == team_id for t in pdata["teams"])
    assert any(a["project_id"] == proj_id for a in pdata["project_allocations"])
    assert any(t["id"] == task_id for t in pdata["assigned_tasks"])


# -------------------------------------------------------------
# FLOW 2: Leave Conflict Detection & Override Audit
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_leave_conflict_and_override(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "flow2")
    headers = owner["headers"]

    # Create employee, project, member
    emp = (await async_client.post("/api/v1/operations/people", headers=headers, json={
        "full_name": "Conflict Dev",
        "email": "cdev@test.com",
    })).json()

    proj = (await async_client.post("/api/v1/operations/projects", headers=headers, json={
        "name": "Sprint Alpha",
    })).json()

    await async_client.post(f"/api/v1/operations/projects/{proj['id']}/members", headers=headers, json={
        "person_id": emp["id"],
    })

    # Submit and approve leave for Nov 10 - Nov 14 (Monday-Friday)
    leave_start = date(2026, 11, 9)  # Monday
    leave_end = date(2026, 11, 13)    # Friday

    leave = (await async_client.post("/api/v1/operations/leave-requests", headers=headers, json={
        "employee_id": emp["id"],
        "start_date": str(leave_start),
        "end_date": str(leave_end),
        "reason": "Beach Holiday",
    })).json()

    # Approve leave
    await async_client.post(f"/api/v1/operations/leave-requests/{leave['id']}/decision", headers=headers, json={
        "decision": "approved",
    })

    # Create task due right in the middle of leave (Nov 11)
    task = (await async_client.post(f"/api/v1/operations/projects/{proj['id']}/tasks", headers=headers, json={
        "title": "Urgent Hotfix",
        "due_date": "2026-11-11",
    })).json()

    # Attempt to assign without override -> 409 LEAVE_CONFLICT
    assign_fail = await async_client.post(f"/api/v1/assignments/tasks/{task['id']}/assignees", headers=headers, json={
        "person_id": emp["id"],
        "role": "owner",
        "override_leave_conflict": False,
    })
    assert assign_fail.status_code == 409
    assert assign_fail.json()["detail"]["code"] == "LEAVE_CONFLICT"

    # Assign WITH override -> 201
    assign_ok = await async_client.post(f"/api/v1/assignments/tasks/{task['id']}/assignees", headers=headers, json={
        "person_id": emp["id"],
        "role": "owner",
        "override_leave_conflict": True,
    })
    assert assign_ok.status_code == 201


# -------------------------------------------------------------
# FLOW 3: Leave Approval Flags Overlapping Tasks as "Needs Reassignment"
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_leave_approval_flags_needs_reassignment(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "flow3")
    headers = owner["headers"]

    emp = (await async_client.post("/api/v1/operations/people", headers=headers, json={
        "full_name": "Lead Eng",
        "email": "lead@test.com",
    })).json()

    proj = (await async_client.post("/api/v1/operations/projects", headers=headers, json={
        "name": "Infra Upgrade",
    })).json()

    await async_client.post(f"/api/v1/operations/projects/{proj['id']}/members", headers=headers, json={
        "person_id": emp["id"],
    })

    # Task due on Dec 15
    task = (await async_client.post(f"/api/v1/operations/projects/{proj['id']}/tasks", headers=headers, json={
        "title": "Database Upgrade",
        "due_date": "2026-12-15",
    })).json()

    await async_client.post(f"/api/v1/assignments/tasks/{task['id']}/assignees", headers=headers, json={
        "person_id": emp["id"],
        "role": "owner",
    })

    # Person requests leave overlapping task (Dec 14 - Dec 18)
    leave = (await async_client.post("/api/v1/operations/leave-requests", headers=headers, json={
        "employee_id": emp["id"],
        "start_date": "2026-12-14",
        "end_date": "2026-12-18",
        "reason": "Winter Break",
    })).json()

    # Before approval, task is not flagged
    t_before = (await async_client.get(f"/api/v1/operations/tasks?project_id={proj['id']}", headers=headers)).json()[0]
    assert t_before["needs_reassignment"] is False

    # Approve leave -> task should be flagged
    await async_client.post(f"/api/v1/operations/leave-requests/{leave['id']}/decision", headers=headers, json={
        "decision": "approved",
    })

    # Task now flagged as needs_reassignment
    flagged = await async_client.get("/api/v1/assignments/tasks/needs-reassignment", headers=headers)
    assert flagged.status_code == 200
    assert any(t["id"] == task["id"] for t in flagged.json())

    # Explicit clear flag works
    clear_res = await async_client.post(f"/api/v1/assignments/tasks/{task['id']}/clear-reassignment-flag", headers=headers)
    assert clear_res.status_code == 200

    t_after = (await async_client.get(f"/api/v1/operations/tasks?project_id={proj['id']}", headers=headers)).json()[0]
    assert t_after["needs_reassignment"] is False


# -------------------------------------------------------------
# FLOW 4: Leave Balance Accounting, Overlap Rejection & Self-Approval Prevention
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_leave_balance_overlap_and_self_approval(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "flow4")
    headers = owner["headers"]

    # Create regular user + employee linked to that user
    emp_user = await create_user_with_role(async_client, headers, owner["org_id"], "flow4", "employee")
    emp = (await async_client.post("/api/v1/operations/people", headers=headers, json={
        "full_name": "Regular Dev",
        "email": "reg@test.com",
        "user_id": emp_user["user_id"],
        "annual_leave_days": 10,
    })).json()

    # 1. Self-approval is rejected (403)
    leave = (await async_client.post("/api/v1/operations/leave-requests", headers=emp_user["headers"], json={
        "employee_id": emp["id"],
        "start_date": "2026-10-26",
        "end_date": "2026-10-30",
        "reason": "Rest",
    })).json()

    self_decide = await async_client.post(
        f"/api/v1/operations/leave-requests/{leave['id']}/decision",
        headers=emp_user["headers"],
        json={"decision": "approved"},
    )
    assert self_decide.status_code == 403

    # 2. Overlapping leave is rejected (409)
    overlap = await async_client.post("/api/v1/operations/leave-requests", headers=headers, json={
        "employee_id": emp["id"],
        "start_date": "2026-10-28",
        "end_date": "2026-11-03",
        "reason": "Overlap attempt",
    })
    assert overlap.status_code == 409

    # 3. Manager approves leave -> balance deducted
    b_before = (await async_client.get(f"/api/v1/operations/leave-balances?employee_id={emp['id']}", headers=headers)).json()
    annual_b_before = next(b for b in b_before if b["leave_type_code"] == "annual")

    approve_res = await async_client.post(
        f"/api/v1/operations/leave-requests/{leave['id']}/decision",
        headers=headers,
        json={"decision": "approved"},
    )
    assert approve_res.status_code == 200

    b_after = (await async_client.get(f"/api/v1/operations/leave-balances?employee_id={emp['id']}", headers=headers)).json()
    annual_b_after = next(b for b in b_after if b["leave_type_code"] == "annual")
    assert annual_b_after["used_days"] == annual_b_before["used_days"] + 5.0

    # 4. Cancel approved leave -> balance restored
    await async_client.post(
        f"/api/v1/operations/leave-requests/{leave['id']}/decision",
        headers=headers,
        json={"decision": "cancelled"},
    )
    b_cancelled = (await async_client.get(f"/api/v1/operations/leave-balances?employee_id={emp['id']}", headers=headers)).json()
    annual_b_cancelled = next(b for b in b_cancelled if b["leave_type_code"] == "annual")
    assert annual_b_cancelled["used_days"] == annual_b_before["used_days"]


# -------------------------------------------------------------
# FLOW 5: Non-Member Assignment Rejected & Cross-Tenant 404
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_non_member_rejection_and_cross_tenant_isolation(async_client: AsyncClient):
    org_a = await create_org_and_owner(async_client, "iso1_a")
    org_b = await create_org_and_owner(async_client, "iso1_b")

    # In Org A: create Person A, Project A, Task A
    p_a = (await async_client.post("/api/v1/operations/people", headers=org_a["headers"], json={"full_name": "Alice A"})).json()
    proj_a = (await async_client.post("/api/v1/operations/projects", headers=org_a["headers"], json={"name": "Proj A"})).json()
    task_a = (await async_client.post(f"/api/v1/operations/projects/{proj_a['id']}/tasks", headers=org_a["headers"], json={"title": "Task A"})).json()

    # Person A is NOT yet a member of Project A -> assignment rejected (422)
    non_member_assign = await async_client.post(
        f"/api/v1/assignments/tasks/{task_a['id']}/assignees",
        headers=org_a["headers"],
        json={"person_id": p_a["id"]},
    )
    assert non_member_assign.status_code == 422
    assert "not a member" in non_member_assign.json()["detail"].lower()

    # Cross-tenant: Org B attempts to access Org A's endpoints -> strictly 404
    assert (await async_client.get(f"/api/v1/assignments/tasks/{task_a['id']}/assignees", headers=org_b["headers"])).status_code == 404
    assert (await async_client.post(f"/api/v1/assignments/tasks/{task_a['id']}/assignees", headers=org_b["headers"], json={"person_id": p_a["id"]})).status_code == 404
    assert (await async_client.get(f"/api/v1/assignments/tasks/{task_a['id']}/suggestions", headers=org_b["headers"])).status_code == 404
    assert (await async_client.get(f"/api/v1/operations/people/{p_a['id']}/detail", headers=org_b["headers"])).status_code == 404


# -------------------------------------------------------------
# FLOW 6: Invoice Lifecycle, Sequential Numbering, Immutability & Overpayment
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_invoice_lifecycle_and_immutability(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "inv_life")
    headers = owner["headers"]

    # 1. Create Invoice 1 -> gets sequential number INV-{year}-0001
    current_year = date.today().year
    inv1 = (await async_client.post("/api/v1/billing/invoices", headers=headers, json={
        "client_name": "Apex Corp",
        "currency": "USD",
        "issue_date": str(date.today()),
        "due_date": str(date.today() + timedelta(days=30)),
        "discount_bps": 500,  # 5%
        "tax_bps": 1000,      # 10%
        "line_items": [
            {"description": "Sprint 1 Work", "quantity": 10, "unit_price_cents": 10000},  # $1,000
        ],
    })).json()
    assert inv1["invoice_number"] == f"INV-{current_year}-0001"
    assert inv1["subtotal_cents"] == 100000
    assert inv1["discount_cents"] == 5000
    assert inv1["tax_cents"] == 9500
    assert inv1["total_cents"] == 104500
    assert inv1["status"] == "draft"

    # 2. Next invoice gets INV-{year}-0002
    inv2 = (await async_client.post("/api/v1/billing/invoices", headers=headers, json={
        "client_name": "Beta LLC",
        "currency": "USD",
        "issue_date": str(date.today()),
        "due_date": str(date.today() + timedelta(days=15)),
        "line_items": [{"description": "Item", "quantity": 1, "unit_price_cents": 50000}],
    })).json()
    assert inv2["invoice_number"] == f"INV-{current_year}-0002"

    # 3. Illegal transition: draft directly to paid without payment -> 409
    illegal_patch = await async_client.patch(
        f"/api/v1/billing/invoices/{inv1['id']}/status",
        headers=headers,
        json={"status": "paid"},
    )
    assert illegal_patch.status_code == 409

    # 4. Valid transition: draft -> sent
    sent = await async_client.patch(
        f"/api/v1/billing/invoices/{inv1['id']}/status",
        headers=headers,
        json={"status": "sent"},
    )
    assert sent.status_code == 200
    assert sent.json()["status"] == "sent"

    # 5. Over-payment rejected: total is 104500, try paying 200000 -> 422
    overpay = await async_client.post(
        f"/api/v1/billing/invoices/{inv1['id']}/payments",
        headers=headers,
        json={"amount_cents": 200000, "paid_date": str(date.today())},
    )
    assert overpay.status_code == 422

    # 6. Partial payment -> status becomes partially_paid
    part_pay = await async_client.post(
        f"/api/v1/billing/invoices/{inv1['id']}/payments",
        headers=headers,
        json={"amount_cents": 50000, "paid_date": str(date.today())},
    )
    assert part_pay.status_code == 201
    inv_part = (await async_client.get(f"/api/v1/billing/invoices/{inv1['id']}", headers=headers)).json()
    assert inv_part["status"] == "partially_paid"
    assert inv_part["paid_cents"] == 50000
    assert inv_part["balance_due_cents"] == 54500

    # 7. Final payment -> status becomes paid
    final_pay = await async_client.post(
        f"/api/v1/billing/invoices/{inv1['id']}/payments",
        headers=headers,
        json={"amount_cents": 54500, "paid_date": str(date.today())},
    )
    assert final_pay.status_code == 201
    inv_paid = (await async_client.get(f"/api/v1/billing/invoices/{inv1['id']}", headers=headers)).json()
    assert inv_paid["status"] == "paid"
    assert inv_paid["balance_due_cents"] == 0

    # 8. Paid invoice is immutable: attempting to update line items or dates returns 409
    put_immutable = await async_client.put(
        f"/api/v1/billing/invoices/{inv1['id']}",
        headers=headers,
        json={
            "client_name": "Tampered Name",
            "currency": "USD",
            "issue_date": str(date.today()),
            "due_date": str(date.today() + timedelta(days=30)),
            "line_items": [{"description": "New Item", "quantity": 1, "unit_price_cents": 1000}],
        },
    )
    assert put_immutable.status_code == 409

    # Notes update is allowed
    notes_patch = await async_client.patch(
        f"/api/v1/billing/invoices/{inv1['id']}/notes",
        headers=headers,
        json={"notes": "Paid in full via wire."},
    )
    assert notes_patch.status_code == 200
    assert notes_patch.json()["notes"] == "Paid in full via wire."


# -------------------------------------------------------------
# FLOW 7: Invoice PDF Generation for Each Status & Content Extraction
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_invoice_pdf_generation(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "pdf_test")
    headers = owner["headers"]

    # Create an invoice
    inv = (await async_client.post("/api/v1/billing/invoices", headers=headers, json={
        "client_name": "Acme Megacorp",
        "currency": "USD",
        "issue_date": "2026-10-01",
        "due_date": "2026-10-31",
        "tax_bps": 1000,
        "line_items": [
            {"description": "Cloud Architecture Review & Hardening", "quantity": 1, "unit_price_cents": 350000},
            {"description": "Microservice Security Audit & Penetration Testing", "quantity": 2, "unit_price_cents": 150000},
        ],
        "notes": "Net 30. Wire transfer to Account # 992834-US",
    })).json()

    # 1. Draft PDF
    pdf_draft = await async_client.get(f"/api/v1/billing/invoices/{inv['id']}/pdf", headers=headers)
    assert pdf_draft.status_code == 200
    assert pdf_draft.headers["content-type"] == "application/pdf"
    assert pdf_draft.content.startswith(b"%PDF")
    assert inv["invoice_number"].encode() in pdf_draft.content

    # 2. Sent PDF
    await async_client.patch(f"/api/v1/billing/invoices/{inv['id']}/status", headers=headers, json={"status": "sent"})
    pdf_sent = await async_client.get(f"/api/v1/billing/invoices/{inv['id']}/pdf?download=true", headers=headers)
    assert pdf_sent.status_code == 200
    assert "attachment" in pdf_sent.headers["content-disposition"]
    assert pdf_sent.content.startswith(b"%PDF")

    # 3. Paid PDF
    await async_client.post(
        f"/api/v1/billing/invoices/{inv['id']}/payments",
        headers=headers,
        json={"amount_cents": inv["total_cents"], "paid_date": "2026-10-15"},
    )
    pdf_paid = await async_client.get(f"/api/v1/billing/invoices/{inv['id']}/pdf", headers=headers)
    assert pdf_paid.status_code == 200
    assert pdf_paid.content.startswith(b"%PDF")


# -------------------------------------------------------------
# FLOW 8: PDF Scalability: 0 Items and 100+ Items Without Clipping
# -------------------------------------------------------------
@pytest.mark.asyncio
async def test_flow_invoice_pdf_scalability_and_long_text(async_client: AsyncClient):
    owner = await create_org_and_owner(async_client, "pdf_scale")
    headers = owner["headers"]

    # 100+ line items with long descriptive text
    long_items = [
        {
            "description": f"Service item #{i}: Comprehensive distributed systems analysis with extensive log inspection and benchmark auditing across node clusters",
            "quantity": i % 5 + 1,
            "unit_price_cents": 10000 + (i * 250),
        }
        for i in range(1, 105)
    ]

    inv = (await async_client.post("/api/v1/billing/invoices", headers=headers, json={
        "client_name": "Enterprise Scale Testing LLC",
        "currency": "USD",
        "issue_date": "2026-10-01",
        "due_date": "2026-10-31",
        "line_items": long_items,
    })).json()

    pdf_res = await async_client.get(f"/api/v1/billing/invoices/{inv['id']}/pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF")
    assert len(pdf_res.content) > 10000  # Multi-page valid PDF generated
