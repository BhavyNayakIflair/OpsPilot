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

# Remove reasoning blocks if a model returns them despite think=False.
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class OllamaProvider(LLMProvider):
    """
    Ollama-backed LLM provider.

    Design goals:
    - Keep normal/fast requests bounded.
    - Prevent pathological model generations from blocking the API for minutes.
    - Explicitly disable model thinking for fast/normal tasks.
    - Allow complex models such as Qwen3 to be used with a generation cap.
    - Automatically ensure required Ollama models exist.
    - Preserve model-request telemetry.
    """

    def __init__(
        self,
        base_url: str | None = None,
        chat_model: str | None = None,
        fast_model: str | None = None,
        embedding_model: str | None = None,
        timeout: float | None = None,
        client: httpx.Client | None = None,
    ):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")

        self.chat_model = chat_model or settings.OLLAMA_CHAT_MODEL
        self.fast_model = fast_model or settings.OLLAMA_FAST_MODEL
        self.embedding_model = (
            embedding_model or settings.OLLAMA_EMBEDDING_MODEL
        )

        self.timeout = timeout or settings.OLLAMA_TIMEOUT_SECONDS
        self.client = client or httpx.Client(timeout=self.timeout)

    def _request(
        self,
        method: str,
        path: str,
        *,
        request_timeout: float | None = None,
        **kwargs,
    ) -> httpx.Response:
        """
        Make an HTTP request to Ollama with one retry.
        """
        last_error: Exception | None = None

        for attempt in range(2):
            try:
                response = self.client.request(
                    method,
                    f"{self.base_url}{path}",
                    timeout=request_timeout or self.timeout,
                    **kwargs,
                )

                response.raise_for_status()
                return response

            except httpx.TimeoutException as exc:
                # Replaying a generation after its read timeout repeats the
                # expensive model work and usually times out again.
                raise ProviderError(
                    f"Ollama request timed out after {request_timeout or self.timeout:g} seconds"
                ) from exc
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc

                if attempt == 0:
                    time.sleep(0.25)

        raise ProviderError(
            f"Ollama request failed after 2 attempts: {last_error}"
        ) from last_error

    def _ensure_model(self, model: str) -> None:
        """
        Ensure that an Ollama model exists locally.

        If the model is missing, Ollama will attempt to pull it automatically.
        """
        try:
            result = self._request(
                "POST",
                "/api/show",
                json={"name": model},
            ).json()

            if result:
                return

        except ProviderError:
            # `/api/show` returns 404 when the model does not exist.
            # In that case we attempt an explicit pull below.
            pass

        try:
            logger.info("Ollama model '%s' is missing; attempting to pull it.", model)

            with self.client.stream(
                "POST",
                f"{self.base_url}/api/pull",
                json={
                    "name": model,
                    "stream": True,
                },
                timeout=self.timeout,
            ) as response:

                response.raise_for_status()

                for line in response.iter_lines():
                    if not line:
                        continue

                    status = json.loads(line)

                    if status.get("error"):
                        raise ProviderError(str(status["error"]))

            logger.info("Ollama model '%s' is ready.", model)

        except (httpx.HTTPError, ValueError, ProviderError) as exc:
            raise ProviderError(
                f"Ollama model '{model}' is unavailable. "
                f"Install it with `ollama pull {model}`. "
                f"Details: {exc}"
            ) from exc

    def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.2,
        response_model: Type[BaseModel] | None = None,
        *,
        fast: bool = False,
        task_type: str = "general",
        org_id: str | None = None,
    ) -> str | BaseModel:

        # Fast tasks use the configured fast model.
        # Other tasks use the configured chat model.
        model = self.fast_model if fast else self.chat_model

        self._ensure_model(model)

        # Keep generation bounded.
        #
        # Fast tasks should be short because they are normally used for:
        # - extraction
        # - classification
        # - simple JSON
        # - short summaries
        #
        # Normal/complex tasks get a larger budget but are still bounded.
        # Fast/classify tasks: small budget (512 tokens).
        # Quote drafts: larger budget needed for multi-line-item JSON (2048).
        #   Note: quote_draft passes fast=True to use qwen2.5:3b-instruct for
        #   speed, but still needs a larger output budget than typical fast tasks.
        # General tasks: standard budget (1024).
        if task_type == "quote_draft":
            num_predict = 2048
        elif fast:
            num_predict = 512
        else:
            num_predict = 1024

        request_timeout = (
            settings.OLLAMA_QUOTE_TIMEOUT_SECONDS
            if task_type == "quote_draft"
            else self.timeout
        )

        # Explicitly tell the model not to expose reasoning.
        #
        # This is especially useful for Qwen3. The model may still produce
        # reasoning-like output depending on its template/version, so we also
        # remove <think>...</think> blocks from the final response below.
        system_parts = []

        if system:
            system_parts.append(system)

        system_parts.append(
            "Do not show chain-of-thought or internal reasoning. "
            "Return only the final answer."
        )

        final_system = "\n\n".join(system_parts)

        messages = [
            {
                "role": "system",
                "content": final_system,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ]

        body: dict = {
            "model": model,
            "messages": messages,
            "stream": False,

            # Explicitly disable thinking for normal application requests.
            #
            # We are intentionally NOT relying only on this flag because the
            # local Qwen3 test showed reasoning-like content despite think=False.
            "think": False,

            "options": {
                "temperature": temperature,
                "num_predict": num_predict,
            },
        }

        # Ollama structured-output support.
        if response_model is not None:
            body["format"] = response_model.model_json_schema()

        started = time.monotonic()
        status = "success"

        tokens_in: int | None = None
        tokens_out: int | None = None

        try:
            logger.debug(
                "Calling Ollama model=%s fast=%s task_type=%s "
                "num_predict=%s response_model=%s",
                model,
                fast,
                task_type,
                num_predict,
                response_model.__name__ if response_model else None,
            )

            payload = self._request(
                "POST",
                "/api/chat",
                request_timeout=request_timeout,
                json=body,
            ).json()

            message = payload.get("message", {})
            content = message.get("content", "")

            if not isinstance(content, str) or not content.strip():
                raise ProviderError(
                    "Ollama returned an empty response"
                )

            # Remove any leaked reasoning block.
            content = _THINK_BLOCK.sub("", content).strip()

            # Some models may leave an unmatched <think> tag.
            # Remove the tag itself as a final cleanup.
            content = re.sub(
                r"</?think>",
                "",
                content,
                flags=re.IGNORECASE,
            ).strip()

            tokens_in = payload.get("prompt_eval_count")
            tokens_out = payload.get("eval_count")

            if not content:
                raise ProviderError(
                    "Ollama returned no usable content after removing "
                    "reasoning output"
                )

            # Validate structured output when requested.
            if response_model is not None:
                try:
                    return response_model.model_validate_json(content)

                except (ValidationError, ValueError) as exc:
                    raise ProviderError(
                        f"Ollama response did not match "
                        f"{response_model.__name__}: {exc}"
                    ) from exc

            return content

        except Exception:
            status = "error"
            raise

        finally:
            _record_request(
                "ollama",
                model,
                task_type,
                tokens_in,
                tokens_out,
                (time.monotonic() - started) * 1000,
                status,
                org_id,
            )

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str = "embedding",
        org_id: str | None = None,
    ) -> list[list[float]]:

        if not texts:
            return []

        # Make sure nomic-embed-text exists before requesting embeddings.
        self._ensure_model(self.embedding_model)

        started = time.monotonic()
        status = "success"

        try:
            try:
                payload = self._request(
                    "POST",
                    "/api/embed",
                    json={
                        "model": self.embedding_model,
                        "input": texts,
                    },
                ).json()

                vectors = payload.get("embeddings")

            except ProviderError as exc:
                # Compatibility fallback for older Ollama versions.
                cause = exc.__cause__

                if (
                    not isinstance(cause, httpx.HTTPStatusError)
                    or cause.response.status_code != 404
                ):
                    raise

                vectors = [
                    self._request(
                        "POST",
                        "/api/embeddings",
                        json={
                            "model": self.embedding_model,
                            "prompt": text,
                        },
                    )
                    .json()
                    .get("embedding")
                    for text in texts
                ]

            if not isinstance(vectors, list):
                raise ProviderError(
                    "Ollama returned an unexpected embedding response"
                )

            if len(vectors) != len(texts):
                raise ProviderError(
                    "Ollama returned a different number of embeddings "
                    "than input texts"
                )

            # nomic-embed-text should produce 768-dimensional vectors.
            if any(
                not isinstance(vector, list) or len(vector) != 768
                for vector in vectors
            ):
                raise ProviderError(
                    "Ollama returned an embedding with an unexpected "
                    "dimension; expected 768 (nomic-embed-text)"
                )

            return vectors

        except Exception:
            status = "error"
            raise

        finally:
            _record_request(
                "ollama",
                self.embedding_model,
                task_type,
                None,
                None,
                (time.monotonic() - started) * 1000,
                status,
                org_id,
            )

    def health(self) -> dict:
        """
        Return the current Ollama health and available models.
        """
        try:
            response = self.client.get(
                f"{self.base_url}/api/tags",
                timeout=3.0,
            )

            response.raise_for_status()

            models = response.json().get("models", [])

            return {
                "status": "healthy",
                "provider": "ollama",
                "models": [
                    model.get("name")
                    for model in models
                ],
            }

        except (httpx.HTTPError, ValueError) as exc:
            return {
                "status": "unavailable",
                "provider": "ollama",
                "detail": str(exc),
            }


