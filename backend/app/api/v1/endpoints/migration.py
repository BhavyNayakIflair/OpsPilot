import csv
import io
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_tenant, get_current_user
from app.core.deps import require_role
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership, RoleType
from app.models.crm import Company, Contact, Lead, PipelineStage
from app.models.content import MigrationJob

router = APIRouter()
TARGETS = {"companies", "contacts", "leads"}


@router.get("/jobs")
async def list_jobs(org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(MigrationJob).where(MigrationJob.org_id == org.id).order_by(MigrationJob.created_at.desc()))).all()


@router.post("/dry-run", status_code=201)
async def dry_run(target: str = Form(...), file: UploadFile = File(...), user: User = Depends(get_current_user), org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    if target not in TARGETS: raise HTTPException(status_code=422, detail="Target must be companies, contacts, or leads")
    if not file.filename or not file.filename.lower().endswith(".csv"): raise HTTPException(status_code=415, detail="Upload a CSV file")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024: raise HTTPException(status_code=413, detail="CSV files must be 5 MB or smaller")
    try:
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        headers = [str(column or "").strip().lower().replace(" ", "_") for column in (reader.fieldnames or [])]
        if not headers: raise ValueError("CSV needs a header row")
        rows = []
        for source in reader:
            rows.append({str(key or "").strip().lower().replace(" ", "_"): (value or "").strip() for key, value in source.items()})
    except (UnicodeDecodeError, csv.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid CSV: {exc}") from exc
    required = {"companies": "name", "contacts": "first_name", "leads": "title"}[target]
    errors = [] if required in headers else [f"Required column '{required}' is missing"]
    if target == "contacts" and "last_name" not in headers: errors.append("Required column 'last_name' is missing")
    if target == "leads":
        for index, row in enumerate(rows, 2):
            if not row.get("title"): errors.append(f"Row {index}: title is required")
            if row.get("value_cents") and not row["value_cents"].isdigit(): errors.append(f"Row {index}: value_cents must be an integer")
    if target == "companies":
        for index, row in enumerate(rows, 2):
            if not row.get("name"): errors.append(f"Row {index}: name is required")
    job = MigrationJob(org_id=org.id, user_id=user.id, filename=file.filename, target=target,
                       status="dry_run", rows=rows, errors=errors)
    db.add(job); await db.commit(); await db.refresh(job)
    return {"id": job.id, "filename": job.filename, "target": target, "status": job.status,
            "row_count": len(rows), "errors": errors, "sample": rows[:5]}


@router.post("/jobs/{job_id}/apply")
async def apply_import(job_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.OWNER]))):
    job = await db.scalar(select(MigrationJob).where(MigrationJob.id == job_id, MigrationJob.org_id == org.id))
    if not job: raise HTTPException(status_code=404, detail="Migration job not found")
    if job.errors: raise HTTPException(status_code=409, detail="Fix CSV validation errors before applying")
    if job.status == "completed": raise HTTPException(status_code=409, detail="This import was already applied")
    rows = job.rows or []
    if job.target == "companies":
        db.add_all([Company(org_id=org.id, name=row["name"], website=row.get("website"), industry=row.get("industry"), notes=row.get("notes")) for row in rows])
    elif job.target == "contacts":
        for row in rows:
            company_id = None
            if row.get("company"):
                company = await db.scalar(select(Company).where(Company.org_id == org.id, Company.name == row["company"]))
                if company is None: company = Company(org_id=org.id, name=row["company"]); db.add(company); await db.flush()
                company_id = company.id
            db.add(Contact(org_id=org.id, first_name=row["first_name"], last_name=row["last_name"], email=row.get("email") or None, phone=row.get("phone"), title=row.get("title"), company_id=company_id))
    else:
        stage = await db.scalar(select(PipelineStage).where(PipelineStage.org_id == org.id).order_by(PipelineStage.position))
        if not stage:
            stage = PipelineStage(org_id=org.id, name="New", position=0, probability=10); db.add(stage); await db.flush()
        for row in rows:
            company_id = None
            if row.get("company"):
                company = await db.scalar(select(Company).where(Company.org_id == org.id, Company.name == row["company"]))
                if company is None: company = Company(org_id=org.id, name=row["company"]); db.add(company); await db.flush()
                company_id = company.id
            value = int(row.get("value_cents") or 0)
            db.add(Lead(org_id=org.id, title=row["title"], company_id=company_id, stage_id=stage.id,
                        source=row.get("source") or "migration", value_cents=value,
                        currency=(row.get("currency") or org.currency).upper(), notes=row.get("notes")))
    job.status = "completed"; await db.commit()
    return {"id": job.id, "status": job.status, "imported": len(rows), "target": job.target}
