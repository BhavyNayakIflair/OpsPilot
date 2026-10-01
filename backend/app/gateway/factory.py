from app.core.config import settings
from app.gateway.base import LLMProvider, ProviderError
from app.gateway.ollama_provider import OllamaProvider


def get_provider(name: str | None = None) -> LLMProvider:
    provider_name = (name or settings.LLM_PROVIDER or "ollama").strip().lower()
    if provider_name == "ollama":
        return OllamaProvider()
    if provider_name == "groq":
        from app.gateway.groq_provider import GroqProvider
        return GroqProvider()
    raise ProviderError(f"Unsupported LLM_PROVIDER '{provider_name}'. Supported providers: ollama, groq")
