---
name: robinhood-cli
description: This skill should be used when the user asks to "use Robinhood", "check my Robinhood account", "show my positions", "rank my options", "quote an options spread", "build a dry-run Robinhood order", "manage recurring investments", "check account settings", "map Robinhood endpoints", "use the Robinhood CLI", or "use the Robinhood MCP". It covers brokerage/crypto reads, positions, orders, watchlists, options chains, recurring buys, account-settings route maps, and the full reverse-engineered API map with safety gates.
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

Operate real Robinhood brokerage accounts from the terminal or via MCP tools. The CLI and MCP share one engine (`cli/src/lib.ts`) — same auth, same route map (285 brokerage/account route entries as of the latest local check), same double-gate write safety.

**Repo:** `github.com/zaydiscold/robinhood-cli`
**Deep reference:** `AGENTS.md` in repo root — the complete API surface, worked examples, and every command. Hand that file to any agent and it's self-contained. This SKILL.md is the Hermes trigger + boot doc: quick-start, the 80/20 commands, and all the operational pitfalls learned across sessions.

> This is exactly the security-research mindset — a breakthrough is a waypoint, not a finish line.

---

## Skill Operating Model

This skill is a progressive-disclosure entrypoint, not the whole repository
loaded into context. Use it in layers:

1. **Boot from this file.** Read the safety model, auth rules, account discovery
   commands, and current read/write surface first.
2. **Pull focused references only when needed.** Use `AGENTS.md` for end-to-end
   operation, `docs/README.md` for the docs index, and the specific docs listed
   below for options/account-settings/deep-link work.
3. **Use deterministic commands over explanation.** Prefer CLI/MCP reads,
   route plans, dry-run order bodies, and browser verification evidence over
   hand-waving.
4. **Keep the user in control.** Reads and dry-runs can proceed. Live trades,
   transfers, account-setting toggles, cancels, unlinks, or margin/account-type
   changes require exact user approval plus both write gates.

For this use case, the skill teaches the workflow and guardrails; the MCP tools
provide execution. Do not overload the prompt with all route docs unless a task
requires a specific route family.

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

## Capability Catalog — what this CLI/API/MCP can actually do

Read this first: it is the menu of supported operations so an agent has full context *before*
scanning the route map. (Far exceeds what one user would manually do.) Reads are live; every write
is double-gated (`--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`).

**Equity**
- Buy by dollar-notional (fractional, market) or by shares (`brokerage buy`); OTC names auto-limit
  at the ask (whole shares only).
- Sell (shares / dollar), search the universe (`brokerage search`), live quotes, positions,
  unified history (equity+options+crypto+transfers), stock profile.

**Options — single-leg (the four primitives)**
- **Buy to open** — long call or long put (`side:buy, position_effect:open`).
- **Sell to close** — close a long (`side:sell, position_effect:close`).
- **Sell to open** — short call or short put / naked (`side:sell, position_effect:open`; needs option level + BP).
- **Buy to close** — cover a short (`side:buy, position_effect:close`).

**Options — multi-leg / strategies** (`options strategy-quote`, `api-map options-strategies`; 18+ workflows)
- Vertical spreads: call/put **debit** and **credit** spreads.
- **Covered call (CC)** and **cash-secured put (CSP)** (coverage/collateral checked); covered put.
- Straddles / strangles (long & short), butterflies, iron condors, calendars / diagonals.

**Rolling** (close one leg, open another — the tax/▸cash nuance matters)
- **Regular roll (margin):** close + open a new expiration/strike, single or staged (`options roll-plan`).
- **Kosher roll (cash accounts):** close **now** → open **next business day** with *settled* cash (T+1),
  to avoid good-faith violations (`options roll-plan --cash-account`). Cash can't fund the new leg same-day.
- **Roll a CSP / CC:** roll out (later expiry), up/down (strike) for a net credit; assignment- and
  ex-dividend-aware. Rolling a tested short is the core income-management move.
- Roll enumeration: bulk-enumerate **both** the near (close) and far (open) expirations — see
  "Option UUIDs — always bulk-enumerate".

**Tax-advantaged / account-aware knowledge** (surface this when planning)
- Account gating: **cash** (no margin/naked, T+1, good-faith) vs **margin** (rolls/spreads/shorts, PDT
  if <$25k) vs **Roth IRA** (long options + defined-risk + CC/CSP; no margin/naked). See the
  account-capability table + the PDT scale below.
