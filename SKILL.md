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

Operate real Robinhood brokerage accounts from the terminal or via MCP tools. The CLI and MCP share one engine (`cli/src/lib.ts`) — same auth, same route map (279 brokerage/account routes as of the latest local check), same double-gate write safety.

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

Requires: **Node >=20**, **pnpm**. If the package bin is not linked in the local workspace, use `node cli/dist/index.js ...`; the built entrypoint is the verification source.

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
robinhood-cli api-map account-context --json
robinhood-cli api-map options-strategies --json
robinhood-cli api-map options-strategy-plan iron-condor --json
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

### Current Read/Write Surface

Keep this split current when editing the skill:

| Surface | Current state | Agent rule |
|---------|---------------|------------|
| API map | 279 brokerage/account routes plus official Crypto API routes | Rebuild after edits; runtime reads `cli/dist/api-map/` |
| Read commands | `quote`, `positions`, `options positions`, `options expirations`, `options chain`, `watchlist list`, `recurring list`, route-map reads, crypto read plans | Live reads are allowed with caller-owned auth, but redact balances/tokens in shareable output |
| Options research/planning | 18 strategy workflows; `options-strategy-plan` emits `reviewContract` | Planning only until exact user approval and write gates |
| Equity/options order writes | Route-map executor against `orders/`, `options/orders/`, and cancel routes | Must use `--method`, exact body, `--live-write`, and `ROBINHOOD_ALLOW_LIVE_WRITE=1`; dry-run first |
| Recurring investments | First-class `recurring list`, `recurring resume`, `recurring pause`; route map also has GET one schedule and POST create | Resume/pause are the verified first-class writes. Create/edit amount/funding-source are route-map research unless a fresh capture verifies body shape |
| Money movement / funding | ACH relationships/transfers and cashier/deposit-schedule routes are mapped mostly as read or `write-or-sensitive` | Never mutate funding, ACH links, deposits, withdrawals, or transfers without a fresh route/body capture and explicit approval |
| DRIP/options/account settings | DRIP PATCH and account-setting routes are mapped or browser-observed | Treat as account-setting writes; plan and verify reload state before any live action |
| Crypto | Official Crypto API signing/planning/execution commands | Different auth from brokerage; crypto writes/cancels use the same double gate |

Do not overclaim first-class support. If a capability is route-map-only, say so and build a dry-run body from the current route map before considering implementation.

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
| Recurring pause/resume | `recurring pause|resume` | Verified first-class writes; double-gated |
| Recurring create/edit/funding source | `bonfire.robinhood.com/recurring_schedules/` | Route-map research only until fresh body capture verifies amount/source fields |
| Funding sources | `cashier.robinhood.com/ach/relationships/`, `payment_instruments/v2/` | Read first; writes are high-risk and not first-class |
| Crypto market data | `crypto execute "marketdata/best_bid_ask/" --query-param symbol=BTC-USD` | Official Crypto API |

### Account Context and Strategy Maps

| Task | Command | Notes |
|------|---------|-------|
| Browser account routing | `robinhood-cli api-map account-context` | Shows whether `?account_number=` propagates, is mixed, or is ignored on each web surface |
| Build web workflow URL | `robinhood-cli api-map account-url <id> --account <n> ...` | Navigation/research only; prefer direct API routes for automation |
| Options strategy catalog | `robinhood-cli api-map options-strategies` | Lists single legs, covered calls, cash-secured/naked puts, naked calls, debit/credit spreads, straddles, strangles, butterflies, iron condors |
| Strategy dry-run body | `robinhood-cli api-map options-strategy-plan <id> --param key=value` | Emits lookup steps + `options/orders/` body template; never sends |
| Exact contract deeplink plan | `robinhood-cli api-map options-contract-deeplink --account <n> --symbol <s> --expiration <d> --type call|put --side buy|sell --strike <k> --json` | Emits observed web shell, candidate URL/app deeplinks, API resolution steps, and dry-run single-leg handoff |

Primary options references:

- `docs/options-greeks-strategy-research-2026-06-02.md`
- `docs/options-quantitative-playbook-2026-06-03.md`
- `docs/options-contract-deeplink-research-2026-06-03.md`
- `api-map/options-strategy-workflows-2026-06-02.json`
- `api-map/options-contract-deeplink-workflows-2026-06-03.json`

