#!/usr/bin/env python3
"""Check active agent guidance for contradictions, stale tax claims, and broken routing links."""

from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

ACTIVE_FILES = (
    Path("SKILL.md"),
    Path("knowledge/README.md"),
    Path("knowledge/cli-routing.md"),
    Path("knowledge/tax.md"),
    Path("knowledge/tax-loss-harvesting.md"),
    Path("docs/tax-aware-options-strategies.md"),
)

TAX_FILES = (
    Path("knowledge/tax.md"),
    Path("knowledge/tax-loss-harvesting.md"),
    Path("docs/tax-aware-options-strategies.md"),
)

FORBIDDEN_GUIDANCE: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"brokerage execute[^\n]{0,160}(?:does not|doesn't|cannot|can't) support query params",
            re.IGNORECASE,
        ),
        "raw brokerage execution supports repeatable --query-param values",
    ),
    (
        re.compile(r"(?:a|the)\s+(?:HTTP\s+)?201\s+(?:is|proves|confirms)", re.IGNORECASE),
        "an HTTP 201 is not order-history evidence",
    ),
    (
        re.compile(r"(?:exactly|all)\s+\d{2,3}\s+(?:MCP\s+)?tools", re.IGNORECASE),
        "MCP inventory must come from tools/list",
    ),
    (
        re.compile(r"all reads (?:are|run) live", re.IGNORECASE),
        "local, generated, plan, and catalog reads are not live brokerage requests",
    ),
)

FORBIDDEN_TAX: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"60%[^\n]{0,60}(?:not real|isn't real) long[- ]term", re.IGNORECASE),
        "Section 1256 assigns actual statutory long-term capital character to the 60% component",
    ),
    (
        re.compile(
            r"box spread[^\n]{0,240}(?:automatically|always)[^\n]{0,120}(?:deduct|capital loss|60/40)",
            re.IGNORECASE,
        ),
        "box-spread characterization is fact-specific",
    ),
    (
        re.compile(
            r"changing (?:the )?(?:strike|expiration)[^\n]{0,80}(?:breaks|avoids|escapes) (?:the )?wash",
            re.IGNORECASE,
        ),
        "there is no universal option strike/expiration wash-sale safe harbor",
    ),
    (
        re.compile(r"premium (?:itself )?is always short[- ]term", re.IGNORECASE),
        "option lifecycle and applicable provisions must be stated rather than using an unlimited always claim",
    ),
    (
        re.compile(r"a plain covered call is not (?:a )?constructive sale", re.IGNORECASE),
        "constructive-sale analysis is fact-specific and strategy names are not the statutory test",
    ),
    (
        re.compile(r"(?:26\s*[–-]\s*28|32|37)%", re.IGNORECASE),
        "active tax guidance must not hard-code rate comparisons without a return year and full facts",
    ),
)

BANNED_TAX_DOMAINS = (
    "justanswer.com",
    "cashflowmachine.net",
    "thebluecollarinvestor.com",
    "optionsamurai.com",
)

REQUIRED_TAX_PHRASES = (
    "tax-reference",
    "primary law",
    "broker-platform",
    "planning inference",
)

NO_AUTHORIZATION_PATTERN = re.compile(
    r"(?:never authoriz|does not[^\n]{0,100}authoriz|do not[^\n]{0,100}authoriz|never supplies? (?:the )?(?:consent|authorization))",
    re.IGNORECASE,
)


def read(path: Path) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def local_links(text: str) -> list[str]:
    return re.findall(r"\]\(([^)#]+)(?:#[^)]+)?\)", text)


def validate_links(path: Path, text: str, errors: list[str]) -> None:
    base = (ROOT / path).parent
    for target in local_links(text):
        if "://" in target or target.startswith(("mailto:", "#")):
            continue
        resolved = (base / target).resolve()
        if ROOT not in resolved.parents and resolved != ROOT:
            errors.append(f"{path}: local link escapes repository: {target}")
        elif not resolved.exists():
            errors.append(f"{path}: broken local link: {target}")


def main() -> int:
    errors: list[str] = []
    texts: dict[Path, str] = {}

    for path in ACTIVE_FILES:
        full = ROOT / path
        if not full.exists():
            errors.append(f"missing active guidance file: {path}")
            continue
        text = read(path)
        texts[path] = text
        validate_links(path, text, errors)
        for pattern, explanation in FORBIDDEN_GUIDANCE:
            if pattern.search(text):
                errors.append(f"{path}: contradictory guidance ({explanation}): /{pattern.pattern}/")

    for path in TAX_FILES:
        text = texts.get(path)
        if text is None:
            continue
        lowered = text.lower()
        for phrase in REQUIRED_TAX_PHRASES:
            if phrase not in lowered:
                errors.append(f"{path}: missing tax evidence contract phrase: {phrase}")
        if not NO_AUTHORIZATION_PATTERN.search(text):
            errors.append(f"{path}: must say that tax research does not authorize a trade or sale")
        for pattern, explanation in FORBIDDEN_TAX:
            if pattern.search(text):
                errors.append(f"{path}: stale tax claim ({explanation}): /{pattern.pattern}/")
        for domain in BANNED_TAX_DOMAINS:
            if domain in lowered:
                errors.append(
                    f"{path}: active tax guidance cites {domain}; route material claims through "
                    "the primary/official tax-reference catalog instead"
                )

    skill = texts.get(Path("SKILL.md"), "")
    if "does support repeatable `--query-param key=value` flags" not in skill:
        errors.append("SKILL.md must state the positive raw query-parameter contract exactly")
    if "Call `tools/list`" not in skill:
        errors.append("SKILL.md must route MCP discovery through tools/list")

    tax_doc = texts.get(Path("docs/tax-aware-options-strategies.md"), "")
    if "**Reviewed:** 2026-08-24" not in tax_doc:
        errors.append("docs/tax-aware-options-strategies.md must carry its explicit review date")
    if "60% long-term and 40% short-term" not in tax_doc:
        errors.append("options tax doc must state the Section 1256 60/40 character accurately")
    if "does **not** produce one automatic tax result" not in tax_doc:
        errors.append("options tax doc must preserve box-spread characterization uncertainty")

    generated = ROOT / "knowledge/tax-reference.md"
    catalog = ROOT / "knowledge/tax-reference.json"
    if not generated.exists() or not catalog.exists():
        errors.append("generated tax-reference Markdown and JSON catalog must both exist")

    print(
        "Agent guidance check: "
        f"{len(texts)} active file(s), {len(TAX_FILES)} tax workflow file(s), "
        f"{sum(len(text.encode('utf-8')) for text in texts.values()):,} bytes reviewed"
    )
    if errors:
        print("Agent guidance regression:\n- " + "\n- ".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
