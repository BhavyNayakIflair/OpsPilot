from app.core.config import settings
from app.gateway.base import LLMProvider, ProviderError
from app.gateway.ollama_provider import OllamaProvider


def get_provider(name: str | None = None) -> LLMProvider:
    provider_name = (name or settings.LLM_PROVIDER or "ollama").strip().lower()

    if provider_name == "mock" or (name is None and getattr(settings, "MOCK_AI_PROVIDER", False) and settings.LLM_PROVIDER == "mock"):
        from app.ai.gateway_adapter import LegacyGatewayAdapter
        from app.ai.providers.mock import MockProvider
        return LegacyGatewayAdapter(MockProvider())

    if provider_name == "ollama":
        return OllamaProvider()

    if provider_name == "groq":
        from app.ai.config import ai_settings
        from app.ai.gateway_adapter import LegacyGatewayAdapter
        from app.ai.providers.openai_compat import OpenAICompatProvider
        return LegacyGatewayAdapter(
            OpenAICompatProvider(
                provider_id="groq",
                base_url="https://api.groq.com/openai/v1",
                api_key=ai_settings.GROQ_API_KEY,
                default_model="llama-3.3-70b-versatile",
            )
        )

    if provider_name in ("gemini", "mistral", "cloudflare", "openrouter"):
        from app.ai.config import ai_settings
        from app.ai.gateway_adapter import LegacyGatewayAdapter
        from app.ai.providers.openai_compat import OpenAICompatProvider
        url_map = {
            "mistral": "https://api.mistral.ai/v1",
            "openrouter": "https://openrouter.ai/api/v1",
            "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
        }
        key_map = {
            "mistral": ai_settings.MISTRAL_API_KEY,
            "openrouter": ai_settings.OPENROUTER_API_KEY,
            "gemini": ai_settings.GEMINI_API_KEY,
        }
        return LegacyGatewayAdapter(
            OpenAICompatProvider(
                provider_id=provider_name,
                base_url=url_map.get(provider_name, "https://api.openai.com/v1"),
                api_key=key_map.get(provider_name),
                default_model="default",
            )
        )

    if provider_name in ("router", "auto", "gateway"):
        from app.ai.gateway_adapter import LegacyGatewayAdapter
        from app.ai.routing.router import AIRouter
        return LegacyGatewayAdapter(AIRouter())

    raise ProviderError(f"Unsupported LLM_PROVIDER '{provider_name}'. Supported providers: ollama, groq, mock, gemini, mistral, cloudflare, openrouter, router, auto")


def get_llm_provider() -> LLMProvider:
    """FastAPI dependency kept separate so routes can override it with a FakeProvider."""
    return get_provider()

