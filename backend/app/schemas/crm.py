from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, EmailStr


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    website: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None


class CompanyRead(CompanyCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    website: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None


class ContactCreate(BaseModel):
    company_id: Optional[str] = None
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    title: Optional[str] = None


class ContactRead(ContactCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class ContactUpdate(BaseModel):
    company_id: Optional[str] = None
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    title: Optional[str] = None


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    position: int = 0
    probability: int = Field(default=0, ge=0, le=100)
    is_won: bool = False
    is_lost: bool = False


class StageRead(StageCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class StageUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    position: Optional[int] = None
    probability: Optional[int] = Field(default=None, ge=0, le=100)
    is_won: Optional[bool] = None
    is_lost: Optional[bool] = None


class LeadCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    stage_id: Optional[str] = None
    source: str = "manual"
    status: str = "open"
    value_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    notes: Optional[str] = None


class LeadRead(LeadCreate, ReadModel):
    id: str
    org_id: str
    created_at: datetime
    updated_at: datetime


class LeadUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    stage_id: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    value_cents: Optional[int] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    notes: Optional[str] = None


class ActivityCreate(BaseModel):
    lead_id: str
    kind: str = "note"
    subject: str = Field(min_length=1, max_length=255)
    body: Optional[str] = None


class ActivityRead(ActivityCreate, ReadModel):
    id: str
    org_id: str
    user_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class ActivityUpdate(BaseModel):
    kind: Optional[str] = None
    subject: Optional[str] = Field(default=None, min_length=1, max_length=255)
    body: Optional[str] = None


class LeadCapture(BaseModel):
    org_slug: str
    title: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=240)
    email: EmailStr
    company: Optional[str] = None
    phone: Optional[str] = None
    message: Optional[str] = None
    value_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
