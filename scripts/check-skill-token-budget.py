#!/usr/bin/env python3
"""Fail when the agent router escapes its progressive-disclosure token budget."""

from pathlib import Path
import sys

MIN_TOKENS = 4_000
MAX_TOKENS = 6_000
ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"


def main() -> int:
    try:
        import tiktoken
    except ImportError:
        print(
            "error: tiktoken is required for the reproducible SKILL.md token check; "
            "install it with `python3 -m pip install tiktoken`",
            file=sys.stderr,
        )
        return 2

    text = SKILL.read_text(encoding="utf-8")
    tokens = len(tiktoken.get_encoding("o200k_base").encode(text))
    print(f"SKILL.md: {tokens} o200k_base tokens (budget {MIN_TOKENS}-{MAX_TOKENS})")

    if tokens < MIN_TOKENS:
        print("error: router is below the minimum contract budget; verify required safety content", file=sys.stderr)
        return 1
    if tokens > MAX_TOKENS:
        print("error: router exceeds the progressive-disclosure budget; move detail to knowledge/", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