- **Wash sale:** rolling a *losing* leg (or re-buying within 30d) can trigger a wash sale in a taxable
  account — flag it. In an **IRA** wash-sale tracking is moot but there's no tax-loss harvest either.
- **LEAPS** (>1yr) for long-term capital-gains treatment; rolling short-dated premium is ordinary income.
- DRIP (read), recurring buys (list/pause/resume).

**Sentiment / discovery** — `midlands/news`, `midlands/ratings` (analyst buy/hold/sell),
`midlands/tags/tag/{100-most-popular|top-movers|upcoming-earnings|technology|etf|...}`,
`midlands/movers/{index}/`, `marketdata/earnings/`. Feeds the signal→deeplink→order pipeline.

**Crypto** — official signed Crypto Trading API (separate Ed25519 auth).

> Anything not listed as a verified first-class command is route-map research until a fresh capture
> proves the write body (see the account-settings capability map). Don't claim unproven writes.

### `?account_number=` — the universal account selector (verified 2026-06-03)

Almost every Robinhood surface is account-scoped, and **`?account_number=<ACCT>` (web) / the
`{account}` path segment (API) selects WHICH account it acts on — even where the UI hides the
selector.** Verified: appending `?account_number=` to `/account/investing` forces that account's
settings to render (Roth param → Roth IRA; 9mo param → far 9mo plus), and every per-account settings
write carries the account in the path (`drip/account_settings/{account}/`,
`options/option_settings/{account}/`, `settings/margin/{account}/`).

**Apply by default — do not wait to be told:**
- Enumerate accounts first (`transfer/accounts/` or `get_accounts`), then **always pass the account**
  (`?account_number=` on web URLs, the `{account}` path/param on API routes). The UI/bare endpoints
  often default to the *individual* account — not the one you intend.
- `/accounts/` (no id) = all accounts; `/accounts/{id}/…` or `?account_number={id}` = one account.
- This is the single biggest "which account am I acting on?" lever. Get it wrong and a trade or a
  settings change lands on the wrong account. When in doubt, set it explicitly.

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

### Agent Preflight

Run this short preflight before any account-specific operation:

```bash
date
node cli/dist/index.js --help >/dev/null                 # CLI builds + runs
node scripts/equity-buy.mjs --preflight                  # LIGHT LOGIN CHECK (one call): is auth live?
node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"
```

Interpretation:

- **`--preflight` is the auth/login check — run it first.** It hits `accounts/` with the
  web-app headers and prints `PREFLIGHT: OK — auth live, N accounts: …` or
  `PREFLIGHT: FAIL`. This is the "is the MCP/CLI/API login good?" gate; do it before any
  account op so you fail fast instead of mid-batch. On FAIL → `pnpm auth:refresh`, retry once.
  Do NOT spin up random browser sessions.
