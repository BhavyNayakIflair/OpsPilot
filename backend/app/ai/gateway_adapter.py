"""
Adapter connecting the new OpsPilot app.ai gateway architecture to the legacy
app.gateway.base.LLMProvider interface, ensuring complete backward compatibility.
Rule R1: Existing public function signatures and API response shapes stay backward compatible.
"""
import asyncio
from typing import Any, Optional, Type
from pydantic import BaseModel

from app.ai.config import ai_settings
from app.ai.errors import AIGatewayError
from app.ai.providers.base import JsonRequest, TextRequest
from app.ai.providers.mock import MockProvider
from app.gateway.base import LLMProvider, ProviderError


def _run_async(coro):
    """Safely execute an async coroutine whether or not an event loop is running."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # In an existing running loop (e.g., if called directly on async thread)
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


class LegacyGatewayAdapter(LLMProvider):
    """
    Wraps an app.ai provider (or composite router) with the legacy LLMProvider interface:
      generate(prompt, system="", temperature=0.2, response_model=None, *, fast=False, task_type="general", org_id=None)
      embed(texts, *, task_type="embedding", org_id=None)
    """

    def __init__(self, target_provider: Any = None):
        self.target = target_provider or MockProvider()
        self.chat_model = getattr(self.target, "default_model", getattr(self.target, "chat_model", "ai-gateway-v1"))
        self.fast_model = getattr(self.target, "fast_model", getattr(self.target, "default_model", "ai-fast-v1"))
        self.embedding_model = getattr(self.target, "embedding_model", "text-embedding-004")

    def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.2,
        response_model: Optional[Type[BaseModel]] = None,
        *,
        fast: bool = False,
        task_type: str = "general",
        org_id: Optional[str] = None,
    ) -> str | BaseModel:
        # If target has legacy generate (like OllamaProvider), call it directly
        if hasattr(self.target, "generate") and callable(getattr(self.target, "generate")):
            try:
                return self.target.generate(
                    prompt,
                    system=system,
                    temperature=temperature,
                    response_model=response_model,
                    fast=fast,
                    task_type=task_type,
                    org_id=org_id,
                )
            except Exception as exc:
                if isinstance(exc, ProviderError):
                    raise
                raise ProviderError(str(exc)) from exc

        # Otherwise use the new Protocol methods
        try:
            if response_model is not None:
                req = JsonRequest(
                    prompt=prompt,
                    system=system,
                    schema_model=response_model,
                    temperature=temperature,
                    task_type=task_type,
                    org_id=org_id,
                    timeout_seconds=ai_settings.AI_TOTAL_DEADLINE_SECONDS,
                )
                if hasattr(self.target, "execute_json"):
                    result = _run_async(self.target.execute_json(task_type, req))
                else:
                    result = _run_async(self.target.generate_json(req))
                return result.data
            else:
                req = TextRequest(
                    prompt=prompt,
                    system=system,
                    temperature=temperature,
                    task_type=task_type,
                    org_id=org_id,
                    timeout_seconds=ai_settings.AI_TOTAL_DEADLINE_SECONDS,
                )
                if hasattr(self.target, "execute_text"):
                    result = _run_async(self.target.execute_text(task_type, req))
                else:
                    result = _run_async(self.target.generate_text(req))
                return result.text
        except AIGatewayError as exc:
            raise ProviderError(f"{type(exc).__name__}: {exc}") from exc
        except Exception as exc:
            raise ProviderError(str(exc)) from exc

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str = "embedding",
        org_id: Optional[str] = None,
    ) -> list[list[float]]:
        if not texts:
            return []

        # If target implements embed
        if hasattr(self.target, "embed"):
            import inspect
            if inspect.iscoroutinefunction(self.target.embed):
                try:
                    res = _run_async(self.target.embed(texts))
                    if hasattr(res, "vectors"):
                        return res.vectors
                    if hasattr(res, "embeddings"):
                        return res.embeddings
                    return res
                except Exception as exc:
                    raise ProviderError(str(exc)) from exc

            # Legacy synchronous embed(texts, task_type=..., org_id=...)
            try:
                return self.target.embed(texts, task_type=task_type, org_id=org_id)
            except Exception as exc:
                if isinstance(exc, ProviderError):
                    raise
                raise ProviderError(str(exc)) from exc

        # If target has no embed (e.g. AIRouter), delegate to preferred embedding provider
        try:
            from app.ai.providers.registry import get_provider_by_id
            if ai_settings.GEMINI_API_KEY:
                gemini = get_provider_by_id("gemini")
                if gemini:
                    res = _run_async(gemini.embed(texts))
                    return res.vectors
            from app.gateway.ollama_provider import OllamaProvider
            return OllamaProvider().embed(texts, task_type=task_type, org_id=org_id)
        except Exception:
            return [[0.0] * 768 for _ in texts]

    def health(self) -> dict:
        if hasattr(self.target, "health") and callable(getattr(self.target, "health")):
            h = getattr(self.target, "health")()
            if isinstance(h, dict):
                return h
            if hasattr(h, "model_dump"):
                return h.model_dump()
        return {"status": "ok", "provider": getattr(self.target, "id", "legacy-adapter")}
