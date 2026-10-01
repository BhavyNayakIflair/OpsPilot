from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.organization import Organization
from app.schemas.user import UserCreate, UserLogin
from app.schemas.organization import OrganizationCreate
from app.schemas.token import Token
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.exceptions import InvalidCredentialsException
from app.services.org_service import OrganizationService
from app.services.audit_service import AuditService


class AuthService:
    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email.lower().strip()))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def register(
        db: AsyncSession,
        data: UserCreate,
        ip_address: Optional[str] = None,
    ) -> Tuple[User, Optional[Organization], Token]:
        existing = await AuthService.get_by_email(db, data.email)
        if existing:
            raise InvalidCredentialsException("User with this email already exists")

        user = User(
            email=data.email.lower().strip(),
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
            is_active=True,
        )
        db.add(user)
        await db.flush()

        org: Optional[Organization] = None
        org_id: Optional[str] = None
        role: Optional[str] = None

        if data.org_name:
            org_create = OrganizationCreate(name=data.org_name)
            org, membership = await OrganizationService.create_organization(db, org_create, user)
            org_id = org.id
            role = membership.role

            await AuditService.log_action(
                db,
                org_id=org_id,
                user_id=user.id,
                action="organization.create",
                entity_type="organization",
                entity_id=org.id,
                details={"org_name": org.name},
                ip_address=ip_address,
            )

        await db.commit()
        await db.refresh(user)

        token_str = create_access_token(
            subject=user.id,
            org_id=org_id,
            role=role,
        )

        token = Token(
            access_token=token_str,
            token_type="bearer",
            user_id=user.id,
            org_id=org_id,
            role=role,
        )

        return user, org, token

    @staticmethod
    async def authenticate(
        db: AsyncSession,
        credentials: UserLogin,
        ip_address: Optional[str] = None,
    ) -> Tuple[User, Optional[str], Optional[str], Token]:
        user = await AuthService.get_by_email(db, credentials.email)
        if not user or not verify_password(credentials.password, user.hashed_password):
            raise InvalidCredentialsException("Incorrect email or password")

        if not user.is_active:
            raise InvalidCredentialsException("User account is inactive")

        # Get first/primary membership
        query = select(Membership).where(Membership.user_id == user.id)
        result = await db.execute(query)
        membership = result.scalars().first()

        org_id = membership.org_id if membership else None
        role = membership.role if membership else None

        token_str = create_access_token(
            subject=user.id,
            org_id=org_id,
            role=role,
        )

        token = Token(
            access_token=token_str,
            token_type="bearer",
            user_id=user.id,
            org_id=org_id,
            role=role,
        )

        if org_id:
            await AuditService.log_action(
                db,
                org_id=org_id,
                user_id=user.id,
                action="auth.login",
                entity_type="user",
                entity_id=user.id,
                details={"email": user.email},
                ip_address=ip_address,
            )

        return user, org_id, role, token