- Date matters for options expirations, staged rolls, after-hours behavior, recurring timing.
- Route count should match current docs (`288` brokerage/account entries incl. `midlands/search`).
- Discover accounts via `transfer/accounts/` (full graph: numbers, types, deposit/recurring
  eligibility, labels). **Never hardcode account numbers.** Note: the bare `accounts/` endpoint
  may only return a subset for a given token — the full set comes from `transfer/accounts/` or
  the MCP `get_accounts`; writes still work against any owned account by its number.

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
| API map | 285 brokerage/account route entries plus official Crypto API routes | Rebuild after edits; runtime reads `cli/dist/api-map/` |
| Read commands | `quote`, `positions`, `options positions`, `options expirations`, `options chain`, `watchlist list`, `recurring list`, route-map reads, crypto read plans | Live reads are allowed with caller-owned auth, but redact balances/tokens in shareable output |
| Options research/planning | 18 strategy workflows; `options-strategy-plan` emits `reviewContract` | Planning only until exact user approval and write gates |
| Equity/options order writes | Route-map executor against `orders/`, `options/orders/`, and cancel routes | Must use `--method`, exact body, `--live-write`, and `ROBINHOOD_ALLOW_LIVE_WRITE=1`; dry-run first |
| Recurring investments | First-class `recurring list`, `recurring resume`, `recurring pause`; route map also has GET one schedule and POST create | Resume/pause are the verified first-class writes. Create/edit amount/funding-source are route-map research unless a fresh capture verifies body shape |
| Money movement / funding | ACH relationships/transfers and cashier/deposit-schedule routes are mapped mostly as read or `write-or-sensitive` | Never mutate funding, ACH links, deposits, withdrawals, or transfers without a fresh route/body capture and explicit approval |
| DRIP/options/account settings | DRIP GET/PATCH is method-split; account-setting routes are mapped or browser-observed | Treat account-setting writes as dry-run first; plan, obtain exact approval, send only with both gates, then verify reload state |
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
| Stock profile page | `stock profile <symbol> --account <n> --json` | Joins quote, description, fundamentals, shorting/borrow, buying-power, and margin reads |
| Recurring buys | `recurring` subcommand | `robinhood-cli recurring list` — dedicated command |
| Recurring pause/resume | `recurring pause|resume` | Verified first-class writes; double-gated |
| Recurring create/edit/funding source | `bonfire.robinhood.com/recurring_schedules/` | Route-map research only until fresh body capture verifies amount/source fields |
| Funding sources | `cashier.robinhood.com/ach/relationships/`, `payment_instruments/v2/` | Read first; writes are high-risk and not first-class |
| Account settings capability map | `docs/account-settings-capability-map-2026-06-03.md` | Defines what is first-class, route-map-only, browser-observed, or not yet proven |
| Crypto market data | `crypto execute "marketdata/best_bid_ask/" --query-param symbol=BTC-USD` | Official Crypto API |

### Account Context and Strategy Maps

| Task | Command | Notes |
|------|---------|-------|
| Browser account routing | `robinhood-cli api-map account-context` | Shows whether `?account_number=` propagates, is mixed, or is ignored on each web surface |
| Build web workflow URL | `robinhood-cli api-map account-url <id> --account <n> ...` | Navigation/research only; prefer direct API routes for automation |
| Options strategy catalog | `robinhood-cli api-map options-strategies` | Lists single legs, covered calls, cash-secured/naked puts, naked calls, debit/credit spreads, straddles, strangles, butterflies, iron condors, calendar rolls |
| Live strategy dry-run quote | `robinhood-cli options strategy-quote <id> --account <n> --symbol <s> --expiration <d> --leg leg_id=strike --json` | Resolves exact option ids, reads bid/ask/Greeks, computes natural/mid/protective limits, and fills a dry-run body; never sends |
| Cash-account staged roll | `robinhood-cli options roll-plan --account <n> --symbol <s> --type call|put --close-expiration <d1> --close-strike <k1> --open-expiration <d2> --open-strike <k2> --cash-account --json` | Emits close-now/open-later dry-run orders with next-business-day fresh-check gates |
| Strategy dry-run body | `robinhood-cli api-map options-strategy-plan <id> --param key=value` | Emits lookup steps + `options/orders/` body template; never sends |
| Exact contract navigation plan | `robinhood-cli api-map options-contract-plan --account <n> --symbol <s> --expiration <d> --type call|put --side buy|sell --strike <k> --json` | Emits the tested web account shell, candidate web URL probes, API resolution steps, and dry-run single-leg handoff |

Primary options references:

- `docs/README.md`
- `docs/options-greeks-strategy-research-2026-06-02.md`
- `docs/options-quantitative-playbook-2026-06-03.md`
- `docs/options-strategy-execution-smoke-2026-06-03.md`
- `docs/options-contract-navigation-2026-06-03.md`
- `docs/release-notes-2026-06-03.md`
- `docs/account-settings-capability-map-2026-06-03.md`
- `api-map/options-strategy-workflows-2026-06-02.json`
- `api-map/options-contract-navigation-workflows-2026-06-03.json`

### Browser Verification Rule

Use API/CLI/MCP first. Use browser automation only when validating web UI state
or discovering a UI-backed endpoint that the route map does not already cover.
When using a browser, attach to the existing logged-in debug session instead of
launching a new Chrome profile. Keep `?account_number=<ACCOUNT_NUMBER>` on
account-pinnable web URLs, but treat direct API account parameters as the source
of truth.

Preferred browser role:

