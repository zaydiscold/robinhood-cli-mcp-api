#!/usr/bin/env python3
"""Protect the comprehensive operating skill from accidental condensation."""

from pathlib import Path
import re
import sys

MIN_BYTES = 120_000
ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"
REQUIRED_HEADINGS = (
    "## 🎯 What this is — and how to be a productive operator",
    "## Capability Catalog — what this CLI/API/MCP can actually do",
    "## ⚠️ Failure modes — hard rules",
    "### Options Greeks and Strategy Math",
    "## Live Write & Order Lifecycle",
    "## MCP Server",
    "## Full-Power MCP and Authenticated API Map (v1.0.0)",
    "## Verification Checklist",
    "## Agent Rules",
)
REQUIRED_CONTRACTS = (
    "ROBINHOOD_ALLOW_LIVE_WRITE=1",
    "ROBINHOOD_MCP_PROFILE unset      -> full",
    "Never trade, transfer, cancel, unlink, or mutate unless the user explicitly asked",
    "Raw captures stay",
)


def main() -> int:
    text = SKILL.read_text(encoding="utf-8")
    size = len(text.encode("utf-8"))
    lines = text.count("\n") + 1
    errors: list[str] = []

    if size < MIN_BYTES:
        errors.append(
            f"SKILL.md is {size:,} bytes; the comprehensive contract floor is {MIN_BYTES:,}"
        )
    for heading in REQUIRED_HEADINGS:
        if heading not in text:
            errors.append(f"missing required heading: {heading}")
    for contract in REQUIRED_CONTRACTS:
        if contract not in text:
            errors.append(f"missing required operating contract: {contract}")

    for target in re.findall(r"\]\(([^)#]+)(?:#[^)]+)?\)", text):
        if "://" in target or target.startswith(("mailto:", "#")):
            continue
        path = (ROOT / target).resolve()
        if ROOT not in path.parents and path != ROOT:
            errors.append(f"local link escapes repository: {target}")
        elif not path.exists():
            errors.append(f"broken local link: {target}")

    token_note = ""
    try:
        import tiktoken

        tokens = len(tiktoken.get_encoding("o200k_base").encode(text))
        token_note = f", {tokens:,} o200k_base tokens"
    except ImportError:
        token_note = ", exact token count unavailable (optional tiktoken not installed)"

    print(f"SKILL.md integrity: {lines:,} lines, {size:,} bytes{token_note}; no maximum")
    if errors:
        print("Skill integrity regression:\n- " + "\n- ".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
