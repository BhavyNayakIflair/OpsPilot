from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.core.config import settings
from app.gateway.factory import get_provider

router = APIRouter()


@router.get("/health", tags=["system"])
async def health_check(db: AsyncSession = Depends(get_db)):
    db_status = "healthy"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "ok" if "unhealthy" not in db_status else "degraded",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": db_status,
        "mock_ai": settings.MOCK_AI_PROVIDER,
    }


@router.get("/ai/health", tags=["system"])
async def ai_health():
    provider = get_provider()
    health = provider.health() if hasattr(provider, "health") else {
        "status": "configured", "provider": settings.LLM_PROVIDER
    }
    return health
