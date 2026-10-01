from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_tenant
from app.models.organization import Organization
from app.models.user import User
from app.models.crm import Company, Contact, Lead, PipelineStage, Activity
from app.models.operations import Project
from app.schemas.crm import (CompanyCreate, CompanyRead, ContactCreate, ContactRead, LeadCreate,
    LeadRead, LeadUpdate, StageCreate, StageRead, ActivityCreate, ActivityRead, LeadCapture,
    CompanyUpdate, ContactUpdate, StageUpdate, ActivityUpdate)

router = APIRouter()
stage_router = APIRouter()


async def _create_won_project(db: AsyncSession, lead: Lead):
    if lead.status == "won":
        existing = await db.scalar(select(Project.id).where(Project.org_id == lead.org_id, Project.lead_id == lead.id))
        if not existing:
            db.add(Project(org_id=lead.org_id, lead_id=lead.id, name=lead.title,
                           budget_amount_cents=lead.value_cents, currency=lead.currency))


async def _owned(db, model, object_id, org_id):
    obj = await db.scalar(select(model).where(model.id == object_id, model.org_id == org_id))
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return obj


async def _ref(db, model, object_id, org_id):
    if object_id:
        await _owned(db, model, object_id, org_id)


@router.get("/companies", response_model=list[CompanyRead])
async def list_companies(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Company).where(Company.org_id == org.id).order_by(Company.name))).all()


@router.post("/companies", response_model=CompanyRead, status_code=201)
async def create_company(data: CompanyCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = Company(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.get("/companies/{company_id}", response_model=CompanyRead)
async def get_company(company_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return await _owned(db, Company, company_id, org.id)


@router.patch("/companies/{company_id}", response_model=CompanyRead)
async def update_company(company_id: str, data: CompanyUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Company, company_id, org.id)
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/companies/{company_id}", status_code=204)
async def delete_company(company_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, Company, company_id, org.id)); await db.commit()


@router.get("/contacts", response_model=list[ContactRead])
async def list_contacts(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Contact).where(Contact.org_id == org.id).order_by(Contact.last_name))).all()


