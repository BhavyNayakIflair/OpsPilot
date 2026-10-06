"""
Dedicated Google Gemini Free-Tier Provider Adapter.
Supports text generation, structured JSON generation, and 768-dim embeddings.
"""
import json
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional
import httpx
from pydantic import BaseModel, ValidationError

from app.ai.errors import (
    ProviderUnavailableError,
    QuotaExceededError,
    SchemaValidationError,
)
from app.ai.providers.base import (
    Chunk,
    EmbedResult,
    HealthStatus,
    JsonRequest,
    JsonResult,
    QuotaState,
    TextRequest,
    TextResult,
    TranscribeResult,
)
from app.ai.utils import extract_json_block, mask_secret, strip_thinking

logger = logging.getLogger(__name__)


class GeminiProvider:
    """
    Adapter for Google Generative AI (Gemini / Gemma).
    Supports generateContent and embedContent REST endpoints.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: str = "gemma-4-26b-a4b-it",
        embedding_model: str = "gemini-embedding-001",
        embedding_dimension: int = 768,
    ):
        self.id = "gemini"
        self.api_key = api_key
        self.default_model = default_model
        self.embedding_model = embedding_model
        self.embedding_dimension = embedding_dimension
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self._quota_state = QuotaState(provider=self.id)

    def _url(self, action: str, model: str) -> str:
        return f"{self.base_url}/models/{model}:{action}?key={self.api_key}"

    async def generate_text(self, req: TextRequest) -> TextResult:
        model = req.model or self.default_model
        url = self._url("generateContent", model)
        payload = {
            "contents": [{"parts": [{"text": f"{req.system}\n\n{req.prompt}" if req.system else req.prompt}]}],
            "generationConfig": {
                "temperature": req.temperature,
                "maxOutputTokens": req.max_tokens,
            },
        }

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=req.timeout_seconds) as client:
                resp = await client.post(url, json=payload)
        except Exception as exc:
            raise ProviderUnavailableError(f"Gemini connection failure: {exc}") from exc

        latency_ms = (time.monotonic() - start) * 1000.0

        if resp.status_code == 429:
            raise QuotaExceededError("Gemini rate limit exceeded", retry_after_seconds=30)
        if resp.status_code >= 500 or resp.status_code == 404:
            raise ProviderUnavailableError(f"Gemini service error ({resp.status_code}): {resp.text[:200]}")
        if resp.status_code != 200:
            raise ProviderUnavailableError(f"Gemini HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise ProviderUnavailableError(f"Gemini returned 0 candidates: {resp.text[:200]}")

        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        clean_text = strip_thinking(raw_text).strip()
        usage = data.get("usageMetadata", {})

        return TextResult(
            text=clean_text,
            raw_text=raw_text,
            provider=self.id,
            model=model,
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=usage.get("candidatesTokenCount"),
            latency_ms=latency_ms,
        )

    async def generate_json(self, req: JsonRequest) -> JsonResult:
        model = req.model or self.default_model
        url = self._url("generateContent", model)

        prompt_text = req.prompt
        if req.schema_model:
            schema_json = json.dumps(req.schema_model.model_json_schema())
            prompt_text = f"{prompt_text}\n\nYou MUST respond with valid JSON adhering to this JSON schema:\n{schema_json}"

        payload = {
            "contents": [{"parts": [{"text": f"{req.system}\n\n{prompt_text}" if req.system else prompt_text}]}],
            "generationConfig": {
                "temperature": req.temperature,
                "maxOutputTokens": req.max_tokens,
                "responseMimeType": "application/json",
            },
        }

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=req.timeout_seconds) as client:
                resp = await client.post(url, json=payload)
        except Exception as exc:
            raise ProviderUnavailableError(f"Gemini connection failure: {exc}") from exc

        latency_ms = (time.monotonic() - start) * 1000.0

        if resp.status_code == 429:
            raise QuotaExceededError("Gemini rate limit exceeded", retry_after_seconds=30)
        if resp.status_code >= 500 or resp.status_code == 404:
            raise ProviderUnavailableError(f"Gemini service error ({resp.status_code}): {resp.text[:200]}")
        if resp.status_code != 200:
            raise ProviderUnavailableError(f"Gemini HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise ProviderUnavailableError(f"Gemini returned 0 candidates: {resp.text[:200]}")

        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        clean_text = strip_thinking(raw_text).strip()
        json_str = extract_json_block(clean_text)

        validated_data: Any = None
        if req.schema_model:
            try:
                validated_data = req.schema_model.model_validate_json(json_str)
            except (ValidationError, ValueError) as exc:
                raise SchemaValidationError(f"Gemini JSON output failed validation: {exc}") from exc
        else:
            try:
                validated_data = json.loads(json_str)
            except Exception:
                validated_data = {"raw": json_str}

        usage = data.get("usageMetadata", {})
        return JsonResult(
            data=validated_data,
            raw_text=raw_text,
            provider=self.id,
            model=model,
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=usage.get("candidatesTokenCount"),
            latency_ms=latency_ms,
        )

    async def stream_text(self, req: TextRequest) -> AsyncIterator[Chunk]:
        res = await self.generate_text(req)
        yield Chunk(delta=res.text, finish_reason="stop")

    async def embed(self, texts: List[str], task_type: str = "embedding", **kwargs) -> EmbedResult:
        """Batch embed texts using Gemini embedContent with exact 768 dimension output."""
        start = time.monotonic()
        vectors: List[List[float]] = []

        async with httpx.AsyncClient(timeout=15.0) as client:
            for text in texts:
                url = self._url("embedContent", self.embedding_model)
                payload = {
                    "content": {"parts": [{"text": text}]},
                    "outputDimensionality": self.embedding_dimension,
                }
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    raise ProviderUnavailableError(f"Gemini embed HTTP {resp.status_code}: {resp.text[:200]}")
                vec = resp.json().get("embedding", {}).get("values", [])
                vectors.append(vec)

        latency_ms = (time.monotonic() - start) * 1000.0
        return EmbedResult(
            embeddings=vectors,
            provider=self.id,
            model=self.embedding_model,
            dimension=self.embedding_dimension,
            latency_ms=latency_ms,
        )

    async def transcribe(self, audio_bytes: bytes, mime_type: str = "audio/wav") -> TranscribeResult:
        raise NotImplementedError("STT not supported on Gemini free adapter; use Groq whisper-large-v3-turbo")

    async def health(self) -> HealthStatus:
        return HealthStatus(
            provider=self.id,
            healthy=bool(self.api_key),
            status="healthy" if self.api_key else "unconfigured",
            latency_ms=None,
        )

    async def quota_status(self) -> QuotaState:
        return self._quota_state
