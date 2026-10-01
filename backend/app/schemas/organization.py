from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.membership import RoleType


class OrganizationBase(BaseModel):
    name: str
    currency: str = "USD"
    plan: str = "Team"


class OrganizationCreate(OrganizationBase):
    slug: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    plan: Optional[str] = None
    monthly_spend_cap_cents: Optional[int] = None
    settings: Optional[Dict[str, Any]] = None


class OrganizationRead(OrganizationBase):
    id: str
    slug: str
    is_active: bool
    monthly_spend_cap_cents: int
    ai_spend_cents: int
    settings: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemberInvite(BaseModel):
    email: EmailStr
    role: RoleType = RoleType.EMPLOYEE


class MemberRead(BaseModel):
    id: str
    user_id: str
    org_id: str
    role: str
    email: str
    full_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
