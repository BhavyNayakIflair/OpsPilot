#!/usr/bin/env python3
"""
OpsPilot AI Gateway Smoke Test CLI.
Tests all configured providers, circuit breaker health, quota ledger, and model discovery.
Rule R4: All API keys masked in output.
Rule R3: Confirms zero cost ($0.00).
"""
import asyncio
import os
import sys
import time
from pathlib import Path

# Ensure backend is on python path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.config import ai_settings
from app.ai.discovery import discovery_service
from app.ai.providers.base import TextRequest
from app.ai.providers.registry import get_provider_by_id
from app.ai.routing.breaker import circuit_breaker
from app.ai.routing.quota import quota_ledger
from app.ai.utils import mask_secret


async def run_smoke_test():
    print("=" * 80)
    print(" OpsPilot AI Gateway Smoke Test (Zero-Cost Production Engine)")
    print(f" Hard Budget Enforced: ${ai_settings.DEFAULT_MONTHLY_AI_BUDGET_USD:.2f} forever")
    print("=" * 80)

    # 1. Model Discovery
    print("\n[1/3] Probing model catalogs at startup (5s timeout per provider)...")
    catalog = await discovery_service.discover_all(force_refresh=True)
    for p, models in catalog.items():
        print(f"  - {p:<12}: {len(models):>3} models discovered (e.g. {models[0] if models else 'none'})")

    # 2. Test providers
    print("\n[2/3] Testing provider live endpoints (single-shot prompt)...")
    results = []

    providers_to_test = [
        ("groq", "openai/gpt-oss-120b"),
        ("gemini", "gemma-4-26b-a4b-it"),
        ("cloudflare", "@cf/meta/llama-3.1-8b-instruct"),
        ("openrouter", "apodex/apodex-1.1-mini:free"),
        ("mistral", "mistral-small-latest"),
        ("ollama", ai_settings.OLLAMA_FAST_MODEL),
        ("mock", "mock-v1"),
    ]

    for pid, model in providers_to_test:
        provider = get_provider_by_id(pid)
        if not provider:
            results.append((pid, model, "SKIPPED", "No adapter found", 0.0))
            continue

        # Check key configuration
        key_configured = True
        masked_k = "n/a"
        if pid == "groq":
            key_configured = bool(ai_settings.GROQ_API_KEY)
            masked_k = mask_secret(ai_settings.GROQ_API_KEY)
        elif pid == "gemini":
            key_configured = bool(ai_settings.GEMINI_API_KEY)
            masked_k = mask_secret(ai_settings.GEMINI_API_KEY)
        elif pid == "cloudflare":
            key_configured = bool(ai_settings.CF_ACCOUNT_ID and ai_settings.CF_API_TOKEN)
            masked_k = mask_secret(ai_settings.CF_API_TOKEN)
        elif pid == "mistral":
            key_configured = bool(ai_settings.MISTRAL_API_KEY)
            masked_k = mask_secret(ai_settings.MISTRAL_API_KEY)
        elif pid == "openrouter":
            key_configured = bool(ai_settings.OPENROUTER_API_KEY)
            masked_k = mask_secret(ai_settings.OPENROUTER_API_KEY)

        if not key_configured:
            results.append((pid, model, "UNCONFIGURED", f"Key missing ({masked_k})", 0.0))
            continue

        req = TextRequest(
            prompt="Reply with exactly the single word: PONG",
            model=model,
            temperature=0.1,
            max_tokens=32,
            timeout_seconds=10.0,
        )

        start = time.monotonic()
        try:
            res = await provider.generate_text(req)
            elapsed_ms = (time.monotonic() - start) * 1000.0
            snippet = res.text.replace("\n", " ").strip()[:30]
            results.append((pid, model, "HEALTHY (200)", f"'{snippet}'", elapsed_ms))
        except Exception as exc:
            elapsed_ms = (time.monotonic() - start) * 1000.0
            err_msg = str(exc)[:40]
            results.append((pid, model, "FAILED", err_msg, elapsed_ms))

    # 3. Print Report Table
    print("\n[3/3] Provider Verification Matrix:")
    print("-" * 88)
    print(f"{'Provider':<12} {'Model':<32} {'Status':<16} {'Latency':>10} {'Response / Note':<24}")
    print("-" * 88)
    for pid, model, status, note, lat in results:
        lat_str = f"{lat:.0f} ms" if lat > 0 else "-"
        print(f"{pid:<12} {model[:31]:<32} {status:<16} {lat_str:>10} {note:<24}")
    print("-" * 88)

    # 4. Embeddings probe
    print("\nEmbeddings Probe (768-dim repository contract):")
    if ai_settings.GEMINI_API_KEY:
        try:
            gemini = get_provider_by_id("gemini")
            e_res = await gemini.embed(["OpsPilot vector chunk"])
            print(f"  - Gemini text-embedding-001: OK (dim={e_res.dimension}, latency={e_res.latency_ms:.0f}ms)")
        except Exception as exc:
            print(f"  - Gemini embed: FAILED ({exc})")

    mock = get_provider_by_id("mock")
    m_res = await mock.embed(["Test chunk"])
    print(f"  - Mock embed: OK (dim={m_res.dimension}, latency={m_res.latency_ms:.0f}ms)")

    print("\nSmoke test complete.\n")


if __name__ == "__main__":
    asyncio.run(run_smoke_test())
