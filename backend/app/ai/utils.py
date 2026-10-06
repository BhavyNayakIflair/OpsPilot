"""Utility functions for secret masking and output sanitation."""
import re
from typing import Optional

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_UNMATCHED_THINK_TAG = re.compile(r"</?think>", re.IGNORECASE)


def mask_secret(secret: Optional[str], prefix_len: int = 4, suffix_len: int = 4) -> str:
    """
    Safely mask API keys or tokens for logs and diagnostics.
    Example: 'gsk_1234567890abcdef' -> 'gsk_...cdef'.
    Returns '[not configured]' for empty/None values.
    Never outputs the unmasked secret.
    """
    if not secret:
        return "[not configured]"
    s = secret.strip()
    if len(s) <= (prefix_len + suffix_len):
        return "***"
    return f"{s[:prefix_len]}...{s[-suffix_len:]}"


def strip_thinking(text: str) -> str:
    """
    Remove reasoning blocks (e.g. Qwen3/DeepSeek <think>...</think>) before parsing.
    Also strips any leftover unmatched thinking tags.
    """
    if not text:
        return ""
    cleaned = _THINK_BLOCK.sub("", text).strip()
    cleaned = _UNMATCHED_THINK_TAG.sub("", cleaned).strip()
    return cleaned


def extract_json_block(text: str) -> str:
    """
    Extract a valid JSON object or array from markdown code fences or raw text.
    """
    cleaned = strip_thinking(text)
    # Check for ```json ... ``` blocks
    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fenced_match:
        return fenced_match.group(1).strip()
    
    # Try finding the first '{' or '[' and matching closing bracket
    first_brace = cleaned.find("{")
    first_bracket = cleaned.find("[")
    
    if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
        last_brace = cleaned.rfind("}")
        if last_brace != -1 and last_brace > first_brace:
            return cleaned[first_brace:last_brace + 1].strip()
    elif first_bracket != -1:
        last_bracket = cleaned.rfind("]")
        if last_bracket != -1 and last_bracket > first_bracket:
            return cleaned[first_bracket:last_bracket + 1].strip()

    return cleaned
