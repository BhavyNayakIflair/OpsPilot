from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InvoiceLineCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: int = Field(default=1, gt=0)
    unit_price_cents: int = Field(ge=0)


class InvoiceLineRead(InvoiceLineCreate, ReadModel):
    id: str
    org_id: str
    invoice_id: str
    amount_cents: int
    created_at: datetime
    updated_at: datetime


class InvoiceCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=255)
    project_id: Optional[str] = None
    currency: str = Field(default="USD", min_length=3, max_length=3)
    issue_date: date
    due_date: date
    tax_bps: int = Field(default=0, ge=0, le=10000)
    notes: Optional[str] = None
    line_items: List[InvoiceLineCreate] = Field(min_length=1)


class ExpenseUpdate(BaseModel):
    vendor: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = None
    description: Optional[str] = Field(default=None, min_length=1)
    amount_cents: Optional[int] = Field(default=None, gt=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    expense_date: Optional[date] = None


class InvoiceRead(ReadModel):
    id: str
    org_id: str
    project_id: Optional[str]
    invoice_number: str
    client_name: str
    status: str
    currency: str
    subtotal_cents: int
    tax_cents: int
    total_cents: int
    paid_cents: int
    issue_date: date
    due_date: date
    notes: Optional[str]
    line_items: List[InvoiceLineRead] = []
    created_at: datetime
    updated_at: datetime


class PaymentCreate(BaseModel):
    amount_cents: int = Field(gt=0)
    paid_date: date
    method: str = "other"
    reference: Optional[str] = None


class PaymentRead(PaymentCreate, ReadModel):
    id: str
    org_id: str
    invoice_id: str
    created_at: datetime
    updated_at: datetime


class ExpenseCreate(BaseModel):
    vendor: str = Field(min_length=1, max_length=255)
    category: str = "general"
    description: str = Field(min_length=1)
    amount_cents: int = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    expense_date: date


class ExpenseRead(ExpenseCreate, ReadModel):
    id: str
    org_id: str
    submitted_by: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
