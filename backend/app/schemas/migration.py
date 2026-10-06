from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class SuggestMappingRequest(BaseModel):
    target: str = Field(description="Target entity type: 'companies', 'contacts', or 'leads'")
    headers: List[str] = Field(description="List of CSV column headers to map")
    sample_rows: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Optional sanitized preview rows (max 3) for semantic evidence",
    )


class ColumnMapping(BaseModel):
    source_column: str
    target_field: Optional[str] = None
    confidence: float
    matched_by: str = "deterministic"  # "deterministic" or "ai"
    sample_values: List[str] = []
    reason: str


class SuggestMappingResponse(BaseModel):
    target: str
    mappings: List[ColumnMapping]
    unmapped_columns: List[str]
    required_missing: List[str]
