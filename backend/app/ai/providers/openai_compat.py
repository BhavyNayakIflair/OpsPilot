"""Generic OpenAI-Compatible Provider Adapter for Groq, Mistral, OpenRouter, Cloudflare, etc."""
import json
import logging
import time
from typing import Any, AsyncIterator, Dict, Optional, Type
import httpx
from pydantic import BaseModel, ValidationError

from app.ai.errors import (
    AICapacityExhausted,
    ForbiddenRouteError,
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


class OpenAICompatProvider:
    """
    Parametrized OpenAI-compatible REST adapter.
    Handles Groq, Mistral, OpenRouter, Cloudflare Workers AI v1, and local Ollama /v1.
    """

    def __init__(
        self,
        provider_id: str,
        base_url: str,
        api_key: Optional[str] = None,
        default_model: str = "gpt-3.5-turbo",
        extra_headers: Optional[Dict[str, str]] = None,
        supports_json_schema: bool = False,
        supports_json_object: bool = True,
        rate_limit_headers_prefix: str = "x-ratelimit-",
    ):
        self.id = provider_id
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_model = default_model
        self.extra_headers = extra_headers or {}
        self.supports_json_schema = supports_json_schema
        self.supports_json_object = supports_json_object
        self.rate_limit_headers_prefix = rate_limit_headers_prefix

        # In-memory cached quota state updated from response headers
        self._quota_state = QuotaState(provider=self.id)

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            **self.extra_headers,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _update_quota_from_headers(self, headers: httpx.Headers) -> None:
        try:
            for k, v in headers.items():
                lower_k = k.lower()
                if "remaining-requests" in lower_k or "remaining-req" in lower_k:
                    self._quota_state.rpm_remaining = int(v)
                elif "remaining-tokens" in lower_k:
                    self._quota_state.tpm_remaining = int(v)
                elif "retry-after" in lower_k:
                    self._quota_state.reset_seconds = int(float(v))
        except Exception:
            pass

    async def _post(self, path: str, payload: dict, timeout_seconds: float) -> httpx.Response:
        url = f"{self.base_url}{path}"
        headers = self._get_headers()

        # Rule R4: Log only masked key and metadata, never request body with secrets
        logger.debug(
            "Calling %s path=%s model=%s auth=%s",
            self.id,
            path,
            payload.get("model"),
            mask_secret(self.api_key),
        )

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(url, json=payload, headers=headers)

                self._update_quota_from_headers(response.headers)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("retry-after", "30"))
                    raise QuotaExceededError(
                        f"Provider {self.id} rate limit exceeded (HTTP 429)",
                        retry_after_seconds=retry_after,
                    )
                if response.status_code in (401, 403):
                    raise ProviderUnavailableError(
                        f"Provider {self.id} authentication or authorization failed ({response.status_code}): {response.text[:200]}"
                    )
                if response.status_code >= 500:
                    raise ProviderUnavailableError(
                        f"Provider {self.id} server error ({response.status_code}): {response.text[:200]}"
                    )

                response.raise_for_status()
                return response

        except httpx.TimeoutException as exc:
            raise ProviderUnavailableError(f"Provider {self.id} timed out after {timeout_seconds:g}s") from exc
        except (QuotaExceededError, ProviderUnavailableError):
            raise
        except Exception as exc:
            raise ProviderUnavailableError(f"Provider {self.id} request failed: {exc}") from exc

    async def generate_json(self, req: JsonRequest) -> JsonResult:
        started = time.monotonic()
        model = req.model or self.default_model

        # Guard for OpenRouter: only :free models permitted (R3)
        if self.id == "openrouter" and not model.endswith(":free"):
            raise ForbiddenRouteError(f"OpenRouter model '{model}' is forbidden. Only ':free' models allowed.")

        messages = []
        system_content = req.system or ""
        if req.schema_model:
            schema_json = json.dumps(req.schema_model.model_json_schema(), separators=(",", ":"))
            instruction = (
                f"\nYou MUST respond with valid JSON strictly adhering to this JSON Schema:\n{schema_json}\n"
                "Do not include any explanation or markdown commentary. Do not show reasoning."
            )
            system_content = f"{system_content}\n{instruction}".strip()

        if system_content:
            messages.append({"role": "system", "content": system_content})
        messages.append({"role": "user", "content": req.prompt})

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        }

        if self.supports_json_object:
            payload["response_format"] = {"type": "json_object"}

        response = await self._post("/chat/completions", payload, req.timeout_seconds)
        data = response.json()

        choices = data.get("choices", [])
        if not choices:
            raise ProviderUnavailableError(f"Provider {self.id} returned no choices")

        content = choices[0].get("message", {}).get("content", "")
        finish_reason = choices[0].get("finish_reason")

        cleaned_text = strip_thinking(content)
        json_str = extract_json_block(cleaned_text)

        parsed_data: Any = None
        if req.schema_model:
            try:
                parsed_data = req.schema_model.model_validate_json(json_str)
            except (ValidationError, ValueError) as exc:
                raise SchemaValidationError(
                    f"Model output failed schema validation for {req.schema_model.__name__}: {exc}"
                ) from exc
        else:
            try:
                parsed_data = json.loads(json_str)
            except Exception:
                parsed_data = {"raw": json_str}

        usage = data.get("usage", {})
        latency = (time.monotonic() - started) * 1000

        return JsonResult(
            data=parsed_data,
            raw_text=json_str,
            provider=self.id,
            model=model,
            latency_ms=latency,
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            finish_reason=finish_reason,
            cache_hit=False,
            prompt_version="v1",
        )

    async def generate_text(self, req: TextRequest) -> TextResult:
        started = time.monotonic()
        model = req.model or self.default_model

        if self.id == "openrouter" and not model.endswith(":free"):
            raise ForbiddenRouteError(f"OpenRouter model '{model}' is forbidden. Only ':free' models allowed.")

        messages = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.append({"role": "user", "content": req.prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        }

        response = await self._post("/chat/completions", payload, req.timeout_seconds)
        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            raise ProviderUnavailableError(f"Provider {self.id} returned no choices")

        raw_content = choices[0].get("message", {}).get("content", "")
        cleaned_content = strip_thinking(raw_content)

        usage = data.get("usage", {})
        latency = (time.monotonic() - started) * 1000

        return TextResult(
            text=cleaned_content,
            provider=self.id,
            model=model,
            latency_ms=latency,
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            finish_reason=choices[0].get("finish_reason"),
            cache_hit=False,
            prompt_version="v1",
        )

    async def stream_text(self, req: TextRequest) -> AsyncIterator[Chunk]:
        model = req.model or self.default_model
        messages = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.append({"role": "user", "content": req.prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
            "stream": True,
        }

        url = f"{self.base_url}/chat/completions"
        headers = self._get_headers()

        async with httpx.AsyncClient(timeout=req.timeout_seconds) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk_obj = json.loads(data_str)
                        choices = chunk_obj.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            text = delta.get("content", "")
                            if text:
                                yield Chunk(text=text, finish_reason=choices[0].get("finish_reason"))
                    except Exception:
                        continue

    async def embed(self, texts: list[str], model_alias: str = "default") -> EmbedResult:
        started = time.monotonic()
        payload = {
            "model": model_alias if model_alias != "default" else self.default_model,
            "input": texts,
        }
        response = await self._post("/embeddings", payload, 20.0)
        data = response.json()
        raw_embeddings = [item["embedding"] for item in data.get("data", [])]
        dimension = len(raw_embeddings[0]) if raw_embeddings else 0
        latency = (time.monotonic() - started) * 1000

        return EmbedResult(
            embeddings=raw_embeddings,
            model=payload["model"],
            dimension=dimension,
            provider=self.id,
            latency_ms=latency,
            input_tokens=data.get("usage", {}).get("prompt_tokens"),
        )

    async def transcribe(self, audio: bytes, mime: str = "audio/wav") -> TranscribeResult:
        # Groq/Whisper endpoint
        started = time.monotonic()
        url = f"{self.base_url}/audio/transcriptions"
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        files = {"file": ("audio.wav", audio, mime)}
        data = {"model": "whisper-large-v3-turbo"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, files=files, data=data, headers=headers)
            resp.raise_for_status()
            text = resp.json().get("text", "")
            return TranscribeResult(text=text, provider=self.id, latency_ms=(time.monotonic() - started) * 1000)

    async def health(self) -> HealthStatus:
        if not self.api_key and self.id != "ollama":
            return HealthStatus(status="unconfigured", provider=self.id, detail="API key is not configured")

        try:
            url = f"{self.base_url}/models"
            headers = self._get_headers()
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    models_data = resp.json().get("data", [])
                    model_ids = [m.get("id") for m in models_data if isinstance(m, dict)]
                    return HealthStatus(status="ok", provider=self.id, models=model_ids[:10])
                return HealthStatus(status="degraded", provider=self.id, detail=f"HTTP {resp.status_code}")
        except Exception as exc:
            return HealthStatus(status="degraded", provider=self.id, detail=str(exc))

    def quota_state(self) -> QuotaState:
        return self._quota_state
