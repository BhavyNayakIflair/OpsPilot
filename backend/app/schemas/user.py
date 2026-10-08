from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, ConfigDict

UserLocale = Literal["en", "fr", "de", "es", "it"]


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    org_name: Optional[str] = None  # If signing up a new company


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    locale: Optional[UserLocale] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class UserRead(UserBase):
    id: str
    locale: UserLocale = "en"
    is_superuser: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserWithRole(UserRead):
    role: str
    org_id: str
    org_name: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: Optional[str] = None


class VerifyResetTokenRequest(BaseModel):
    token: str


class VerifyResetTokenResponse(BaseModel):
    valid: bool
    email: Optional[str] = None
    message: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ResetPasswordResponse(BaseModel):
    message: str

