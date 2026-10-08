from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_membership, get_current_tenant
from app.models.user import User
from app.models.organization import Organization
from app.models.membership import Membership
from app.schemas.user import (
    UserCreate,
    UserLogin,
    UserRead,
    UserWithRole,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    VerifyResetTokenRequest,
    VerifyResetTokenResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
)
from app.schemas.token import Token
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=Token, status_code=201)
async def register(
    data: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user, org, token = await AuthService.register(db, data, ip_address=client_ip)
    return token


@router.post("/login", response_model=Token)
async def login(
    data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user, org_id, role, token = await AuthService.authenticate(db, data, ip_address=client_ip)
    return token


@router.get("/me", response_model=UserWithRole)
async def get_me(
    user: User = Depends(get_current_user),
    tenant: Organization = Depends(get_current_tenant),
    membership: Membership = Depends(get_current_membership),
):
    return UserWithRole(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        locale=user.locale,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at,
        updated_at=user.updated_at,
        role=membership.role,
        org_id=tenant.id,
        org_name=tenant.name,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    _, reset_token = await AuthService.request_password_reset(
        db, data.email, ip_address=client_ip
    )
    return ForgotPasswordResponse(
        message="If an account with this email exists, a password reset link has been generated.",
        reset_token=reset_token,
    )


@router.post("/verify-reset-token", response_model=VerifyResetTokenResponse)
async def verify_reset_token(
    data: VerifyResetTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    valid, user, err_msg = await AuthService.verify_password_reset_token(db, data.token)
    if not valid or not user:
        return VerifyResetTokenResponse(
            valid=False,
            message=err_msg or "Invalid or expired token",
        )
    return VerifyResetTokenResponse(
        valid=True,
        email=user.email,
        message="Token is valid",
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    await AuthService.reset_password(
        db,
        token=data.token,
        new_password=data.new_password,
        ip_address=client_ip,
    )
    return ResetPasswordResponse(
        message="Password has been successfully updated. You can now log in with your new password.",
    )

