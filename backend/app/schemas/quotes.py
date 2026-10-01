from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RateCardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    default_rate_cents: int = Field(default=0, ge=0)
    description: Optional[str] = None


class RateCardRead(RateCardCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class QuoteLineItemCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: int = Field(default=1, gt=0)
    unit_price_cents: int = Field(ge=0)
    rate_card_id: Optional[str] = None


class QuoteLineItemRead(QuoteLineItemCreate, ReadModel):
    id: str
    org_id: str
    quote_id: str
    amount_cents: int
    created_at: datetime
    updated_at: datetime


class QuoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    rate_card_id: Optional[str] = None
    lead_id: Optional[str] = None
    currency: str = Field(default="USD", min_length=3, max_length=3)
    discount_bps: int = Field(default=0, ge=0, le=10000)
    tax_bps: int = Field(default=0, ge=0, le=10000)
    terms: Optional[str] = None
    line_items: List[QuoteLineItemCreate] = Field(min_length=1)


class QuoteRead(ReadModel):
    id: str
    org_id: str
    rate_card_id: Optional[str]
    lead_id: Optional[str]
    title: str
    status: str
    currency: str
    discount_bps: int
    tax_bps: int
    subtotal_cents: int
    total_cents: int
    accept_token: str
    accepted_at: Optional[datetime]
    terms: Optional[str]
    created_at: datetime
    updated_at: datetime
    line_items: List[QuoteLineItemRead] = []


class QuoteDraftRequest(BaseModel):
    lead_id: str
    rate_card_id: Optional[str] = None


class AIDraftLineItem(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: int = Field(gt=0)
    unit_price_cents: int = Field(ge=0)


class AIDraftResponse(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    currency: str = Field(min_length=3, max_length=3)
    line_items: List[AIDraftLineItem] = Field(min_length=1, max_length=30)
    total_cents: int = Field(ge=0)
    terms: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)