def _record_request(
    provider: str,
    model: str,
    task_type: str,
    tokens_in: int | None,
    tokens_out: int | None,
    latency_ms: float,
    status: str,
    org_id: str | None,
) -> None:
    """
    Persist telemetry outside request/event-loop state.

    Logging must never mask the actual model result.
    """

    def write() -> None:
        try:
            import asyncio

            from sqlalchemy.ext.asyncio import (
                AsyncSession,
                create_async_engine,
            )

            from app.core.config import settings
            from app.models.model_request import ModelRequest

            async def insert() -> None:
                # Dedicated engine for this thread's own event loop.
                # Never share the app's main async engine/pool across
                # event loops.
                engine = create_async_engine(
                    settings.DATABASE_URL,
                    pool_size=1,
                    max_overflow=0,
                )

                try:
                    async with AsyncSession(engine) as db:
                        db.add(
                            ModelRequest(
                                provider=provider,
                                model=model,
                                task_type=task_type,
                                tokens_in=tokens_in,
                                tokens_out=tokens_out,
                                latency_ms=latency_ms,
                                cost_usd=0,
                                status=status,
                                org_id=org_id,
                            )
                        )

                        await db.commit()

                finally:
                    await engine.dispose()

            asyncio.run(insert())

        except Exception:
            logger.exception(
                "Could not persist model request telemetry"
            )

    threading.Thread(
        target=write,
        daemon=True,
    ).start()