@router.post("/contacts", response_model=ContactRead, status_code=201)
async def create_contact(data: ContactCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _ref(db, Company, data.company_id, org.id)
    row = Contact(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.get("/contacts/{contact_id}", response_model=ContactRead)
async def get_contact(contact_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return await _owned(db, Contact, contact_id, org.id)


@router.patch("/contacts/{contact_id}", response_model=ContactRead)
async def update_contact(contact_id: str, data: ContactUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Contact, contact_id, org.id); changes = data.model_dump(exclude_unset=True)
    await _ref(db, Company, changes.get("company_id"), org.id)
    for key, value in changes.items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, Contact, contact_id, org.id)); await db.commit()


@router.get("/stages", response_model=list[StageRead])
async def list_stages(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    stages = (await db.scalars(select(PipelineStage).where(PipelineStage.org_id == org.id).order_by(PipelineStage.position))).all()
    if not stages:
        stages = [PipelineStage(org_id=org.id, name=name, position=i, probability=p, is_won=won, is_lost=lost)
                  for i, (name, p, won, lost) in enumerate([("New", 10, False, False), ("Qualified", 30, False, False), ("Proposal", 60, False, False), ("Won", 100, True, False), ("Lost", 0, False, True)])]
        db.add_all(stages); await db.commit()
        for stage in stages: await db.refresh(stage)
    return stages


@router.post("/stages", response_model=StageRead, status_code=201)
async def create_stage(data: StageCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = PipelineStage(org_id=org.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/stages/{stage_id}", response_model=StageRead)
async def update_stage(stage_id: str, data: StageUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, PipelineStage, stage_id, org.id)
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.get("/leads", response_model=list[LeadRead])
async def list_leads(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Lead).where(Lead.org_id == org.id).order_by(Lead.created_at.desc()))).all()


@router.post("/leads", response_model=LeadRead, status_code=201)
async def create_lead(data: LeadCreate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _ref(db, Company, data.company_id, org.id); await _ref(db, Contact, data.contact_id, org.id); await _ref(db, PipelineStage, data.stage_id, org.id)
    values = data.model_dump()
    if data.stage_id:
        stage = await _owned(db, PipelineStage, data.stage_id, org.id)
        if stage.is_won: values["status"] = "won"
        elif stage.is_lost: values["status"] = "lost"
    row = Lead(org_id=org.id, **values); db.add(row); await db.flush(); await _create_won_project(db, row); await db.commit(); await db.refresh(row); return row


@router.patch("/leads/{lead_id}", response_model=LeadRead)
async def update_lead(lead_id: str, data: LeadUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Lead, lead_id, org.id); changes = data.model_dump(exclude_unset=True)
    await _ref(db, Company, changes.get("company_id"), org.id); await _ref(db, Contact, changes.get("contact_id"), org.id); await _ref(db, PipelineStage, changes.get("stage_id"), org.id)
    for key, value in changes.items(): setattr(row, key, value)
    if "stage_id" in changes and "status" not in changes and changes["stage_id"]:
        stage = await _owned(db, PipelineStage, changes["stage_id"], org.id)
        if stage.is_won: row.status = "won"
        elif stage.is_lost: row.status = "lost"
        elif row.status in ("won", "lost"): row.status = "open"
    await _create_won_project(db, row)
    await db.commit(); await db.refresh(row); return row


@router.delete("/leads/{lead_id}", status_code=204)
async def delete_lead(lead_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Lead, lead_id, org.id); await db.delete(row); await db.commit()


@router.get("/activities", response_model=list[ActivityRead])
async def list_activities(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Activity).where(Activity.org_id == org.id).order_by(Activity.created_at.desc()))).all()


@router.post("/activities", response_model=ActivityRead, status_code=201)
async def create_activity(data: ActivityCreate, user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await _owned(db, Lead, data.lead_id, org.id)
    row = Activity(org_id=org.id, user_id=user.id, **data.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row


@router.patch("/activities/{activity_id}", response_model=ActivityRead)
async def update_activity(activity_id: str, data: ActivityUpdate, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, Activity, activity_id, org.id)
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(row, key, value)
    await db.commit(); await db.refresh(row); return row


@router.delete("/activities/{activity_id}", status_code=204)
async def delete_activity(activity_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, Activity, activity_id, org.id)); await db.commit()


@stage_router.post("/leads", response_model=LeadRead, status_code=201)
async def capture_lead(data: LeadCapture, db: AsyncSession = Depends(get_db)):
    org = await db.scalar(select(Organization).where(Organization.slug == data.org_slug, Organization.is_active.is_(True)))
    if not org: raise HTTPException(status_code=404, detail="Organization not found")
    company = None
    if data.company:
        company = await db.scalar(select(Company).where(Company.org_id == org.id, Company.name == data.company))
        if not company:
            company = Company(org_id=org.id, name=data.company); db.add(company); await db.flush()
    contact = await db.scalar(select(Contact).where(Contact.org_id == org.id, Contact.email == str(data.email)))
    if not contact:
        parts = data.name.split(" ", 1)
        contact = Contact(org_id=org.id, company_id=company.id if company else None, first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "Unknown", email=str(data.email), phone=data.phone)
        db.add(contact); await db.flush()
    stage = await db.scalar(select(PipelineStage).where(PipelineStage.org_id == org.id).order_by(PipelineStage.position))
    if not stage:
        stage = PipelineStage(org_id=org.id, name="New", position=0, probability=10); db.add(stage); await db.flush()
    row = Lead(org_id=org.id, company_id=company.id if company else None, contact_id=contact.id, stage_id=stage.id,
        title=data.title, source="website", status="open", value_cents=data.value_cents, currency=data.currency, notes=data.message)
    db.add(row); await db.commit(); await db.refresh(row); return row
