from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogCreate


class AuditService:
    @staticmethod
    async def log_action(
        db: AsyncSession,
        org_id: str,
        action: str,
        user_id: Optional[str] = None,
        actor_type: str = "user",
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            org_id=org_id,
            user_id=user_id,
            actor_type=actor_type,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
            ip_address=ip_address,
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def get_logs_for_org(
        db: AsyncSession,
        org_id: str,
        limit: int = 100,
        offset: int = 0,
        action: Optional[str] = None,
    ) -> List[AuditLog]:
        query = select(AuditLog).where(AuditLog.org_id == org_id)
        if action:
            query = query.where(AuditLog.action == action)
        query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())
