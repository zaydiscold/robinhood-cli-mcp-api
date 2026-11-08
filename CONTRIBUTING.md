# Contributing

The CLI, importable API, and MCP server share one brokerage engine. Fix behavior in that engine and keep the adapters consistent. Start with [SKILL.md](SKILL.md) for the operating contract and [AGENTS.md](AGENTS.md) for implementation context.

## Development

Use Node.js 20.19 or later, pnpm 10.12.1, Python 3, and Bash. Windows authentication requires Git Bash.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm quality
pnpm coverage:built
```

Tests use synthetic fixtures and local mocks. You do not need a Robinhood account, browser session, `.env`, or access to encrypted operator files to run them. Keep live-write settings unset while developing. Never submit a real trade or transfer as a smoke test.

## Changes worth reviewing

- Include a regression that demonstrates the behavior you fixed. Exercise shared logic and protocol boundaries rather than matching implementation text.
- Retain account identity, pagination, missing-data distinctions, and provenance in account reads.
- Preserve dry-run defaults and uncertain-outcome handling. An ambiguous mutation must never become an automatic retry.
- Check CLI JSON and MCP structured output together when changing a shared contract.
- Update the focused command or knowledge reference; keep the root README an introduction.
- Rebuild after route-map changes. Generated assets in `dist` are runtime inputs, not source-of-truth edits.

## Before opening a pull request

Run the checks above, inspect the diff, and state exactly what you verified. Separate fixture coverage from live-account evidence. CI runs the supported operating-system matrix, dependency audit, privacy checks, and secret scan; do not lower gates to make a patch pass.

Never include credentials, real account identifiers, account reports, browser captures, private ledgers, or personal machine paths. Encrypted `local/` files are optional operator state and should not be changed in public feature PRs. Follow [SECURITY.md](SECURITY.md) for vulnerabilities rather than filing sensitive details publicly.

Open a focused issue for a new capability. The [roadmap](ROADMAP.md) and existing issues distinguish implemented features from planned tax reconciliation, exposure accounting, and execution controls.
