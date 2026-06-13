# Market mechanics — the floor every other module stands on

> **When to load this:** any "why is the price weird," "why didn't my order fill," "what trades
> after hours," "what's the spread costing me," or basic-mechanics question — and as the
> grounding layer when a user is new to markets. This is the Investopedia floor in one place,
> wired to the repo commands that expose each concept live.

## Order types — and what this repo actually sends

| Type | Behavior | Repo reality |
|---|---|---|
| **Market** | Fills now at the other side of the book; you pay the spread; no price control | `buy`/`sell` dollar-notional and share market orders carry the **live ask as a price collar** in the web body; the engine's collar-sanity check flags a stale/halted quote (ask >25% off a robust reference) — warns on dry-run, **blocks live** |
| **Limit** | Fills at your price or better; may not fill | `buy -q <n> -p <price>`; the only type OTC names accept, and the only type in extended/overnight sessions |
| **Stop** | Triggers a market order at the stop price; gap-through risk (can fill far past the stop) | route-map surface; stops don't execute in extended hours — they queue for the next regular session |
| **Stop-limit** | Triggers a limit at the stop; no gap-through, but can fail to fill in a fast move | same |

**GFD vs GTC:** good-for-day dies at session end; good-til-canceled persists (~90 days at most
brokers). Repo-critical nuance: **GTC option opens are gated by OVERNIGHT buying power**, not
regular BP (`knowledge/accounts.md`). Options orders take TIF `gfd`/`gtc`.

## Bid / ask / spread / mark — the cost nobody itemizes

- **Bid** = highest resting buyer; **ask** = lowest resting seller; **spread** = the gap — the
  toll for immediacy. In dollars: spread × shares, or **spread × 100 per option contract**. A
  $0.30-wide option spread is **$30/contract** to cross, every entry and every exit.
- **Mark** ≈ (bid+ask)/2 — what P&L displays use. **Last** is just the most recent print; on an
  illiquid name it can be hours old and far from the live market. When last and mark disagree,
  trust the bid/ask.
- Quoting rule from the repo's pricing model: buy at the **ask**, sell at the **bid** (natural);
  mid is a hope, not a right (`knowledge/multi-leg.md`).

## Liquidity and open interest (options)

- **Volume** = contracts traded today (live). **Open interest** = contracts outstanding —
  updated **next morning**, not intraday. Low OI + wide spread = you'll pay real dollars both
  ways and may not get out near mark.
- Judge an option by **spread as a fraction of premium**: $0.10 wide on a $5.00 option is fine;
  $0.10 wide on a $0.20 option is a 50% toll.
