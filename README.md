# robinhood-cli — the full Robinhood API as a CLI + MCP server

> **Unofficial Robinhood API toolkit: a typed API map, a command-line tool, and a Model Context Protocol (MCP) server — full account access, read *and* write, dry-run gated.** Stocks, options, recurring investments, transfers, dividends, watchlists, and multi-account brokerage automation for terminals and AI agents (Claude, Cursor, any MCP client).

As far as I can tell, this is the **only open-source project that exposes the *entire* Robinhood brokerage surface as all three at once** — a reverse-engineered API map, a CLI, and an MCP server — driving the real account you already have, not an isolated sandbox.

I wanted to run my *entire* Robinhood account from the terminal and from my agents — not just the crypto sandbox, the whole brokerage. So I sat down, mapped the API myself (browser captures, signed requests, a lot of staring at the network tab), and built this: a TypeScript CLI and MCP server that drive the full Robinhood surface using my own auth.

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

It does both **reads and writes**, including **buy/sell for equities and options**. But it will never place a real trade on its own. Every write defaults to a dry-run and only goes live when you pass an explicit `--live-write` flag *and* set the `ROBINHOOD_ALLOW_LIVE_WRITE=1` environment gate. Two deliberate opt-ins, or nothing leaves the machine.

## The map is the point

The CLI is nice, but the headline artifact is [`api-map/`](./api-map/). It's the part I'd want if I were starting from scratch:

- **OpenAPI 3.1** — unified and per-surface specs.
- **Per-endpoint Markdown** — one file per route under [`api-map/markdown/`](./api-map/markdown/), each marked `Mutation: yes/no`, including [`trading-buy-sell-write.md`](./api-map/markdown/trading-buy-sell-write.md) for buy/sell + options.
- **curl** — copy-paste examples for every route.

It covers **265+ captured endpoints (278 mapped routes)** across eight Robinhood API hosts — `api.robinhood.com`, `bonfire.robinhood.com`, `nummus.robinhood.com` (crypto), `cashier.robinhood.com` (money movement), plus `dora`, `identi`, `minerva`, and `phoenix`. Where Robinhood publishes an official spec (the Crypto Trading API), I fold that in verbatim; everything else is sanitized, browser-backed evidence — route shapes, methods, and query keys, never tokens, balances, or order tickets.

## Getting started

### Requirements

- **Node.js 18+** and **pnpm** (`npm i -g pnpm`).
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
robinhood-cli recurring list                          # flagship: recurring buys + state
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
