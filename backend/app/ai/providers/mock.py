"""Deterministic Mock Provider for tests, CI, and demo-without-keys."""
import time
from typing import AsyncIterator, Optional
from pydantic import BaseModel

from app.ai.providers.base import (
    Chunk,
    EmbedResult,
    HealthStatus,
    JsonRequest,
    JsonResult,
    LLMProviderProtocol,
    QuotaState,
    TextRequest,
    TextResult,
    TranscribeResult,
)


class MockProvider:
    """
    In-process, zero-network deterministic mock provider.
    Unlimited quota, instant response.
    """
    id = "mock"

    def __init__(self, embedding_dimension: int = 768):
        self.embedding_dimension = embedding_dimension

    async def generate_json(self, req: JsonRequest) -> JsonResult:
        started = time.monotonic()
        data = {}
        if req.schema_model:
            # Provide sensible defaults for OpsPilot schemas
            name = req.schema_model.__name__
            if name == "AIDraftResponse":
                data = {
                    "title": "Mock Website implementation proposal",
                    "currency": "USD",
                    "line_items": [
                        {"description": "Engineering Services", "quantity": 10, "unit_price_cents": 15000}
                    ],
                    "total_cents": 150000,
                    "terms": "Net 30 payment terms.",
                    "assumptions": ["Mock assumption: Scope defined in work orders."],
                }
            elif name == "RequestUnderstanding":
                data = {
                    "summary": "Mock summary of client project scope",
                    "requirements": ["Customer portal frontend", "API backend"],
                    "uncertainties": [],
                }
            elif name == "QuoteSelfReview":
                data = {
                    "totals_match": True,
                    "flags": [],
                }
            else:
                data = {}
                for field_name, field_info in req.schema_model.model_fields.items():
                    if not field_info.is_required():
                        data[field_name] = field_info.default
                        continue
                    annotation = field_info.annotation
                    if annotation in (int, float):
                        data[field_name] = 1
                    elif annotation is bool:
                        data[field_name] = True
                    elif annotation is list or getattr(annotation, "__origin__", None) is list:
                        data[field_name] = []
                    else:
                        data[field_name] = f"mock_{field_name}"

            parsed = req.schema_model.model_validate(data)
        else:
            parsed = {"status": "ok", "message": "mock json"}

        return JsonResult(
            data=parsed,
            raw_text=str(data),
            provider=self.id,
            model="mock-v1",
            latency_ms=(time.monotonic() - started) * 1000,
            input_tokens=10,
            output_tokens=25,
            finish_reason="stop",
            cache_hit=False,
            prompt_version="v1",
        )

    async def generate_text(self, req: TextRequest) -> TextResult:
        started = time.monotonic()
        prompt_lower = req.prompt.lower()
        if "rag_answer" in req.task_type or "context documents" in prompt_lower:
            import re
            chunk_match = re.search(r"\[Chunk ([^ \]|]+)", req.prompt)
            chunk_ref = f"[Chunk {chunk_match.group(1)}]" if chunk_match else "[Chunk chunk-1]"
            if "99.95%" in req.prompt:
                text_out = f"Our enterprise SLA guarantees 99.95% annual uptime as specified in {chunk_ref}."
            elif "15-minute" in req.prompt or "15" in req.prompt:
                text_out = f"Priority 1 critical incidents have a 15-minute response SLA as specified in {chunk_ref}."
            else:
                text_out = f"Verified according to {chunk_ref}."
        else:
            text_out = "Mock text output."

        return TextResult(
            text=text_out,
            provider=self.id,
            model="mock-v1",
            latency_ms=(time.monotonic() - started) * 1000,
            input_tokens=10,
            output_tokens=10,
            finish_reason="stop",
            cache_hit=False,
            prompt_version="v1",
        )

    async def stream_text(self, req: TextRequest) -> AsyncIterator[Chunk]:
        yield Chunk(text="Mock ")
        yield Chunk(text="stream ")
        yield Chunk(text="output.", finish_reason="stop")

    async def embed(self, texts: list[str], model_alias: str = "default", **kwargs) -> EmbedResult:
        started = time.monotonic()
        # Return deterministic unit vectors
        vectors = []
        for idx, _ in enumerate(texts):
            vec = [0.0] * self.embedding_dimension
            vec[idx % self.embedding_dimension] = 1.0
            vectors.append(vec)

        return EmbedResult(
            embeddings=vectors,
            model="mock-embed-v1",
            dimension=self.embedding_dimension,
            provider=self.id,
            latency_ms=(time.monotonic() - started) * 1000,
            input_tokens=len(texts) * 5,
        )

    async def transcribe(self, audio: bytes, mime: str = "audio/wav") -> TranscribeResult:
        return TranscribeResult(
            text="Mock transcribed audio speech to text.",
            provider=self.id,
            latency_ms=10.0,
        )

    async def health(self) -> HealthStatus:
        return HealthStatus(
            status="ok",
            provider=self.id,
            models=["mock-v1", "mock-embed-v1"],
            detail="In-memory mock provider is operational",
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(
            provider=self.id,
            rpm_remaining=999999,
            rpd_remaining=999999,
            tpm_remaining=999999,
            tpd_remaining=999999,
            reset_seconds=0,
        )
