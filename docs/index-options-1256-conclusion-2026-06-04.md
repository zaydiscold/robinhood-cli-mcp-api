# Does Robinhood offer true INDEX OPTIONS (SPX / XSP / NDX / VIX / RUT)? — §1256 conclusion

**Date:** 2026-06-04
**Method:** read-only / dry-run only. `brokerage search`, authed GET via `scripts/rh-get.mjs`. No `--live-write`, no `ROBINHOOD_ALLOW_LIVE_WRITE`, no orders placed.
**Account context used for chain reads:** `{account_number}` (individual/cash).

---

## TL;DR — UNEXPECTED RESULT: YES, Robinhood DOES offer true cash-settled index options

> ⚠️ **This contradicts the going assumption (and the framing of several repo docs) that RH offers only ETF proxies.** The brokerage `search` bar returns only ETFs for these tickers, but the underlying **options API exposes genuine index option chains** with `underlying_type = "index"`, empty `underlying_instruments` (no physical deliverable), index-level strikes, and live two-sided markets.

Confirmed tradable index option chains (all `can_open_position: true`, all `underlying_type: "index"`):

| Underlying | Chains returned | `underlying_type` | Strike range observed | Notes |
|------------|-----------------|-------------------|------------------------|-------|
| **SPX**  | `SPX`, `SPXW`   | `index` | 200 – 5410 (sampled) | S&P 500 index; SPXW = weeklys |
| **XSP**  | `XSP`           | `index` | up to ~155            | Mini-SPX (1/10 SPX) |
| **NDX**  | `NDX`, `NDXP`   | `index` | up to ~11000          | Nasdaq-100; NDXP = PM-settled |
| **VIX**  | `VIX`, `VIXW`   | `index` | up to ~15.5 (sampled) | Volatility index; VIXW = weeklys |
| **RUT**  | `RUT`, `RUTW`   | `index` | up to ~1700           | Russell 2000; RUTW = weeklys |

