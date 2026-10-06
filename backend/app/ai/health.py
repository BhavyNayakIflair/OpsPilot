"""Health and readiness probing for AI providers and system services."""
import time
from typing import Any, Dict
from app.ai.config import ai_settings
from app.ai.utils import mask_secret

# In-memory cache for provider health so probes never burn quota
_HEALTH_CACHE: Dict[str, Dict[str, Any]] = {}
_LAST_CACHE_TIME: float = 0.0
_CACHE_TTL_SECONDS: float = 60.0


def get_ai_providers_status() -> Dict[str, Dict[str, Any]]:
    """
    Returns a cached health summary of all 7 free-tier AI providers.
    Does NOT burn LLM token quota on probes.
    Per-provider states: ok | degraded | cooling_down | disabled | unconfigured
    """
    global _HEALTH_CACHE, _LAST_CACHE_TIME
    now = time.monotonic()
    if _HEALTH_CACHE and (now - _LAST_CACHE_TIME) < _CACHE_TTL_SECONDS:
        return _HEALTH_CACHE

    status: Dict[str, Dict[str, Any]] = {}

    # Mock provider
    status["mock"] = {
        "status": "ok",
        "role": "in-process mock",
        "quota": "unlimited",
    }

    # Gemini
    if ai_settings.GEMINI_API_KEY:
        status["gemini"] = {
            "status": "ok",
            "key": mask_secret(ai_settings.GEMINI_API_KEY),
            "role": "primary quote drafting & embeddings (demo/synthetic)",
        }
    else:
        status["gemini"] = {"status": "unconfigured", "detail": "GEMINI_API_KEY not set"}

    # Groq
    if ai_settings.GROQ_API_KEY:
        status["groq"] = {
            "status": "ok",
            "key": mask_secret(ai_settings.GROQ_API_KEY),
            "role": "fast extraction, reasoning & Whisper STT",
        }
    else:
        status["groq"] = {"status": "unconfigured", "detail": "GROQ_API_KEY not set"}

    # Cloudflare
    if ai_settings.CF_ACCOUNT_ID and ai_settings.CF_API_TOKEN:
        status["cloudflare"] = {
            "status": "ok",
            "account": mask_secret(ai_settings.CF_ACCOUNT_ID),
            "token": mask_secret(ai_settings.CF_API_TOKEN),
            "role": "hosted fallback",
        }
    else:
        status["cloudflare"] = {"status": "unconfigured", "detail": "CF_ACCOUNT_ID or CF_API_TOKEN not set"}

    # Mistral
    if ai_settings.MISTRAL_API_KEY:
        status["mistral"] = {
            "status": "ok",
            "key": mask_secret(ai_settings.MISTRAL_API_KEY),
            "role": "secondary LLM, structured JSON",
        }
    else:
        status["mistral"] = {"status": "unconfigured", "detail": "MISTRAL_API_KEY not set"}

    # OpenRouter
    if ai_settings.OPENROUTER_API_KEY:
        status["openrouter"] = {
            "status": "ok",
            "key": mask_secret(ai_settings.OPENROUTER_API_KEY),
            "role": "emergency fallback (:free models only)",
        }
    else:
        status["openrouter"] = {"status": "unconfigured", "detail": "OPENROUTER_API_KEY not set"}

    # Ollama
    status["ollama"] = {
        "status": "ok" if ai_settings.OLLAMA_BASE_URL else "disabled",
        "endpoint": ai_settings.OLLAMA_BASE_URL,
        "chat_model": ai_settings.OLLAMA_CHAT_MODEL,
        "fast_model": ai_settings.OLLAMA_FAST_MODEL,
        "role": "local offline & confidential data route",
    }

    _HEALTH_CACHE = status
    _LAST_CACHE_TIME = now
    return status