### Options Greeks and Strategy Math

Use this section when the user asks for options trading, options strategies, or
Greek exposure. It is research/planning guidance, not investment advice and not
permission to send a live order.

When viewing an options chain, do not stop at reporting strikes. Translate the
screen into a tradeable research object:

1. Resolve symbol -> instrument -> chain id -> expiration -> option instrument ids.
2. Quote individual legs with `marketdata/options/`; quote multi-leg packages
   with `marketdata/options/strategy/quotes/` when available.
3. Classify the strategy from the 18-workflow catalog before building an order.
4. Compute payoff math separately from Greek sensitivity math.
5. Emit missing fields and blockers before any dry-run body.

For every options read or plan, include:

```text
spot, expiration, dte, strike(s), call/put, bid/ask/mark, IV if available,
delta/gamma/theta/vega/rho with units, open/close effect, quantity,
natural/mid/limit price, max profit/loss, breakevens, assignment/expiration flags
```

Treat every multi-leg trade as a portfolio of signed legs. Long legs add Greek
exposure; short legs subtract it. Multiply by `ratio_quantity`, contract count,
and the 100-share multiplier:

```
net_delta = sum(leg_side * leg_delta * ratio_quantity * contracts * 100)
net_gamma = sum(leg_side * leg_gamma * ratio_quantity * contracts * 100)
net_theta = sum(leg_side * leg_theta * ratio_quantity * contracts * 100)
net_vega  = sum(leg_side * leg_vega  * ratio_quantity * contracts * 100)
net_rho   = sum(leg_side * leg_rho   * ratio_quantity * contracts * 100)
```

Where `leg_side` is `+1` for buy/long legs and `-1` for sell/short legs. Use
this as a live sensitivity snapshot, not a prediction: delta/gamma move with the
underlying, theta changes as expiration approaches, and vega changes with implied
volatility.

For quick scenarios:

```text
approx_pnl = net_delta*dS + 0.5*net_gamma*dS^2 + net_vega*dIV + net_theta*days
```

Label units. Broker Greeks may already be per day or per volatility point;
Black-Scholes outputs are often per year and per 1.00 volatility unit.

Black-Scholes baseline for sanity checks:

```text
d1 = (ln(S / K) + (r - q + sigma^2 / 2) * T) / (sigma * sqrt(T))
d2 = d1 - sigma * sqrt(T)
call_delta = exp(-qT) * N(d1)
put_delta  = exp(-qT) * (N(d1) - 1)
gamma      = exp(-qT) * phi(d1) / (S * sigma * sqrt(T))
vega       = S * exp(-qT) * phi(d1) * sqrt(T)
```

Operational scaling: divide vega by 100 for one volatility point, theta by 365
for a rough per-day value, and rho by 100 for one rate point. Prefer Robinhood's
live `marketdata/options/` Greeks when present, then use formulas only to check
sign and magnitude.

Core interpretations:

| Greek | Meaning for an agent |
|-------|----------------------|
| Delta | Directional exposure. Positive benefits from up moves; negative benefits from down moves. |
| Gamma | How fast delta changes. Long gamma likes movement; short gamma can lose faster as price moves against it. |
| Theta | Time decay. Positive theta collects decay; negative theta pays decay. |
| Vega | Implied-volatility exposure. Long vega benefits from IV expansion; short vega benefits from IV crush. |
| Rho | Interest-rate exposure. Usually less important intraday but include it in summaries. |

### Options Strategy Classification

First classify the requested trade. Never infer naked exposure from loose
language. If the user says "sell a call", distinguish sell-to-close, covered
call, call credit spread, and naked short call before planning an order.

