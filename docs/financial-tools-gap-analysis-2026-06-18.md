# Financial Tools Gap Analysis — robinhood-cli

> **Date:** 2026-06-18  
> **Scope:** What Robinhood features exist but aren't surfaced in the CLI/MCP, and what new financial operations would enable the project's stated goal of "financial freedom."  
> **Methodology:** Cross-referenced TODO.md feature backlog, SKILL.md Capability Catalog, 66 MCP tools in server.ts, and the full ~311-entry brokerage-routes.json API surface.

---

## 1. Current State: What Exists (66 MCP Tools)

The CLI/MCP already has a robust read+write surface:

| Domain | Coverage |
|--------|----------|
| **Equity** | Quotes, positions, market/limit buys+sells, order status, cancel, panic cancel-all, pre-trade checks, stock profiles, history |
| **Options** | Chain enumeration, instrument resolution, strategy workflows (20 templates), dry-run quoting, single-leg close plans, holdings inspection, wheel tracking |
| **Portfolio** | Per-account P&L in dollars (day + after-hours), buying power breakdown, margin health, dividend engine (cadence + projection) |
| **Account** | Settings (DRIP, expiration, PDT, lending, sweep toggle), recurring schedules, documents, trade review (film study) |
| **Watchlists** | Read, add/remove/create, basket-buy |
| **Crypto** | Route discovery, auth signing, dry-run plans, execute (reads live; writes gated) |
| **Infra** | API map summary/directory, route describe, recipe routing, knowledge library, roll ledger |

---

## 2. GAP 1: Robinhood Features NOT in CLI/MCP

Features that exist in the Robinhood platform (and often in the route map) but have no first-class tooling:

### 2.1 Gold / Subscription Management
- **API presence:** `active_subscription_id` field on accounts/ route; subscription endpoints in `identi.robinhood.com` cluster (9 routes in map)
- **What's missing:** Read subscription tier/benefits, Gold status (margin rate tier, instant deposit limits, Morningstar access), upgrade/downgrade flow
- **Financial freedom impact:** LOW-MEDIUM — marginal utility for active traders; Gold unlocks better margin rates but the actual trading tools already work regardless
- **Implementation complexity:** MEDIUM — subscription endpoints mapped but body contracts unverified; `identi.robinhood.com` host may need separate auth handling

### 2.2 Debit Card / Cash Management / Minerva
- **API presence:** 3 Minerva routes (`minerva.robinhood.com/accounts/`, `/cards/declined_transactions/`, `/history/transactions/`); `cash_management_enabled` on accounts
- **What's missing:** Spending history, card management (lock/unlock, limits), cash-management sweep status detail, Minerva balance read
- **Financial freedom impact:** LOW — these are banking convenience features, not wealth-building levers
- **Implementation complexity:** LOW — 3 mapped routes, all reads; Minerva host may use separate auth

### 2.3 Crypto Full Trading (Nummus)
- **API presence:** 60 Nummus routes mapped (orders, positions, marketdata, accounts); `robinhood_crypto_execute` exists as generic executor
- **What's missing:** First-class crypto verbs (`crypto buy`, `crypto positions`, `crypto orders`, `crypto quote`); current `crypto_execute` requires manual route/body construction
- **Financial freedom impact:** MEDIUM — crypto is a significant asset class but separate from core brokerage
- **Implementation complexity:** MEDIUM-HIGH — 60 routes exist but all need first-class command wiring; Nummus uses different auth domain

### 2.4 Futures
- **API presence:** 13 ceres routes mapped; `has_futures_account`, `futures_cash`, `futures_market_value` fields on portfolio; futures items in watchlist
- **What's missing:** `ceres.robinhood.com` is **TLS-walled** (app-only cert allowlist) — handshake refused. Read-enumerate only; cannot place futures trades. SKILL.md documents this clearly.
- **Financial freedom impact:** LOW until RH opens ceres to web-session auth
- **Implementation complexity:** BLOCKED — TLS wall prevents any progress without Robinhood opening the host

