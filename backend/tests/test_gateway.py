import httpx
import pytest
from pydantic import BaseModel

from app.gateway.base import LLMProvider, ProviderError
from app.gateway.factory import get_provider
from app.gateway.ollama_provider import OllamaProvider


class FakeProvider(LLMProvider):
    def generate(self, prompt, system="", temperature=0.2, response_model=None, **kwargs):
        return "ok"

    def embed(self, texts, **kwargs):
        return [[0.0, 1.0] for _ in texts]


class Answer(BaseModel):
    answer: str


def test_fake_provider_contract():
    provider = FakeProvider()
    assert provider.generate("say ok") == "ok"
    assert provider.embed(["one", "two"]) == [[0.0, 1.0], [0.0, 1.0]]


def test_factory_defaults_to_ollama():
    assert isinstance(get_provider("ollama"), OllamaProvider)


def test_ollama_strips_thinking_and_validates_structured_output():
    def handler(request):
        return httpx.Response(200, json={"message": {"content": '<think>private reasoning</think>{"answer":"ok"}'}})

    provider = OllamaProvider(client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = provider.generate("say ok", response_model=Answer)
    assert result == Answer(answer="ok")


def test_ollama_reports_clear_provider_failure_after_retry():
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        return httpx.Response(503)

    provider = OllamaProvider(client=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(ProviderError, match="Ollama request failed after 2 attempts"):
        provider.generate("say ok")
    assert attempts == 2
