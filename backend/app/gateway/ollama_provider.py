import json
import logging
import re
import threading
import time
from typing import Type

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.gateway.base import LLMProvider, ProviderError

logger = logging.getLogger(__name__)
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str | None = None, chat_model: str | None = None,
                 fast_model: str | None = None, embedding_model: str | None = None,
                 timeout: float | None = None, client: httpx.Client | None = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.chat_model = chat_model or settings.OLLAMA_CHAT_MODEL
        self.fast_model = fast_model or settings.OLLAMA_FAST_MODEL
        self.embedding_model = embedding_model or settings.OLLAMA_EMBEDDING_MODEL
        self.timeout = timeout or settings.OLLAMA_TIMEOUT_SECONDS
        self.client = client or httpx.Client(timeout=self.timeout)

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = self.client.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs)
                response.raise_for_status()
                return response
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(0.25)
        raise ProviderError(f"Ollama request failed after 2 attempts: {last_error}") from last_error

    def _ensure_model(self, model: str) -> None:
        try:
            result = self._request("POST", "/api/show", json={"name": model}).json()
            if result:
                return
        except ProviderError:
            # `/api/show` uses a 404 for an absent model; try a pull so setup is explicit.
            pass
        try:
            with self.client.stream("POST", f"{self.base_url}/api/pull", json={"name": model, "stream": True}, timeout=self.timeout) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        status = json.loads(line)
                        if status.get("error"):
                            raise ProviderError(str(status["error"]))
        except (httpx.HTTPError, ValueError, ProviderError) as exc:
            raise ProviderError(f"Ollama model '{model}' is unavailable. Install it with `ollama pull {model}`. Details: {exc}") from exc

    def generate(self, prompt: str, system: str = "", temperature: float = 0.2,
                 response_model: Type[BaseModel] | None = None, *, fast: bool = False,
                 task_type: str = "general", org_id: str | None = None) -> str | BaseModel:
        model = self.fast_model if fast else self.chat_model
        if fast:
            self._ensure_model(model)
            system = (system + "\n" if system else "") + "Do not show chain-of-thought. Return only the answer."
        body: dict = {"model": model, "messages": ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}],
                      "stream": False, "options": {"temperature": temperature}}
        if response_model is not None:
            body["format"] = response_model.model_json_schema()
        started = time.monotonic()
        status = "success"
        tokens_in = tokens_out = None
        try:
            payload = self._request("POST", "/api/chat", json=body).json()
            content = payload.get("message", {}).get("content", "")
            if not isinstance(content, str) or not content.strip():
                raise ProviderError("Ollama returned an empty response")
            content = _THINK_BLOCK.sub("", content).strip()
            tokens_in, tokens_out = payload.get("prompt_eval_count"), payload.get("eval_count")
            if response_model is not None:
                try:
                    return response_model.model_validate_json(content)
                except (ValidationError, ValueError) as exc:
                    raise ProviderError(f"Ollama response did not match {response_model.__name__}: {exc}") from exc
            return content
        except Exception:
            status = "error"
            raise
        finally:
            _record_request("ollama", model, task_type, tokens_in, tokens_out,
                            (time.monotonic() - started) * 1000, status, org_id)

    def embed(self, texts: list[str], *, task_type: str = "embedding", org_id: str | None = None) -> list[list[float]]:
        if not texts:
            return []
        started = time.monotonic()
        status = "success"
        try:
            try:
                payload = self._request("POST", "/api/embed", json={"model": self.embedding_model, "input": texts}).json()
                vectors = payload.get("embeddings")
            except ProviderError as exc:
                cause = exc.__cause__
                if not isinstance(cause, httpx.HTTPStatusError) or cause.response.status_code != 404:
                    raise
                vectors = [
                    self._request("POST", "/api/embeddings", json={"model": self.embedding_model, "prompt": text})
                    .json().get("embedding")
                    for text in texts
                ]
            if not isinstance(vectors, list) or len(vectors) != len(texts):
                raise ProviderError("Ollama returned an unexpected embedding response")
            if any(not isinstance(vector, list) or len(vector) != 768 for vector in vectors):
                raise ProviderError("Ollama returned an embedding with an unexpected dimension; expected 768 (nomic-embed-text)")
            return vectors
        except Exception:
            status = "error"
            raise
        finally:
            _record_request("ollama", self.embedding_model, task_type, None, None,
                            (time.monotonic() - started) * 1000, status, org_id)

    def health(self) -> dict:
        try:
            response = self.client.get(f"{self.base_url}/api/tags", timeout=3.0)
            response.raise_for_status()
            models = response.json().get("models", [])
            return {"status": "healthy", "provider": "ollama", "models": [m.get("name") for m in models]}
        except (httpx.HTTPError, ValueError) as exc:
            return {"status": "unavailable", "provider": "ollama", "detail": str(exc)}


def _record_request(provider: str, model: str, task_type: str, tokens_in: int | None,
                    tokens_out: int | None, latency_ms: float, status: str, org_id: str | None) -> None:
    """Persist telemetry outside request/event-loop state; logging must not mask model results."""
    def write() -> None:
        try:
            import asyncio
            from app.core.database import AsyncSessionLocal
            from app.models.model_request import ModelRequest

            async def insert() -> None:
                async with AsyncSessionLocal() as db:
                    db.add(ModelRequest(provider=provider, model=model, task_type=task_type,
                                        tokens_in=tokens_in, tokens_out=tokens_out,
                                        latency_ms=latency_ms, cost_usd=0, status=status, org_id=org_id))
                    await db.commit()
            asyncio.run(insert())
        except Exception:
            logger.exception("Could not persist model request telemetry")
    threading.Thread(target=write, daemon=True).start()
