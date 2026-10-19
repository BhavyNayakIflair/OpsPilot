from datetime import date, datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user, get_current_membership, require_role
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.operations import Project
from app.models.billing import Invoice, InvoiceLineItem, Payment, Expense
from app.schemas.billing import (
    InvoiceCreate, InvoiceRead, PaymentCreate, PaymentRead,
    ExpenseCreate, ExpenseUpdate, BillingAnomalyReport
)
from app.services.invoice_service import InvoiceService
from app.services.pdf_service import generate_invoice_pdf
from app.services.audit_service import AuditService

router = APIRouter()


async def _owned(db: AsyncSession, model, object_id: str, org_id: str):
    row = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if row is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return row


async def _invoice_out(db: AsyncSession, invoice: Invoice) -> dict:
    lines = (await db.scalars(
        select(InvoiceLineItem).where(
            InvoiceLineItem.invoice_id == invoice.id,
            InvoiceLineItem.org_id == invoice.org_id,
        )
    )).all()
    today = date.today()
    is_overdue = (
        invoice.due_date < today
        and invoice.status not in ("paid", "void")
        and invoice.paid_cents < invoice.total_cents
    )
    balance_due = max(0, invoice.total_cents - invoice.paid_cents)
    data = {column.name: getattr(invoice, column.name) for column in Invoice.__table__.columns}
    data["line_items"] = lines
    data["balance_due_cents"] = balance_due
    data["is_overdue"] = is_overdue
    return data


@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = Query(default=None),
    client_name: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    overdue: bool = Query(default=False),
    order_by: str = Query(default="issue_date"),
    order_dir: str = Query(default="desc"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER, RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.SALES])),
):
    """List invoices with server-side search, filtering, overdue computation, and sorting."""
    invoices, total = await InvoiceService.list_invoices(
        db=db,
        org_id=org.id,
        status=status,
        client_name=client_name,
        search=search,
        start_date=start_date,
        end_date=end_date,
        overdue_only=overdue,
        order_by=order_by,
        order_dir=order_dir,
        limit=limit,
        offset=offset,
    )
    return [await _invoice_out(db, item) for item in invoices]


