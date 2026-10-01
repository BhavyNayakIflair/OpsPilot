from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user, get_current_membership, require_role
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.crm import Lead
from app.models.operations import Project, TimeEntry
from app.models.billing import Invoice, Expense
from app.models.content import WorkflowRun

router = APIRouter()


class Decision(BaseModel):
    decision: str


@router.get("/approvals")
async def list_approvals(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE]))):
    times = (await db.scalars(select(TimeEntry).where(TimeEntry.org_id == org.id, TimeEntry.approval_status == "pending"))).all()
    expenses = (await db.scalars(select(Expense).where(Expense.org_id == org.id, Expense.status == "pending"))).all()
    return ([{"id": row.id, "entity_type": "timesheet", "label": row.description, "amount_cents": None, "created_at": row.created_at} for row in times]
            + [{"id": row.id, "entity_type": "expense", "label": f"{row.vendor}: {row.description}", "amount_cents": row.amount_cents, "currency": row.currency, "created_at": row.created_at} for row in expenses])


@router.post("/approvals/{entity_type}/{entity_id}")
async def decide_approval(entity_type: str, entity_id: str, data: Decision, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE]))):
    if data.decision not in ("approved", "rejected"): raise HTTPException(status_code=422, detail="Decision must be approved or rejected")
    if entity_type == "timesheet":
        row = await db.scalar(select(TimeEntry).where(TimeEntry.id == entity_id, TimeEntry.org_id == org.id))
        if not row: raise HTTPException(status_code=404, detail="Approval item not found")
        row.approval_status = data.decision
    elif entity_type == "expense":
        row = await db.scalar(select(Expense).where(Expense.id == entity_id, Expense.org_id == org.id))
        if not row: raise HTTPException(status_code=404, detail="Approval item not found")
        row.status = data.decision
    else: raise HTTPException(status_code=404, detail="Unsupported approval item")
    await db.commit(); return {"id": entity_id, "entity_type": entity_type, "status": data.decision}


@router.get("")
async def list_workflows(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE, RoleType.SALES]))):
    return (await db.scalars(select(WorkflowRun).where(WorkflowRun.org_id == org.id).order_by(WorkflowRun.created_at.desc()))).all()


@router.post("/{workflow_type}", status_code=201)
async def run_workflow(workflow_type: str, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), membership: Membership = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    allowed_roles = {
        "lead_qualification": {RoleType.SALES.value, RoleType.PROJECT_MANAGER.value},
        "invoice_aging": {RoleType.FINANCE.value},
        "project_health": {RoleType.PROJECT_MANAGER.value},
    }
    if workflow_type not in allowed_roles: raise HTTPException(status_code=422, detail="Unsupported workflow")
    if membership.role != RoleType.OWNER.value and membership.role not in allowed_roles[workflow_type]:
        raise HTTPException(status_code=403, detail="Your role cannot run this workflow")
    today = date.today()
    if workflow_type == "lead_qualification":
        leads = (await db.scalars(select(Lead).where(Lead.org_id == org.id, Lead.status == "open"))).all()
        result = [{"lead_id": lead.id, "title": lead.title, "score": min(100, 20 + (30 if lead.contact_id else 0) + (20 if lead.company_id else 0) + (30 if lead.value_cents >= 1000000 else 10))} for lead in leads]
    elif workflow_type == "invoice_aging":
        invoices = (await db.scalars(select(Invoice).where(Invoice.org_id == org.id, Invoice.status != "paid", Invoice.status != "void", Invoice.due_date < today))).all()
        result = [{"invoice_id": row.id, "invoice_number": row.invoice_number, "client_name": row.client_name, "balance_cents": row.total_cents - row.paid_cents, "days_overdue": (today - row.due_date).days} for row in invoices]
    elif workflow_type == "project_health":
        projects = (await db.scalars(select(Project).where(Project.org_id == org.id, Project.status == "active"))).all()
        result = []
        for project in projects:
            logged = await db.scalar(select(func.coalesce(func.sum(TimeEntry.minutes), 0)).where(TimeEntry.org_id == org.id, TimeEntry.project_id == project.id, TimeEntry.is_billable.is_(True)))
            pct = int(logged * 100 / project.budget_minutes) if project.budget_minutes else 0
            result.append({"project_id": project.id, "name": project.name, "logged_minutes": logged, "budget_minutes": project.budget_minutes, "utilization_percent": pct, "at_risk": pct >= 80})
    else: raise HTTPException(status_code=422, detail="Supported workflows: lead_qualification, invoice_aging, project_health")
    run = WorkflowRun(org_id=org.id, user_id=user.id, workflow_type=workflow_type, input_data={"as_of": today.isoformat()}, result_data={"items": result})
    db.add(run); await db.commit(); await db.refresh(run); return run