### 2.5 IPO Access
- **API presence:** 6 routes (`equity_trading/ipo_access/viewmodels/summary/{ipo_id}/`; `ipo_access_*` fields on accounts and instruments)
- **What's missing:** IPO calendar, eligibility check, participation submission
- **Financial freedom impact:** LOW-MEDIUM — IPO access is occasional, not recurring wealth-building
- **Implementation complexity:** MEDIUM — routes mapped but write body contracts unverified; IPO participation is high-risk mutating

### 2.6 Stock Lending (SLIP)
- **API presence:** 5 routes (`slip/{id}/`, `slip/eligibility/`, `slip/hub-card/`, `slip/{account_number}/status/`); toggleable via `robinhood_settings action=lending`
- **What's missing:** Lending income dashboard (how much earned), eligibility scanning across held positions, auto-enroll eligible securities
- **Financial freedom impact:** LOW — lending income is typically small but passive
- **Implementation complexity:** LOW — routes mapped, toggle works; income read may need additional endpoint

### 2.7 Price Alerts
- **API presence:** 2 routes mapped (bonfire host, alerts category)
- **What's missing:** Create/read/delete price alerts, alert trigger history
- **Financial freedom impact:** LOW — alerts are operational, not analytical
- **Implementation complexity:** LOW-MEDIUM — 2 routes mapped but need CDP body capture

### 2.8 Social / Community Features
- **API presence:** None mapped (gifting, referrals, social feed)
- **What's missing:** Gift shares, referral tracking, social trade sharing
- **Financial freedom impact:** NEGLIGIBLE
- **Implementation complexity:** HIGH — no routes mapped; out of scope

