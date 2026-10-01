from sqlalchemy import Column, String, Integer, ForeignKey, Date, Text
from app.core.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    invoice_number = Column(String(40), nullable=False)
    client_name = Column(String(255), nullable=False)
    status = Column(String(30), default="draft", nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    subtotal_cents = Column(Integer, default=0, nullable=False)
    tax_cents = Column(Integer, default=0, nullable=False)
    total_cents = Column(Integer, default=0, nullable=False)
    paid_cents = Column(Integer, default=0, nullable=False)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    notes = Column(Text)


class InvoiceLineItem(Base, TimestampMixin):
    __tablename__ = "invoice_line_items"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(500), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    unit_price_cents = Column(Integer, nullable=False)
    amount_cents = Column(Integer, nullable=False)


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    paid_date = Column(Date, nullable=False)
    method = Column(String(40), default="other", nullable=False)
    reference = Column(String(160))


class Expense(Base, TimestampMixin):
    __tablename__ = "expenses"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    submitted_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    vendor = Column(String(255), nullable=False)
    category = Column(String(100), default="general", nullable=False)
    description = Column(Text, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    expense_date = Column(Date, nullable=False)
    status = Column(String(30), default="pending", nullable=False)
