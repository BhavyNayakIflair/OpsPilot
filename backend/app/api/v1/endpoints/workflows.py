from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user, get_current_membership, require_role
from app.gateway.base import LLMProvider, ProviderError
from app.gateway.factory import get_llm_provider
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.crm import Lead
from app.models.operations import Project, TimeEntry
from app.models.billing import Invoice, Expense
from app.models.content import WorkflowRun, WorkflowStep, QuoteAgentApproval
from app.models.quotes import RateCard
from app.services.quote_agent_service import execute_quote_agent

router = APIRouter()


class Decision(BaseModel):
    decision: str


class QuoteAgentRequest(BaseModel):
    lead_id: str
    rate_card_id: str | None = None


async def _agent_run_detail(db: AsyncSession, run: WorkflowRun):
    steps = (await db.scalars(select(WorkflowStep).where(
        WorkflowStep.org_id == run.org_id, WorkflowStep.workflow_run_id == run.id
    ).order_by(WorkflowStep.created_at))).all()
    approval = await db.scalar(select(QuoteAgentApproval).where(
        QuoteAgentApproval.org_id == run.org_id, QuoteAgentApproval.workflow_run_id == run.id
    ))
    return {
        **{column.name: getattr(run, column.name) for column in WorkflowRun.__table__.columns},
        "steps": [{column.name: getattr(step, column.name) for column in WorkflowStep.__table__.columns} for step in steps],
        "approval": ({column.name: getattr(approval, column.name) for column in QuoteAgentApproval.__table__.columns}
                     if approval else None),
    }


@router.post("/quote-agent/run", status_code=201)
async def run_quote_agent(data: QuoteAgentRequest, user: User = Depends(get_current_user),
                          org: Organization = Depends(get_current_tenant),
                          membership: Membership = Depends(get_current_membership),
                          db: AsyncSession = Depends(get_db), provider: LLMProvider = Depends(get_llm_provider)):
    if membership.role not in (RoleType.OWNER.value, RoleType.SALES.value, RoleType.PROJECT_MANAGER.value):
        raise HTTPException(status_code=403, detail="Your role cannot run the quote agent")
    lead = await db.scalar(select(Lead).where(Lead.id == data.lead_id, Lead.org_id == org.id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.status in ("won", "lost"):
        raise HTTPException(status_code=409, detail="Quotes can only be drafted for open leads")
    if data.rate_card_id:
        card = await db.scalar(select(RateCard).where(RateCard.id == data.rate_card_id, RateCard.org_id == org.id))
        if not card:
            raise HTTPException(status_code=404, detail="Rate card not found")
        if card.currency.upper() != lead.currency.upper():
            raise HTTPException(status_code=422, detail="Rate card currency must match the lead currency")
    run = WorkflowRun(org_id=org.id, user_id=user.id, workflow_type="quote_agent", status="running",
                      input_data={"lead_id": lead.id, "rate_card_id": data.rate_card_id}, result_data={})
    db.add(run)
    await db.commit()
    await db.refresh(run)
    state = {"run_id": run.id, "org_id": org.id, "user_id": user.id,
             "lead_id": lead.id, "rate_card_id": data.rate_card_id}
    try:
        await execute_quote_agent(db, provider, state)
    except ProviderError as exc:
        run.status = "failed"
        run.result_data = {"error": str(exc)[:500]}
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Quote agent could not complete: {exc}") from exc
    except Exception:
        # The graph records node errors and status; retain that run for inspection.
        await db.refresh(run)
    await db.refresh(run)
    return await _agent_run_detail(db, run)


@router.get("/runs/{run_id}")
async def get_workflow_run(run_id: str, org: Organization = Depends(get_current_tenant),
                           db: AsyncSession = Depends(get_db),
                           _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE, RoleType.SALES]))):
    run = await db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.org_id == org.id))
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return await _agent_run_detail(db, run)


@router.get("/approvals")
async def list_approvals(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE]))):
    times = (await db.scalars(select(TimeEntry).where(TimeEntry.org_id == org.id, TimeEntry.approval_status == "pending"))).all()
    expenses = (await db.scalars(select(Expense).where(Expense.org_id == org.id, Expense.status == "pending"))).all()
    quote_approvals = (await db.execute(select(QuoteAgentApproval, WorkflowRun).join(
        WorkflowRun, WorkflowRun.id == QuoteAgentApproval.workflow_run_id
    ).where(QuoteAgentApproval.org_id == org.id, QuoteAgentApproval.status == "pending",
            WorkflowRun.org_id == org.id))).all()
    quote_items = [{"id": approval.id, "entity_type": "quote_agent",
                    "label": f"Quote draft review · {(await db.scalar(select(Lead.title).where(Lead.id == run.input_data.get('lead_id'), Lead.org_id == org.id))) or 'lead'}",
                    "reason": approval.reason, "created_at": approval.created_at}
                   for approval, run in quote_approvals]
    return ([{"id": row.id, "entity_type": "timesheet", "label": row.description, "amount_cents": None, "created_at": row.created_at} for row in times]
            + [{"id": row.id, "entity_type": "expense", "label": f"{row.vendor}: {row.description}", "amount_cents": row.amount_cents, "currency": row.currency, "created_at": row.created_at} for row in expenses]
            + quote_items)


@router.post("/approvals/{entity_type}/{entity_id}")
async def decide_approval(entity_type: str, entity_id: str, data: Decision, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), provider: LLMProvider = Depends(get_llm_provider), _role: Membership = Depends(require_role([RoleType.APPROVER, RoleType.PROJECT_MANAGER, RoleType.FINANCE]))):
    if data.decision not in ("approved", "rejected"): raise HTTPException(status_code=422, detail="Decision must be approved or rejected")
    if entity_type == "timesheet":
        row = await db.scalar(select(TimeEntry).where(TimeEntry.id == entity_id, TimeEntry.org_id == org.id))
        if not row: raise HTTPException(status_code=404, detail="Approval item not found")
        row.approval_status = data.decision
    elif entity_type == "expense":
        row = await db.scalar(select(Expense).where(Expense.id == entity_id, Expense.org_id == org.id))
        if not row: raise HTTPException(status_code=404, detail="Approval item not found")
        row.status = data.decision
    elif entity_type == "quote_agent":
        approval = await db.scalar(select(QuoteAgentApproval).where(
            QuoteAgentApproval.id == entity_id, QuoteAgentApproval.org_id == org.id
        ))
        if not approval or approval.status != "pending":
            raise HTTPException(status_code=404, detail="Approval item not found")
        run = await db.scalar(select(WorkflowRun).where(
            WorkflowRun.id == approval.workflow_run_id, WorkflowRun.org_id == org.id,
            WorkflowRun.workflow_type == "quote_agent"
        ))
        if not run:
            raise HTTPException(status_code=404, detail="Workflow run not found")
        state = {"run_id": run.id, "org_id": org.id, "user_id": run.user_id or "",
                 "lead_id": run.input_data["lead_id"], "rate_card_id": run.input_data.get("rate_card_id"),
                 "approval_id": approval.id}
        await execute_quote_agent(db, provider, state, resume_decision=data.decision)
        await db.refresh(run)
        return await _agent_run_detail(db, run)
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