- Verify that a stock page or option chain is logged in and on the intended
  account.
- Inspect visible bid/ask/mark/Greeks or account-setting UI state.
- Capture sanitized route shapes for missing mutation bodies.

Do not use browser clicks to send live financial actions unless the user gave
exact-action approval and the CLI/MCP route is already understood.

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

Pricing rules for dry-run strategy quotes:

```text
buy leg natural price  = ask
sell leg natural price = bid
leg mid price          = (bid + ask) / 2 when usable, else mark/last fallback
net credit/debit       = sum(sell prices * ratio) - sum(buy prices * ratio)
safe-sell-probe        = natural credit + $200, dry-run only
safe-buy-probe         = max($0.01, natural debit - $200), dry-run only
```

Prefer `robinhood-cli options strategy-quote` over manually filling
`options-strategy-plan` when the user asks about spreads or live pricing. It is
still dry-run: it resolves option ids, quotes bid/ask/Greeks, computes a limit,
and fills the body without calling `POST options/orders/`.

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
| Calendar roll | Close one option and open another expiration/strike; compare realized close and new open risk | Moderate |

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
| Calendar roll | Net = close credit - open debit; compare old and new Greeks, duration, and assignment risk |

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
- In cash accounts, do not assume close proceeds can fund the replacement leg on
  the same day. Use `options roll-plan --cash-account`; treat the open leg as a
  next-business-day task that must recheck settled cash and fresh bid/ask.

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
2. For an exact contract, run `robinhood-cli api-map options-contract-plan --account <N> --symbol <SYMBOL> --expiration <DATE> --type call|put --side buy|sell --strike <K> --json`.
3. `robinhood-cli options expirations <SYMBOL> --json` and `robinhood-cli options chain <SYMBOL> --expiration <DATE> --type call|put --json` to inspect available contracts.
4. `robinhood-cli api-map options-strategies --json` to choose the strategy id and leg ids.
5. For spreads/straddles/condors, run `robinhood-cli options strategy-quote <id> --account <N> --symbol <SYMBOL> --expiration <DATE> --leg <leg_id>=<strike> ... --pricing-mode mid --json`.
6. For calendar rolls, pass per-leg expirations: `--param close_call_expiration=<old> --param open_call_expiration=<new>` or use `options roll-plan` for a two-order staged plan.
7. Use `--pricing-mode safe-sell-probe` only as a dry-run control when proving a sell/credit body is far from the market.
8. If exact ids are already known, `robinhood-cli api-map options-strategy-plan <id> --param key=value --json` can still emit the raw template body.
9. Only after the dry-run body is exact should any live route be considered, and only with `--live-write` plus `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

Worked dry-run examples:

```bash
robinhood-cli options strategy-quote long-call --account <N> --symbol <S> --expiration <D> --leg long_call=<K> --pricing-mode mid --json
robinhood-cli options strategy-quote naked-short-call --account <N> --symbol <S> --expiration <D> --leg naked_call=<K> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote call-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_call=<K1> --leg long_call=<K2> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote call-debit-spread --account <N> --symbol <S> --expiration <D> --leg long_call=<K1> --leg short_call=<K2> --pricing-mode mid --json
robinhood-cli options strategy-quote put-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_put=<K1> --leg long_put=<K2> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote iron-condor --account <N> --symbol <S> --expiration <D> --leg long_put_wing=<K1> --leg short_put_body=<K2> --leg short_call_body=<K3> --leg long_call_wing=<K4> --pricing-mode safe-sell-probe --json
robinhood-cli options strategy-quote call-calendar-roll --account <N> --symbol <S> --expiration <OLD_D> --leg close_call=<OLD_K> --leg open_call=<NEW_K> --param close_call_expiration=<OLD_D> --param open_call_expiration=<NEW_D> --pricing-mode mid --json
robinhood-cli options roll-plan --account <N> --symbol <S> --type call --close-expiration <OLD_D> --close-strike <OLD_K> --open-expiration <NEW_D> --open-strike <NEW_K> --cash-account --json
```

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

### Exact Contract Navigation Rules

Use `api-map options-contract-plan` when the user wants a specific contract
planned:

```bash
robinhood-cli api-map options-contract-plan \
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
- `options-chain-contract-query-candidate` and fragment variants are probes,
  not proof that Robinhood stores contract state in the URL.
