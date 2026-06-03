# robinhood-cli — the full Robinhood API as a CLI + MCP server

> Trading at the speed of inference.

> Hey, if this project saves you time and you want to support the work, you can use my Robinhood referral link: https://join.robinhood.com/zaydk5

> **Unofficial Robinhood API toolkit: a typed API map, a command-line tool, and a Model Context Protocol (MCP) server — full account access, read *and* write, dry-run gated.** Stocks, options, recurring investments, transfers, dividends, watchlists, and multi-account brokerage automation for terminals and AI agents (Claude, Cursor, any MCP client).

As far as I can tell, this is the **only open-source project that exposes the *entire* Robinhood brokerage surface as all three at once** — a reverse-engineered API map, a CLI, and an MCP server — driving the real account you already have, not an isolated sandbox.

I wanted to run my *entire* Robinhood account from the terminal and from my agents — full-blown account management: multi-account brokerage and retirement, options, watchlist management, recurring investments, transfers, dividends, margin, the works. So I sat down, mapped the API myself (browser captures, signed requests, a lot of staring at the network tab), and built this: a TypeScript CLI and MCP server that drive the full Robinhood surface using my own auth.

## What it does

This talks to my real, existing Robinhood account. Read and write:

- **Accounts** — multiple accounts including retirement / Roth, balances, identity, settings.
- **Positions** — equity holdings, cost basis, day-trade counters.
- **Options** — chains, Greeks, multi-leg spreads, rolling, and selling.
- **Performance** — windowed returns: YTD, 1w, 1m, 1y, 5y, and all-time.
- **Money movement** — transfers, deposits, withdrawals, linked accounts.
- **Dividends** — history and upcoming payouts.
- **Orders** — equity and options order history, status, placement, and cancellation.
- **Watchlists** — list, add, remove.
- **Margin** — status, maintenance requirements, margin balance.
- **Recurring investments** *(the flagship)* — list, create, edit, pause, resume, and cancel automatic investments.

The differentiator: **this manages the account I already have.** Robinhood's own official agent access ("agentic") is **equity-only** and makes you stand up a separate, isolated portfolio — this drives your *real* one, across **every account**, with the full surface: options, recurring investments, transfers/deposits/withdrawals, dividends, watchlists, and margin. Account management that's a pain through their UI becomes one command here. Full coverage: identify, navigate, and modify across every account; a safe read-only default with a dry-run test mode on every write.

## In plain English (new here?)

Not a developer? Here's the gist:

- **Robinhood** is the investing app. Normally you tap through its phone/web interface to check balances or place trades.
- A **CLI** (command-line tool) lets you do the same things by *typing commands* in a terminal — faster, scriptable, and you can automate it.
- An **MCP server** is a standard way to hand those abilities to an **AI assistant** (like Claude). With it, you can literally ask your AI to "show me my Roth positions" or "pause my recurring buys" and it uses this tool to do it.

**Why it's useful:** some things are tedious or near-impossible in Robinhood's app — seeing *all* your accounts at once, bulk-managing dozens of recurring investments, pulling clean data for a spreadsheet. This turns those into one line.

**Is it safe?** It uses *your own* login (nothing is sent to anyone else, no passwords are stored), and it's built **read-only by default**. Looking at data is free and instant. Anything that *changes* your account — placing a trade, moving money — is blocked unless you flip **two** separate safety switches on purpose. So an AI agent can browse freely but cannot spend a cent or place a trade without your explicit go-ahead. (Details in [Reads vs. writes](#4-reads-vs-writes--the-safety-model).)

**Note:** this is an independent, unofficial project — not affiliated with or endorsed by Robinhood. Use your own account, at your own risk.

It does both **reads and writes**, including **buy/sell for equities and options**. But it will never place a real trade on its own. Every write defaults to a dry-run and only goes live when you pass an explicit `--live-write` flag *and* set the `ROBINHOOD_ALLOW_LIVE_WRITE=1` environment gate. Two deliberate opt-ins, or nothing leaves the machine.

## The map is the point

The CLI is nice, but the headline artifact is [`api-map/`](./api-map/). It's the part I'd want if I were starting from scratch:

- **OpenAPI 3.1** — unified and per-surface specs.
- **Per-endpoint Markdown** — one file per route under [`api-map/markdown/`](./api-map/markdown/), each marked `Mutation: yes/no`, including [`trading-buy-sell-write.md`](./api-map/markdown/trading-buy-sell-write.md) for buy/sell + options.
- **curl** — copy-paste examples for every route.

It covers **265+ captured endpoints (279 mapped brokerage/account routes)** across eight Robinhood API hosts — `api.robinhood.com`, `bonfire.robinhood.com`, `nummus.robinhood.com` (crypto), `cashier.robinhood.com` (money movement), plus `dora`, `identi`, `minerva`, and `phoenix`. Where Robinhood publishes an official spec (the Crypto Trading API), I fold that in verbatim; everything else is sanitized, browser-backed evidence — route shapes, methods, and query keys, never tokens, balances, or order tickets.

### Design note: method-aware route resolution

This CLI selects routes **by URL *and* HTTP method**, so a single endpoint can carry both a safe read and a gated write (e.g. `GET` vs `PATCH` on `recurring_schedules/{id}/`) and each resolves to the correct risk level. That's what lets the same URL expose a free read and a double-gated write without one leaking into the other. A URL-keyed resolver (route looked up by path alone) can't do this safely — a shared GET+write entry would either bypass the write gate or block the read — so it must split writes onto distinct, write-only URLs instead. The method-aware design is why the write surface here can be rich without weakening the safety gate.

## Getting started

### Requirements

- **Node.js 20+** and **pnpm** (`npm i -g pnpm`).
- A **Robinhood account** you own, logged in via the Robinhood web app in a Chromium-based browser (Chrome/Brave/Edge) on the same machine — that's where auth is read from.

### 1. Install & build

```bash
git clone https://github.com/zaydiscold/robinhood-cli.git
cd robinhood-cli
pnpm install
pnpm build        # builds the CLI and copies the API map into dist (see "rebuild" note below)
```

### 2. Authenticate (browser-free, self-healing)

The CLI authenticates with your existing Robinhood **web session** — no separate login, no OAuth app, no password stored.

- It reads the freshest bearer token straight from your browser's on-disk storage and writes it to a gitignored `.env` as `ROBINHOOD_BROKERAGE_TOKEN`.
- On a cold start (no token) or any `401`, it auto-refreshes once and retries. Force a refresh anytime:

```bash
pnpm auth:refresh
```

> Make sure you're logged into Robinhood in your browser first. The token never leaves your machine and is never committed.

### 3. Run the CLI

```bash
# Link the binary (or call via: node cli/dist/index.js <args>)
pnpm --filter @zaydiscold/robinhood-cli cli -- --help

robinhood-cli api-map summary --json                 # what the map covers
robinhood-cli api-map account-context                # browser-tested account_number routing behavior
robinhood-cli api-map options-strategies             # options payoff/Greek strategy catalog
robinhood-cli api-map options-strategy-plan iron-condor --json
robinhood-cli api-map options-strategy-plan naked-short-put --json
robinhood-cli recurring list                          # flagship: recurring buys + state
robinhood-cli quote MRVL NVDA AAPL                    # live quotes for one+ symbols
robinhood-cli positions                               # equity holdings ranked by return
robinhood-cli options positions                       # rank open options by % return
robinhood-cli options chain MRVL --width 6            # live chain around the money
robinhood-cli watchlist list                          # your custom watchlists + sizes
robinhood-cli brokerage routes --category orders      # browse mapped routes
robinhood-cli brokerage plan "https://api.robinhood.com/accounts/{0}/" --param 0=ACCOUNT_ID --json
```

### 4. Reads vs. writes — the safety model

**Reads run live and free. Every write defaults to a dry-run** ("test mode") and only sends when you set **both** gates — a flag *and* an environment variable. Two deliberate opt-ins, or nothing leaves the machine:

```bash
# Dry-run (default): builds the request, prints the plan, sends nothing
robinhood-cli brokerage execute "https://api.robinhood.com/orders/" --body-json '{...}'

# Live: BOTH gates required
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli brokerage execute \
  "https://api.robinhood.com/orders/" --body-json '{...}' --live-write

# First-class commands carry the same gate, e.g. recurring investments:
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli recurring resume --all --live-write
```

### 5. Use it from an AI agent (MCP server)