| Strategy family | Typical posture | Aggression |
|-----------------|-----------------|------------|
| Long call / put | Defined-risk directional debit; long gamma, long vega, negative theta | Moderate |
| Sell-to-close | Reduces an existing long option; should use `position_effect=close` | Conservative |
| Covered call | Short call against 100 owned shares; income but caps upside and can assign shares | Conservative |
| Cash-secured put | Short put backed by cash for 100 shares; bullish income with assignment risk | Moderate |
| Covered put | Short stock plus short put; not the same as cash-secured, keeps short-stock upside risk | Aggressive |
| Naked short call / short straddle | Undefined-risk short-volatility exposure | Aggressive |
| Naked/margin short put | Short put without verified full cash collateral | Aggressive |
| Vertical credit spread | Defined-risk premium selling; short gamma/vega with long wing protection | Moderate |
| Vertical debit spread | Defined-risk directional debit; capped gain and capped loss | Moderate |
| Long straddle | Defined-risk long-volatility trade; long gamma/vega, heavy negative theta | Moderate |
| Short straddle / short strangle | Short-volatility income with undefined risk | Aggressive |
| Long strangle | Defined-risk long-volatility trade with OTM call and OTM put | Moderate |
| Butterfly / iron condor | Defined-risk range/pin or short-volatility structures | Moderate |

Payoff checks:

| Strategy | Quant check |
|----------|-------------|
| Long call | Max loss = debit * 100; breakeven = strike + debit |
| Long put | Max loss = debit * 100; breakeven = strike - debit |
| Covered call | Verify 100 shares per short call in same account; upside capped above strike |
| Cash-secured put | Verify cash collateral; max loss = (strike - credit) * 100 |
| Naked short call | Max profit = credit * 100; max loss theoretically unlimited |
| Credit spread | Max profit = credit * 100; max loss = (width - credit) * 100 |
| Debit spread | Max loss = debit * 100; max profit = (width - debit) * 100 |
| Long straddle | Max loss = debit * 100; breakevens = strike +/- debit |
| Long strangle | Max loss = debit * 100; breakevens = call strike + debit and put strike - debit |
| Short strangle | Max profit = credit * 100; undefined call-side risk and large put-side downside |
| Iron condor | Max profit = credit * 100; max loss = widest wing - credit, scaled by 100 |

Ambiguous wording:

| User says | Clarify before planning |
|-----------|-------------------------|
| Sell a call | Sell-to-close, covered call, call credit spread, or naked short call |
| Sell a put | Cash-secured put, put credit spread, or margin/naked short put |
| Covered short put | Cash-secured put or covered put; these are not the same |
| Straddle | Long debit straddle or short undefined-risk straddle |
| Roll | Which legs close, which legs open, and whether net risk increases |

Use the risk-score heuristic in
`docs/options-greeks-strategy-research-2026-06-02.md` for aggressive vs.
non-aggressive gating. Inputs include undefined loss, naked short calls,
short gamma/vega, assignment sensitivity, near-expiration risk, wide spreads,
margin use, defined-risk wings, collateral/coverage, and closing-only status.

Every dry-run summary should include strategy id, conservative/moderate/aggressive
label, max profit/loss, breakevens, collateral/coverage check, net Greeks,
liquidity flags, expiration flags, exact order body, missing fields, and write-gate
state.

### Quant Review Heuristics

Use these rules to turn "quant talk" into reliable agent behavior:

- Greeks are local derivatives, not payoff guarantees. Always separate current
  sensitivity from expiration payoff.
- Credit received is max profit only for short premium structures; debit paid is
  max loss only for defined-risk long premium structures.
- Short gamma near expiration is a risk amplifier. Flag near-expiration shorts,
  wide bid/ask spreads, stale package quotes, and 0DTE exposure.
- A covered call is covered only if the same account has at least 100 shares per
  short call. A cash-secured put is secured only if cash collateral is verified.
- Naked short calls, short straddles, and short strangles are aggressive even
  when the premium looks small because loss can expand nonlinearly.
- For rolls, compare closed-leg Greeks/payoff to opened-leg Greeks/payoff and
  state whether risk increased, duration changed, or undefined exposure appeared.

### Options Review Contract

`options-strategy-plan` emits a machine-readable `reviewContract`. Treat it as a
hard checklist, not decoration. Before any order body can leave dry-run mode,
an agent must satisfy or explicitly block every field:

```bash
robinhood-cli api-map options-strategy-plan covered-call \
  --param account_number=<ACCOUNT_NUMBER> \
  --param symbol=<SYMBOL> \
  --param chain_id=<CHAIN_ID> \
  --param expiration=<YYYY-MM-DD> \
  --param short_call_option_id=<OPTION_ID> \
  --param limit_price=<PRICE> \
  --param quantity=1 \
  --param time_in_force=gfd \
  --param ref_id=<UUID> \
  --json
```

The `reviewContract` requires:

- account, symbol, chain, expiration, every option instrument id, every strike,
  side, `position_effect`, `ratio_quantity`, quantity, limit price, time in
  force, and `ref_id`;
- payoff checks for max profit, max loss, and breakevens from the actual debit
  or credit;
- signed-leg net Greeks with unit labels;
- scenario rows for spot +/-1%, IV +/-5 vol points, one day of theta, breakevens,
  and max-loss boundary;
- variant resolution for phrases like "sell a call", "sell a put", "covered
  short put", "straddle", and "strangle";
- hard blockers for missing instrument ids, unclear open/close effects,
  unverified coverage/collateral, stale package quotes, and missing live-write
  gates.

When the user asks for "covered short put", first run:

```bash
robinhood-cli api-map options-strategies --query "covered short put" --json
```

Then explain the ambiguity: common retail wording often means cash-secured put,
while a true covered put means short stock plus short put. Pick neither
automatically.

### Options CLI/API Playbook

Use this exact planning sequence:

1. `robinhood-cli api-map account-context --json` to understand browser account routing. Prefer explicit API `account_number` fields over URL state.
2. For an exact contract, run `robinhood-cli api-map options-contract-deeplink --account <N> --symbol <SYMBOL> --expiration <DATE> --type call|put --side buy|sell --strike <K> --json`.
3. `robinhood-cli options expirations <SYMBOL> --json` and `robinhood-cli options chain <SYMBOL> --expiration <DATE> --type call|put --json` to inspect available contracts.
4. Resolve all leg instrument ids through `options/instruments/`, then quote individual legs with `marketdata/options/`.
5. For spreads/straddles/condors, quote the package with `marketdata/options/strategy/quotes/` when available.
6. `robinhood-cli api-map options-strategies --json` to choose the strategy id.
7. `robinhood-cli api-map options-strategy-plan <id> --param key=value --json` to emit lookup steps and an `options/orders/` body template.
8. Only after the dry-run body is exact should any live route be considered, and only with `--live-write` plus `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

Required fields before a dry-run is acceptable: account, symbol, expiration,
every strike, every option instrument id, buy/sell side, `position_effect`,
quantity, limit price, time in force, and ref id. For closes, verify the open
position first and set `position_effect=close`.

### Options Chain Builder State

The web URL `https://robinhood.com/options/chains/<SYMBOL>` is not enough to
rebuild a selected order. It defaults to a nearby expiration and then stores the
selected expiration, buy/sell side, call/put side, strike, and Builder legs in
UI/API state rather than the location bar.

Map the UI to APIs like this:

| UI state | API state |
|----------|-----------|
| Symbol page | `options/chains/?account_number=<N>&underlying_symbol=<SYMBOL>` |
| Expiration dropdown | `options/instruments/?chain_id=<ID>&expiration_dates=<DATE>` |
| Call/put toggle | `type=call|put` |
| Strike rows | returned option instrument ids |
| Right-side price | `marketdata/options/?ids=<IDS>` |
| Spread/straddle/condor Builder | `marketdata/options/strategy/quotes/` plus multi-leg `options/orders/` body |

For a spread, never trust a label alone. Reconstruct every leg from option
instrument id, strike, expiration, side, ratio, and `position_effect`, then
quote the package and calculate max profit/loss before emitting the dry-run.

### Exact Contract Deeplink Rules

Use `api-map options-contract-deeplink` when the user wants a specific contract
opened or planned:

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

Interpret output this way:

- `options-chain-account-shell` is the observed web shell for account context.
- `android-option-chain-by-chain-id` and `mobile-option-chain-by-chain-id-observed`
  are the source-backed app/web route shapes for a chain after API resolution:
  `option_chain?chain_id=<CHAIN_ID>&source=<SOURCE>`.
