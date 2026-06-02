---
name: robinhood-cli
description: Use when operating Robinhood brokerage/crypto accounts via CLI or MCP — portfolio reads, positions, orders, watchlists, options chains, recurring buys, and the full reverse-engineered API route map with safety gates.
version: 2.0.0
author: Zayd (@zaydiscold)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [robinhood, trading, finance, api, mcp, brokerage, crypto, stocks, options]
    related_skills: []
---

# Robinhood CLI + MCP

Operate real Robinhood brokerage accounts from the terminal or via MCP tools. The CLI and MCP share one engine (`cli/src/lib.ts`) — same auth, same route map (~277 reverse-engineered endpoints), same double-gate write safety.

**Repo:** `github.com/zaydiscold/robinhood-cli`
**Deep reference:** `AGENTS.md` in repo root — the complete API surface, worked examples, and every command. Hand that file to any agent and it's self-contained. This SKILL.md is the Hermes trigger + boot doc: quick-start, the 80/20 commands, and all the operational pitfalls learned across sessions.

---

## When to Use

Load this skill when:
- The user asks about Robinhood — portfolio, positions, orders, watchlists, options chains
- You need to query account data (balances, positions, orders, watchlists, dividends)
- The user mentions their managed accounts (Agentic, Agentic-long) or any of their 5 accounts
- You need to place or preview a trade (equity, options), cancel orders, resume/pause recurring buys
- The user mentions tickers, symbols, stock prices, or market data
- You're debugging the route map, the CLI, or the MCP server
- You need to discover new API endpoints or classify route risk
- The user mentions crypto trading or the official Robinhood Crypto API

