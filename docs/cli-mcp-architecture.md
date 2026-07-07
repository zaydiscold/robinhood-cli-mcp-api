# CLI and MCP Architecture

This repo has three public faces over one core:

1. `cli/src/lib.ts` is the shared engine. It loads auth, route maps, account data,
   order builders, write gates, dedup logic, pricing helpers, and higher-level
   portfolio/options workflows.
2. `cli/src/index.ts` is the command-line adapter. It parses arguments, calls the
   shared engine, and formats terminal output or JSON.
3. `mcp/src/server.ts` is the agent adapter. It registers MCP tools, validates
   inputs with Zod, calls the same shared engine, and wraps write results with
   explicit execution status.

The CLI and MCP should not grow separate brokerage logic. If a behavior touches
auth, route matching, account discovery, order construction, risk checks, write
gates, quotes, or position math, it belongs in `cli/src/lib.ts` first and should
then be exposed by thin CLI/MCP adapters.

## Request Flow

```text
user / agent intent
  -> CLI command or MCP tool
  -> shared lib function
  -> route map lookup or first-class workflow
  -> account/instrument/option resolution
  -> risk classification and live-write gate
  -> Robinhood request or dry-run plan
  -> evidence readback when execution matters
```

Reads run live with caller-owned auth. Writes are dry-run unless
`ROBINHOOD_ALLOW_LIVE_WRITE=1` is set. `--dry-run` and MCP `dryRun: true` always
force a preview.

## Route Map

`api-map/brokerage-routes.json` is the allow-list for browser-backed brokerage
and account routes. Entries carry URL templates, methods, risk levels, and notes.
The runtime reads the built copy under `cli/dist/api-map/`, so any route-map edit
must be followed by:

```bash
pnpm --filter @zaydiscold/robinhood-cli build
node cli/dist/index.js brokerage routes --json
```

Route resolution is method-aware. If `orders/` has both GET and POST entries, a
POST must be requested with `--method POST`; otherwise the read route is selected.
For forced write methods with no matching write route, the resolver fails closed.

## First-Class Workflows vs Raw Execute

Prefer first-class commands and MCP tools for common work:

- `portfolio`, `positions`, `accounts`, `history`, `quote`, `buying-power`
- `options chain`, `options expirations`, `options enumerate`,
  `options strategy-quote`, `options roll-plan`, `options close`
- `buy`, `sell`, `cancel`, `order-status`, `pretrade`, `panic`
- `watchlist`, `recurring`, `settings`, `documents`, `dividends`, `margin`
- `income`, `risk`, `whatif`, `calendar`, `exposure`, `autopilot`, `sentinel`
- `recipes`, `knowledge`, `roll-ledger`, `hotlist`

Use raw `brokerage execute` / `robinhood_brokerage_execute` for mapped routes
that have no first-class wrapper yet, endpoint research, or reproducing exact
route behavior. Raw execute is powerful, but it does not replace account
discovery, options UUID enumeration, coverage/collateral checks, or user consent.

## MCP Surface

The MCP server is the agent-facing adapter. Its live tool list is `tools/list`;
do not maintain fixed counts in docs. A running MCP process can advertise an old
tool set after a pull, so reload or restart it after rebuilding.

Write tools must keep three properties:

- input schemas reject malformed account numbers, symbols, UUIDs, dates, and
  strategy parameters before they reach the engine;
- `writeStatus()` hoists `executed` and `executionStatus` to the top of the MCP
  response so a dry-run cannot be mistaken for a completed action;
- `dryRun: true` is a hard override, even if the server was launched with
  `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

## Maintenance Invariants

- One shared engine. Do not duplicate HTTP, routing, order-building, P&L, or
  options math between CLI and MCP.
- New capability means: engine function, CLI command if human-useful, MCP tool if
  agent-useful, tests, docs, and a recipe when it answers a common intent.
- New write route means: conservative risk level, method metadata, dry-run
  example, exact body provenance, live verification only with explicit consent,
  and order/history/state evidence after execution.
- Do not hardcode account numbers, route counts, MCP tool counts, or option UUIDs.
- Public docs must stay sanitized. Tokens, account numbers, balances, bank data,
  order IDs, and private captures belong in gitignored or encrypted local space.

## Improvement Backlog

These are high-leverage refinements that would make the project easier to
maintain and safer for agents:

1. **Typed capability registry.** Define each first-class operation once, then
   generate CLI commands, MCP schemas, recipes, README tables, and parity tests
   from that registry.
2. **Compact MCP profile.** Keep the full expert tool surface, but add a smaller
   default profile with discovery tools plus 10-15 common workflows for agents
   that do worse with large tool menus.
3. **Structured output schemas.** Add explicit MCP output schemas for high-volume
   tools such as portfolio, orders, risk, options quotes, and documents.
4. **Doctor command.** Add `doctor` / `robinhood_doctor` to check Node version,
   build freshness, dist route-map freshness, auth presence, web-app header
   freshness, MCP reload state, and dry-run gate behavior.
5. **Route verification metadata.** Split route-map write bodies into
   `captured`, `inferred`, `live_verified`, and `deprecated` states and block
   live sends for unverified write bodies unless explicitly overridden.
6. **Docs drift tests.** Test the snippets that matter: live-write language,
   `--method` on writes, route-map rebuild notes, package README command names,
   and links in `docs/README.md`.
7. **Execution audit trail.** Standardize JSONL receipts for live writes,
   cancels, settings changes, recurring changes, and dry-run plans, then join
   them to `trading-log.md`.
8. **Route discovery workflow.** Add a repeatable capture template for browser
   network evidence: method, URL, body, response, account context, redactions,
   and reproduction command.
9. **Options workbench.** Build a single quote/compare view for chain selection,
   payoff, Greeks, collateral, roll comparison, and dry-run order body.
10. **Tool-selection evals.** Benchmark common natural-language requests against
    `recipes` and MCP tool selection so regressions show up in CI.

## Docs Map

- `README.md`: product overview, quick start, broad feature tour.
- `SKILL.md`: agent operating guide and progressive-disclosure entry point.
- `AGENTS.md`: full self-contained agent/developer runbook.
- `docs/write-operations.md`: live-write gate and mutation rules.
- `docs/auth.md`: brokerage token and Crypto API auth.
- `docs/README.md`: index of dated research and operational docs.

<!-- Zayd Khan // cold // www.zayd.wtf -->
