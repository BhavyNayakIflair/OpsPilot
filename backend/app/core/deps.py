from typing import Optional, List, Callable
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_token
from app.core.exceptions import InvalidCredentialsException, NotAuthorizedException
from app.models.user import User
from app.models.organization import Organization
from app.models.membership import Membership, RoleType

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    authorization: Optional[str] = Header(None),
) -> User:
    # Support both OAuth2 scheme and Authorization header
    raw_token = token
    if not raw_token and authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ")[1]

    if not raw_token:
        raise InvalidCredentialsException("Authentication credentials were not provided")

    payload = decode_token(raw_token)
    user_id: Optional[str] = payload.get("sub")
    if not user_id:
        raise InvalidCredentialsException("Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise InvalidCredentialsException("User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    return user


async def get_current_org_context(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_org_id: Optional[str] = Header(None, alias="X-Org-ID"),
) -> tuple[Organization, Membership]:
    """
    Extracts the current tenant organization and user membership.
    If X-Org-ID header is provided, switches to that organization if user is a member.
    Otherwise defaults to the user's primary/first organization.
    """
    query = select(Membership).where(Membership.user_id == user.id)
    if x_org_id:
        query = query.where(Membership.org_id == x_org_id)

    result = await db.execute(query)
    membership = result.scalars().first()

    if not membership:
        raise NotAuthorizedException("User does not belong to the requested organization")

    org_result = await db.execute(select(Organization).where(Organization.id == membership.org_id))
    org = org_result.scalar_one_or_none()
    if not org or not org.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization is inactive or not found")

    return org, membership


async def get_current_tenant(
    context: tuple[Organization, Membership] = Depends(get_current_org_context)
) -> Organization:
    return context[0]


async def get_current_membership(
    context: tuple[Organization, Membership] = Depends(get_current_org_context)
) -> Membership:
    return context[1]


def require_role(allowed_roles: List[RoleType]) -> Callable:
    async def role_checker(membership: Membership = Depends(get_current_membership)) -> Membership:
        allowed_values = [r.value for r in allowed_roles]
        # 'owner' has access to all operational roles by default
        if membership.role == RoleType.OWNER.value or membership.role in allowed_values:
            return membership
        raise NotAuthorizedException(f"Role '{membership.role}' does not have required permissions: {allowed_values}")
    return role_checker