@router.post("/invoices", status_code=201)
async def create_invoice(
    data: InvoiceCreate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    """Create a draft invoice with server-side Decimal totals and sequential org-scoped numbering."""
    if data.due_date < data.issue_date:
        raise HTTPException(status_code=422, detail="Due date must be on or after issue date")
    if data.project_id:
        await _owned(db, Project, data.project_id, org.id)

    # Server-side Decimal calculation
    totals = InvoiceService.calculate_totals(
        line_items=data.line_items,
        discount_bps=getattr(data, "discount_bps", 0),
        tax_bps=data.tax_bps,
    )

    # Race-safe sequential org-scoped invoice numbering
    inv_number = await InvoiceService.get_next_invoice_number(db, org.id, data.issue_date.year, prefix="INV")

    invoice = Invoice(
        org_id=org.id,
        project_id=data.project_id,
        invoice_number=inv_number,
        client_name=data.client_name,
        status="draft",
        currency=data.currency.upper(),
        subtotal_cents=totals["subtotal_cents"],
        discount_cents=totals["discount_cents"],
        tax_cents=totals["tax_cents"],
        total_cents=totals["total_cents"],
        paid_cents=0,
        issue_date=data.issue_date,
        due_date=data.due_date,
        notes=data.notes,
    )
    db.add(invoice)
    await db.flush()

    for item in data.line_items:
        db.add(
            InvoiceLineItem(
                org_id=org.id,
                invoice_id=invoice.id,
                description=item.description,
                quantity=item.quantity,
                unit_price_cents=item.unit_price_cents,
                amount_cents=item.quantity * item.unit_price_cents,
            )
        )

    await AuditService.log_action(
        db=db,
        org_id=org.id,
        user_id=user.id,
        action="invoice.created",
        entity_type="invoice",
        entity_id=invoice.id,
        details={
            "invoice_number": inv_number,
            "client_name": invoice.client_name,
            "total_cents": totals["total_cents"],
        },
    )

    await db.commit()
    await db.refresh(invoice)
    return await _invoice_out(db, invoice)


@router.put("/invoices/{invoice_id}")
async def update_draft_invoice(
    invoice_id: str,
    data: InvoiceCreate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    """Update an unpaid draft invoice. Paid and void invoices are immutable."""
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    if invoice.status != "draft" or invoice.paid_cents > 0:
        raise HTTPException(status_code=409, detail="Only unpaid draft invoices can be edited")
    if data.due_date < data.issue_date:
        raise HTTPException(status_code=422, detail="Due date must be on or after issue date")
    if data.project_id:
        await _owned(db, Project, data.project_id, org.id)

    totals = InvoiceService.calculate_totals(
        line_items=data.line_items,
        discount_bps=getattr(data, "discount_bps", 0),
        tax_bps=data.tax_bps,
    )

    invoice.project_id = data.project_id
    invoice.client_name = data.client_name
    invoice.currency = data.currency.upper()
    invoice.subtotal_cents = totals["subtotal_cents"]
    invoice.discount_cents = totals["discount_cents"]
    invoice.tax_cents = totals["tax_cents"]
    invoice.total_cents = totals["total_cents"]
    invoice.issue_date = data.issue_date
    invoice.due_date = data.due_date
    invoice.notes = data.notes

    await db.execute(
        delete(InvoiceLineItem).where(
            InvoiceLineItem.org_id == org.id,
            InvoiceLineItem.invoice_id == invoice.id,
        )
    )
    for item in data.line_items:
        db.add(
            InvoiceLineItem(
                org_id=org.id,
                invoice_id=invoice.id,
                description=item.description,
                quantity=item.quantity,
                unit_price_cents=item.unit_price_cents,
                amount_cents=item.quantity * item.unit_price_cents,
            )
        )

    await AuditService.log_action(
        db=db,
        org_id=org.id,
        user_id=user.id,
        action="invoice.updated",
        entity_type="invoice",
        entity_id=invoice.id,
        details={"total_cents": totals["total_cents"]},
    )

    await db.commit()
    await db.refresh(invoice)
    return await _invoice_out(db, invoice)


@router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_draft_invoice(
    invoice_id: str,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    """Delete an unpaid draft invoice."""
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    if invoice.status != "draft" or invoice.paid_cents > 0:
        raise HTTPException(status_code=409, detail="Only unpaid draft invoices can be deleted")
    await db.delete(invoice)
    await AuditService.log_action(
        db=db,
        org_id=org.id,
        user_id=user.id,
        action="invoice.deleted",
        entity_type="invoice",
        entity_id=invoice_id,
        details={"invoice_number": invoice.invoice_number},
    )
    await db.commit()


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER, RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.SALES])),
):
    return await _invoice_out(db, await _owned(db, Invoice, invoice_id, org.id))


