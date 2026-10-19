"""Seed Northwind Digital demo dataset.

Includes:
- 1 Organization (Northwind Digital)
- 4 Auth Users (Alice Director, Fiona Finance, Sam Sales, Peter PM)
- 3 Teams (Engineering, Design & UX, Consulting & Delivery)
- 12 Employees / People with capacities and rates
- Project Allocations (ProjectMember)
- Tasks and TaskAssignee (many-to-many, with owner synced)
- Leave Types, Leave Balances, and sample Leave Requests
- An overlap scenario that triggers LEAVE_CONFLICT
"""

from datetime import date, datetime, timezone
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.subscription import Subscription
from app.models.operations import (
    Employee, Team, TeamMember, Project, ProjectMember,
    ProjectTask, TaskAssignee, LeaveType, LeaveBalance, LeaveRequest
)
from app.models.billing import Invoice, InvoiceLineItem, Payment, InvoiceSequence


async def seed_northwind_demo(db: AsyncSession) -> dict:
    # 1. Organization
    org = await db.scalar(select(Organization).where(Organization.name == "Northwind Digital"))
    if not org:
        org = Organization(
            name="Northwind Digital",
            slug="northwind-digital",
            currency="USD",
            plan="Scale",
            settings={
                "address": "100 Innovation Way, Suite 400, Seattle, WA 98101",
                "phone": "+1 (555) 019-2834",
                "email": "ops@northwind.io",
                "website": "https://northwind.io",
                "tax_id": "US-EIN-98-7654321",
            },
        )
        db.add(org)
        await db.flush()

        sub = Subscription(
            org_id=org.id,
            plan="Scale",
            status="active",
            monthly_price_cents=9900,
        )
        db.add(sub)
        await db.flush()

    # 2. Key Users
    demo_users_spec = [
        ("alice@northwind.io", "Alice Director", RoleType.OWNER),
        ("fiona@northwind.io", "Fiona Finance", RoleType.FINANCE),
        ("sam@northwind.io", "Sam Sales", RoleType.SALES),
        ("peter@northwind.io", "Peter PM", RoleType.PROJECT_MANAGER),
    ]
    user_map: dict[str, User] = {}
    default_hash = get_password_hash("Northwind2026!")

    for email, full_name, role in demo_users_spec:
        user = await db.scalar(select(User).where(User.email == email))
        if not user:
            user = User(
                email=email,
                full_name=full_name,
                hashed_password=default_hash,
                is_active=True,
            )
            db.add(user)
            await db.flush()

        mem = await db.scalar(select(Membership).where(Membership.org_id == org.id, Membership.user_id == user.id))
        if not mem:
            mem = Membership(org_id=org.id, user_id=user.id, role=role.value)
            db.add(mem)
            await db.flush()

        user_map[email] = user

    # 3. 12 Employees (People)
    people_specs = [
        {"name": "Alice Director", "email": "alice@northwind.io", "title": "Managing Director", "role": "Director", "bill": 25000, "cost": 12000, "user": user_map.get("alice@northwind.io")},
        {"name": "Bob TechLead", "email": "bob@northwind.io", "title": "Staff Engineer & Tech Lead", "role": "Engineering Lead", "bill": 18000, "cost": 9000},
        {"name": "Charlie Backend", "email": "charlie@northwind.io", "title": "Senior Backend Engineer", "role": "Backend Engineer", "bill": 15000, "cost": 7500},
        {"name": "Diana Frontend", "email": "diana@northwind.io", "title": "Senior Frontend Engineer", "role": "Frontend Engineer", "bill": 14000, "cost": 7000},
        {"name": "Evan DevOps", "email": "evan@northwind.io", "title": "Cloud & DevOps Architect", "role": "DevOps Engineer", "bill": 16000, "cost": 8000},
        {"name": "Fiona Finance", "email": "fiona@northwind.io", "title": "Finance Operations Lead", "role": "Controller", "bill": 12000, "cost": 6000, "user": user_map.get("fiona@northwind.io")},
        {"name": "Clara Designer", "email": "clara@northwind.io", "title": "Design Principal", "role": "UX Lead", "bill": 15000, "cost": 7500},
        {"name": "Grace Product", "email": "grace@northwind.io", "title": "Product Designer", "role": "Product Designer", "bill": 13000, "cost": 6500},
        {"name": "Sam Sales", "email": "sam@northwind.io", "title": "VP Business Development", "role": "Sales Lead", "bill": 17000, "cost": 8500, "user": user_map.get("sam@northwind.io")},
        {"name": "Peter PM", "email": "peter@northwind.io", "title": "Technical Project Manager", "role": "Project Manager", "bill": 14000, "cost": 7000, "user": user_map.get("peter@northwind.io")},
        {"name": "David Consultant", "email": "david@northwind.io", "title": "Principal Architect", "role": "Principal Consultant", "bill": 22000, "cost": 11000},
        {"name": "Hannah QA", "email": "hannah@northwind.io", "title": "Lead SDET", "role": "QA Engineer", "bill": 13000, "cost": 6500},
    ]

    emp_map: dict[str, Employee] = {}
    for spec in people_specs:
        emp = await db.scalar(select(Employee).where(Employee.org_id == org.id, Employee.email == spec["email"]))
        if not emp:
            user_obj = spec.get("user")
            emp = Employee(
                org_id=org.id,
                user_id=user_obj.id if user_obj else None,
                full_name=spec["name"],
                email=spec["email"],
                title=spec["title"],
                role=spec["role"],
                employment_status="full_time",
                billing_rate_cents=spec["bill"],
                cost_rate_cents=spec["cost"],
                weekly_capacity_minutes=2400,  # 40 hours
                annual_leave_days=25,
                is_active=True,
            )
            db.add(emp)
            await db.flush()
        emp_map[spec["name"]] = emp

    # 4. 3 Teams
    teams_spec = [
        {"name": "Engineering", "description": "Core software architecture, backend, frontend, DevOps, and QA", "lead": "Bob TechLead",
         "members": ["Bob TechLead", "Charlie Backend", "Diana Frontend", "Evan DevOps", "Hannah QA"]},
        {"name": "Design & UX", "description": "User experience, product design, and design systems", "lead": "Clara Designer",
         "members": ["Clara Designer", "Grace Product"]},
        {"name": "Consulting & Delivery", "description": "Client delivery, solutions architecture, and project management", "lead": "David Consultant",
         "members": ["David Consultant", "Peter PM", "Alice Director", "Fiona Finance", "Sam Sales"]},
    ]

    for t_spec in teams_spec:
        lead_emp = emp_map.get(t_spec["lead"])
        team = await db.scalar(select(Team).where(Team.org_id == org.id, Team.name == t_spec["name"]))
        if not team:
            team = Team(
                org_id=org.id,
                name=t_spec["name"],
                description=t_spec["description"],
                lead_id=lead_emp.id if lead_emp else None,
                is_active=True,
            )
            db.add(team)
            await db.flush()

        for mem_name in t_spec["members"]:
            mem_emp = emp_map.get(mem_name)
            if not mem_emp:
                continue
            tm = await db.scalar(select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.person_id == mem_emp.id))
            if not tm:
                tm = TeamMember(
                    org_id=org.id,
                    team_id=team.id,
                    person_id=mem_emp.id,
                    role="lead" if mem_name == t_spec["lead"] else "member",
                )
                db.add(tm)
                await db.flush()

    # 5. Leave Types & Balances
    leave_types_spec = [
        {"name": "Annual Leave", "code": "annual", "days": 25, "paid": True},
        {"name": "Sick Leave", "code": "sick", "days": 10, "paid": True},
        {"name": "Unpaid Leave", "code": "unpaid", "days": 0, "paid": False},
    ]
    lt_map: dict[str, LeaveType] = {}
    for lt_spec in leave_types_spec:
        lt = await db.scalar(select(LeaveType).where(LeaveType.org_id == org.id, LeaveType.code == lt_spec["code"]))
        if not lt:
            lt = LeaveType(
                org_id=org.id,
                name=lt_spec["name"],
                code=lt_spec["code"],
                default_days_per_year=lt_spec["days"],
                is_paid=lt_spec["paid"],
                is_active=True,
            )
            db.add(lt)
            await db.flush()
        lt_map[lt_spec["code"]] = lt

    current_year = date.today().year
    for emp in emp_map.values():
        for code, lt in lt_map.items():
            lb = await db.scalar(select(LeaveBalance).where(
                LeaveBalance.person_id == emp.id,
                LeaveBalance.leave_type_id == lt.id,
                LeaveBalance.year == current_year,
            ))
            if not lb:
                lb = LeaveBalance(
                    org_id=org.id,
                    person_id=emp.id,
                    leave_type_id=lt.id,
                    year=current_year,
                    allocated_days=float(lt.default_days_per_year),
                    used_days=0.0,
                )
                db.add(lb)
                await db.flush()

    # 6. Projects & Project Members
    proj1 = await db.scalar(select(Project).where(Project.org_id == org.id, Project.name == "Northwind Client Portal"))
    if not proj1:
        proj1 = Project(
            org_id=org.id,
            name="Northwind Client Portal",
            description="B2B customer portal with secure document exchange and billing review.",
            status="active",
            budget_minutes=14400,  # 240h
            budget_amount_cents=3600000,  # $36k
            currency="USD",
            start_date=date(2026, 10, 1),
            end_date=date(2026, 12, 31),
        )
        db.add(proj1)
        await db.flush()

    proj2 = await db.scalar(select(Project).where(Project.org_id == org.id, Project.name == "Cloud Migration Platform"))
    if not proj2:
        proj2 = Project(
            org_id=org.id,
            name="Cloud Modernization",
            description="Migration of legacy microservices into Kubernetes with automated CI/CD.",
            status="active",
            budget_minutes=18000,  # 300h
            budget_amount_cents=5400000,  # $54k
            currency="USD",
            start_date=date(2026, 10, 15),
            end_date=date(2027, 2, 28),
        )
        db.add(proj2)
        await db.flush()

    # Add Project Members
    allocations = [
        (proj1, "Bob TechLead", "lead", 25, 10),
        (proj1, "Charlie Backend", "contributor", 50, 20),
        (proj1, "Diana Frontend", "contributor", 50, 20),
        (proj1, "Peter PM", "manager", 25, 10),
        (proj1, "Hannah QA", "contributor", 25, 10),
        (proj2, "Bob TechLead", "lead", 25, 10),
        (proj2, "Charlie Backend", "contributor", 50, 20),
        (proj2, "Evan DevOps", "contributor", 75, 30),
        (proj2, "David Consultant", "architect", 30, 12),
    ]
    for proj, emp_name, role, alloc_pct, hrs in allocations:
        p_emp = emp_map.get(emp_name)
        if not p_emp:
            continue
        pmem = await db.scalar(select(ProjectMember).where(ProjectMember.project_id == proj.id, ProjectMember.person_id == p_emp.id))
        if not pmem:
            pmem = ProjectMember(
                org_id=org.id,
                project_id=proj.id,
                person_id=p_emp.id,
                role=role,
                allocation_percent=alloc_pct,
                hours_per_week=hrs,
                start_date=proj.start_date,
                end_date=proj.end_date,
            )
            db.add(pmem)
            await db.flush()

    # 7. Tasks & Task Assignees
    tasks_data = [
        {
            "project": proj1,
            "title": "Database Schema Design & Migration",
            "desc": "Design schema for client entities and run initial migrations.",
            "status": "done",
            "prio": "high",
            "est": 960,  # 16h
            "due": date(2026, 10, 25),
            "owner": "Charlie Backend",
        },
        {
            "project": proj1,
            "title": "OAuth Authentication & Session Service",
            "desc": "Implement multi-tenant JWT and session storage.",
            "status": "in_progress",
            "prio": "high",
            "est": 1200,  # 20h
            "due": date(2026, 11, 5),
            "owner": "Charlie Backend",
            "contributor": "Bob TechLead",
        },
        {
            "project": proj1,
            "title": "Frontend Responsive Navigation & Theme",
            "desc": "Build navigation bar, mobile drawer, and Tailwind dark mode.",
            "status": "in_progress",
            "prio": "medium",
            "est": 840,  # 14h
            "due": date(2026, 11, 15),
            "owner": "Diana Frontend",
        },
        {
            "project": proj1,
            "title": "API Gateway Performance Tuning",
            "desc": "Profile slow queries and configure Redis caching layer.",
            "status": "todo",
            "prio": "urgent",
            "est": 1440,  # 24h
            "due": date(2026, 11, 12),  # NOTE: Overlaps Charlie's approved leave!
            "owner": "Charlie Backend",
        },
        {
            "project": proj2,
            "title": "Terraform Infrastructure as Code Baseline",
            "desc": "Set up VPC, subnets, and EKS cluster manifests.",
            "status": "in_progress",
            "prio": "high",
            "est": 1800,  # 30h
            "due": date(2026, 11, 8),
            "owner": "Evan DevOps",
        },
    ]

    for t_spec in tasks_data:
        task = await db.scalar(select(ProjectTask).where(
            ProjectTask.project_id == t_spec["project"].id,
            ProjectTask.title == t_spec["title"],
        ))
        owner_emp = emp_map.get(t_spec.get("owner", ""))
        if not task:
            task = ProjectTask(
                org_id=org.id,
                project_id=t_spec["project"].id,
                title=t_spec["title"],
                description=t_spec["desc"],
                status=t_spec["status"],
                priority=t_spec["prio"],
                estimate_minutes=t_spec["est"],
                due_date=t_spec["due"],
                assignee_id=owner_emp.id if owner_emp else None,
                needs_reassignment=False,
            )
            db.add(task)
            await db.flush()

        if owner_emp:
            ta = await db.scalar(select(TaskAssignee).where(TaskAssignee.task_id == task.id, TaskAssignee.person_id == owner_emp.id))
            if not ta:
                ta = TaskAssignee(
                    org_id=org.id,
                    task_id=task.id,
                    person_id=owner_emp.id,
                    role="owner",
                    assigned_by=user_map["alice@northwind.io"].id,
                    assigned_at=datetime.now(timezone.utc),
                )
                db.add(ta)
                await db.flush()

        contrib_name = t_spec.get("contributor")
        if contrib_name:
            c_emp = emp_map.get(contrib_name)
            if c_emp:
                c_ta = await db.scalar(select(TaskAssignee).where(TaskAssignee.task_id == task.id, TaskAssignee.person_id == c_emp.id))
                if not c_ta:
                    c_ta = TaskAssignee(
                        org_id=org.id,
                        task_id=task.id,
                        person_id=c_emp.id,
                        role="contributor",
                        assigned_by=user_map["alice@northwind.io"].id,
                        assigned_at=datetime.now(timezone.utc),
                    )
                    db.add(c_ta)
                    await db.flush()

    # 8. Leave Requests (Including Conflicting Overlap)
    charlie_emp = emp_map["Charlie Backend"]
    diana_emp = emp_map["Diana Frontend"]
    annual_lt = lt_map["annual"]

    # Charlie has APPROVED leave from 2026-11-10 to 2026-11-14 (5 working days)
    charlie_leave = await db.scalar(select(LeaveRequest).where(
        LeaveRequest.employee_id == charlie_emp.id,
        LeaveRequest.start_date == date(2026, 11, 10),
    ))
    if not charlie_leave:
        charlie_leave = LeaveRequest(
            org_id=org.id,
            employee_id=charlie_emp.id,
            leave_type_id=annual_lt.id,
            leave_type="annual",
            start_date=date(2026, 11, 10),
            end_date=date(2026, 11, 14),
            working_days=5,
            days_computed=5.0,
            reason="Family vacation in Oregon",
            status="approved",
            reviewed_by_user_id=user_map["alice@northwind.io"].id,
            reviewed_at=datetime.now(timezone.utc).replace(tzinfo=None),
            decision_note="Approved. Have a great vacation Charlie!",
        )
        db.add(charlie_leave)
        await db.flush()

        # Deduct balance
        charlie_bal = await db.scalar(select(LeaveBalance).where(
            LeaveBalance.person_id == charlie_emp.id,
            LeaveBalance.leave_type_id == annual_lt.id,
            LeaveBalance.year == current_year,
        ))
        if charlie_bal:
            charlie_bal.used_days = min(charlie_bal.allocated_days, charlie_bal.used_days + 5.0)
            await db.flush()

    # Diana has PENDING leave from 2026-11-20 to 2026-11-22 (3 working days)
    diana_leave = await db.scalar(select(LeaveRequest).where(
        LeaveRequest.employee_id == diana_emp.id,
        LeaveRequest.start_date == date(2026, 11, 20),
    ))
    if not diana_leave:
        diana_leave = LeaveRequest(
            org_id=org.id,
            employee_id=diana_emp.id,
            leave_type_id=annual_lt.id,
            leave_type="annual",
            start_date=date(2026, 11, 20),
            end_date=date(2026, 11, 22),
            working_days=3,
            days_computed=3.0,
            reason="Attending frontend conference",
            status="pending",
        )
        db.add(diana_leave)
        await db.flush()

    # 9. Invoice Sequence & Sample Invoices
    inv_seq = await db.scalar(select(InvoiceSequence).where(
        InvoiceSequence.org_id == org.id,
        InvoiceSequence.year == current_year,
        InvoiceSequence.prefix == "INV",
    ))
    if not inv_seq:
        inv_seq = InvoiceSequence(
            org_id=org.id,
            year=current_year,
            prefix="INV",
            last_number=1003,
        )
        db.add(inv_seq)
        await db.flush()

    # Sample invoices: Paid, Partial, Sent, Draft
    sample_invoices = [
        {
            "num": f"INV-{current_year}-1001",
            "client": "Acme Global Solutions",
            "status": "paid",
            "issue": date(2026, 9, 1),
            "due": date(2026, 9, 30),
            "lines": [
                ("Phase 1 Architecture & Setup", 1, 1500000),
                ("Database Infrastructure Provisioning", 1, 500000),
            ],
            "paid": 2200000,
            "tax_bps": 1000,
        },
        {
            "num": f"INV-{current_year}-1002",
            "client": "Global Logistics Corp",
            "status": "partially_paid",
            "issue": date(2026, 10, 1),
            "due": date(2026, 10, 31),
            "lines": [
                ("Full Stack Sprint 1 Delivery", 1, 1200000),
                ("QA & Automated Test Harness", 1, 400000),
            ],
            "paid": 880000,
            "tax_bps": 1000,
        },
        {
            "num": f"INV-{current_year}-1003",
            "client": "Starlight Ventures",
            "status": "sent",
            "issue": date(2026, 10, 10),
            "due": date(2026, 11, 9),
            "lines": [
                ("Cloud Security & Access Audit", 1, 800000),
            ],
            "paid": 0,
            "tax_bps": 1000,
        },
    ]

    for inv_spec in sample_invoices:
        inv = await db.scalar(select(Invoice).where(Invoice.org_id == org.id, Invoice.invoice_number == inv_spec["num"]))
        if not inv:
            subtotal = sum(q * r for _, q, r in inv_spec["lines"])
            tax = (subtotal * inv_spec["tax_bps"] + 5000) // 10000
            total = subtotal + tax
            inv = Invoice(
                org_id=org.id,
                project_id=proj1.id,
                invoice_number=inv_spec["num"],
                client_name=inv_spec["client"],
                status=inv_spec["status"],
                currency="USD",
                subtotal_cents=subtotal,
                tax_cents=tax,
                total_cents=total,
                paid_cents=inv_spec["paid"],
                issue_date=inv_spec["issue"],
                due_date=inv_spec["due"],
                notes="Net 30 terms. Thank you for your business.",
            )
            db.add(inv)
            await db.flush()

            for desc, qty, rate in inv_spec["lines"]:
                line = InvoiceLineItem(
                    org_id=org.id,
                    invoice_id=inv.id,
                    description=desc,
                    quantity=qty,
                    unit_price_cents=rate,
                    amount_cents=qty * rate,
                )
                db.add(line)

            if inv_spec["paid"] > 0:
                payment = Payment(
                    org_id=org.id,
                    invoice_id=inv.id,
                    amount_cents=inv_spec["paid"],
                    paid_date=inv_spec["issue"],
                    method="bank_transfer",
                    reference="WIRE-TX-9901",
                )
                db.add(payment)

    await db.commit()
    return {
        "org_id": org.id,
        "org_name": org.name,
        "people_count": len(emp_map),
        "teams_count": len(teams_spec),
        "status": "seeded",
    }
