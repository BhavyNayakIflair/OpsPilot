"""Base Provider Protocol and Request/Result models for OpsPilot AI Gateway."""
from typing import Any, AsyncIterator, Optional, Protocol, Type, runtime_checkable
from pydantic import BaseModel, Field


class JsonRequest(BaseModel):
    prompt: str
    system: str = ""
    schema_model: Optional[Type[BaseModel]] = None
    temperature: float = 0.2
    max_tokens: int = 2048
    model: Optional[str] = None
    timeout_seconds: float = 25.0
    org_id: Optional[str] = None
    task_type: str = "general"
    data_class: str = "internal"  # public_demo | internal | confidential


class TextRequest(BaseModel):
    prompt: str
    system: str = ""
    temperature: float = 0.2
    max_tokens: int = 1024
    model: Optional[str] = None
    timeout_seconds: float = 25.0
    org_id: Optional[str] = None
    task_type: str = "general"
    data_class: str = "internal"


class Chunk(BaseModel):
    text: str
    finish_reason: Optional[str] = None


class BaseResult(BaseModel):
    provider: str
    model: str
    latency_ms: float = 0.0
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    finish_reason: Optional[str] = None
    fallback_reason: Optional[str] = None
    cache_hit: bool = False
    prompt_version: str = "v1"


class JsonResult(BaseResult):
    data: Any
    raw_text: str = ""


class TextResult(BaseResult):
    text: str


class EmbedResult(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimension: int
    provider: str
    latency_ms: float = 0.0
    input_tokens: Optional[int] = None

    @property
    def vectors(self) -> list[list[float]]:
        return self.embeddings



class TranscribeResult(BaseModel):
    text: str
    provider: str
    latency_ms: float = 0.0


class HealthStatus(BaseModel):
    status: str  # ok | degraded | cooling_down | disabled | unconfigured
    provider: str
    models: list[str] = Field(default_factory=list)
    detail: Optional[str] = None


class QuotaState(BaseModel):
    provider: str
    rpm_remaining: Optional[int] = None
    rpd_remaining: Optional[int] = None
    tpm_remaining: Optional[int] = None
    tpd_remaining: Optional[int] = None
    reset_seconds: Optional[int] = None


@runtime_checkable
class LLMProviderProtocol(Protocol):
    id: str

    async def generate_json(self, req: JsonRequest) -> JsonResult: ...
    async def generate_text(self, req: TextRequest) -> TextResult: ...
    def stream_text(self, req: TextRequest) -> AsyncIterator[Chunk]: ...
    async def embed(self, texts: list[str], model_alias: str = "default") -> EmbedResult: ...
    async def transcribe(self, audio: bytes, mime: str = "audio/wav") -> TranscribeResult: ...
    async def health(self) -> HealthStatus: ...
    def quota_state(self) -> QuotaState: ...
