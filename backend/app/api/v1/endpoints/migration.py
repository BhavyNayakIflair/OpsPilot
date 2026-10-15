import csv
import io
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
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

from app.schemas.migration import SuggestMappingRequest, SuggestMappingResponse
from app.services.migration_service import suggest_column_mappings

router = APIRouter()
TARGETS = {"companies", "contacts", "leads"}


class MigrationPreviewUpdate(BaseModel):
    rows: list[dict[str, str]]


def _normalized(value: str | None) -> str:
    return " ".join((value or "").casefold().split())


def _row_key(target: str, row: dict[str, str]) -> tuple[str, ...] | None:
    if target == "companies":
        name = _normalized(row.get("name"))
        return ("company", name) if name else None
    if target == "contacts":
        email = _normalized(row.get("email"))
        if email:
            return ("contact_email", email)
        first_name = _normalized(row.get("first_name"))
        last_name = _normalized(row.get("last_name"))
        if first_name and last_name:
            return ("contact_name", first_name, last_name, _normalized(row.get("company")))
        return None
    title = _normalized(row.get("title"))
    return ("lead", title, _normalized(row.get("company"))) if title else None


def _row_errors(target: str, row: dict[str, str], row_number: int) -> list[str]:
    errors = []
    if target == "companies" and not row.get("name", "").strip():
        errors.append(f"Row {row_number}: name is required")
    if target == "contacts":
        if not row.get("first_name", "").strip():
            errors.append(f"Row {row_number}: first_name is required")
        if not row.get("last_name", "").strip():
            errors.append(f"Row {row_number}: last_name is required")
    if target == "leads":
        if not row.get("title", "").strip():
            errors.append(f"Row {row_number}: title is required")
        value_cents = row.get("value_cents", "").strip()
        if value_cents and not value_cents.isdigit():
            errors.append(f"Row {row_number}: value_cents must be an integer")
    return errors


def _columns(target: str, rows: list[dict[str, str]]) -> list[str]:
    required = {
        "companies": ["name"],
        "contacts": ["first_name", "last_name"],
        "leads": ["title"],
    }[target]
    columns = list(dict.fromkeys(column for row in rows for column in row))
    for column in required:
        if column not in columns:
            columns.append(column)
    return columns


async def _existing_keys(db: AsyncSession, org_id: str, target: str) -> set[tuple[str, ...]]:
    if target == "companies":
        names = await db.scalars(select(Company.name).where(Company.org_id == org_id))
        return {key for name in names if (key := _row_key(target, {"name": name}))}
    if target == "contacts":
        rows = await db.execute(
            select(Contact, Company.name)
            .outerjoin(Company, Contact.company_id == Company.id)
            .where(Contact.org_id == org_id)
        )
        return {
            key for contact, company_name in rows
            if (key := _row_key(target, {
                "email": contact.email or "",
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "company": company_name or "",
            }))
        }
    rows = await db.execute(
        select(Lead, Company.name)
        .outerjoin(Company, Lead.company_id == Company.id)
        .where(Lead.org_id == org_id)
    )
    return {
        key for lead, company_name in rows
        if (key := _row_key(target, {"title": lead.title, "company": company_name or ""}))
    }


async def _preview_rows(
    db: AsyncSession, org_id: str, target: str, rows: list[dict[str, str]],
) -> list[dict]:
    existing = await _existing_keys(db, org_id, target)
    seen: dict[tuple[str, ...], int] = {}
    result = []
    for index, row in enumerate(rows, start=2):
        key = _row_key(target, row)
        duplicate_reason = None
        if key and key in existing:
            duplicate_reason = "Already exists in this workspace"
        elif key and key in seen:
            duplicate_reason = f"Duplicate of CSV row {seen[key]}"
        if key:
            seen.setdefault(key, index)
        result.append({
            "row_number": index,
            "data": row,
            "duplicate_reason": duplicate_reason,
            "errors": _row_errors(target, row, index),
        })
    return result


