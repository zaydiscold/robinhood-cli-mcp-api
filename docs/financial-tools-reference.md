# Financial Tools Reference

Six new financial-analysis tools added 2026-06-18. All math is done in-engine — agents and
callers must not hand-compute totals, Greeks, or projections. The engine lives in
`cli/src/lib.ts`; the CLI renders it; the MCP returns it as JSON. Same alignment invariant
as every other `compute*` function in the codebase.

---

## 1. Income (`income` / `robinhood_income`)

**Purpose:** Combined income engine — dividends + option premium net of debits.

**CLI:**
```
robinhood-cli income --account <N> --year 2026 --json
```

**MCP:** `robinhood_income`

**Inputs:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `account_number` | string | all owned | Scope to one account |
| `year` | int | current year | Calendar year to focus on |

**Outputs:**
| Field | Description |
|---|---|
| `monthlyBreakdown[]` | Per-month breakdown: `dividendsUsd`, `optionPremiumUsd`, `totalUsd` |
| `ttmTotalUsd` | Trailing 12-month total income (dividends + premium) |
| `monthlyAverageUsd` | TTM total ÷ 12 |
| `projectedAnnualRunRateUsd` | Monthly average × 12 |
| `dividendsTtmUsd` | TTM dividends component |
| `optionPremiumTtmUsd` | TTM option premium component |

**Math:**
- Dividends: re-uses the existing `computeDividends` engine (all-time/YTD/last-12-mo
  totals, per-symbol cadence, projection from CURRENT holdings only).
- Option premium: fetches filled option orders (`/options/orders/?state=filled`),
  computes net credits from sell-to-open fills minus debits from buy-to-close fills.
  Each execution: `price × quantity × 100` (contract multiplier), signed positive for
  credits (sell-to-open), negative for debits (buy-to-close).
- Monthly breakdown: marries dividend `byMonth` with premium `byMonth` on the same
  YYYY-MM calendar key, sorted chronologically.

---

## 2. Risk (`risk` / `robinhood_risk`)

**Purpose:** Portfolio risk scanner — max loss, assignment exposure, undercovered legs,
margin-call distance, and concentration warnings.

**CLI:**
```
robinhood-cli risk --account <N> --json
```

**MCP:** `robinhood_risk`

**Inputs:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `account_number` | string | all owned | Scope to one account |

**Outputs:**
| Field | Description |
|---|---|
| `totalEquityUsd` | Sum of all account equities |
| `totalBorrowedUsd` | Sum of all margin borrowings |
| `marginCallDistancePct` | `totalBorrowed / totalEquity × 100` (null if no equity) |
| `positions[]` | Per-position risk profile |
| `concentrationWarnings[]` | Symbols with >20% portfolio weight |

**Position-level fields:**
| Field | Description |
|---|---|
| `kind` | `equity` or `option` |
| `symbol` | Underlying ticker |
| `side` | `long` or `short` |
| `marketValueUsd` | Current mark value |
| `maxLossUsd` | Debit paid for longs; `null` for undefined-risk naked shorts |
| `itmExpirationRisk` | True if ITM short option |
| `undercoveredShortLegs` | Uncovered shares for short calls |

**Math:**
- Equity max loss = full market value (can go to zero).
- Option long max loss = total debit paid (average_open_price × contracts × 100).
- Option short max loss = `null` (undefined) — naked short risk is theoretically unlimited.
- ITM detection: `classifyMoneyness(strike, spot, type)` — calls ITM when spot > strike,
  puts ITM when strike > spot.
- Undercovered short calls: `contracts × 100 − shares held`, positive = uncovered shares.
- Concentration: `symbol_value / total_portfolio_value > 0.20`.

---

## 3. What-If (`whatif` / `robinhood_whatif`)

**Purpose:** Greeks scenario calculator — estimate P&L from changes in spot, IV, and time.

**CLI:**
```
robinhood-cli whatif --account <N> --spot-pct +5 --iv-pct +10 --days 7 --json
```

**MCP:** `robinhood_whatif`

**Inputs:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `account_number` | string | all owned | Scope to one account |
| `spot_pct` | number | 0 | Spot change in % (e.g. +5 or -3) |
| `iv_pct` | number | 0 | IV change in % points (e.g. +10 or -5) |
| `days` | int | 0 | Days of theta decay |
| `rate_change_pct` | number | 0 | Rate change in % points (rho sensitivity) |

**Outputs:**
| Field | Description |
|---|---|
| `scenario` | `{ spotChangePct, ivChangePct, daysPassed, rateChangePct }` |
| `totalEstimatedPnlUsd` | Portfolio-wide estimated P&L |
| `totalRho` | Portfolio-wide net rho |
| `greekDecomposition` | `{ deltaUsd, gammaUsd, thetaUsd, vegaUsd, rhoUsd }` — per-Greek contribution |
| `perPosition[]` | Per-position: `estimatedPnlUsd`, `marketValueUsd`, `netDelta`, `netGamma`, `netTheta`, `netVega`, `netRho` |

**Math (Taylor approximation):**
```
ΔP ≈ delta × ΔS + ½ × gamma × ΔS² + theta × Δt + vega × Δσ + rho × Δr

Where:
  ΔS = spotPct / 100          (spot change as decimal)
  Δt = days                    (theta is daily)
  Δσ = ivPct / 100             (IV change as decimal)
  Δr = rateChangePct / 100     (rate change as decimal)
```

