from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_current_tenant,
    get_current_membership,
    require_role,
)
from app.models.user import User
from app.models.organization import Organization
from app.models.membership import Membership, RoleType
from app.schemas.organization import (
    OrganizationRead,
    OrganizationUpdate,
    MemberInvite,
    MemberRead,
)
from app.services.org_service import OrganizationService
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService

router = APIRouter()


@router.get("/current", response_model=OrganizationRead)
async def get_current_organization(
    tenant: Organization = Depends(get_current_tenant),
):
    return tenant


@router.put("/current", response_model=OrganizationRead)
async def update_current_organization(
    data: OrganizationUpdate,
    tenant: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    _role: Membership = Depends(require_role([RoleType.OWNER])),
    db: AsyncSession = Depends(get_db),
):
    updated = await OrganizationService.update_organization(db, tenant.id, data)
    await AuditService.log_action(
        db,
        org_id=tenant.id,
        user_id=user.id,
        action="organization.update",
        entity_type="organization",
        entity_id=tenant.id,
        details=data.model_dump(exclude_unset=True),
    )
    return updated


@router.get("/members", response_model=List[MemberRead])
async def list_members(
    tenant: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    members_data = await OrganizationService.get_members(db, tenant.id)
    return [
        MemberRead(
            id=membership.id,
            user_id=member_user.id,
            org_id=tenant.id,
            role=membership.role,
            email=member_user.email,
            full_name=member_user.full_name,
            created_at=membership.created_at,
        )
        for membership, member_user in members_data
    ]


@router.post("/members", response_model=MemberRead, status_code=201)
async def invite_or_add_member(
    data: MemberInvite,
    tenant: Organization = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    _role: Membership = Depends(require_role([RoleType.OWNER])),
    db: AsyncSession = Depends(get_db),
):
    # Find existing user or create invitation
    member_user = await AuthService.get_by_email(db, data.email)
    if not member_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. They must first create an OpsPilot account.",
        )

    membership = await OrganizationService.add_or_update_member(
        db,
        org_id=tenant.id,
        user=member_user,
        role=data.role,
    )

    await AuditService.log_action(
        db,
        org_id=tenant.id,
        user_id=user.id,
        action="membership.invite",
        entity_type="membership",
        entity_id=membership.id,
        details={"member_email": member_user.email, "role": data.role.value},
    )

    return MemberRead(
        id=membership.id,
        user_id=member_user.id,
        org_id=tenant.id,
        role=membership.role,
        email=member_user.email,
        full_name=member_user.full_name,
        created_at=membership.created_at,
    )
