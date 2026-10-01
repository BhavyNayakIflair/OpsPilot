from abc import ABC, abstractmethod
from typing import Type

from pydantic import BaseModel


class ProviderError(RuntimeError):
    """A model provider could not complete a request."""


class LLMProvider(ABC):
    @abstractmethod
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
        """Generate text or validate structured output into a Pydantic model."""

    @abstractmethod
    def embed(self, texts: list[str], *, task_type: str = "embedding", org_id: str | None = None) -> list[list[float]]:
        """Return one embedding vector per input text."""
