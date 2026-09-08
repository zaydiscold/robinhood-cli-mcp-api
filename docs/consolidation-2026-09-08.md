# One-main consolidation, 2026-09-08

## What was integrated

The starting local main had 35 commits absent from GitHub, including PRs #98 and #106. GitHub main had two absent locally: #107 browser-session recovery documentation and #108 history pagination. They are now integrated without replacing either history. Review corrected the incoming recovery documentation to describe exact candidate verification and working-directory-independent MCP startup.

All 16 live remote feature/maintenance branches were compared against local and remote main by ancestry or stable patch equivalence. Preserved capabilities include tax reference and strategy research, unified tax CLI/API, position identity, strategy payoff/spread risk, trusted devices/Gold/sweep, authentication recovery and portability, history pagination, and order-watch deadlines.

| Branch | Incorporation evidence |
| --- | --- |
| codex/robinhood-wiring-audit-2026-09-06 | exact ancestry, PR #106 |
| codex/tax-strategy-research-router | exact ancestry, PR #98 |
| codex/stable-snapshot-position-identity | exact ancestry |
| codex/skill-tax-docs-hardening | stable patch equivalent, squash #92 |
| codex/tax-reference-surface | stable patch equivalent, squash #91 |
| codex/unified-tax-cli | stable patch equivalent, squash #93 |
| cursor/strategy-payoff-and-spread-risk-cb25 | stable patch equivalent, squash #66 |
| cursor/docs-mcp-path-version-sync-fc28 | patch equivalent, merged #65 |
| feat/trusted-devices-sweep-gold | patch equivalent, merged #45 |
| fix/auth-session-guardian | patch equivalent, merged #104 |
| fix/custom-auth-profile | patch equivalent, merged #105 |
| fix/fast-uri-security | patch equivalent, merged #103 |
| fix/public-auth-portability | patch equivalent, merged #43 |
| docs/login-recovery-instructions | stable patch equivalent, squash #107 |
| fix/history-pagination | stable patch equivalent, squash #108 |
| cron/midday-2026-09-03 | private operational records only, archived privately |

A verified private Git bundle preserves the pre-cleanup refs and unique operational records. Those portfolio notes are not added to public source. No new branch or worktree was created for this consolidation.

## Regressions corrected during integration

- Incoming history fixtures now consistently use synthetic owned-account identities.
- One shared bounded pagination collector rejects malformed results, malformed/repeated cursors and later-page failures instead of returning incomplete data. History accepts an explicit positive integer maxPages in its importable API, default 50, validated before dependencies run. No unsupported date-filter or page-ordering contract is assumed.
- Equity order references use opaque UUIDs instead of embedding account numbers. Amount, shares and explicit limit prices must be finite and positive, with exactly one amount/quantity input. Invalid inputs fail before account, instrument, quote or write dependencies run (#75).
- All package engines agree on Node >=20.19. Node types stay on the Node 20 line; doctor rejects earlier versions. Ubuntu compatibility CI exercises exactly 20.19.0, while the other jobs cover current Node 20/22 on Linux/macOS/Windows (#82/#89).

## CI and test review

Retained the six runtime/platform jobs because the repository has actual platform-specific auth, executable and path regressions. Removed duplicate normal Vitest execution from the canonical coverage job: coverage already runs that same suite. Kept behavioral write-gate, order-evidence, protocol, package and authentication checks. Dependency auditing now matches the existing release requirement at low severity. No coverage threshold was weakened or behavioral test deleted to obtain green checks.

## Verification

Exact Node 20.19.0 passed CLI/MCP builds, built imports, CLI help, 30 focused runtime/package tests and an actual packed CLI installation/import/help check in a temporary consumer. Independent stdio MCP startup from an unrelated working directory advertised 93 tools and returned a structured authenticated account response. Built CLI accounts, SPY quote, portfolio and tax strategy wheel returned successful nonempty JSON with live writes disarmed. These are read-only acceptance checks, not proof of every entitlement-specific endpoint or financial mutation.

Final consolidated local validation passed: 614 CLI tests, 18 MCP tests, authentication script/Python checks, coverage ratchets, quality checks, generated-map drift check, and a zero-advisory dependency audit.

Reproduce the complete local gates with pnpm test, pnpm quality, pnpm coverage:built and pnpm regression:recent. CI additionally runs the supported OS/runtime matrix and generated-map drift check. Source secrets were scanned with gitleaks git . --log-opts='origin/main..HEAD' --redact before publication.

## Issue reconciliation and limits

#75 and #82/#89 are addressed by the changes above. #77 duplicates the broader #85; #80 overlaps #86. #97 is a temporary tool check. Remaining issues are retained as real unfinished requirements rather than marked complete because related work exists: #100 still needs semantic readback across crypto, recurring and watchlists; #94-96 request distinct reconciliation engines, not the strategy research router already integrated. Broad schema/refactor and request-bound approval proposals likewise are not silently claimed implemented.

History remains bounded and reports an explicit completeness error above its page budget. No live trades, transfers or account-setting changes were used for testing. Existing historical personal identifiers are not erased by current-source cleanup; this consolidation does not rewrite published history or claim otherwise.