- For unopened contracts, exactness comes from API resolution:
  `options/chains/` -> `options/instruments/` filtered by expiration/type/strike
  -> `marketdata/options/` -> optional `strategy/quotes/`.
- Do not claim a universal unopened-contract URL unless it has been verified in
  a logged-in browser/device pass across multiple symbols and expirations.

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
- `docs/options-strategy-execution-smoke-2026-06-03.md`
- `docs/options-contract-navigation-2026-06-03.md`
- `api-map/options-strategy-workflows-2026-06-02.json`
- `api-map/options-contract-navigation-workflows-2026-06-03.json`
- `AGENTS.md`

When updating the skill, follow progressive disclosure:

- Put only the command sequence, safety gates, and decision rules in `SKILL.md`.
- Link detailed docs instead of duplicating whole reference essays.
- Verify live command names with `node cli/dist/index.js --help`.
- Verify strategy count and `reviewContract` with `node cli/dist/index.js api-map options-strategies --json` and `node cli/dist/index.js api-map options-strategy-plan iron-condor --json`.
- Verify live strategy quoting with `node cli/dist/index.js options strategy-quote call-credit-spread --account <N> --symbol <S> --expiration <D> --leg short_call=<K1> --leg long_call=<K2> --pricing-mode safe-sell-probe --json`.
- If a route supports both read and write methods, state the method explicitly; do not rely on URL-only matching.
- If a body shape is inferred or unverified, label it route-map research, not supported automation.

---

## Operating Playbook — When To Use What

This repo gives an agent a typed, gated grip on a brokerage that ships **no public
brokerage API** (only the separate official Crypto API). Everything below the
crypto line is a mapped browser/app surface. So an agent's job is two things at
once: **(1) call the hardcoded actions correctly**, and **(2) reason like an
options trader** about what to call. This section routes intent to action; the
deep math lives in *Options Greeks and Strategy Math* above.

| User intent | Action | Command (verify with `--help`) |
|-------------|--------|--------------------------------|
| "What do I own / how are my accounts?" | discover accounts, then read | `accounts` (lists every account with cash/margin/IRA capabilities; unverified-type accounts flagged conservative); then portfolios/positions per account |
| "Quote X" / "what's the chain?" | live read | `quote <SYM>`, `options chain <SYM>`, `options expirations <SYM>` |
| "Best option position" / P&L | ranked read | `options positions` |
| "What transactions went through (today/yesterday)?" | unified history | `history --days <n> [--account <N>]` (merges equity + options + crypto orders + ACH transfers, newest first) |
| "Price a spread / iron condor" | dry-run strategy quote | `options strategy-quote <strategy> --account <N> --symbol <S> --expiration <D> --leg ...` |
| "Plan a named strategy" | catalog plan | `api-map options-strategies`, `api-map options-strategy-plan <id>` |
| "Open the exact contract for me" | resolve + navigate | `api-map options-contract-links ...` (emits the API-resolved contract + chain-id deeplink) |
| "Roll my position" | staged close+open plan | `options roll-plan ...` (cash-account aware; see below) |
| "Place / cancel an order" | gated write | `brokerage execute "options/orders/" --method POST --live-write` ... then `options/orders/{0}/cancel/` |
| "Change a setting (DRIP, recurring, etc.)" | gated write | `recurring pause|resume`; route-map writes via `brokerage execute --method ... --live-write` |

**Decision rule:** read first, classify the strategy, compute payoff + net Greeks,
emit blockers, *then* (only on explicit request + both write gates) send. Never
infer naked/undefined-risk exposure from loose wording — see *Options Strategy
Classification*.

## Worked Build — Iron Condor, End to End

An iron condor = short put spread + short call spread (4 legs, net credit,
defined risk). Build it with the live tools, not by hand:

```bash
# 1. Resolve the chain + expiration
node cli/dist/index.js options chain <SYM> --json
node cli/dist/index.js options expirations <SYM> --json

# 2. Inspect the named strategy contract (legs it expects, review fields)
node cli/dist/index.js api-map options-strategy-plan iron-condor --json

# 3. Live dry-run quote the 4 legs (resolves ids, reads bid/ask/Greeks,
#    computes net credit + a safe limit, fills the order body — sends nothing)
node cli/dist/index.js options strategy-quote iron-condor \
  --account <N> --symbol <SYM> --expiration <D> \
  --leg short_put=<K1> --leg long_put=<K2> \
  --leg short_call=<K3> --leg long_call=<K4> \
  --pricing-mode safe-sell-probe --json
```

