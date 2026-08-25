#!/usr/bin/env python3
"""Validate the Robinhood skill as a concise, non-contradictory operating contract."""

from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"
CLAUDE = ROOT / "CLAUDE.md"

MIN_BYTES = 12_000
MAX_BYTES = 50_000
MIN_VERSION = (3, 1, 0)

REQUIRED_HEADINGS = (
    "## 30-second operating contract",
    "## Progressive disclosure",
    "## Choose the surface",
    "## Intent router",
    "## Account discovery and scope",
    "## Raw brokerage executor",
    "## Live-write contract",
    "## Tax and legal-mechanics research contract",
    "## Agent response contracts",
    "## Failure modes that must stop the workflow",
    "## Verification checklist",
    "## Maintainer rules",
)

REQUIRED_CONTRACTS = (
    "ROBINHOOD_ALLOW_LIVE_WRITE=1",
    "--query-param key=value",
    "robinhood-tax",
    "robinhood-cli tax strategy",
    "@zaydiscold/robinhood-cli/tax-reference",
    "@zaydiscold/robinhood-cli/tax-strategy",
    "tools/list",
    "Order history is the only proof",
    "Dry-run is the resting state",
    "exact user approval",
    "account allow-list",
    "knowledge/tax-reference.md",
    "knowledge/tax-strategy-routing.md",
    "primary law or regulation",
    "broker-platform behavior",
    "planning inference",
    "A tax-reference read never authorizes",
    "A tax-strategy guide never determines a filing result",
    "tradeAuthorized: false",
    "CLI, MCP, scripts, and package APIs must share",
)

FORBIDDEN_PATTERNS: tuple[tuple[str, str], ...] = (
    (
        r"brokerage execute[^\n]{0,120}(?:does not|doesn't|cannot|can't) support query params",
        "raw CLI supports repeatable --query-param values",
    ),
    (
        r"(?:exactly|all)\s+\d{2,3}\s+(?:MCP\s+)?tools",
        "MCP tool counts are runtime-discovered through tools/list",
    ),
    (
        r"(?:a|the)\s+(?:HTTP\s+)?201\s+(?:is|proves|confirms)",
        "an HTTP 201 is not order evidence",
    ),
    (
        r"all reads (?:are|run) live",
        "local, catalog, plan, reference, and generated surfaces are not live brokerage reads",
    ),
    (
        r"(?:tax-reference|robinhood-tax)[^\n]{0,100}(?:is|provides) personalized tax advice",
        "tax reference is educational mechanics, not personalized advice",
    ),
    (
        r"60%[^\n]{0,40}(?:not real|isn't real) long[- ]term",
        "Section 1256 assigns actual statutory long-term capital character to the 60% component",
    ),
    (
        r"payment(?:s)? in lieu[^\n]{0,80}(?:is|are) (?:a )?qualified dividend",
        "payments in lieu are not automatically qualified dividends",
    ),
)

REQUIRED_LINKS = (
    "AGENTS.md",
    "knowledge/README.md",
    "knowledge/execution-safety.md",
    "knowledge/accounts.md",
    "knowledge/mcp-operations.md",
    "knowledge/tax-reference.md",
    "knowledge/tax-strategy-routing.md",
    "knowledge/tax.md",
    "knowledge/tax-loss-harvesting.md",
    "docs/write-operations.md",
    "docs/evidence-confidence-ledger.md",
    "docs/cli-mcp-architecture.md",
)


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}
    values: dict[str, str] = {}
    for line in text[4:end].splitlines():
        match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$", line)
        if match:
            values[match.group(1)] = match.group(2).strip()
    return values


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", value)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def local_links(text: str) -> list[str]:
    return re.findall(r"\]\(([^)#]+)(?:#[^)]+)?\)", text)


def validate_symlink(errors: list[str]) -> None:
    if not CLAUDE.is_symlink():
        errors.append("CLAUDE.md must remain a symlink to SKILL.md")
        return
    try:
        target = CLAUDE.resolve(strict=True)
    except FileNotFoundError:
        errors.append("CLAUDE.md symlink is broken")
        return
    if target != SKILL.resolve():
        errors.append(f"CLAUDE.md resolves to {target}, expected {SKILL.resolve()}")


def main() -> int:
    text = SKILL.read_text(encoding="utf-8")
    size = len(text.encode("utf-8"))
    lines = text.count("\n") + 1
    errors: list[str] = []

    if size < MIN_BYTES:
        errors.append(f"SKILL.md is {size:,} bytes; minimum router contract is {MIN_BYTES:,}")
    if size > MAX_BYTES:
        errors.append(
            f"SKILL.md is {size:,} bytes; maximum router size is {MAX_BYTES:,}. "
            "Move deep detail into knowledge/ or docs/."
        )

    frontmatter = parse_frontmatter(text)
    if frontmatter.get("name") != "robinhood-cli":
        errors.append("frontmatter name must be robinhood-cli")
    version = parse_version(frontmatter.get("version", ""))
    if version is None:
        errors.append("frontmatter version must be semantic x.y.z")
    elif version < MIN_VERSION:
        errors.append(
            f"frontmatter version {frontmatter['version']} is below required "
            f"{'.'.join(map(str, MIN_VERSION))}"
        )
    if not frontmatter.get("description"):
        errors.append("frontmatter description is required")

    for heading in REQUIRED_HEADINGS:
        if heading not in text:
            errors.append(f"missing required heading: {heading}")
    for contract in REQUIRED_CONTRACTS:
        if contract.lower() not in text.lower():
            errors.append(f"missing required operating contract: {contract}")

    for pattern, explanation in FORBIDDEN_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL):
            errors.append(f"stale or unsafe guidance detected ({explanation}): /{pattern}/")

    link_targets = set(local_links(text))
    for target in REQUIRED_LINKS:
        if target not in link_targets:
            errors.append(f"missing canonical local link: {target}")

    for target in link_targets:
        if "://" in target or target.startswith(("mailto:", "#")):
            continue
        path = (ROOT / target).resolve()
        if ROOT not in path.parents and path != ROOT:
            errors.append(f"local link escapes repository: {target}")
        elif not path.exists():
            errors.append(f"broken local link: {target}")

    validate_symlink(errors)

    agents_size = (ROOT / "AGENTS.md").stat().st_size
    if size >= agents_size:
        errors.append(
            "SKILL.md must remain a progressive-disclosure router smaller than AGENTS.md; "
            f"skill={size:,}, agents={agents_size:,}"
        )

    print(
        "SKILL.md integrity: "
        f"{lines:,} lines, {size:,} bytes, version={frontmatter.get('version', 'missing')}, "
        f"bounds={MIN_BYTES:,}-{MAX_BYTES:,}"
    )
    if errors:
        print("Skill integrity regression:\n- " + "\n- ".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