### 2.9 Tax-Loss Harvesting Automation
- **API presence:** None (Robinhood doesn't offer automated TLH)
- **What's missing:** Wash-sale detection across accounts, loss-harvest candidate identification (positions with unrealized losses, no wash-sale window conflict), automated sell→replacement-buy orchestration
- **Financial freedom impact:** **HIGH** — tax optimization directly increases after-tax returns
- **Implementation complexity:** MEDIUM-HIGH — requires wash-sale rule engine (30-day window), position pairing logic, order orchestration; NOT a Robinhood API gap — this is a *computational* tool

### 2.10 Portfolio Rebalancing
- **API presence:** None (no rebalancing API)
- **What's missing:** Target allocation definition, drift calculation, buy/sell order generation to rebalance, tax-aware rebalancing (avoid short-term gains)
- **Financial freedom impact:** **HIGH** — systematic rebalancing improves risk-adjusted returns
- **Implementation complexity:** MEDIUM — pure computation over existing position/quote data; generates dry-run orders through existing `placeEquityOrder`

---

## 3. GAP 2: Financial Freedom Enablers (New Tools)

These are computational tools that combine existing reads into higher-level financial operations — they don't need new API endpoints, just smart composition of what already works:

### 3.1 Income Tracking (`income`) — in TODO
- **Status:** TODO.md line 66, not built
- **What:** Combined income view: dividends + option premium collected, by month, in dollars
- **API dependency:** `dividends/` (live-verified, 102 records), `options/orders/?states=filled` (premium = credit received on sell-to-open, debit paid on buy-to-close)
- **Financial freedom impact:** **HIGH** — the #1 metric for income investors; answers "how much cash did my portfolio generate this month?"

### 3.2 Risk Scanner (`risk`) — in TODO
- **Status:** TODO.md line 65, not built
- **What:** Portfolio risk scan: max loss across open positions, assignment exposure, undercovered short legs, margin-call distance
- **API dependency:** `options/aggregate_positions/` + `marketdata/options/` (Greeks per contract) + `portfolios/{account}/` (margin health)
- **Financial freedom impact:** **HIGH** — directly prevents catastrophic losses

### 3.3 Scenario Analysis (`whatif`) — in TODO
- **Status:** TODO.md line 63, not built
- **What:** Greeks-based scenario calc: spot ±X%, IV ±N pts, T-n days → position P&L in dollars
- **API dependency:** `marketdata/options/?ids=` (live Greeks per contract), `marketdata/quotes/` (spot price)
- **Financial freedom impact:** **HIGH** — enables informed position management before moves happen

### 3.4 Calendar — in TODO
- **Status:** TODO.md line 64, not built
- **What:** Upcoming events for held names: option expirations, ex-div dates (assignment risk on covered calls), earnings dates
- **API dependency:** `options/chains/{id}/` (expiration dates), `marketdata/earnings/` (mapped but not wired), `marketdata/fundamentals/{id}/` (ex-dividend date)
- **Financial freedom impact:** **MEDIUM-HIGH** — prevents surprise assignments and missed roll opportunities

### 3.5 Exposure / Concentration — in TODO
- **Status:** TODO.md line 69, not built
- **What:** Concentration by underlying/sector + portfolio-wide net Greeks
- **API dependency:** `positions/` + `options/aggregate_positions/` + `marketdata/options/` (Greeks) + `marketdata/fundamentals/` (sector/industry)
- **Financial freedom impact:** **HIGH** — concentration risk is the silent portfolio killer

### 3.6 Performance Attribution
- **Status:** Not in TODO; partially covered by `review` (film study)
- **What:** "What strategy made/lost money?" — group closed trades by strategy (wheel CSP, wheel CC, long calls, spreads, buy-and-hold), compute realized P&L per strategy, win rate, average hold time
- **API dependency:** `orders/` + `options/orders/?states=filled` (all fills) + FIFO pairing engine (already in `computeTradeReview`)
- **Financial freedom impact:** **HIGH** — knowing which strategies work enables capital allocation to what's profitable

### 3.7 Automated Roll Management
- **Status:** Partial — `roll_ledger` tracks pending cash-account rolls; wheel tracks stage
- **What:** Proactive roll suggestions: "Your MSFT 450C expires Friday, ITM by $3.20. Roll to next week 455C for net credit of $1.15." Scan all open short options approaching expiration, compute roll candidates, emit dry-run orders.
- **API dependency:** `options/aggregate_positions/` + `options/chains/{id}/` + `options/instruments/` + `marketdata/options/`
- **Financial freedom impact:** **HIGH** — systematic roll management is the engine of income strategies

### 3.8 Cost Basis Tracking Across Accounts
- **Status:** Not built
- **What:** Per-symbol cost basis aggregated across all accounts, with tax-lot-level detail (acquisition date, holding period — short-term vs long-term)
- **API dependency:** `positions/` (average_buy_price per account) + `orders/?states=filled` (individual fills for lot-level detail) — limited by what RH exposes
- **Financial freedom impact:** **MEDIUM-HIGH** — essential for tax-aware selling decisions

### 3.9 Rebalancing Suggestions
- **Status:** Not built
- **What:** Given target allocations, compute drift in dollars, generate the minimal set of buy/sell orders to rebalance, with tax-impact awareness (avoid realizing short-term gains)
- **API dependency:** `positions/` + `portfolios/{account}/` (market values) + `marketdata/quotes/`
- **Financial freedom impact:** **MEDIUM** — systematic rebalancing improves risk-adjusted returns

### 3.10 Coach Mode — in TODO
- **Status:** TODO.md line 67, not built
- **What:** Explain any held position/order in plain English with the math shown
- **API dependency:** Everything already wired
- **Financial freedom impact:** **MEDIUM** — enables beginners to understand their positions; less critical for experienced operators

---

## 4. GAP 3: Execution Infrastructure Improvements

Issues between MCP and CLI that affect composability and reliability:

### 4.1 Tool Composability
- **Current state:** MCP tools return JSON; an agent can parse and feed output to another tool. But there's no structured pipeline — each call is independent.
- **Gap:** No `pipe` or chaining mechanism. `options_enumerate` returns contract IDs that must be manually extracted and passed to `options_inspect` or `options_close`.
- **Fix:** Structured output contracts (typed responses with explicit `nextCalls` hints) — already partially done in `options_close` which returns "the exact order body + gated send command."

### 4.2 Batch Operations
- **Current state:** `watchlist_buy` batches; `panic` sweeps all orders. But no general batch: multi-symbol quotes require iterative instrument lookup per symbol.
- **Gap:** `robinhood_quote` resolves symbols one-by-one (sequential `instruments/?symbol=` calls). No batch instrument resolution.
- **Fix:** Batch instrument resolution (send all symbols → one `instruments/?symbols=` call if RH supports it, or parallelize).

### 4.3 Streaming / Real-Time Data
- **Current state:** All reads are polling. No WebSocket or streaming support.
- **Gap:** No way to watch a quote tick or monitor order fills in real time.
- **Fix:** Research whether RH exposes a WebSocket quote feed (likely not for web API). Fallback: intelligent polling with configurable intervals.

### 4.4 Session Persistence
- **Current state:** Each MCP call is stateless — auth token from `.env`, self-heals on 401.
- **Gap:** No cross-call caching (instrument UUIDs re-resolved every call), no session-level rate-limit awareness.
- **Fix:** In-memory LRU cache for instrument ID lookups, rate-limit token bucket shared across calls.

### 4.5 Retry / Error Recovery
- **Current state:** `ref_id` idempotency on orders; 429 handling in engine. But no general retry policy — a transient 502/503 aborts.
- **Gap:** No exponential backoff, no circuit breaker, no degraded-mode operation (e.g., "options data unavailable, equity-only snapshot").
- **Fix:** Retry middleware with exponential backoff + jitter; circuit breaker per host.

---

## 5. Prioritized Roadmap

Ranked by: API availability × implementation complexity × financial-freedom impact.

| Priority | Tool | Category | API Ready? | Complexity | Impact | Time Estimate |
|----------|------|----------|------------|------------|--------|---------------|
| **P0** | **`income`** — combined dividend + option premium, by month, in dollars | New tool | ✅ dividends/, options/orders/ live | LOW | HIGH | 2-3 days |
| **P0** | **`risk`** — portfolio risk scan (max loss, assignment exposure, margin distance) | New tool | ✅ positions, options Greeks, margin live | MEDIUM | HIGH | 3-5 days |
| **P0** | **`whatif`** — Greeks scenario calculator (spot ±X%, IV ±N) → P&L | New tool | ✅ options quotes include full Greeks | LOW-MEDIUM | HIGH | 2-3 days |
| **P0** | **`calendar`** — upcoming events for held names (expirations, ex-div, earnings) | New tool | ✅ chains, fundamentals live; earnings/ mapped | LOW-MEDIUM | HIGH | 2-3 days |
| **P0** | **`exposure`** — concentration by underlying/sector + net Greeks | New tool | ✅ positions, fundamentals, options data live | MEDIUM | HIGH | 3-4 days |
| **P1** | **Performance attribution** — strategy-level P&L (wheel vs spreads vs B&H) | New tool | ✅ order history + FIFO engine exists | MEDIUM | HIGH | 4-6 days |
| **P1** | **Automated roll management** — proactive roll suggestions for ITM shorts | New tool | ✅ options chains, positions, quotes live | MEDIUM-HIGH | HIGH | 5-7 days |
| **P1** | **Notional guardrails** — per-order/per-session dollar caps | Safety | ✅ gatedBrokerageWrite engine | LOW | MEDIUM | 1-2 days |
| **P1** | **`order watch`** — place → poll → report fill/reject lifecycle | CLI/MCP | ✅ orders/ polling works | LOW | MEDIUM | 1-2 days |
| **P1** | **`coach` mode** — plain-English position/order explanation | New tool | ✅ all reads exist | LOW-MEDIUM | MEDIUM | 2-3 days |
| **P2** | **Rebalancing suggestions** — drift calc + order generation | New tool | ✅ positions, quotes live | MEDIUM | MEDIUM | 3-4 days |
| **P2** | **Tax-loss harvesting helper** — wash-sale aware loss harvesting | New tool | ✅ positions, order history live | HIGH | HIGH | 5-8 days |
| **P2** | **Crypto first-class commands** — `crypto buy/positions/quote` | Surface gap | ✅ 60 Nummus routes mapped | HIGH | MEDIUM | 5-8 days |
| **P2** | **Cost basis aggregation** — cross-account, lot-level where possible | New tool | ✅ positions, orders live | MEDIUM | MEDIUM | 3-5 days |
| **P3** | **IPO access dashboard** — calendar, eligibility, participation (read-only) | Surface gap | ✅ 6 routes mapped | MEDIUM | LOW | 2-3 days |
| **P3** | **Gold/subscription dashboard** — tier, benefits, rate card | Surface gap | ✅ 9 routes mapped | MEDIUM | LOW | 2-3 days |
| **P3** | **Price alerts** — create/read/delete, trigger history | Surface gap | ✅ 2 routes mapped | LOW-MEDIUM | LOW | 2-3 days |
| **P3** | **Batch operations infra** — parallel instrument resolution, multi-symbol quotes | Infra | ✅ (parallelize existing) | LOW | MEDIUM | 1-2 days |
| **P3** | **Retry/error recovery middleware** — backoff, circuit breaker | Infra | ✅ (wrap existing HTTP) | MEDIUM | MEDIUM | 2-3 days |
| **BLOCKED** | **Futures trading** — ceres.robinhood.com TLS-wall | Surface gap | ❌ TLS handshake refused | — | — | Until RH opens ceres |
| **WON'T BUILD** | **Money movement** — ACH/wire transfers | Safety decision | ✅ mapped | HIGH | LOW | Out of scope |

---

## 6. Tool Specs — Top 5 (P0 Priority)

### 6.1 `robinhood_income` — Combined Income Engine

```
Tool: robinhood_income
Title: Robinhood Combined Income
Risk: sensitive-read (read-only)
```

**Description:** Combined passive income across all owned accounts: dividends received + option premium collected (net credits from sell-to-open minus debits from buy-to-close), broken down by month, by symbol, in dollars. Also computes trailing-12-month total, monthly average, and projected annual run-rate. "How much cash did my portfolio generate?"

**Input schema:**
```typescript
{
  account_number: z.string().optional(),  // scope to one account
  year: z.number().optional(),            // calendar year (default: current)
  by: z.enum(["month", "symbol", "both"]).default("both")
}
```

**Implementation plan:**
1. Read dividend history from `dividends/` (already live-verified, `computeDividends` engine exists)
2. Read filled option orders from `options/orders/?states=filled` 
3. Classify each fill: `sell_to_open` → credit received (premium); `buy_to_close` → debit paid (cost to cover); `buy_to_open` / `sell_to_close` → informational only
4. Sum net premium by month (credits - debits)
5. Merge dividend + premium income into unified monthly breakdown
6. Output: `{ months: [{ month, dividendIncome, optionPremium, total }], annualTotal, monthlyAverage, projectedAnnual }`

**API dependencies:** `dividends/` ✅ (live-verified), `options/orders/` ✅ (live-verified), `options/aggregate_positions/` ✅

**Engine location:** New function `computeIncome` in `cli/src/lib.ts`, imported by both CLI (`income` command) and MCP.

---

### 6.2 `robinhood_risk` — Portfolio Risk Scanner

```
Tool: robinhood_risk
Title: Robinhood Risk Scanner
Risk: sensitive-read (read-only)
```

**Description:** Full portfolio risk assessment: (1) max loss across all open positions, (2) assignment exposure (ITM short options by expiration proximity), (3) undercovered short legs (naked calls without shares, naked puts without cash), (4) margin-call distance (equity / market_value, with warning thresholds), (5) concentration risk (top 3 names as % of portfolio). Returns a PASS/WARN/DANGER summary with per-issue detail.

**Input schema:**
```typescript
{
  account_number: z.string().optional()
}
```

**Implementation plan:**
1. Read positions (`positions/`) and option aggregate positions (`options/aggregate_positions/`)
2. For each option position, fetch live Greeks via `marketdata/options/?ids=`
3. Max loss: for long options = premium paid (limited); for short naked = theoretically unlimited (flag as DANGER); for spreads = width minus credit
4. Assignment risk: ITM shorts expiring within 7 days → WARN; within 3 days → DANGER
5. Undercovered legs: short calls where share count < contracts×100; short puts where cash < strike×contracts×100
6. Margin distance: `equity / market_value` → >50% OK, 30-50% WARN, <30% DANGER
7. Concentration: top 3 underlyings as % of total portfolio value
8. Output: `{ riskLevel: "PASS"|"WARN"|"DANGER", issues: [{ severity, category, detail }], maxLossByUnderlying, assignmentExposure, uncoveredLegs, marginDistance, concentration }`

**API dependencies:** `positions/` ✅, `options/aggregate_positions/` ✅, `marketdata/options/` ✅, `portfolios/{account}/` ✅

---

### 6.3 `robinhood_whatif` — Scenario Analysis Calculator

```
Tool: robinhood_whatif
Title: Robinhood What-If Scenario
Risk: read (read-only, no brokerage call)
```

**Description:** Greeks-based scenario calculator: for held positions, compute P&L in dollars under user-specified scenarios. Scenarios: spot price ±X%, implied volatility ±N percentage points, time decay by D days. Uses live option Greeks (delta, gamma, vega, theta) and share deltas to approximate P&L. Outputs per-position and aggregate P&L.

**Input schema:**
```typescript
{
  account_number: z.string().optional(),
  symbol: z.string().optional(),          // scope to one underlying
  spot_move_pct: z.number().optional(),   // e.g., +5 for 5% up
  iv_move_pts: z.number().optional(),     // e.g., +10 for 10 IV points up
  days_forward: z.number().int().optional(), // time decay scenario
  scenarios: z.array(z.object({           // or specify multiple
    label: z.string(),
    spot_move_pct: z.number().optional(),
    iv_move_pts: z.number().optional(),
    days_forward: z.number().int().optional()
  })).optional()
}
```

**Implementation plan:**
1. Read positions and option positions for target account/symbol
2. Fetch live option quotes with Greeks (`marketdata/options/?ids=`)
3. For each scenario:
   - Equity: ΔP&L = shares × spot_price × spot_move_pct/100
   - Options: ΔP&L ≈ delta × ΔS + ½ × gamma × (ΔS)² + vega × Δσ + theta × Δt
   - Compute in dollars per contract, then × quantity
4. Aggregate by position, then portfolio total
5. Output: `{ currentValue, scenarios: [{ label, totalPnl, byPosition: [{ symbol, type, pnl }] }] }`

**API dependencies:** `positions/` ✅, `options/aggregate_positions/` ✅, `marketdata/options/` ✅, `marketdata/quotes/` ✅

**Math note:** Uses the Taylor expansion approximation (delta-gamma-theta-vega). The `options_strategy_plan` + `options_strategy_workflows` reference already documents the Greek posture for each strategy.

---

### 6.4 `robinhood_calendar` — Event Calendar for Held Names

```
Tool: robinhood_calendar
Title: Robinhood Event Calendar
Risk: read (read-only)
```

**Description:** Upcoming events for currently held positions: option expiration dates (with days-remaining countdown), ex-dividend dates (with assignment-risk flag for covered calls), and earnings announcement dates. Sorted by urgency. "What's happening to my positions this week?"

**Input schema:**
```typescript
{
  account_number: z.string().optional(),
  days: z.number().int().min(1).max(90).default(30),  // lookahead window
  event_types: z.array(z.enum(["expiration", "ex_div", "earnings"])).default(["expiration", "ex_div", "earnings"])
}
```

**Implementation plan:**
1. Read all positions (`positions/`, `options/aggregate_positions/`)
2. Collect unique symbols
3. For each symbol:
   - **Expirations:** From `options/chains/{id}/` → `expiration_dates`, then filter held contracts. Flag ITM shorts for assignment risk.
   - **Ex-div dates:** From `marketdata/fundamentals/{id}/` → `ex_dividend_date`, `distribution_frequency`. Flag if you hold covered calls that could be assigned.
   - **Earnings:** From `marketdata/earnings/` (mapped route, needs live-verification — use `brokerageGetJson` to probe)
4. Merge into unified timeline, sorted by date
5. Output: `{ days, events: [{ date, symbol, type, detail, urgency: "info"|"warning"|"critical" }] }`

**API dependencies:** `positions/` ✅, `options/chains/` ✅, `marketdata/fundamentals/` ✅, `marketdata/earnings/` ⚠️ (mapped, needs live-verification)

---

### 6.5 `robinhood_exposure` — Concentration + Net Greeks

```
Tool: robinhood_exposure
Title: Robinhood Exposure Analysis
Risk: sensitive-read (read-only)
```

**Description:** Portfolio concentration and net Greek exposure: (1) allocation by underlying (dollar value + % of portfolio), (2) allocation by sector (using fundamentals data), (3) portfolio-wide net Greeks (total delta, gamma, theta, vega), (4) top-3 concentration warning. Answers "What am I actually exposed to?"

**Input schema:**
```typescript
{
  account_number: z.string().optional(),
  by: z.enum(["underlying", "sector", "both"]).default("both")
}
```

**Implementation plan:**
1. Read equity positions + option positions for all accounts (or specified one)
2. For equities: market value = shares × last_trade_price; delta contribution = shares × price / 100 (approximate)
3. For options: fetch Greeks via `marketdata/options/?ids=`; delta/gamma/theta/vega contributions = Greek × quantity × 100 (per contract multiplier)
4. Resolve sectors via `marketdata/fundamentals/{id}/` for each unique equity underlying
5. Compute:
   - Per-underlying: dollar value, % of portfolio, net delta
   - Per-sector: aggregate dollar value, % of portfolio
   - Portfolio net Greeks: sum across all positions
6. Output: `{ totalValue, byUnderlying: [{ symbol, value, pct, netDelta }], bySector: [{ sector, value, pct }], netGreeks: { delta, gamma, theta, vega }, concentrationWarnings: [...] }`

**API dependencies:** `positions/` ✅, `options/aggregate_positions/` ✅, `marketdata/options/` ✅, `marketdata/fundamentals/` ✅, `marketdata/quotes/` ✅

---

## 7. Architecture Note: Engine-First Design

All five P0 tools follow the same pattern as existing tools:
- **One engine function** in `cli/src/lib.ts` (shared between CLI and MCP)
- **CLI entry:** `robinhood-cli income --account N --year 2026 --json`
- **MCP entry:** `robinhood_income` tool in `mcp/src/server.ts`
- **Write-gate:** All are read-only; no live-write switch needed
- **Recipe:** Register in the recipes JSON so `robinhood_recipes` routes intent → tool

Estimated total implementation: **12-18 days** for all five P0 tools (a focused 2-3 week push).

---

## 8. What Was Confirmed vs Discovered

| Finding | Source |
|---------|--------|
| 66 MCP tools currently registered | server.ts, 66 `registerTool` calls |
| 311 brokerage routes in map, 30 categories, 8 hosts | brokerage-routes.json |
| 70 routes in "unknown" category — largest untapped surface | Category analysis |
| `marketdata/earnings/` mapped but not wired — key dependency for calendar tool | Route map search |
| 60 Nummus (crypto) routes mapped — crypto trading surface is deep but not first-class | Route map analysis |
| Minerva (cash mgmt) has only 3 routes mapped — limited surface | Route map analysis |
| 9 Gold/subscription routes exist but write contracts unverified | Route map analysis |
| TODO.md has 9 feature ideas; 5 are P0-worthy, 4 are P1 | TODO.md lines 59-70 |
| Doc contradictions exist (SKILL.md tool count, strategy count) — TODO line 51-56 | TODO.md |
| Tax-loss harvesting and rebalancing are purely computational (no new RH endpoints needed) | Analysis |
| Futures are TLS-blocked (ceres.robinhood.com) — no path forward without RH change | SKILL.md, docs/ |

---

*Generated 2026-06-18 from live route map, MCP server scan, and TODO.md backlog.*
*Zayd Khan // cold // www.zayd.wtf*