Before sending, the summary must show: strategy id, risk label, **net credit**,
**max profit = credit×100**, **max loss = (widest wing − credit)×100**, both
breakevens, net Greeks, liquidity/expiration flags, the exact `options/orders/`
body (`direction:"credit"`, 4 legs with `ratio_quantity`), and write-gate state.
Same pattern for verticals (2 legs), straddles/strangles, and butterflies — only
the leg set and `direction` change.

## Account-Aware Capabilities — read the account, then say what's allowed

Always read `account.type` and `brokerage_account_type` first and **annotate what
the account can and cannot do** before planning a write. This is required behavior,
not a nicety — the user holds a cash account and several margin accounts, and the
allowed actions differ:

| Account type | Can | Cannot / caution |
|--------------|-----|------------------|
| `cash` | buy/sell, cash-secured puts, covered calls, debit spreads | no margin borrowing, no naked/undefined-risk shorts, **rolling that needs margin won't work**, unsettled-cash (T+1) limits, watch good-faith violations |
| `margin` (individual) | the above + margin, rolls, spreads requiring buying power | PDT rule (<$25k → ≤3 day trades/5d), maintenance margin |
| `ira_roth` | long options, defined-risk spreads, covered calls | no margin, no naked shorts; contribution/withdrawal rules out of scope |

When a requested action is impossible for the account type, **say so and stop**:
e.g. "Account `…cash…` is a cash account — it can't roll on margin; options-level
rolling here is limited to closing then re-opening with settled cash." Read margin
state from `bonfire.robinhood.com/margin/{id}/investing_info/` and
`.../settings/`; read cash/sweep from `accounts/sweeps/`. Surface the constraint
in the plan output, the way the tool already reports buying power.

### Pattern Day Trading (PDT) — check per account, every time

Before any plan that could involve a same-day **round trip** (buy then sell, or sell then
buy the same security in one session), read the account and apply the PDT scale. **Buys
alone never trigger PDT** — only *day trades* (round trips) count. Decide per account from
`get_portfolio` (`total_value` + `buying_power`) and `account.type`:

- **`cash` account:** PDT does not apply (no margin day-trading). But T+1 settlement and
  good-faith violations do — selling unsettled funds can flag it.