- External Android `option_chain` reads `chain_id` and `source` only. Although
  the internal `OptionChainIntentKey` supports `initialAccountNumber`, the
  decompiled external target does not parse `account_number`.
- `options-chain-contract-query-candidate` and fragment variants are probes,
  not proof that Robinhood stores contract state in the URL.
- `robinhood://option_position?id=<id>` and
  `robinhood://aggregate_option_position?id=<id>&account_number=<n>` are held
  position detail links from Android decompile evidence; do not use unopened
  contract ids in those slots.
- `robinhood://option_position_open?id=<aggregate_position_id>&account_number=<n>`
  and `robinhood://option_position_close?id=<aggregate_position_id>&account_number=<n>`
  are order-form routes for an existing aggregate option position, not fresh
  symbol/expiry/strike contract routes.
- `robinhood://pending_option_order_replace?id=<order_id>&account_number=<n>`
  and `robinhood://pending_option_order_cancel?id=<order_id>&account_number=<n>`
  are pending-order management routes.
- For unopened contracts, exactness comes from API resolution:
  `options/chains/` -> `options/instruments/` filtered by expiration/type/strike
  -> `marketdata/options/` -> optional `strategy/quotes/`.

Decompiled Android evidence lives in
`docs/options-contract-deeplink-research-2026-06-03.md`. The key finding is that
internal option-chain navigation carries `targetStrikePrice`,
`initialAccountNumber`, `initialFilter`, `targetLegs`, and chain launch modes,
while order navigation carries `initialAccountNumber`, `optionOrderBundle`,
replacement fields, order type/time-in-force, source, and `strategyCode`.

### Route Matching Gotchas

1. **Matching is substring-based.** `portfolios/<ACCOUNT_NUMBER>/` will NOT match — the route is `portfolios/{num}/` with a placeholder. Use brace syntax + `--param`.
2. **Method-aware routing.** `GET /orders/` and `POST /orders/` share a URL. To hit the POST route you MUST pass `--method POST`, otherwise you get the GET (read) route.
3. **`accounts/` under-reports.** Use `bonfire.robinhood.com/transfer/accounts/` for the full account list.
4. **Build after map edits.** The runtime reads `cli/dist/api-map/`, not the source. Editing `api-map/brokerage-routes.json` without rebuilding is a silent no-op.
5. **`url_template` vs `url`.** Some routes (watchlists, indices 263-271) used `url_template` instead of `url`. The engine only matches on `url`; keep source and dist route maps rebuilt after any repair.

Full details: `AGENTS.md` §3-§5.

### Skill Maintenance Rules

This skill should stay concise and operational. Detailed math and source-backed
research belong in:

- `docs/options-quantitative-playbook-2026-06-03.md`
- `docs/options-greeks-strategy-research-2026-06-02.md`
- `docs/options-contract-deeplink-research-2026-06-03.md`
- `api-map/options-strategy-workflows-2026-06-02.json`
- `api-map/options-contract-deeplink-workflows-2026-06-03.json`
- `AGENTS.md`

When updating the skill, follow progressive disclosure:

- Put only the command sequence, safety gates, and decision rules in `SKILL.md`.
- Link detailed docs instead of duplicating whole reference essays.
- Verify live command names with `node cli/dist/index.js --help`.
- Verify strategy count and `reviewContract` with `node cli/dist/index.js api-map options-strategies --json` and `node cli/dist/index.js api-map options-strategy-plan iron-condor --json`.
- If a route supports both read and write methods, state the method explicitly; do not rely on URL-only matching.
- If a body shape is inferred or unverified, label it route-map research, not supported automation.

---

## MCP Server

15 tools surfaced via Hermes MCP. Same engine -> same auth, gate, and method-aware routing as the CLI.

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
| `robinhood_account_context_workflows` | Browser-observed account-number routing workflows |
| `robinhood_account_context_url` | Build a workflow URL from safe placeholders |
| `robinhood_options_strategy_workflows` | Strategy catalog with payoff and Greek posture |
| `robinhood_options_strategy_plan` | Dry-run strategy lookup steps + order body template |
| `robinhood_options_contract_deeplink` | Exact contract web/mobile deeplink candidates + API resolution plan |
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
- [ ] Route map count: `node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"` returns 279
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