The MCP server exposes the same engine as tools for Claude, Cursor, or any Model Context Protocol client:

```bash
pnpm --filter @zaydiscold/robinhood-cli-mcp build

# Register with Claude Code (CLI):
claude mcp add robinhood-cli -s user -- node /absolute/path/to/robinhood-cli/mcp/dist/server.js

# Or run it directly:
node mcp/dist/server.js
```

Tools surface as `mcp__robinhood-cli__*` and inherit the identical auth, route map, and write-gate as the CLI.

### 6. Options analytics — positions & chains

Two read-only convenience commands that join the raw options routes (`aggregate_positions`, `marketdata/options`, `instruments`, `chains`) into one line each — the kind of thing that's six hand-built `brokerage execute` calls otherwise:

```bash
# Rank every open option position by percent return (best performer last line).
# Premiums and % only — no account totals are printed.
robinhood-cli options positions
robinhood-cli options positions --json

# Live option chain around the money. Defaults to the nearest expiry and calls.
robinhood-cli options chain MRVL
robinhood-cli options chain NVDA --expiration 2026-07-02 --type put --width 10 --json
```

```text
$ robinhood-cli options positions
contract              qty  entry  mark    return    delta
--------------------  ---  -----  ------  --------  -----
DRAM $50 Call 6/18    1    $1.30  $18.65  +1334.6%  0.93
HPE $30 Call 9/18     1    $1.68  $19.00  +1031.0%  0.88
...
Best performer: DRAM $50 Call 6/18 at +1334.6%.
```

Both are pure reads (no write gate). `--json` emits structured rows for piping into a spreadsheet or an agent.

### 6.1 Options strategy planners — Greeks, spreads, and dry-run bodies

The strategy layer is separate from the live chain reader. It is a research/planning catalog for single legs, covered calls, cash-secured puts, naked short calls/puts, debit and credit spreads, straddles, strangles, butterflies, and iron condors. Each strategy records the leg roles, payoff bounds, rough Greek posture, Robinhood lookup steps, and an `options/orders/` body template.

```bash
# Browse the strategy catalog.
robinhood-cli api-map options-strategies
robinhood-cli api-map options-strategies --defined-risk
robinhood-cli api-map options-strategies --aggressiveness aggressive --json
robinhood-cli api-map options-strategy-plan short-strangle --json

# Build a dry-run body template. This does not send an order.
robinhood-cli api-map options-strategy-plan call-credit-spread \
  --param account_number=<ACCOUNT_NUMBER> \
  --param symbol=XBI \
  --param chain_id=<CHAIN_ID> \
  --param expiration=2026-06-26 \
  --param short_call_option_id=<SHORT_CALL_OPTION_ID> \
  --param long_call_option_id=<LONG_CALL_OPTION_ID> \
  --param strategy_legs=<ENCODED_STRATEGY_LEGS> \
  --param limit_price=4.00 \
  --param quantity=1 \
  --param time_in_force=gfd \
  --param ref_id=$(python3 -c "import uuid;print(uuid.uuid4())") \
  --json
```

Planner output is still a write-capable order body, so the live route remains blocked by the normal double gate. Treat aggressive or undefined-risk strategies as exact-approval only.

The detailed math references live in [`docs/options-greeks-strategy-research-2026-06-02.md`](./docs/options-greeks-strategy-research-2026-06-02.md) and [`docs/options-quantitative-playbook-2026-06-03.md`](./docs/options-quantitative-playbook-2026-06-03.md). They cover net Greek aggregation, Black-Scholes sanity checks, payoff and breakeven formulas, aggressive-vs-non-aggressive variants, and the machine-readable `reviewContract` emitted by `options-strategy-plan`. Use them when translating loose requests like "sell a call" or "covered short put" into a precise dry-run order body.

### 6.2 Browser account context — `account_number` routing

The browser pass found that some Robinhood web routes propagate `?account_number=...` into API calls and some ignore it. The CLI exposes that as a separate workflow map:

```bash
robinhood-cli api-map account-context
robinhood-cli api-map account-context --behavior propagates
robinhood-cli api-map account-url stock-detail-order-ticket \
  --account <ACCOUNT_NUMBER> \
  --symbol XBI \
  --instrument-id <INSTRUMENT_UUID>
```