def _preview_response(job: MigrationJob, rows_preview: list[dict], columns: list[str]) -> dict:
    duplicates = sum(row["duplicate_reason"] is not None for row in rows_preview)
    return {
        "id": job.id,
        "filename": job.filename,
        "target": job.target,
        "status": job.status,
        "row_count": len(job.rows or []),
        "imported": getattr(job, "imported", None),
        "skipped_duplicates": getattr(job, "skipped_duplicates", None),
        "duplicate_count": duplicates,
        "importable_count": len(rows_preview) - duplicates,
        "errors": job.errors or [],
        "columns": columns,
        "rows_preview": rows_preview,
    }


@router.post("/suggest-mapping", response_model=SuggestMappingResponse)
async def suggest_mapping(
    data: SuggestMappingRequest,
    org: Organization = Depends(get_current_tenant),
):
    if data.target not in TARGETS:
        raise HTTPException(status_code=422, detail="Target must be companies, contacts, or leads")
    if not data.headers:
        raise HTTPException(status_code=422, detail="Headers list cannot be empty")
    return await suggest_column_mappings(data, org_id=org.id)


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
    required = {
        "companies": ["name"],
        "contacts": ["first_name", "last_name"],
        "leads": ["title"],
    }[target]
    errors = [f"Required column '{column}' is missing" for column in required if column not in headers]
    errors.extend(error for index, row in enumerate(rows, 2) for error in _row_errors(target, row, index))
    job = MigrationJob(org_id=org.id, user_id=user.id, filename=file.filename, target=target,
                       status="dry_run", rows=rows, errors=errors)
    db.add(job); await db.commit(); await db.refresh(job)
    return _preview_response(job, await _preview_rows(db, org.id, target, rows), _columns(target, rows))


@router.put("/jobs/{job_id}/preview")
async def update_preview(
    job_id: str,
    data: MigrationPreviewUpdate,
    org: Organization = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    _role: Membership = Depends(require_role([RoleType.OWNER])),
):
    job = await db.scalar(select(MigrationJob).where(
        MigrationJob.id == job_id, MigrationJob.org_id == org.id,
    ))
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")
    if job.status != "dry_run":
        raise HTTPException(status_code=409, detail="Only pending imports can be edited")

    rows = data.rows
    columns = _columns(job.target, rows)
    errors = [
        f"Required column '{column}' is missing"
        for column in {
            "companies": ["name"],
            "contacts": ["first_name", "last_name"],
            "leads": ["title"],
        }[job.target]
        if not any(column in row for row in rows)
    ]
    errors.extend(error for index, row in enumerate(rows, 2) for error in _row_errors(job.target, row, index))
    job.rows = rows
    job.errors = errors
    await db.commit()
    await db.refresh(job)
    return _preview_response(job, await _preview_rows(db, org.id, job.target, rows), columns)


@router.post("/jobs/{job_id}/apply")
async def apply_import(job_id: str, org: Organization = Depends(get_current_tenant), db: AsyncSession = Depends(get_db), _role: Membership = Depends(require_role([RoleType.OWNER]))):
    job = await db.scalar(select(MigrationJob).where(MigrationJob.id == job_id, MigrationJob.org_id == org.id))
    if not job: raise HTTPException(status_code=404, detail="Migration job not found")
    if job.errors: raise HTTPException(status_code=409, detail="Fix CSV validation errors before applying")
    if job.status == "completed": raise HTTPException(status_code=409, detail="This import was already applied")
    rows = job.rows or []
    rows_preview = await _preview_rows(db, org.id, job.target, rows)
    duplicate_indexes = {
        index for index, row in enumerate(rows_preview)
        if row["duplicate_reason"] is not None
    }
    import_rows = [row for index, row in enumerate(rows) if index not in duplicate_indexes]
    if job.target == "companies":
        db.add_all([Company(org_id=org.id, name=row["name"], website=row.get("website"), industry=row.get("industry"), notes=row.get("notes")) for row in import_rows])
    elif job.target == "contacts":
        for row in import_rows:
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
        for row in import_rows:
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
    return {
        "id": job.id,
        "status": job.status,
        "imported": len(import_rows),
        "skipped_duplicates": len(duplicate_indexes),
        "row_count": len(rows),
        "duplicate_count": len(duplicate_indexes),
        "target": job.target,
    }
