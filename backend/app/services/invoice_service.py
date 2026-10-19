"""Invoice service providing server-side Decimal totals, race-safe sequential numbering,
strict lifecycle transition enforcement, payment recording, and filtering.
"""

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import logging
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException
from sqlalchemy import select, and_, or_, func, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import Invoice, InvoiceLineItem, Payment, InvoiceSequence
from app.models.operations import Project
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class InvoiceService:

    @staticmethod
    def calculate_totals(
        line_items: List[Any],
        discount_bps: int = 0,
        tax_bps: int = 0,
    ) -> Dict[str, int]:
        """Compute subtotal, discount, tax, and total strictly with Decimal and ROUND_HALF_UP."""
        subtotal = Decimal("0")
        for item in line_items:
            qty = Decimal(str(getattr(item, "quantity", 1)))
            rate = Decimal(str(getattr(item, "unit_price_cents", 0)))
            subtotal += (qty * rate)

        d_bps = Decimal(str(max(0, min(10000, discount_bps))))
        t_bps = Decimal(str(max(0, min(10000, tax_bps))))

        disc_cents = (subtotal * d_bps / Decimal("10000")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        taxable = max(Decimal("0"), subtotal - disc_cents)
        tax_cents = (taxable * t_bps / Decimal("10000")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        total_cents = taxable + tax_cents

        return {
            "subtotal_cents": int(subtotal),
            "discount_cents": int(disc_cents),
            "tax_cents": int(tax_cents),
            "total_cents": int(total_cents),
        }

    @staticmethod
    async def get_next_invoice_number(
        db: AsyncSession,
        org_id: str,
        year: Optional[int] = None,
        prefix: str = "INV",
    ) -> str:
        """Atomically generate the next sequential, org-scoped invoice number."""
        yr = year or date.today().year
        # SELECT ... FOR UPDATE on invoice_sequences
        seq = await db.scalar(
            select(InvoiceSequence)
            .where(
                InvoiceSequence.org_id == org_id,
                InvoiceSequence.year == yr,
                InvoiceSequence.prefix == prefix,
            )
            .with_for_update()
        )

        if not seq:
            # Query existing invoices for that year to pick up current max if any
            existing_count = await db.scalar(
                select(func.count(Invoice.id)).where(
                    Invoice.org_id == org_id,
                    Invoice.invoice_number.like(f"{prefix}-{yr}-%"),
                )
            ) or 0
            seq = InvoiceSequence(
                org_id=org_id,
                year=yr,
                prefix=prefix,
                last_number=existing_count + 1,
            )
            db.add(seq)
            await db.flush()
            next_num = seq.last_number
        else:
            seq.last_number += 1
            await db.flush()
            next_num = seq.last_number

        return f"{prefix}-{yr}-{next_num:04d}"

    @staticmethod
    def validate_status_transition(
        current_status: str,
        target_status: str,
        is_payment: bool = False,
    ) -> None:
        """Enforce strict invoice lifecycle state machine:
        draft -> sent -> partially_paid -> paid
        any non-paid -> void
        Paid and void invoices are final and immutable.
        """
        curr = (current_status or "draft").lower()
        target = target_status.lower()

        if curr == target:
            return

        if curr in ("paid", "void"):
            raise HTTPException(
                status_code=409,
                detail=f"Invoice in status '{curr}' is final and its status cannot be changed."
            )

        # Void is allowed from any non-paid state
        if target == "void":
            return

        allowed_map = {
            "draft": {"sent", "partially_paid", "paid" if is_payment else "sent"},
            "sent": {"partially_paid", "paid", "void"},
            "partial": {"partially_paid", "paid", "void"},
            "partially_paid": {"paid", "void"},
        }

        valid_targets = allowed_map.get(curr, set())
        if target not in valid_targets:
            raise HTTPException(
                status_code=409,
                detail=f"Illegal status transition from '{curr}' to '{target}'. Enforced lifecycle is draft -> sent -> partially_paid -> paid."
            )

    @staticmethod
    async def record_payment(
        db: AsyncSession,
        org_id: str,
        invoice: Invoice,
        amount_cents: int,
        paid_date: date,
        method: str = "other",
        reference: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Payment:
        """Record an invoice payment, reject over-payment, update status, and audit."""
        if invoice.status == "void":
            raise HTTPException(status_code=409, detail="Cannot record payment for a void invoice.")

        balance_remaining = invoice.total_cents - invoice.paid_cents
        if amount_cents > balance_remaining:
            raise HTTPException(
                status_code=422,
                detail=f"Payment of {amount_cents / 100:.2f} exceeds remaining invoice balance of {balance_remaining / 100:.2f}."
            )

        payment = Payment(
            org_id=org_id,
            invoice_id=invoice.id,
            amount_cents=amount_cents,
            paid_date=paid_date,
            method=method,
            reference=reference,
        )
        db.add(payment)

        invoice.paid_cents += amount_cents
        if invoice.paid_cents >= invoice.total_cents:
            invoice.status = "paid"
        else:
            invoice.status = "partially_paid"

        await db.flush()

        await AuditService.log_action(
            db=db,
            org_id=org_id,
            user_id=user_id,
            action="invoice.payment_recorded",
            entity_type="invoice",
            entity_id=invoice.id,
            details={
                "amount_cents": amount_cents,
                "new_paid_cents": invoice.paid_cents,
                "total_cents": invoice.total_cents,
                "status": invoice.status,
                "method": method,
                "reference": reference,
            },
        )
        await db.commit()
        await db.refresh(payment)
        await db.refresh(invoice)
        return payment

    @staticmethod
    async def list_invoices(
        db: AsyncSession,
        org_id: str,
        status: Optional[str] = None,
        client_name: Optional[str] = None,
        search: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        overdue_only: bool = False,
        order_by: str = "issue_date",
        order_dir: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Invoice], int]:
        """List invoices with server-side search, filtering, overdue calculation, and pagination."""
        query = select(Invoice).where(Invoice.org_id == org_id)
        today = date.today()

        if status and status != "all":
            if status in ("partial", "partially_paid"):
                query = query.where(Invoice.status.in_(["partial", "partially_paid"]))
            else:
                query = query.where(Invoice.status == status)

        if client_name:
            query = query.where(Invoice.client_name.ilike(f"%{client_name}%"))

        if search:
            q = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Invoice.invoice_number.ilike(q),
                    Invoice.client_name.ilike(q),
                    Invoice.notes.ilike(q),
                )
            )

        if start_date:
            query = query.where(Invoice.issue_date >= start_date)
        if end_date:
            query = query.where(Invoice.issue_date <= end_date)

        if overdue_only:
            query = query.where(
                Invoice.due_date < today,
                Invoice.status.notin_(["paid", "void"]),
                Invoice.paid_cents < Invoice.total_cents,
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_count = (await db.scalar(count_query)) or 0

        # Sort order
        sort_col = getattr(Invoice, order_by, Invoice.issue_date)
        if order_dir.lower() == "asc":
            query = query.order_by(asc(sort_col), asc(Invoice.id))
        else:
            query = query.order_by(desc(sort_col), desc(Invoice.id))

        query = query.offset(offset).limit(limit)
        invoices = (await db.scalars(query)).all()
        return list(invoices), total_count
