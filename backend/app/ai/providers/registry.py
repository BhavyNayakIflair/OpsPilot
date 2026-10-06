"""
Provider registry creating and caching provider adapters.
"""
from typing import Dict, Optional

from app.ai.config import ai_settings
from app.ai.providers.base import LLMProviderProtocol
from app.ai.providers.cloudflare import CloudflareProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.mock import MockProvider
from app.ai.providers.openai_compat import OpenAICompatProvider

_PROVIDERS: Dict[str, LLMProviderProtocol] = {}


def get_provider_by_id(provider_id: str) -> Optional[LLMProviderProtocol]:
    """Retrieve or initialize the provider adapter for a given provider id."""
    global _PROVIDERS

    if provider_id in _PROVIDERS:
        return _PROVIDERS[provider_id]

    if provider_id == "mock":
        _PROVIDERS["mock"] = MockProvider()
        return _PROVIDERS["mock"]

    if provider_id == "groq":
        _PROVIDERS["groq"] = OpenAICompatProvider(
            provider_id="groq",
            base_url="https://api.groq.com/openai/v1",
            api_key=ai_settings.GROQ_API_KEY,
            default_model="openai/gpt-oss-120b",
            supports_json_object=True,
        )
        return _PROVIDERS["groq"]

    if provider_id == "gemini":
        _PROVIDERS["gemini"] = GeminiProvider(
            api_key=ai_settings.GEMINI_API_KEY,
            default_model="gemma-4-26b-a4b-it",
            embedding_model="gemini-embedding-001",
            embedding_dimension=768,
        )
        return _PROVIDERS["gemini"]

    if provider_id == "mistral":
        _PROVIDERS["mistral"] = OpenAICompatProvider(
            provider_id="mistral",
            base_url="https://api.mistral.ai/v1",
            api_key=ai_settings.MISTRAL_API_KEY,
            default_model="mistral-small-latest",
            supports_json_object=True,
        )
        return _PROVIDERS["mistral"]

    if provider_id == "cloudflare":
        _PROVIDERS["cloudflare"] = CloudflareProvider(
            account_id=ai_settings.CF_ACCOUNT_ID,
            api_token=ai_settings.CF_API_TOKEN,
            default_model="@cf/meta/llama-3.1-8b-instruct",
        )
        return _PROVIDERS["cloudflare"]

    if provider_id == "openrouter":
        _PROVIDERS["openrouter"] = OpenAICompatProvider(
            provider_id="openrouter",
            base_url="https://openrouter.ai/api/v1",
            api_key=ai_settings.OPENROUTER_API_KEY,
            default_model="apodex/apodex-1.1-mini:free",
            supports_json_object=True,
        )
        return _PROVIDERS["openrouter"]

    if provider_id == "ollama":
        _PROVIDERS["ollama"] = OpenAICompatProvider(
            provider_id="ollama",
            base_url=f"{ai_settings.OLLAMA_BASE_URL.rstrip('/')}/v1",
            api_key="ollama",
            default_model=ai_settings.OLLAMA_FAST_MODEL,
            supports_json_object=True,
        )
        return _PROVIDERS["ollama"]

    return None


def register_custom_provider(provider_id: str, provider: LLMProviderProtocol) -> None:
    """Allow test harnesses to inject mock/stub providers."""
    _PROVIDERS[provider_id] = provider


def reset_provider_registry() -> None:
    """Clear provider instances."""
    _PROVIDERS.clear()
