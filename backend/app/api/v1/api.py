from fastapi import APIRouter
from app.api.v1.endpoints import auth, organizations, users, health, crm, quotes, operations, billing, migration, documents, workflows, knowledge

api_router = APIRouter()

api_router.include_router(health.router, prefix="", tags=["system"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(crm.router, prefix="/crm", tags=["CRM"])
api_router.include_router(crm.stage_router, prefix="/public", tags=["Public"])
api_router.include_router(quotes.router, prefix="/quotes", tags=["Quotes"])
api_router.include_router(operations.router, prefix="/operations", tags=["Projects, time & people"])
api_router.include_router(billing.router, prefix="/billing", tags=["Invoicing & expenses"])
api_router.include_router(migration.router, prefix="/migration", tags=["Migration"])
api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["Knowledge search"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["Workflows & approvals"])
