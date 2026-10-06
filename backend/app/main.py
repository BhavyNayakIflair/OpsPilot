import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.api import api_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup database tables on startup (useful for SQLite / initial setups)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI-native, lightweight business operations SaaS for small IT services and software companies",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_and_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    start_time = time.time()
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    return response


# Include API routes under /api/v1 and alias under /api
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
async def root_health():
    """Liveness probe: no dependencies, immediate 200 OK (stops 404 log spam)."""
    return {
        "status": "ok",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }


@app.get("/ready", tags=["system"])
async def root_ready():
    """
    Readiness probe: checks DB and returns cached AI provider states.
    """
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    from app.ai.health import get_ai_providers_status

    db_status = "ok"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    from app.ai.observability.metrics import ai_metrics

    ai_status = get_ai_providers_status()
    is_ready = ("unhealthy" not in db_status)

    return {
        "status": "ok" if is_ready else "degraded",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": db_status,
        "ai_providers": ai_status,
        "ai_metrics": ai_metrics.get_summary(),
    }


@app.get("/")
async def root():
    return {
        "message": "Welcome to OpsPilot API",
        "docs": "/docs",
        "version": settings.VERSION,
    }