- **`margin` account, total value ≥ $25,000:** PDT lifted — effectively unlimited day
  trades. (The user's Roth ≈ $40k and the 9mo are margin ⇒ PDT moot there.)
- **`margin` account, total value < $25,000:** classic PDT — **≤ 3 day trades / 5 rolling
  business days**, else flagged ~90 days.

So each time you look at a new account, ask: *cash (n/a) or margin? if margin, total ≥ $25k?*
and state which branch applies in the plan.

> Rule-change watch: there is active movement to lower/restructure the $25k threshold
> (proposals around ~$5k). Treat $25k as current law; re-verify if the user flags a change,
> and keep this number easy to update.

## Live Write & Order Lifecycle (verified 2026-06-03)

Verified live, not theorized:

- **Both gates fire and mutate:** `--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`.
  A recurring `pause`→`resume` round-trip returned `200` both ways and restored
  state; an options order placed (`201`, state `queued`) and cancelled (`200`).
- **Order lifecycle:** `POST options/orders/` returns the order `id` → confirm it
  is `queued/confirmed` → `POST options/orders/{0}/cancel/` (brace syntax!) →
  re-read; a `403`/"cannot cancel" on a second cancel means it is already
  cancelled. Use a far-from-market limit (`$0.01` buy / natural+`$200` sell) for
  any test order so it physically cannot fill.
- **Two gotchas that bite live:** (1) keep the `{0}`/`{num}` **placeholder** in the
  query and pass the real value via `--param`; substituting the raw value fails to
  match the route. (2) pass `--method` explicitly for writes — GET and POST share
  a URL.
- **Do not trust a route-map write until it is live-verified.** Example: the map
  claimed DRIP toggles via `PATCH corp_actions/drip/enrollment/{num}/`; live, all
  of PATCH/POST/PUT return `405` — that endpoint is GET-only. A dry-run would have
  endorsed the bad body forever. Treat unverified write bodies as research.

### Equity buying — `buy` + `search` (verified live 2026-06-03)

- **Ground the ticker first.** With only a name/theme, run `brokerage search "<name>"`
  (Robinhood's own search bar, `midlands/search/`) and pick the exact symbol. **Never guess
  a ticker.** (A prior agent guessed `SSO` for an "Oracle 2x ETF"; `search "oracle 2x"` returns
  the real ones — `ORCX` / `ORCU`.) Search output flags `fractional` eligibility and `OTC`.
- **Place with `brokerage buy`** (single) or `scripts/equity-buy.mjs` (batches) — both build the
  web order body (`order_form_version: 7` + live bid/ask collar):
  - `brokerage buy ORCU --account <num> --dollars 5` → fractional dollar-notional (market).
  - `brokerage buy RNECY --account <num> --shares 1` → whole shares; **OTC auto-limits at ask**.
  - Dry-run by default; live needs `--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1`.
- **OTC / fractional guard.** Before a dollar order the tool reads `fractional_tradability` +
  `otc_market_tier`. OTC names (e.g. RNECY) are `position_closing_only` and **reject market
  orders** — buy them as **whole shares via a marketable limit**. "$X of <OTC>" is impossible;
  switch to `--shares` and say so rather than malforming an order.
- **Rate limit — agentic managers, NOT an HFT script.** `orders/` burst-limits *fractional*
  orders (~9, then HTTP **429**, ~48s cooldown). A web endpoint will never tolerate hammering.
  Pace ≥2.5s; on 429 sleep the server-directed seconds and retry the **same `ref_id`** (429 =
  nothing placed → idempotent). The batch script does this and **stops on "You can only purchase
  0 shares" / "Not enough buying power"** (account dry) instead of spamming dead orders.
- **Affordability.** Read `get_portfolio.buying_power` before a batch and size to fit — $3–5 DCA
  across dozens of names drains an account fast (a $40k account can show ~$1 buying power).

### Options order gotchas (verified live 2026-06-03)

- **Per-chain min tick.** `options/chains/{id}` returns `min_ticks` (`below_tick`, `above_tick`,
  `cutoff_price`). A limit below `cutoff_price` (often $3.00) must use `below_tick` — ARKG is
  **$0.05**, so `$0.01` → 400 *"Price does not satisfy the min tick value."* (AAPL allows $0.01.)
  Read the chain's ticks; never assume $0.01.
- **GTC options open is gated by _overnight_ buying power**, not regular BP. A `time_in_force: gtc`
  buy-to-open on thin overnight BP → 400 *"not enough overnight buying power"* even when regular BP
  looks fine. (Cross-account test: ARKG $0.05 call → `201 queued` in the 9mo, `400` overnight-BP in
  the Roth + near-3mo individual.)
- **No version gate on options.** `options/orders/` takes the standard body (no `order_form_version`)
  — the version gate is equity-only.
- **Lifecycle (verified):** POST `options/orders/` (`201 queued`) → `options/orders/{0}/cancel/`
  (`200`) → re-read (`cancelled`). Always use a far-from-market limit for test orders so they can't fill.
- **DRIP toggle is NOT `PATCH corp_actions/drip/enrollment/{num}/`** — GET-only; PATCH/POST/PUT → `405`
  (re-verified). DRIP/cash-sweep/stock-lending/margin **write** endpoints remain unproven and need a
  fresh browser capture before any automation. Treat them as research, not supported writes.

### Option UUIDs — always bulk-enumerate (default behavior, no prompt needed)

Option `instrument_id`s are random **UUID v4**. There is NO deterministic mapping from the OCC
symbol/strike/expiration — you can never *compute* one. This isn't an anti-forge security choice:
options contracts are **ephemeral and astronomically numerous** (every strike × expiry × call/put,
created and expired constantly — far more instruments than there are shares), so a random
per-contract id is simply the only practical way to address a space that large and short-lived.
**The id must be enumerated, every time — that is the backbone of every options flow.**

So by default, *without being asked*, whenever a specific option / chain / contract comes up:
- **Bulk-enumerate first:** `options enumerate <SYM> --expiration <YYYY-MM-DD> [--type call|put|both] [--account <N>]`
  → every strike's `option_instrument_id` + desktop deep link in one shot (one API call per
  chain/expiration/type). Use `--expiration all` to list expirations first. Prefer this over
  resolving contracts one at a time.
- **Single known contract:** `api-map options-contract-links ... --strike <K>` resolves just that one.
- **Don't cache per-contract ids** (unique + ephemeral); the reusable thing is the *chain enumeration*.
Treat UUID bulk-enumeration as the first move in any options task, not an afterthought.

### Sentiment data + deep-link pipeline (mapped 2026-06-03)

RH exposes a live sentiment layer under `api.robinhood.com/midlands/` (risk `read`):
- `midlands/news/?symbol=<SYM>` — news articles per ticker.
- `midlands/ratings/{instrument_id}/` — analyst buy/hold/sell summary + dated texts.
- `midlands/tags/tag/{100-most-popular|top-movers|...}/` — crowd / momentum instrument lists.
(Per-instrument `instruments/{id}/popularity/` is now 404 — use the `tags` crowd lists instead.
Internal hosts `news./youfeed./charted./ai-realtime.` have no public TLS; `midlands/` is the surface.)

**Signal → deep link → order:** a signal ("SPY $1000c EOY", "+$100 from strike") → contract spec
→ resolve via `api-map options-contract-links` (symbol→chain→**bulk-enumerate** `options/instruments/`
→ match strike → `option_instrument_id`) → it emits `links.webContractPageDesktop`
(`robinhood.com/options/instruments/{uuid}/`, the verified desktop order ticket; `+?account_number=`
to pin). **Option UUIDs are random v4 — not generatable; bulk-enumerate a chain/expiration in one
call.** The URL carries no side; set `side`+`position_effect` in the `options/orders/` body
(buy/open, sell/close, sell/open, buy/close) for the agentic order.

## Research Methodology — mapping a no-official-API surface

Because there is no official brokerage API, the surface is discovered, not
documented. To extend it safely:

1. **Capture, don't guess.** Drive the logged-in web UI with the network tab / CDP
   recording open, perform the action once, and capture the exact method, URL, and
   body. That capture is the source of truth (the DRIP write endpoint, for
   example, is only knowable this way).
2. **Add it to the map** (`api-map/brokerage-routes.json`), rebuild
   (`pnpm build`), then **live-verify** with a reversible action.
3. **Recon for surface, not exploits.** Passive enumeration (subfinder, dnsx,
   waybackurls) maps the host/endpoint space; cross-reference against the route
   map to spot anything missing. Note interesting hosts (`api-streaming` for
   websockets, `ceres` futures, `vgs` tokenization) without intrusive scanning.
4. **Document honestly.** Mark anything not live-verified as research; never claim
   working automation for an unconfirmed body. Keep raw/private captures in the
   gitignored `info/` folder; promote only sanitized, tested behavior to the public
   CLI/MCP/docs.

> Greeks as a math function: the full delta/gamma/theta/vega/rho model, net-Greek
> aggregation across legs, and the Black-Scholes sanity baseline are in *Options
> Greeks and Strategy Math* above. An agent can specialize there when asked for
> deep options analysis — but it is a tool in the kit, not the default mode.

---

## MCP Server

17 tools surfaced via Hermes MCP. Same engine -> same auth, gate, and method-aware routing as the CLI.

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
| `robinhood_options_contract_plan` | Exact contract web navigation candidates + API resolution plan |
| `robinhood_options_contract_link_bundle` | Account-pinned option chain/link bundle for webhook handoff research |
| `robinhood_stock_profile` | Stock detail page quote/fundamental/borrow/margin read join |
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
12. **Method-aware routing fails closed.** A forced `--method POST` (or PATCH/PUT/DELETE) on a URL with no matching write route now returns **no match** (clear error), instead of silently degrading to the GET route — so a forced write can never be mis-resolved into a read at the wrong risk class. (GET/HEAD stay permissive for legacy route entries without method metadata.)
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
- [ ] Route map count: `node cli/dist/index.js brokerage routes --json | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])"` returns 285
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