@router.patch("/invoices/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str,
    data: dict,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    """Enforce strict status lifecycle: draft -> sent -> partially_paid -> paid; non-paid -> void."""
    status_value = data.get("status")
    if not status_value or status_value not in ("sent", "void", "partially_paid", "paid"):
        raise HTTPException(status_code=422, detail="Invalid target status")

    invoice = await _owned(db, Invoice, invoice_id, org.id)
    prev_status = invoice.status

    # Enforce lifecycle transition rules
    InvoiceService.validate_status_transition(prev_status, status_value)

    invoice.status = status_value
    await AuditService.log_action(
        db=db,
        org_id=org.id,
        user_id=user.id,
        action="invoice.status_changed",
        entity_type="invoice",
        entity_id=invoice.id,
        details={"from": prev_status, "to": status_value},
    )
    await db.commit()
    await db.refresh(invoice)
    return await _invoice_out(db, invoice)


@router.patch("/invoices/{invoice_id}/notes")
async def update_invoice_notes(
    invoice_id: str,
    data: dict,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    """Notes may be updated on any invoice (including paid/void)."""
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    invoice.notes = data.get("notes")
    await db.commit()
    await db.refresh(invoice)
    return await _invoice_out(db, invoice)


@router.get("/invoices/{invoice_id}/payments")
async def list_payments(
    invoice_id: str,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    await _owned(db, Invoice, invoice_id, org.id)
    return (await db.scalars(
        select(Payment)
        .where(Payment.invoice_id == invoice_id, Payment.org_id == org.id)
        .order_by(Payment.paid_date.asc(), Payment.created_at.asc())
    )).all()


@router.post("/invoices/{invoice_id}/payments", status_code=201)
async def record_payment(
    invoice_id: str,
    data: PaymentCreate,
    org: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    """Record an invoice payment, reject overpayment, and auto-update status."""
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    payment = await InvoiceService.record_payment(
        db=db,
        org_id=org.id,
        invoice=invoice,
        amount_cents=data.amount_cents,
        paid_date=data.paid_date,
        method=data.method,
        reference=data.reference,
        user_id=user.id,
    )
    return payment


@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    download: bool = Query(default=False),
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER, RoleType.PROJECT_MANAGER, RoleType.APPROVER, RoleType.SALES])),
):
    """Generate and return professional PDF document for the invoice."""
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    lines = (await db.scalars(
        select(InvoiceLineItem).where(
            InvoiceLineItem.invoice_id == invoice.id,
            InvoiceLineItem.org_id == org.id,
        )
    )).all()
    project = None
    if invoice.project_id:
        project = await db.scalar(select(Project).where(Project.id == invoice.project_id, Project.org_id == org.id))
    payments = (await db.scalars(
        select(Payment).where(Payment.invoice_id == invoice.id, Payment.org_id == org.id)
    )).all()

    pdf_bytes = generate_invoice_pdf(
        org=org,
        invoice=invoice,
        lines=lines,
        project=project,
        payments=payments,
    )

    disposition_type = "attachment" if download else "inline"
    filename = f"{invoice.invoice_number}.pdf"
    headers = {
        "Content-Disposition": f'{disposition_type}; filename="{filename}"',
        "Content-Length": str(len(pdf_bytes)),
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


# -------------------------------------------------------------
# EXPENSES
# -------------------------------------------------------------

@router.get("/expenses")
async def list_expenses(org: Organization = Depends(get_current_tenant), user: User = Depends(get_current_user), membership: Membership = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    query = select(Expense).where(Expense.org_id == org.id)
    if membership.role not in (RoleType.OWNER.value, RoleType.FINANCE.value, RoleType.APPROVER.value):
        query = query.where(Expense.submitted_by == user.id)
    return (await db.scalars(query.order_by(Expense.expense_date.desc()))).all()


@router.post("/expenses", status_code=201)
async def create_expense(data: ExpenseCreate, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = Expense(org_id=org.id, submitted_by=user.id, **data.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: ExpenseUpdate, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Expense, expense_id, org.id)
    if row.submitted_by != user.id or row.status != "pending":
        raise HTTPException(status_code=409, detail="Only your pending expenses can be edited")
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(expense_id: str, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Expense, expense_id, org.id)
    if row.submitted_by != user.id or row.status != "pending":
        raise HTTPException(status_code=409, detail="Only your pending expenses can be deleted")
    await db.delete(row); await db.commit()


@router.patch("/expenses/{expense_id}/review")
async def review_expense(expense_id: str, data: dict, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.APPROVER]))):
    status_value = data.get("status")
    if status_value not in ("approved", "rejected"): raise HTTPException(status_code=422, detail="Status must be approved or rejected")
    row = await _owned(db, Expense, expense_id, org.id)
    if row.status != "pending": raise HTTPException(status_code=409, detail="Expense has already been reviewed")
    row.status = status_value; await db.commit(); await db.refresh(row); return row


@router.post("/anomalies/explain", response_model=BillingAnomalyReport)
async def explain_billing_anomalies(
    period: str = None,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.FINANCE, RoleType.OWNER])),
):
    from app.services.billing_service import detect_and_explain_anomalies
    return await detect_and_explain_anomalies(db, org.id, period=period)
