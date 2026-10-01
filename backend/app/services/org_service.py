import re
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.subscription import Subscription
from app.schemas.organization import OrganizationCreate, OrganizationUpdate
from app.core.exceptions import EntityNotFoundException, NotAuthorizedException


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


class OrganizationService:
    @staticmethod
    async def create_organization(
        db: AsyncSession,
        data: OrganizationCreate,
        owner: User,
    ) -> Tuple[Organization, Membership]:
        base_slug = data.slug or slugify(data.name)
        slug = base_slug
        
        # Check slug uniqueness
        counter = 1
        while True:
            existing = await db.execute(select(Organization).where(Organization.slug == slug))
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(
            name=data.name,
            slug=slug,
            currency=data.currency,
            plan=data.plan,
        )
        db.add(org)
        await db.flush()

        # Create Default Subscription
        sub = Subscription(
            org_id=org.id,
            plan=data.plan,
            status="active",
            monthly_price_cents=4900 if data.plan == "Team" else 9900,
        )
        db.add(sub)

        # Create Owner Membership
        membership = Membership(
            user_id=owner.id,
            org_id=org.id,
            role=RoleType.OWNER.value,
        )
        db.add(membership)
        await db.commit()
        await db.refresh(org)
        await db.refresh(membership)
        return org, membership

    @staticmethod
    async def get_by_id(db: AsyncSession, org_id: str) -> Optional[Organization]:
        result = await db.execute(select(Organization).where(Organization.id == org_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update_organization(
        db: AsyncSession,
        org_id: str,
        data: OrganizationUpdate,
    ) -> Organization:
        org = await OrganizationService.get_by_id(db, org_id)
        if not org:
            raise EntityNotFoundException("Organization not found")

        update_data = data.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            setattr(org, key, val)

        await db.commit()
        await db.refresh(org)
        return org

    @staticmethod
    async def get_members(db: AsyncSession, org_id: str) -> List[Tuple[Membership, User]]:
        query = (
            select(Membership, User)
            .join(User, Membership.user_id == User.id)
            .where(Membership.org_id == org_id)
        )
        result = await db.execute(query)
        return list(result.all())

    @staticmethod
    async def add_or_update_member(
        db: AsyncSession,
        org_id: str,
        user: User,
        role: RoleType,
    ) -> Membership:
        query = select(Membership).where(
            Membership.org_id == org_id,
            Membership.user_id == user.id,
        )
        result = await db.execute(query)
        membership = result.scalar_one_or_none()
        if membership:
            membership.role = role.value
        else:
            membership = Membership(
                org_id=org_id,
                user_id=user.id,
                role=role.value,
            )
            db.add(membership)
        await db.commit()
        await db.refresh(membership)
        return membership