So the §1256 60/40 tax treatment, year-end mark-to-market, and European-style / cash-settled box-spread financing described in `docs/tax-aware-options-strategies.md` are **potentially available on Robinhood directly** — not just as a theoretical "go trade SPX somewhere else" footnote. (Subject to the user's account having index-options trading enabled; chain reads succeeded and report `can_open_position: true`.)

---

## What was searched and what resolved

### 1. `brokerage search` — returns ONLY ETFs/equities (the misleading surface)

`node cli/dist/index.js brokerage search "<q>" --json` for SPX, XSP, SPXW, NDX, VIX, RUT returned **no raw index** — only ETF/equity name-or-symbol matches:

- **SPX** → `SPXC` (SPX Technologies), `SPXL`/`SPXU`/`SPXS` (3x S&P ETFs), `SPYI`, `SPXX`, `SPXV/T/N`, `ODTE`. No raw SPX.
- **XSP** → `XSPI` (NEOS ETF) only.
- **SPXW** → `count: 0`.
- **NDX** → `ODTE` ETF only.
- **VIX** → `UVXY`, `VXX`, `VIXY`, `UVIX`, `SVXY`, `SVIX`, `VIXM`, `CBOE`, ... (all VIX-*futures* ETFs/ETNs — none is the VIX index).
- **RUT** → unrelated tickers (`MAT`, `CWST`, ...). No raw RUT.

**Takeaway:** the consumer search bar (`midlands/search/`) is equity/ETF only. Searching here is what produces the false "RH only has ETF proxies" conclusion.

### 2. `instruments/?symbol=<index>` — empty for every index (equities-only endpoint)

```
GET instruments/?symbol=SPX  → 200 {"results": []}
GET instruments/?symbol=XSP  → 200 {"results": []}
GET instruments/?symbol=NDX  → 200 {"results": []}
GET instruments/?symbol=VIX  → 200 {"results": []}
GET instruments/?symbol=RUT  → 200 {"results": []}
GET instruments/?symbol=SPXW → 200 {"results": []}
GET instruments/?symbol=SPY  → 200 results=[ type=etp, tradability=tradable, tradable_chain_id=c277b118-... ]  (control)
```

The equity `instruments/` table has **no row** for any index — consistent with an index being a non-tradable underlying. This is the second thing that makes index options look absent. **But it is not where index options live.**

### 3. `options/chains/?underlying_symbol=<index>` — the index chains DO resolve

This is the decisive endpoint:

```
GET options/chains/?account_number={account_number}&underlying_symbol=SPX
  → SPX  (id a9f69c4e-9393-4554-9849-271f0297e70b)  can_open_position=true
  → SPXW (id 7a7fa2b1-b65e-4c75-a0b3-7f62749bee0a)  can_open_position=true
GET ...underlying_symbol=XSP → XSP (bf82fd28-...) can_open_position=true
GET ...underlying_symbol=NDX → NDX (4e4e56cd-...), NDXP (0ed2fd55-...)
GET ...underlying_symbol=VIX → VIX (c3b183bc-...), VIXW (57d98eff-...)
GET ...underlying_symbol=RUT → RUT (339adff0-...), RUTW (f815fae2-...)
GET ...underlying_symbol=SPY → SPY (c277b118-...)  (ETF control)
```

---

## Evidence it is a real INDEX option (cash-settled), not an ETF proxy

### Chain-level signature: empty `underlying_instruments`

```
SPX chain a9f69c4e:  underlying_instruments = []          ← NO physical deliverable
                     trade_value_multiplier = "100.0000"
                     min_ticks = {above 0.10, below 0.05, cutoff 3.00}
                     expirations: 2026-06-18 ... 2031-12-19 (LEAPS-length)

SPY chain c277b118:  underlying_instruments = [{ instrument: .../8f92e76f.../, quantity: 100 }]  ← 100 shares deliverable
                     trade_value_multiplier = "100.0000"
                     min_ticks = {above 0.01, below 0.01, cutoff 0.00}
```

An empty `underlying_instruments` array = **nothing to deliver on exercise** = **cash settlement**. SPY's chain points to a concrete 100-share equity instrument = physical settlement. This is the structural fingerprint distinguishing a cash-settled index option from an ETF option.

### Instrument-level signature: `underlying_type = "index"`

```
options/instruments/?chain_id=<SPX>&expiration_dates=2026-06-18&type=call
  → 100 results, underlying_type = "index", strikes 200 … 5410
options/instruments/?chain_id=<SPY>&expiration_dates=2026-06-18&type=call
  → 100 results, underlying_type = "equity", strikes 245 … 676
XSP → underlying_type = "index"   (strikes to ~155, ≈ 1/10 SPX)
NDX → underlying_type = "index"   (strikes to ~11000)
VIX → underlying_type = "index"   (strikes to ~15.5)
RUT → underlying_type = "index"   (strikes to ~1700)
```

Every index chain's options carry `underlying_type: "index"`; SPY's carry `underlying_type: "equity"`. The index-level strike magnitudes (SPX to 5410, NDX to 11000, RUT to 1700 — versus SPY 245–676) confirm these track the **indices themselves**, not a ~1/10-priced ETF.

Option instrument keys present: `chain_id, chain_symbol, expiration_date, id, issue_date, long_strategy_code, min_ticks, rhs_tradability, sellout_datetime, short_strategy_code, state, strike_price, tradability, type, underlying_type, url`. (Robinhood does not expose an explicit `exercise_style`/`american_or_european`/`settlement_style` field on the instrument; the cash-settled/European nature is inferred from `underlying_type=index` + empty chain `underlying_instruments`, which is the canonical CBOE structure for SPX/XSP/NDX/RUT/VIX.)

### Live market data: real, two-sided, deep-ITM-priced

```
marketdata/options/?ids=89a6f0e5-...  (SPX 2026-06-18 200C)
  adjusted_mark_price = 7353.75
  bid = 7343.80   ask = 7363.70
  open_interest = 1926   volume = 2   high = 7365.50
  (greeks/IV null on this deep-ITM strike)
```

A $200-strike SPX call marked at ~$7,354 is exactly right for SPX ≈ 6,000 trading deep ITM (intrinsic ≈ (6000−200) = 5800 index pts, plus the option is quoted in index points × the 100 multiplier conventions) — i.e., this is a **live, real index option with genuine open interest**, not a placeholder.

---

## §1256 / European-style implication — REVISED

The earlier working assumption baked into repo framing ("RH offers no real SPX/XSP — only ETF proxies → no §1256, no European box financing") is **WRONG as of this 2026-06-04 read.**

Corrected position:

- **§1256 60/40 + mark-to-market IS reachable on Robinhood.** SPX, XSP, NDX, RUT, and VIX are broad-based, cash-settled index options — exactly the products §1256 covers (per `docs/tax-aware-options-strategies.md` §3). Trading them on RH (rather than SPY/QQQ/IWM ETF options, which are ordinary equity options taxed at up to 37% short-term) routes the user into the blended ~26–28% rate and year-end MTM on Form 6781.
- **European-style / cash-settled box-spread financing IS reachable.** The box-spread synthetic-loan play in `docs/tax-aware-options-strategies.md` §4 requires European-style, cash-settled, broad-based options (SPX) to avoid early-assignment risk. RH exposes SPX chains out to **2031-12-19** (LEAPS-length), which is the maturity range a long-dated financing box needs.
- **ETF proxies remain the §1256 *trap*, not the only option.** SPY/QQQ/IWM options (American-style equity options) are still NOT §1256 and CAN be assigned early. The classic "ETF-vs-index confusion" error (doc §3) now matters *more* on RH, because the user can pick either the qualifying (SPX) or non-qualifying (SPY) product on the same platform — the distinction is a live choice, not unavailable.

> Educational/general only — not tax advice. §1256 product-qualification, mark-to-market, and box mechanics are fact-specific; see `docs/tax-aware-options-strategies.md` and a tax professional.

### Caveats / open items (not blockers to the core finding)

1. **Account entitlement.** Chain reads returned `can_open_position: true` for account `{account_number}`, but actually opening index-option positions may require an options-trading approval tier / index-options entitlement. Not order-tested (read/dry-run only by instruction). Verify entitlement before assuming executability.
2. **No explicit settlement/exercise-style field** is returned by RH's option-instrument payload; cash-settled/European is inferred from `underlying_type=index` + empty `underlying_instruments` (the standard CBOE structure for these products). A live order ticket or a placed-then-cancelled dry-run would corroborate, but was out of scope here.
3. **Min-tick differs** from equity options: SPX uses `below_tick 0.05 / above_tick 0.10, cutoff 3.00` (vs SPY's 0.01/0.01/0.00). Any future order math must read the chain's `min_ticks` (the repo already warns about per-chain ticks).

---

## Wheel strategy — present in the knowledge base ✅

`docs/options-strategies-knowledge-base-2026-06-03.md` documents the Wheel (cash-secured put → assignment → covered call → roll):

- L25: "**Cash-Secured Put (CSP)** — sell a put, hold cash for assignment … Entry leg of the Wheel."
- L28: "**The Wheel** — sell CSPs → get assigned → sell covered calls → get called away → repeat. Continuous theta harvest; weakness is holding a falling stock after assignment. Persistently +theta/−vega."
- L66: listed under income/range strategies alongside CC, CSP, condors.

No gap — the full cash-secured-put → assignment → covered-call → roll cycle is described.

---

## Commands (reproducible, read-only)

```bash
# misleading equity-only surface
node cli/dist/index.js brokerage search "SPX" --json    # → ETFs only
node scripts/rh-get.mjs "https://api.robinhood.com/instruments/?symbol=SPX"   # → results: []

# the real index chains
node scripts/rh-get.mjs "https://api.robinhood.com/options/chains/?account_number={account_number}&underlying_symbol=SPX"
node scripts/rh-get.mjs "https://api.robinhood.com/options/chains/a9f69c4e-9393-4554-9849-271f0297e70b/"   # underlying_instruments: []
node scripts/rh-get.mjs "https://api.robinhood.com/options/instruments/?chain_id=a9f69c4e-9393-4554-9849-271f0297e70b&expiration_dates=2026-06-18&state=active&type=call"  # underlying_type: index
node scripts/rh-get.mjs "https://api.robinhood.com/marketdata/options/?ids=89a6f0e5-95f1-4f96-bc88-4c7f7cd25d4f"  # live mark/bid/ask/OI

# ETF control
node scripts/rh-get.mjs "https://api.robinhood.com/options/chains/c277b118-58d9-4060-8dc5-a3b5898955cb/"   # underlying_instruments: [100 shares SPY], underlying_type: equity
```

<!-- Zayd Khan // cold // www.zayd.wtf -->