Greeks are fetched from live `marketdata/options/?ids=` marks and signed:
- Short legs: sign = −1 (delta negative for short calls, positive for short puts per the
  mark's native sign).
- Long legs: sign = +1.
- Each Greek is multiplied by `sign × contracts × ratio_quantity × 100` (contract multiplier).

---

## 4. Calendar (`calendar` / `robinhood_calendar`)

**Purpose:** Event calendar — upcoming option expirations, ex-dividend dates, and
earnings dates.

**CLI:**
```
robinhood-cli calendar --account <N> --days 30 --json
```

**MCP:** `robinhood_calendar`

**Inputs:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `account_number` | string | all owned | Scope to one account |
| `days` | int | 30 | Look-ahead window (1–365) |

**Outputs:**
| Field | Description |
|---|---|
| `events[]` | Sorted by date: `{ date, type, symbol, detail, assignmentRisk }` |
| Event types | `expiration`, `ex-dividend`, `earnings` |

**Sources:**
- **Option expirations:** From open aggregate positions (`/options/aggregate_positions/`),
  filtered to expirations within `[today, today + days]`.
- **Ex-dividend dates:** From `/dividends/`, filtered by `ex_dividend_date` or `record_date`
  in the window.
- **Assignment-risk flag:** True when a short call expires within 5 calendar days of an
  ex-dividend date for the same underlying (dividend-capture assignment risk).
- **Earnings dates:** Not directly available via brokerage API; noted as a limitation.

---

## 5. Exposure (`exposure` / `robinhood_exposure`)

**Purpose:** Concentration & Net Greeks — portfolio weight by underlying, concentration
flags, and portfolio-wide Greek totals.

**CLI:**
```
robinhood-cli exposure --account <N> --json
```

**MCP:** `robinhood_exposure`

**Inputs:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `account_number` | string | all owned | Scope to one account |

**Outputs:**
| Field | Description |
|---|---|
| `totalEquityUsd` | Total portfolio equity |
| `concentration[]` | `{ symbol, marketValueUsd, weightPct, flag }` sorted by weight descending |
| `netGreeks` | `{ delta, gamma, theta, vega, rho }` — portfolio-wide sums |

**Math:**
- **Concentration:** Each symbol's market value (equity shares × last price + option
  positions × |mark price × 100 × contracts|) as % of total portfolio.
  Flag = `weightPct > 20`.
- **Net Greeks:** Summed across all equity (delta = 1 per share) and option positions
  (signed per leg, multiplied by contracts × ratio × 100). Equity gamma/theta/vega/rho = 0.

---

## 6. Autopilot (`autopilot` / `robinhood_autopilot`)

**Purpose:** Automated roll management — scan open short options approaching expiration
and emit dry-run roll order bodies.

**CLI:**
```
robinhood-cli autopilot --account <N> --json
```

**MCP:** `robinhood_autopilot`

**Inputs:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `account_number` | string | all owned | Scope to one account |
| `days` | int | 7 | Look-ahead window (1–30) |

**Outputs:**
| Field | Description |
|---|---|
| `candidates[]` | Roll candidates sorted by DTE ascending (most urgent first) |
| Per candidate: | `symbol`, `currentPosition`, `expiration`, `dte`, `itmBy`, `strike`, `type`, `side` |
| `rollCandidate` | `{ targetExpiration, targetStrike, estimatedNetCredit, message }` |
| `dryRunOrder` | `{ close: { action, leg }, open: { action, leg } }` — the two-leg roll plan |

**How it works:**
1. Scans all open short options (from `/options/aggregate_positions/?nonzero=true`) with
   expiration within `[today, today + days]`.
2. Fetches spot prices for each underlying via `/marketdata/quotes/`.
3. Classifies ITM/OTM: calls ITM when `spot > strike`, puts ITM when `strike > spot`.
4. Builds a roll candidate: close the expiring leg (buy-to-close) + open the same strike
   at the next nearest expiration (sell-to-open). The "better strike" rule aims for a
   net credit — same strike with more time value typically yields a credit.
5. Emits dry-run order bodies — **never places orders**. The operator must explicitly
   gate any live send with `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

**Note on estimatedNetCredit:** Currently `null` — real credit estimation requires
fetching option chains and quotes for the target expiration, which would add significant
API load. The message field carries the qualitative roll guidance.

---

## Shared Patterns

All six tools follow these invariants:

1. **Single engine** in `cli/src/lib.ts` — the CLI and MCP are thin renderers.
2. **Dependency injection** via the `deps` pattern: `getJson`, `getAll`, `now` are
   injectable for testing (golden fixtures).
3. **Account enumeration** via `listOwnedTradingAccounts(getJson, accountNumber)` —
   the transfer/accounts/ graph is the authoritative account list.
4. **Per-account degrade:** a single account's API failure downgrades to a warning;
   the engine never throws on one bad account.
5. **Read-only:** all six are read-only (`toolAnnotations(true, ...)`) — no write
   gate applies.
6. **Risk classification:** `sensitive-read` for tools exposing dollar amounts and
   position details (income, risk); `read` for scenario math and calendar (exposure,
   whatif, calendar, autopilot`.