Do NOT load for: general investing advice (that's not what this tool does), paper trading (this hits real accounts), or brokerages other than Robinhood.

---

## Quick Start

```bash
cd ~/Desktop && git clone https://github.com/zaydiscold/robinhood-cli.git
cd robinhood-cli
pnpm install
pnpm --filter @zaydiscold/robinhood-cli build
pnpm --filter @zaydiscold/robinhood-cli-mcp build
```

Requires: **Node >=20**, **pnpm**.

---

## Auth

A single bearer token in `.env` (repo root, gitignored):

```
ROBINHOOD_BROKERAGE_TOKEN=<token>
```

**Token source:** Chrome's on-disk localStorage on a machine where Robinhood is logged in. The engine auto-loads `.env` on import and self-heals on 401 by re-running the refresh script — no browser popup, no manual login. Force a refresh with `pnpm auth:refresh`.

**Cross-machine auth:** Use Syncthing (the `home-sync` folder) or `scp` from the machine where Robinhood is logged in. Do NOT fight with broken SSH for multiple turns — check Syncthing first.

Full auth details: `AGENTS.md` §1.

---

## CLI Usage — The 80/20

All commands run from repo root. Reads run live and free. Writes are double-gated (dry-run by default unless both `--live-write` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1` are set).

```bash
robinhood-cli api-map summary --json
robinhood-cli api-map routes --host trading.robinhood.com --json
robinhood-cli brokerage routes --risk read --json
robinhood-cli brokerage route "https://api.robinhood.com/accounts/" --json
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --dry-run --json
robinhood-cli quote MRVL NVDA AAPL --json
robinhood-cli positions --json
robinhood-cli options positions --json
robinhood-cli options chain MRVL --width 6 --json
robinhood-cli options expirations MRVL --json
robinhood-cli watchlist list --json
robinhood-cli crypto routes --json
robinhood-cli crypto sign --api-key "$ROBINHOOD_API_KEY" --private-key-b64 "$ROBINHOOD_PRIVATE_KEY_B64" --path /api/v1/crypto/trading/accounts/ --method GET
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --dry-run --json
```

### Critical Query Patterns

| Task | Query | Notes |
|------|-------|-------|
| All accounts (complete) | `bonfire.robinhood.com/transfer/accounts/` | ONLY endpoint that lists every account |
| Primary account portfolio | `portfolios/` | List endpoint, includes `equity_previous_close` |
| Per-account portfolio | `portfolios/{num}/` | Use `--param num=X`. Does NOT include prev_close |
| Positions | `positions/?account_number={n}&nonzero=true` | Returns instrument UUIDs, not tickers |
| Instruments→tickers | `instruments/?ids={ids}` | Batch resolve UUIDs: `--param ids=uuid1,uuid2` |
| Quotes | `marketdata/quotes/?ids={ids}` | Batch resolve instrument UUIDs to prices |
| Watchlists | `discovery/lists/?owner_type=custom` | `owner_type=custom` is MANDATORY |
| Orders (read) | `orders/` | GET by default |
| Orders (create) | `orders/` | Requires `--method POST` |
| Options chain | `options/chains/{id}/` | Get expirations + tick rules |
| Options instruments | `options/instruments/?chain_id={id}&expiration_dates={date}&state=active&type=call` | Find specific strikes |
| Options orders | `options/orders/` | POST, same double-gate |
| Recurring buys | `recurring` subcommand | `robinhood-cli recurring list` — dedicated command |
| Crypto market data | `crypto execute "marketdata/best_bid_ask/" --query-param symbol=BTC-USD` | Official Crypto API |

### Route Matching Gotchas

1. **Matching is substring-based.** `portfolios/<ACCOUNT_NUMBER>/` will NOT match — the route is `portfolios/{num}/` with a placeholder. Use brace syntax + `--param`.
2. **Method-aware routing.** `GET /orders/` and `POST /orders/` share a URL. To hit the POST route you MUST pass `--method POST`, otherwise you get the GET (read) route.
3. **`accounts/` under-reports.** Use `bonfire.robinhood.com/transfer/accounts/` for the full account list.
4. **Build after map edits.** The runtime reads `cli/dist/api-map/`, not the source. Editing `api-map/brokerage-routes.json` without rebuilding is a silent no-op.
5. **`url_template` vs `url`.** Some routes (watchlists, indices 263-271) use `url_template` instead of `url`. The engine only matches on `url`. Fix: copy `url_template` → `url` in both source and dist, then rebuild. (Fixed in commit `fb445fd`, not yet pushed.)

Full details: `AGENTS.md` §3-§5.

---

## MCP Server

10 tools surfaced via Hermes MCP. Same engine → same auth, gate, and method-aware routing as the CLI.

### Registration

```bash
hermes mcp add robinhood --command "node" \
  --args "C:/Users/ZaydK/Desktop/robinhood-cli/mcp/dist/server.js"
```

Or for Claude Code / other MCP clients:

```bash
claude mcp add robinhood-cli -s user -- \
  node /absolute/path/to/robinhood-cli/mcp/dist/server.js
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| `robinhood_api_map_summary` | Summarize the route map |
| `robinhood_brokerage_routes` | List brokerage routes with filters |
| `robinhood_routes` | Unified route map (crypto + brokerage) |
| `robinhood_browser_routes` | Latest CDP-captured route templates |
| `robinhood_brokerage_plan` | Create a dry-run plan (no execution) |
| `robinhood_brokerage_execute` | Execute a brokerage request |
| `robinhood_crypto_routes` | List official Crypto API routes |
| `robinhood_crypto_sign` | Generate Crypto API auth headers |
| `robinhood_crypto_plan` | Dry-run plan for Crypto API |
| `robinhood_crypto_execute` | Execute a Crypto API request |

### MCP Safety Gates

Same double-gate as CLI:
- **Reads run live** — no gate needed.
- **Writes are dry-run by default.** To go live: `liveWrite: true` + `ROBINHOOD_ALLOW_LIVE_WRITE=1` in the server's environment.
- `dryRun: true` always forces a plan, even with both gates set — a deliberate "preview this exact live call" escape hatch.

Reload MCP tools in-session with `/reload-mcp`.

Full details: `AGENTS.md` §6, §11.

---

## Accounts

The user's Robinhood login has 5 accounts across individual brokerage, Roth IRA, and crypto. Two are designated as primary managed accounts:

| Nickname | Type | Purpose |
|----------|------|---------|
| Agentic | individual | Primary trade account |
| Agentic-long | individual | Primary long-term hold account |

**Never hardcode account numbers.** Discover them at runtime (§2 of AGENTS.md). The funded accounts have the bulk of the portfolio; Agentic accounts start at $0 and are built up through trading.

---

## Cross-Machine Infrastructure

The user operates across multiple machines on a private Tailscale network:

- **mothership** (Windows 10): always-on GPU server, runs Hermes. Primary Robinhood CLI host.
- **frostbyte** (macOS): daily-driver laptop, also runs Hermes.

File transfer options, in priority order:
1. **Syncthing** — folder `home-sync` at `~/Sync`, shared between machines. Web UI at `:8384`. Primary channel for moving `.env` auth tokens and files.
2. **scp from frostbyte** — `scp <file> user@mothership-ip:<path>`
3. **SSH** — frostbyte→mothership works; mothership→frostbyte is broken (key rejected).

Always try Syncthing before fighting with SSH.

---

## Common Pitfalls

### Route Map & Build

1. **Editing source without rebuilding.** The runtime reads `cli/dist/api-map/`, not `api-map/`. Rebuild after every map edit: `pnpm --filter @zaydiscold/robinhood-cli build`.
2. **`url_template` vs `url`.** 9 watchlist routes use `url_template`; the engine matches on `url` only. Copy `url_template` → `url` in both copies. (Fixed locally, not pushed.)
3. **`accounts/` under-reports.** Shows only 2 accounts. Use `bonfire.robinhood.com/transfer/accounts/` for the complete list.
4. **Route matching is substring-based.** A raw account number won't match `portfolios/{num}/`. Use brace syntax + `--param`.

### Portfolio & Data

5. **Per-account portfolio lacks `equity_previous_close`.** The list endpoint (`portfolios/`) has it, but only for the primary account. For day-change across all accounts, use portfolio historicals or external pricing.
6. **Positions return UUIDs, not tickers.** Batch-resolve with `instruments/?ids={ids}` and `marketdata/quotes/?ids={ids}`.

### Watchlists

7. **`owner_type=custom` is MANDATORY.** Every watchlist read without it returns 400: `"owner_type of request must be specified"`.
8. **Rename uses `display_name`, not `name`.** Wrong field → 200 with no change.
9. **The Options Watchlist cannot be deleted.** Robinhood hard-blocks it server-side (not a CLI bug).
10. **Item add/remove/reorder is not yet mapped.** POST to `discovery/lists/items/` returns `"failed operations":""` with no detail.

### Writes & Safety

11. **Writes need BOTH gates.** `--live-write` AND `ROBINHOOD_ALLOW_LIVE_WRITE=1`. One alone = dry-run. Never export the env var into your shell profile — keep it inline.
12. **Method-aware routing is a safety feature.** A forced `--method POST` without a matching POST route resolves to the GET route (sensitive-read), not a write route — it can't slip past the gate.
13. **`dryRun: true` always wins in MCP.** Even with both gates set, it forces a plan. Use it to preview exact live calls.

### Cross-Machine

14. **Syncthing first, SSH last.** mothership→frostbyte SSH is broken. Use Syncthing (`~/Sync`) or scp from frostbyte.
15. **Token freshness.** If Robinhood was logged in on frostbyte, the token in Chrome's localStorage there is the freshest. Syncthing it to mothership's `.env` is the standard flow.

### Crypto API

16. **Crypto API uses a different auth scheme.** Requires API key + base64-encoded private key, not the brokerage bearer token. Sign headers with `robinhood_crypto_sign` before calling `robinhood_crypto_execute`.

---

## One-Shot Recipes

### Portfolio Snapshot (All Accounts)

```bash
# 1. Discover all accounts
node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full

# 2. For each account, get portfolio
node cli/dist/index.js brokerage execute "portfolios/{num}/" --param "num=<N>" --json --full

# 3. Get positions (returns instrument UUIDs)
node cli/dist/index.js brokerage execute "positions/?account_number={n}&nonzero=true" --param "n=<N>" --json --full

# 4. Resolve UUIDs to tickers + prices
node cli/dist/index.js brokerage execute "instruments/?ids={ids}" --param "ids=<uuid1,uuid2>" --json --full
node cli/dist/index.js brokerage execute "marketdata/quotes/?ids={ids}" --param "ids=<uuid1,uuid2>" --json --full
```

### Options Trade (End-to-End Preview)

```bash
# 1. Symbol → instrument + chain ID
node cli/dist/index.js brokerage execute "instruments/?symbol={symbol}" --param symbol=AAPL --json --full

# 2. Chain → expirations + tick rules
node cli/dist/index.js brokerage execute "options/chains/{id}/" --param id=<CHAIN_ID> --json --full

# 3. Find the strike
node cli/dist/index.js brokerage execute \
  "options/instruments/?chain_id={chain_id}&expiration_dates={date}&state=active&type=call" \
  --param chain_id=<CHAIN_ID> --param expiration_dates=<YYYY-MM-DD> --param type=call --json --full

# 4. Quote the option
node cli/dist/index.js brokerage execute "marketdata/options/?ids={ids}" \
  --param ids=<OPTION_INSTRUMENT_ID> --json --full

# 5. Dry-run the order (safe — sends nothing)
REF=$(python3 -c "import uuid;print(uuid.uuid4())")
node cli/dist/index.js brokerage execute "https://api.robinhood.com/options/orders/" --method POST \
  --body-json "{\"account\":\"...\",\"direction\":\"debit\",\"legs\":[{\"side\":\"buy\",\"option\":\"...\",\"position_effect\":\"open\",\"ratio_quantity\":1}],\"type\":\"limit\",\"time_in_force\":\"gtc\",\"trigger\":\"immediate\",\"price\":\"0.01\",\"quantity\":\"1\",\"ref_id\":\"$REF\"}" \
  --json --full
```

Full worked example with real placeholders: `AGENTS.md` §7.

### Recurring Buys (Resume All)

```bash
# List all recurring schedules (live read)
node cli/dist/index.js brokerage execute "recurring list" --json

# Resume all paused (dry-run first)
node cli/dist/index.js brokerage execute "recurring resume --all" --json

# Live resume — BOTH gates
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js brokerage execute \
  "recurring resume --all --live-write" --json
```

Full details: `AGENTS.md` §9.

### Add a New Route to the Map

1. Capture the endpoint from the authenticated web app (browser dev tools or CDP).
2. Add it to `api-map/brokerage-routes.json` with conservative risk classification.
3. Rebuild: `pnpm --filter @zaydiscold/robinhood-cli build`.
4. Verify: `node cli/dist/index.js brokerage execute "<new-route>" --json --full`.
5. Document the discovery method in `docs/undocumented-surface.md`.

---

## Verification Checklist

- [ ] `pnpm install && pnpm build` completes without errors
- [ ] `.env` exists with a valid `ROBINHOOD_BROKERAGE_TOKEN`
- [ ] `node cli/dist/index.js brokerage execute "accounts/" --json` returns 200
- [ ] `node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full` shows all 5 accounts
- [ ] `node cli/dist/index.js brokerage execute "portfolios/" --json --full` returns portfolio data
- [ ] MCP server starts: `node mcp/dist/server.js` (or `hermes mcp add` registered)
- [ ] Route map count: `node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"` returns ~277
- [ ] Watchlists work: `node cli/dist/index.js brokerage execute "discovery/lists/?owner_type=custom" --json` returns 200
- [ ] Dry-run gate works: a POST without `--live-write` returns `liveWriteBlocked`
- [ ] Live write gate works: a POST with `--live-write` but without `ROBINHOOD_ALLOW_LIVE_WRITE=1` returns `liveWriteBlocked`

---

## Agent Rules

- Treat `api-map/robinhood-routes.json` as the unified route map: official Robinhood Crypto OpenAPI + community seed + sanitized CDP capture.
- Treat `api-map/brokerage-routes.json` as the browser-backed brokerage/account subset used by `brokerage execute`.
- Reads run live and free. Writes default to dry-run unless BOTH gates are set.
- Never trade, transfer, cancel, unlink, or mutate unless the user explicitly asked for that exact live operation. Echo back the resolved account + symbol + side + qty + price and get a yes before sending.
- If you discover a route not in the map, add it, classify risk conservatively, rebuild, and document the discovery in `docs/undocumented-surface.md`.
- If you hit a 401: the engine self-heals. If it fails, run `pnpm auth:refresh` manually.
- The `recurring` subcommand is preferred over raw URL calls for recurring buys — it's idempotent and safer.
