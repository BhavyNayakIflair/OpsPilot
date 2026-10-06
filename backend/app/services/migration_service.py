"""
Migration Center Column Mapping Service.
Implements Rule R9 (Data Minimization) & Master Prompt Section 6.3:
- Deterministic fuzzy matcher runs first and acts as the baseline fallback.
- LLM improves ambiguous/unmapped columns only.
- Never auto-applies mappings; returns suggestions with confidence scores and evidence.
"""
import logging
import re
from typing import Dict, List, Optional, Set
from pydantic import BaseModel, Field

from app.ai.providers.base import JsonRequest
from app.ai.routing.router import ai_router
from app.schemas.migration import ColumnMapping, SuggestMappingRequest, SuggestMappingResponse

logger = logging.getLogger(__name__)

TARGET_FIELDS = {
    "companies": {
        "required": ["name"],
        "optional": ["website", "industry", "notes"],
        "synonyms": {
            "name": {"name", "company", "company_name", "account", "organization", "org", "business", "client_name"},
            "website": {"website", "domain", "url", "web", "site", "web_address"},
            "industry": {"industry", "sector", "vertical", "category", "field"},
            "notes": {"notes", "description", "details", "comments", "memo", "about"},
        },
    },
    "contacts": {
        "required": ["first_name", "last_name"],
        "optional": ["email", "phone", "company", "title"],
        "synonyms": {
            "first_name": {"first_name", "first", "firstname", "given_name", "fname"},
            "last_name": {"last_name", "last", "lastname", "surname", "family_name", "lname"},
            "email": {"email", "email_address", "mail", "contact_email", "e_mail"},
            "phone": {"phone", "telephone", "mobile", "cell", "phone_number", "contact_number"},
            "company": {"company", "company_name", "account", "employer", "organization", "client"},
            "title": {"title", "job_title", "position", "role", "designation"},
        },
    },
    "leads": {
        "required": ["title"],
        "optional": ["company", "value_cents", "currency", "notes"],
        "synonyms": {
            "title": {"title", "deal", "deal_name", "opportunity", "lead_name", "project", "name"},
            "company": {"company", "company_name", "account", "client", "client_name"},
            "value_cents": {"value", "amount", "deal_value", "revenue", "budget", "rate", "value_cents", "price"},
            "currency": {"currency", "curr"},
            "notes": {"notes", "description", "details", "comments", "summary"},
        },
    },
}


class AIMappingItem(BaseModel):
    source_column: str
    target_field: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class AIMappingResult(BaseModel):
    mappings: List[AIMappingItem]


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _deterministic_match(
    header: str,
    target: str,
    already_mapped: Set[str],
) -> Optional[ColumnMapping]:
    norm_h = _normalize(header)
    spec = TARGET_FIELDS.get(target, {})
    synonyms = spec.get("synonyms", {})

    for field_name, syn_set in synonyms.items():
        if field_name in already_mapped:
            continue
        # Direct exact match
        if norm_h == _normalize(field_name):
            return ColumnMapping(
                source_column=header,
                target_field=field_name,
                confidence=1.0,
                matched_by="deterministic",
                reason=f"Exact match to '{field_name}'",
            )
        # Synonym match
        for s in syn_set:
            if norm_h == _normalize(s):
                return ColumnMapping(
                    source_column=header,
                    target_field=field_name,
                    confidence=0.95,
                    matched_by="deterministic",
                    reason=f"Matched standard synonym '{s}' to '{field_name}'",
                )
        # Substring match if long enough
        if len(norm_h) >= 4 and any(_normalize(s) in norm_h or norm_h in _normalize(s) for s in syn_set):
            return ColumnMapping(
                source_column=header,
                target_field=field_name,
                confidence=0.85,
                matched_by="deterministic",
                reason=f"Substring lexical match to '{field_name}'",
            )

    return None


async def suggest_column_mappings(
    req: SuggestMappingRequest,
    org_id: Optional[str] = None,
) -> SuggestMappingResponse:
    target = req.target.lower()
    spec = TARGET_FIELDS.get(target)
    if not spec:
        raise ValueError(f"Unknown target '{target}'. Allowed: {list(TARGET_FIELDS.keys())}")

    mapped_fields: Set[str] = set()
    mappings: List[ColumnMapping] = []
    unmapped_headers: List[str] = []

    # 1. Deterministic Pass
    for header in req.headers:
        mapping = _deterministic_match(header, target, mapped_fields)
        if mapping:
            mapped_fields.add(mapping.target_field)
            mappings.append(mapping)
        else:
            unmapped_headers.append(header)

    # Attach sample values if available
    if req.sample_rows:
        for m in mappings:
            vals = [
                str(row.get(m.source_column, "")).strip()
                for row in req.sample_rows
                if row.get(m.source_column)
            ]
            m.sample_values = vals[:3]

    # 2. LLM Pass for ambiguous / unmapped headers (if unmapped headers and unmapped target fields remain)
    all_target_fields = spec["required"] + spec["optional"]
    available_target_fields = [f for f in all_target_fields if f not in mapped_fields]

    if unmapped_headers and available_target_fields:
        # Prepare data-minimized prompt
        samples_context = {}
        if req.sample_rows:
            for h in unmapped_headers:
                samples_context[h] = [
                    str(r.get(h, ""))[:50] for r in req.sample_rows if r.get(h)
                ][:2]

        prompt = (
            f"Target entity type: '{target}'\n"
            f"Available target schema fields: {available_target_fields}\n"
            f"Unmapped source CSV column headers: {unmapped_headers}\n"
            f"Sample data evidence per column: {samples_context}\n\n"
            "Suggest the best target field for each source column if a semantic match exists, "
            "or set target_field to null if none fits. Provide confidence (0.0 to 1.0) and brief reasoning."
        )
        system = (
            "You are an expert data migration assistant. Map source CSV columns to target SaaS entity fields. "
            "Do not guess. If a column has no suitable target, return null for target_field."
        )

        try:
            ai_req = JsonRequest(
                prompt=prompt,
                system=system,
                schema_model=AIMappingResult,
                task_type="mapping_suggest",
                org_id=org_id,
            )
            ai_res = await ai_router.execute_json("mapping_suggest", ai_req)
            if ai_res and ai_res.parsed:
                ai_data: AIMappingResult = ai_res.parsed
                for item in ai_data.mappings:
                    if (
                        item.target_field
                        and item.target_field in available_target_fields
                        and item.target_field not in mapped_fields
                        and item.confidence >= 0.6
                    ):
                        mapped_fields.add(item.target_field)
                        unmapped_headers = [h for h in unmapped_headers if h != item.source_column]
                        sample_vals = []
                        if req.sample_rows:
                            sample_vals = [
                                str(r.get(item.source_column, "")).strip()
                                for r in req.sample_rows
                                if r.get(item.source_column)
                            ][:3]
                        mappings.append(
                            ColumnMapping(
                                source_column=item.source_column,
                                target_field=item.target_field,
                                confidence=round(item.confidence, 2),
                                matched_by="ai",
                                sample_values=sample_vals,
                                reason=item.reason,
                            )
                        )
        except Exception as exc:
            logger.warning("AI mapping suggestion failed or degraded: %s", exc)

    # Check required missing
    required_missing = [f for f in spec["required"] if f not in mapped_fields]

    return SuggestMappingResponse(
        target=target,
        mappings=mappings,
        unmapped_columns=unmapped_headers,
        required_missing=required_missing,
    )
