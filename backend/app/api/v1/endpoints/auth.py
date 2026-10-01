from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_membership, get_current_tenant
from app.models.user import User
from app.models.organization import Organization
from app.models.membership import Membership
from app.schemas.user import UserCreate, UserLogin, UserRead, UserWithRole
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
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at,
        updated_at=user.updated_at,
        role=membership.role,
        org_id=tenant.id,
        org_name=tenant.name,
    )
