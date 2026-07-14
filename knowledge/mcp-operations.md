# MCP operations and token discipline

Load this module for registration, profile selection, missing tools, stale servers, or MCP response
size. The CLI and MCP are two front doors over the same engine, authentication, route map, and
real-money write gate.

## Choose the narrowest profile

Set `ROBINHOOD_MCP_PROFILE` explicitly in each client registration. The capability registry and live
`tools/list` are authoritative; profile membership can evolve. Current profile intents are:

| Profile | Use it for |
|---|---|
| `core` | Routine account/position/quote reads and compact operational checks |
| `trading` | Order planning/lifecycle plus trading and options workflows |
| `research` | Portfolio analysis, signals, performance, risk, and options research |
| `admin` | Route-map, browser-research, crypto/admin, and maintenance work |
| `full` | Compatibility/debugging when a narrower profile demonstrably lacks a needed tool |

Do not default to `full` merely because it exists. Tool discovery metadata is paid on every new agent
context; a narrow profile is the normal operating posture. Move up for the task, then return to the
smaller profile.

Validate profile names with `robinhood-cli doctor` and the connected server's `tools/list`. An unknown
profile must fail clearly; it must never silently expose zero tools or be reported healthy.

## Registration patterns

Build first:

```bash
pnpm --filter @zaydiscold/robinhood-cli build
pnpm --filter @zaydiscold/robinhood-cli-mcp build
```

Register a read/dry-run server with an explicit profile and an absolute server path:

```bash
# Claude Code example
claude mcp add robinhood-cli -s user \
  -e ROBINHOOD_MCP_PROFILE=core -- \
  node /absolute/path/to/robinhood-cli/mcp/dist/server.js

# Hermes example
hermes mcp add robinhood-cli --command node \
  --env ROBINHOOD_MCP_PROFILE=core \
  --args /absolute/path/to/robinhood-cli/mcp/dist/server.js
```

Keep routine registrations dry-run capable. If the operator deliberately maintains a write-enabled
registration, give it an unmistakable separate name such as `robinhood-cli-live`, choose the trading
profile, and set `ROBINHOOD_ALLOW_LIVE_WRITE=1` only in that registration. The safety contract still
requires exact user approval and a matching dry-run before every write.

Never include bearer tokens in client configuration. The server resolves the repo-root `.env` at
runtime, with restrictive file permissions. This avoids multiplying secrets across Codex, Claude,
Hermes, and desktop configurations.

## Discovery is runtime truth

After changing the build, profile, or registration:

1. Restart or reload the MCP server.
2. Inspect `tools/list` from that client.
3. Confirm the expected narrow tool families are present and unrelated families are absent.
4. Run a harmless read such as `robinhood_quote` and one account-aware read.
5. Run `robinhood_doctor` if the active profile exposes it.

A process started before a pull/build continues to advertise its old schemas until restarted. Do not
debug source files while trusting a stale process.

## Tool-family routing

| Need | Prefer |
|---|---|
| Discover accounts | `robinhood_accounts` |
| Portfolio attribution | `robinhood_portfolio` / compact snapshot tool if advertised |
| Equity positions and quotes | `robinhood_positions`, `robinhood_quote` |
| Options chain/owned contracts | `robinhood_options_chain`, `_expirations`, `_holdings`, `_inspect`, `_enumerate` |
| Strategy planning | `robinhood_options_strategy_quote`, `_roll_plan`, `_pretrade` |
| Order lifecycle | `robinhood_orders_open`, `_order_status`, order-watch tool if advertised |
| Risk/research | `robinhood_risk`, `_whatif`, `_calendar`, `_exposure`, `_news`, `_ratings`, `_earnings` |
| Intent lookup | `robinhood_recipes` |
| Route maintenance | `robinhood_brokerage_describe`, `_routes`, `_plan`; execute only when necessary |
| Focused docs | `robinhood_knowledge` or one local `knowledge/*.md` module |

The generic executor is an escape hatch, not the default agent interface. Typed tools provide smaller
inputs, better defaults, safer account routing, and more predictable responses.

## Token-efficient calls

- Ask for summary/default output first. Request raw/full evidence only for a field the summary omits.
- Filter by account, symbol, state, date range, or limit before data enters model context.
- Use composite tools (`portfolio`, pretrade, workbench, snapshot) when they replace several raw calls
  without returning redundant payloads.
- Do not call both CLI and MCP for the same fact unless verifying parity.
- Do not load the full `AGENTS.md`, every knowledge module, or the whole route map for routine account
  questions. Start at `SKILL.md`, then load one module.
- Treat `structuredContent` as the machine-readable result. Text should be a compact human summary,
  not a second pretty-printed copy of the same object.
- When a tool returns pagination metadata, follow it deliberately rather than asking for an unlimited
  result set.

## Write gate

MCP uses the same single environment gate as the CLI:

- No `ROBINHOOD_ALLOW_LIVE_WRITE=1`: every mutating tool must return a dry-run/blocked plan.
- Gate set in the server process: a mutating tool may send after exact approval.
- `dryRun:true`: always preview, even on a write-enabled server.

The gate is necessary but not sufficient. Before sending, resolve the account, classify the exact
strategy, inspect positions/open orders/buying power, run pretrade, show the dry-run contract, and get
specific approval. After sending, verify the order through history. See
[execution-safety.md](execution-safety.md).

## Diagnosing a missing or broken MCP

Check in this order:

1. `robinhood-cli doctor` for source/dist parity, profile value, credential hygiene, and gate state.
2. The registration's absolute path and working checkout.
3. That both packages were rebuilt after source or route-map changes.
4. The server process environment (`ROBINHOOD_MCP_PROFILE`; write gate intentionally absent/present).
5. Restart/reload and inspect `tools/list`.
6. Run one harmless typed read.
7. Compare the three clients separately; “configured” in a file is not the same as “connected and live.”

If a call fails, read the actual MCP error, correct the indicated schema/profile/path issue, and retry
once before concluding the server is unavailable.

Deep references: [CLI/MCP architecture](../docs/cli-mcp-architecture.md),
[MCP README](../mcp/README.md), and [AGENTS.md](../AGENTS.md).