- **Per-chain min ticks:** limits below the chain's `cutoff_price` (~$3) must use `below_tick`
  — ARKG is $0.05, so a $0.01 limit 400s. Read `min_ticks` before pricing (failure mode #8).

## Market sessions — what actually trades when

| Session (ET) | Equities/ETFs | Options |
|---|---|---|
| Pre-market 7:00–9:30 | Yes (RH extended hours; limit orders) | **No — options do not quote or trade pre-market** |
| Regular 9:30–16:00 | Yes — full order types | Equity/ETF options 9:30–16:00 |
| 16:00–16:15 | After-hours | **Index options (SPX/VIX/XSP/RUT…) and several broad ETF options trade ~15 min past the bell**; some index products quote later still |
| After-hours 16:00–20:00 | Yes (limit only) | No (per above exception) |
| Overnight (RH 24H Market, Sun 20:00 → Fri 20:00) | ~900 select symbols via Blue Ocean ATS — **whole-share LIMIT orders only**, thin books, wide spreads | No (Cboe runs nearly-24×5 GTH for SPX/VIX/XSP, but treat platform availability as unverified until a live read shows it) |

Repo consequences: after-hours P&L attribution is **equity-only** in `portfolio` (options don't
print extended marks); between the close and next open the option feeds roll `previous_close`
a session ahead of equity feeds — the `portfolio` engine detects this from the feeds' own
`previous_close_date` stamps and re-anchors, and its output states which session window it
measured. Overnight quotes are thin — a "weird" 3 AM price is usually a 10-share print.

## Settlement — T+1

Since 2024-05-28, US equities (and options) settle **one business day** after the trade.
Operational bites: cash-account proceeds are spendable T+1 (good-faith violations if you open
on unsettled cash — the reason the kosher roll exists, `knowledge/rolling.md`), and the
ex-dividend date now generally **coincides with the record date**
(`knowledge/dividend-investing.md`).

## Why limit-only for OTC

OTC names on Robinhood are typically `position_closing_only` for fractional and **reject market
orders** outright — thin, fragmented quoting makes an unpriced order a blank check. The engine
handles it: OTC whole-share buys are auto-limited **at the ask** (marketable limit), and dollar
orders on OTC names hard-fail with the switch-to-shares message (failure mode #4).

## Halts — when the quote stops meaning anything

- **LULD (limit-up/limit-down):** single-stock 5-minute pauses when price breaks its dynamic
  band — routine on volatile small caps.
- **Market-wide circuit breakers:** S&P 500 −7% / −13% (15-min halts) / −20% (day over).
- **News halts (T1):** pending material news; can last hours.
- During any halt the API still serves the **last stale quote** — bids/asks go fictional. This
  is exactly what the buy engine's collar-sanity check exists for (observed live: a halted-ish
  ARKG ask of $92.80 on a ~$33 stock). A dead/stale quote hard-fails a live order.

## Corporate actions — splits adjust options, dividends don't

- **Splits:** the OCC adjusts option contracts so holders are made whole — a 2:1 split halves
  the strike and doubles contracts (or adjusts the deliverable). **Reverse splits and special
  distributions** create *non-standard* contracts with odd deliverables (e.g., 10 shares + cash)
  — they price strangely and quote wide; check the chain before "cheap" conclusions.
- **Ordinary cash dividends do NOT adjust options.** That asymmetry is why deep-ITM short calls
  get exercised the night before ex-date (extrinsic < dividend) — the early-assignment tripwire
  in `knowledge/wheel.md` and `knowledge/rolling.md`.
- Shares: splits multiply quantity and divide basis; tickers/CUSIPs can change in mergers —
  positions resolve via instrument UUID, which survives ticker changes (failure mode #11).

## APPLY-IT — which command exposes each concept

```bash
node cli/dist/index.js quote <SYM> --json          # last, bid/ask (spread in $), day %, extended-hours last
node cli/dist/index.js options chain <SYM> --width 6 --json    # live bid/ask/mark per strike — spread check
node cli/dist/index.js brokerage execute "options/chains/{id}/" --param id=<CHAIN_ID> --json --full  # min_ticks, cutoff_price
node cli/dist/index.js options enumerate <SYM> --expiration <D>   # OI-bearing instrument list + UUIDs
node cli/dist/index.js portfolio                   # session-coherent day Δ vs after-hours Δ (states its window)
node cli/dist/index.js stock profile <SYM> --json  # volume, 52wk range, fundamentals, borrow rate
node cli/dist/index.js buy -s <SYM> -a <N> -q 1 -p <limit>   # dry-run shows the exact body: type, TIF, collar
node cli/dist/index.js history --days 3            # what actually executed, with timestamps (the evidence rule)
```

**Diagnostic procedure for "this price/fill looks wrong":** (1) **session** — is this market
even open for this asset class right now? (options pre-market = no quote, not a bug); (2)
**spread** — is the "loss" just mark-vs-natural on a wide market? compute it in dollars; (3)
**halt/stale quote** — last trade timestamp vs now; collar-sanity logic; (4) **min-tick** — a
400 on a low limit is usually tick granularity; (5) **non-standard contract** — check the
deliverable after any split/special dividend; (6) and always: order history is the only proof
of execution (failure mode #20).

## Deep dives

- `knowledge/accounts.md` — buying-power family, T+1/good-faith, overnight BP.
- `knowledge/execution-safety.md` — min-tick, 429/ref_id, dead-quote hard-fail, the evidence rule.
- `knowledge/multi-leg.md` — natural/mid pricing rules per leg side.
- `docs/error-code-reference-2026-06-11.md` — every API error → meaning → fix.

## Sources

- [Investopedia — Order types (market, limit, stop)](https://www.investopedia.com/ask/answers/100314/whats-difference-between-market-order-and-limit-order.asp)
- [Robinhood — Extended-hours trading](https://robinhood.com/us/en/support/articles/extendedhours-trading/) · [Robinhood — 24 Hour Market](https://robinhood.com/us/en/support/articles/24hour-market/) (sessions, limit-only, Blue Ocean ATS)
- [Robinhood — Options trading hours](https://robinhood.com/us/en/support/articles/options-trading-hours/) (equity options 9:30–4:00, index/ETF exceptions)
- [Cboe — SPX options](https://www.cboe.com/tradable-products/sp-500/spx-options/) (4:15 close, global trading hours)
- [Investor.gov — Stock trading halts & wash sales glossary](https://www.investor.gov/introduction-investing/investing-basics/glossary) · LULD/circuit-breaker basics
- [OCC — Contract adjustments](https://www.theocc.com/clearance-and-settlement/contract-adjustments) (splits, non-standard deliverables)
- [DTCC — T+1 resources](https://www.dtcc.com/ust1) (settlement cycle since 2024-05-28)

<!-- made with love by Zayd Khan / cold @ www.zayd.wtf -->
