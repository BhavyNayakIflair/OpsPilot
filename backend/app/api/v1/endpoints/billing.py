import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user, get_current_membership, require_role
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.operations import Project
from app.models.billing import Invoice, InvoiceLineItem, Payment, Expense
from app.schemas.billing import InvoiceCreate, PaymentCreate, ExpenseCreate, ExpenseUpdate, BillingAnomalyReport

router = APIRouter()


async def _owned(db, model, object_id, org_id):
    row = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if row is None: raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return row


async def _invoice_out(db: AsyncSession, invoice: Invoice):
    lines = (await db.scalars(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id, InvoiceLineItem.org_id == invoice.org_id))).all()
    return {**{column.name: getattr(invoice, column.name) for column in Invoice.__table__.columns}, "line_items": lines}


@router.get("/invoices")
async def list_invoices(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    invoices = (await db.scalars(select(Invoice).where(Invoice.org_id == org.id).order_by(Invoice.created_at.desc()))).all()
    return [await _invoice_out(db, item) for item in invoices]


@router.post("/invoices", status_code=201)
async def create_invoice(data: InvoiceCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    if data.due_date < data.issue_date: raise HTTPException(status_code=422, detail="Due date must be on or after issue date")
    if data.project_id: await _owned(db, Project, data.project_id, org.id)
    subtotal = sum(item.quantity * item.unit_price_cents for item in data.line_items)
    tax = (subtotal * data.tax_bps + 5000) // 10000
    invoice = Invoice(org_id=org.id, project_id=data.project_id, invoice_number=f"INV-{data.issue_date.year}-{secrets.token_hex(3).upper()}",
        client_name=data.client_name, currency=data.currency.upper(), subtotal_cents=subtotal, tax_cents=tax,
        total_cents=subtotal + tax, issue_date=data.issue_date, due_date=data.due_date, notes=data.notes)
    db.add(invoice); await db.flush()
    for item in data.line_items:
        db.add(InvoiceLineItem(org_id=org.id, invoice_id=invoice.id, **item.model_dump(), amount_cents=item.quantity * item.unit_price_cents))
    await db.commit(); await db.refresh(invoice); return await _invoice_out(db, invoice)


@router.put("/invoices/{invoice_id}")
async def update_draft_invoice(invoice_id: str, data: InvoiceCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    if invoice.status != "draft" or invoice.paid_cents:
        raise HTTPException(status_code=409, detail="Only unpaid draft invoices can be edited")
    if data.due_date < data.issue_date: raise HTTPException(status_code=422, detail="Due date must be on or after issue date")
    if data.project_id: await _owned(db, Project, data.project_id, org.id)
    subtotal = sum(item.quantity * item.unit_price_cents for item in data.line_items)
    tax = (subtotal * data.tax_bps + 5000) // 10000
    invoice.project_id = data.project_id
    invoice.client_name = data.client_name
    invoice.currency = data.currency.upper()
    invoice.subtotal_cents = subtotal
    invoice.tax_cents = tax
    invoice.total_cents = subtotal + tax
    invoice.issue_date = data.issue_date
    invoice.due_date = data.due_date
    invoice.notes = data.notes
    await db.execute(delete(InvoiceLineItem).where(InvoiceLineItem.org_id == org.id, InvoiceLineItem.invoice_id == invoice.id))
    for item in data.line_items:
        db.add(InvoiceLineItem(org_id=org.id, invoice_id=invoice.id, **item.model_dump(), amount_cents=item.quantity * item.unit_price_cents))
    await db.commit(); await db.refresh(invoice); return await _invoice_out(db, invoice)


@router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_draft_invoice(invoice_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    if invoice.status != "draft" or invoice.paid_cents:
        raise HTTPException(status_code=409, detail="Only unpaid draft invoices can be deleted")
    await db.delete(invoice); await db.commit()


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    return await _invoice_out(db, await _owned(db, Invoice, invoice_id, org.id))


@router.patch("/invoices/{invoice_id}/status")
async def update_invoice_status(invoice_id: str, data: dict, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    status_value = data.get("status")
    if status_value not in ("sent", "void"): raise HTTPException(status_code=422, detail="Status must be sent or void")
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    if invoice.status == "paid": raise HTTPException(status_code=409, detail="Paid invoice status cannot be changed")
    invoice.status = status_value; await db.commit(); await db.refresh(invoice); return await _invoice_out(db, invoice)


@router.get("/invoices/{invoice_id}/payments")
async def list_payments(invoice_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    await _owned(db, Invoice, invoice_id, org.id)
    return (await db.scalars(select(Payment).where(Payment.invoice_id == invoice_id, Payment.org_id == org.id).order_by(Payment.paid_date))).all()


@router.post("/invoices/{invoice_id}/payments", status_code=201)
async def record_payment(invoice_id: str, data: PaymentCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.FINANCE]))):
    invoice = await _owned(db, Invoice, invoice_id, org.id)
    if invoice.status == "void": raise HTTPException(status_code=409, detail="Cannot record payment for a void invoice")
    if invoice.paid_cents + data.amount_cents > invoice.total_cents: raise HTTPException(status_code=422, detail="Payment exceeds the invoice balance")
    db.add(Payment(org_id=org.id, invoice_id=invoice.id, **data.model_dump()))
    invoice.paid_cents += data.amount_cents
    invoice.status = "paid" if invoice.paid_cents == invoice.total_cents else "partial"
    await db.commit(); await db.refresh(invoice)
    payments = (await db.scalars(select(Payment).where(Payment.invoice_id == invoice.id, Payment.org_id == org.id).order_by(Payment.paid_date))).all()
    return payments[-1]


@router.get("/expenses")
async def list_expenses(org: Organization = Depends(get_current_tenant), user: User = Depends(get_current_user), membership: Membership = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    query = select(Expense).where(Expense.org_id == org.id)
    if membership.role not in (RoleType.OWNER.value, RoleType.FINANCE.value, RoleType.APPROVER.value): query = query.where(Expense.submitted_by == user.id)
    return (await db.scalars(query.order_by(Expense.expense_date.desc()))).all()


@router.post("/expenses", status_code=201)
async def create_expense(data: ExpenseCreate, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = Expense(org_id=org.id, submitted_by=user.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


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
