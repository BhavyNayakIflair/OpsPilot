"""
Cloudflare Workers AI Free-Tier Provider Adapter.
Supports text generation and structured JSON generation.
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


class CloudflareProvider:
    """
    Adapter for Cloudflare Workers AI.
    Uses account-scoped REST endpoint:
    https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
    """

    def __init__(
        self,
        account_id: Optional[str] = None,
        api_token: Optional[str] = None,
        default_model: str = "@cf/meta/llama-3.1-8b-instruct",
    ):
        self.id = "cloudflare"
        self.account_id = account_id
        self.api_token = api_token
        self.default_model = default_model
        self._quota_state = QuotaState(provider=self.id)

    def _url(self, model: str) -> str:
        acc = self.account_id or "unknown"
        clean_model = model.lstrip("/")
        return f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/{clean_model}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    async def generate_text(self, req: TextRequest) -> TextResult:
        model = req.model or self.default_model
        url = self._url(model)

        messages = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.append({"role": "user", "content": req.prompt})

        payload = {
            "messages": messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
        }

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=req.timeout_seconds) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)
        except Exception as exc:
            raise ProviderUnavailableError(f"Cloudflare connection failure: {exc}") from exc

        latency_ms = (time.monotonic() - start) * 1000.0

        if resp.status_code == 429:
            raise QuotaExceededError("Cloudflare rate limit exceeded", retry_after_seconds=30)
        if resp.status_code >= 500 or resp.status_code == 404:
            raise ProviderUnavailableError(f"Cloudflare service error ({resp.status_code}): {resp.text[:200]}")
        if resp.status_code != 200:
            raise ProviderUnavailableError(f"Cloudflare HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        raw_text = data.get("result", {}).get("response", "")
        clean_text = strip_thinking(raw_text).strip()

        return TextResult(
            text=clean_text,
            raw_text=raw_text,
            provider=self.id,
            model=model,
            latency_ms=latency_ms,
        )

    async def generate_json(self, req: JsonRequest) -> JsonResult:
        model = req.model or self.default_model
        url = self._url(model)

        prompt_text = req.prompt
        if req.schema_model:
            schema_json = json.dumps(req.schema_model.model_json_schema())
            prompt_text = f"{prompt_text}\n\nYou MUST respond with valid JSON adhering to this JSON schema:\n{schema_json}"

        messages = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.append({"role": "user", "content": prompt_text})

        payload = {
            "messages": messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
        }

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=req.timeout_seconds) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)
        except Exception as exc:
            raise ProviderUnavailableError(f"Cloudflare connection failure: {exc}") from exc

        latency_ms = (time.monotonic() - start) * 1000.0

        if resp.status_code == 429:
            raise QuotaExceededError("Cloudflare rate limit exceeded", retry_after_seconds=30)
        if resp.status_code >= 500 or resp.status_code == 404:
            raise ProviderUnavailableError(f"Cloudflare service error ({resp.status_code}): {resp.text[:200]}")
        if resp.status_code != 200:
            raise ProviderUnavailableError(f"Cloudflare HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        raw_text = data.get("result", {}).get("response", "")
        clean_text = strip_thinking(raw_text).strip()
        json_str = extract_json_block(clean_text)

        validated_data: Any = None
        if req.schema_model:
            try:
                validated_data = req.schema_model.model_validate_json(json_str)
            except (ValidationError, ValueError) as exc:
                raise SchemaValidationError(f"Cloudflare JSON output failed validation: {exc}") from exc
        else:
            try:
                validated_data = json.loads(json_str)
            except Exception:
                validated_data = {"raw": json_str}

        return JsonResult(
            data=validated_data,
            raw_text=raw_text,
            provider=self.id,
            model=model,
            latency_ms=latency_ms,
        )

    async def stream_text(self, req: TextRequest) -> AsyncIterator[Chunk]:
        res = await self.generate_text(req)
        yield Chunk(delta=res.text, finish_reason="stop")

    async def embed(self, texts: List[str], task_type: str = "embedding") -> EmbedResult:
        raise NotImplementedError("Embeddings handled by Gemini text-embedding-001 or Ollama")

    async def transcribe(self, audio_bytes: bytes, mime_type: str = "audio/wav") -> TranscribeResult:
        raise NotImplementedError("STT not supported on Cloudflare free adapter; use Groq whisper-large-v3-turbo")

    async def health(self) -> HealthStatus:
        return HealthStatus(
            provider=self.id,
            healthy=bool(self.account_id and self.api_token),
            status="healthy" if (self.account_id and self.api_token) else "unconfigured",
            latency_ms=None,
        )

    async def quota_status(self) -> QuotaState:
        return self._quota_state
