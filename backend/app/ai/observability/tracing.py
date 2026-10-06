"""
Langfuse Tracing Integration for OpsPilot AI Gateway.
Implements Rule R4, Section 7.7 (Privacy Matrix), and Section 9 (Observability):
- Trace per user action / AI operation; span per provider attempt.
- Score fields: schema_valid (1.0/0.0), fallback_used (1.0/0.0).
- Privacy Guard (Section 7.7): Only sends prompt/output content for 'public_demo' data class.
  For 'internal' and 'confidential', sends strictly metadata (tokens, latency, model, scores).
- Degrades silently as a no-op if Langfuse credentials are not configured or offline.
"""
import logging
from typing import Any, Dict, Optional

from app.ai.config import ai_settings

logger = logging.getLogger(__name__)

# Check if official langfuse SDK is available
try:
    from langfuse import Langfuse
    _LANGFUSE_AVAILABLE = True
except ImportError:
    _LANGFUSE_AVAILABLE = False


class NoOpSpan:
    """Mock/No-op span when Langfuse is unconfigured or disabled."""

    def end(self, **kwargs: Any) -> None:
        pass

    def score(self, name: str, value: float, comment: Optional[str] = None) -> None:
        pass

    def update(self, **kwargs: Any) -> None:
        pass


class NoOpTrace:
    """Mock/No-op trace when Langfuse is unconfigured or disabled."""

    def span(self, name: str, **kwargs: Any) -> NoOpSpan:
        return NoOpSpan()

    def score(self, name: str, value: float, comment: Optional[str] = None) -> None:
        pass

    def update(self, **kwargs: Any) -> None:
        pass


class LangfuseTracer:
    """Manages Langfuse client lifecycle and traces with privacy guards."""

    def __init__(self):
        self._client: Optional[Any] = None
        self._initialized = False

    def _get_client(self) -> Optional[Any]:
        if not self._initialized:
            self._initialized = True
            if (
                _LANGFUSE_AVAILABLE
                and ai_settings.LANGFUSE_PUBLIC_KEY
                and ai_settings.LANGFUSE_SECRET_KEY
            ):
                try:
                    self._client = Langfuse(
                        public_key=ai_settings.LANGFUSE_PUBLIC_KEY,
                        secret_key=ai_settings.LANGFUSE_SECRET_KEY,
                        host=ai_settings.LANGFUSE_HOST,
                    )
                    logger.info("Langfuse tracing enabled at %s", ai_settings.LANGFUSE_HOST)
                except Exception as exc:
                    logger.warning("Failed to initialize Langfuse client: %s", exc)
                    self._client = None
        return self._client

    def start_trace(
        self,
        name: str,
        user_id: Optional[str] = None,
        org_id: Optional[str] = None,
        data_class: str = "internal",
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[list] = None,
    ) -> Any:
        """
        Starts a trace for an AI operation.
        Returns a trace object (or NoOpTrace if unconfigured).
        """
        client = self._get_client()
        if not client:
            return NoOpTrace()

        meta = {
            "org_id": org_id or "anonymous",
            "data_class": data_class,
            **(metadata or {}),
        }
        trace_tags = [data_class] + (tags or [])

        try:
            return client.trace(
                name=name,
                user_id=user_id,
                metadata=meta,
                tags=trace_tags,
            )
        except Exception as exc:
            logger.debug("Failed to create Langfuse trace: %s", exc)
            return NoOpTrace()

    def record_attempt_span(
        self,
        trace: Any,
        span_name: str,
        provider: str,
        model: str,
        data_class: str = "internal",
        prompt: Optional[str] = None,
        output: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Creates a span for a provider attempt.
        Strictly enforces Section 7.7:
        Only includes prompt and output text if data_class == 'public_demo'.
        """
        if isinstance(trace, NoOpTrace) or not trace:
            return NoOpSpan()

        span_meta = {
            "provider": provider,
            "model": model,
            "data_class": data_class,
            **(metadata or {}),
        }

        # Privacy matrix guard: only public_demo gets payload content logged
        include_content = (data_class == "public_demo")
        span_input = prompt if include_content else f"<redacted:{data_class}>"
        span_output = output if include_content else None

        try:
            return trace.span(
                name=span_name,
                input=span_input,
                output=span_output,
                metadata=span_meta,
            )
        except Exception as exc:
            logger.debug("Failed to create Langfuse span: %s", exc)
            return NoOpSpan()

    def flush(self) -> None:
        """Flushes buffered traces to server if client is active."""
        if self._client:
            try:
                self._client.flush()
            except Exception:
                pass


tracer = LangfuseTracer()