Use this for navigation and endpoint discovery. For automation, prefer direct API routes with explicit account fields over trusting a web URL.

Security-research details live in [`docs/security-research-account-number-context-routing-2026-06-03.md`](./docs/security-research-account-number-context-routing-2026-06-03.md). It records the account-number dropdown/routing pattern, full-scope retest matrix, and the boundary between account-context evidence and any real IDOR claim.

### 6.3 Exact options contract deeplinks

Use this when you need to open or plan one specific contract by account, symbol,
expiration, strike, call/put, and buy/sell side:

```bash
robinhood-cli api-map options-contract-deeplink \
  --account <ACCOUNT_NUMBER> \
  --symbol XBI \
  --expiration 2026-06-26 \
  --type call \
  --side buy \
  --strike 127 \
  --json
```

The planner emits observed web account-context URLs, Android-decompiled
`option_chain?chain_id=...` app/web target shapes, candidate contract query
params, deterministic API lookup steps, and a dry-run single-leg
`options/orders/` handoff template. Treat the API lookup as the source of truth:
resolve `chain_id`, filter `options/instruments/` by expiration/type/strike,
quote the resulting `option_instrument_id`, then build the order body.
Expiration, strike, side, and type URL params are probe candidates until
validated in a logged-in browser/device pass.

For phone tests, `robinhood://stocks/AAPL` is the equity baseline. The closest
source-backed options equivalent is `robinhood://option_chain?chain_id=<CHAIN_ID>&source=<SOURCE>`
after resolving the chain ID. Android decompile evidence shows that external
`option_chain` reads `chain_id` and `source`, but does **not** read
`account_number`; account specificity still belongs in the web chain shell and
API/order handoff. Held-position/order routes do read account context where
shown, for example `robinhood://option_position_close?id=<AGGREGATE_POSITION_ID>&account_number=<ACCOUNT_NUMBER>`.

Research details live in
[`docs/options-contract-deeplink-research-2026-06-03.md`](./docs/options-contract-deeplink-research-2026-06-03.md)
and the machine-readable workflow lives in
[`api-map/options-contract-deeplink-workflows-2026-06-03.json`](./api-map/options-contract-deeplink-workflows-2026-06-03.json).

### 7. More read commands — quote, positions, watchlists

The same one-line ergonomics for everyday lookups. All read-only; all print per-share prices and percentages, never a summed account total (so output stays safe to screenshot):

```bash
# Live quotes for one or more symbols (last, day %, bid/ask).
robinhood-cli quote MRVL NVDA AAPL

# Your open equity positions, ranked by unrealized return.
robinhood-cli positions
robinhood-cli positions --sort symbol --json

# Your custom watchlists and how many symbols each holds.
robinhood-cli watchlist list

# Option expirations for a symbol (handy before `options chain`).
robinhood-cli options expirations MRVL
```

```text
$ robinhood-cli positions
symbol  qty     avgCost  last     return
------  ------  -------  -------  ------
HPE     0.1074  $37.23   $56.15   +50.8%
ARM     0.0060  $331.46  $402.55  +21.4%
...
21 positions — 14 green, 7 red.
```

> **Rebuild note:** the build copies `api-map/brokerage-routes.json` into `cli/dist/`, and the runtime reads that copy. After editing the route map, **rebuild** (`pnpm build`) or your change is a silent no-op.

For the full agent playbook — account discovery, the gate, watchlists, recurring investments — see [`AGENTS.md`](./AGENTS.md).

## Extending it

The repo is built to grow. If you (or an agent) find an endpoint that isn't here:

1. Add the path to the OpenAPI spec in [`api-map/openapi/`](./api-map/openapi/).
2. Drop a Markdown file describing it under [`api-map/markdown/`](./api-map/markdown/).
3. Wire a command so the CLI and MCP can drive it.

That's the whole loop — capture, document, expose. Pull requests that widen the map are exactly the point.

Built on the trio pattern (CLI + skill + MCP) pioneered by [Matt Van Horn's Printing Press](https://github.com/mvanhorn/cli-printing-press).

---

Mapped & built by Zayd Khan ([@ColdCooks](https://twitter.com/ColdCooks) / [zaydiscold](https://github.com/zaydiscold)). MIT © Zayd Khan.
