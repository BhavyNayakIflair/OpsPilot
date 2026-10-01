from pydantic import BaseModel

from app.gateway.base import LLMProvider, ProviderError


class GroqProvider(LLMProvider):
    """Reserved provider adapter; implementation is intentionally deferred."""

    def generate(self, prompt: str, system: str = "", temperature: float = 0.2,
                 response_model: type[BaseModel] | None = None, **kwargs):
        raise ProviderError("Groq provider is a stub; configure LLM_PROVIDER=ollama")

    def embed(self, texts: list[str], **kwargs) -> list[list[float]]:
        raise ProviderError("Groq embeddings are not implemented; configure LLM_PROVIDER=ollama")
