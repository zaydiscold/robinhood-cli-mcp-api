# Position building — getting from here to the strategy you want to run

> **When to load this:** the user wants to run a strategy they don't yet have the resources for —
> "I want to wheel X but only have 40 shares," "how do I get to a covered call," "I can't afford
> 100 shares of NVDA," "build me into this position." This module maps partial resources onto
> the strategy's floor and emits the path. Descriptive, not prescriptive — pace and sizing are
> the operator's call. The Wheel itself lives in `knowledge/wheel.md`.

## Every strategy has a resource floor — compute the gap first

| Target strategy | Floor (per contract) | The gap math |
|---|---|---|
| Covered call | **100 shares, same account** (whole shares — 40 shares covers nothing) | `(100 − shares) × price` = dollars to go |
| Cash-secured put | `strike × 100` **settled** cash | collateral $ vs `buying-power` |
| PMCC (poor man's covered call) | one deep-ITM LEAPS (≈ delta 0.70–0.85) | LEAPS ask × 100 — usually 25–35% of 100 shares' cost |
| Vertical/defined-risk spread | width − credit (credit) or debit (debit) × 100 | smallest floor of all |
| The full Wheel | either the CSP floor or the CC floor | whichever side you enter from |

State the gap in dollars before discussing paths. "You hold 40 sh of XYZ at $50 — the covered
call floor is 60 more shares ≈ **$3,000**" is the sentence that starts the plan.

## Path 1 — accumulate to 100 shares

- **Fractional dollar-notional buys** (`buy -s SYM -a N -m 25`): any cadence, any size, market
  orders; only for `fractional_tradability: tradable` names (the engine checks). Fractional
  remainders count once they sum to whole shares — coverage is whole-share math.
- **Whole-share limit buys** (`buy -s SYM -a N -q 5 -p <limit>`): price control; the only path
  for OTC names (engine auto-limits at the ask, rejects dollar orders).
- **Recurring schedule** — the autopilot: `recurring create` (weekly/biweekly/monthly, proven
  write). Cycles to goal = gap dollars ÷ amount per cycle. A $3,000 gap at $150/week ≈ 20 weeks.
- While accumulating, the position is just long stock — no income yet. That opportunity cost is
  exactly what Path 2 and 3 attack.

## Path 2 — CSP entry: get paid to wait, assignment IS the goal

In acquisition mode the cash-secured put inverts the usual fear: you **want** the shares.

- Sell a put at the strike you'd happily pay. Collateral = `strike × 100` settled cash. If
  assigned: shares land at an **effective basis of `strike − credit`** — cheaper than a limit
  buy at the same level. If not assigned: keep the credit, resell.
- **Delta is the acquisition dial:** ~0.30 delta ≈ roughly 30% assignment odds; push the strike
  closer to the money (higher delta) when acquiring is the priority, lower when income is.
- The honest tradeoff vs a plain limit order at the strike: the CSP pays you the credit either
  way, but if the stock **runs without dipping**, you never get the shares — opportunity cost
  in a rip. A limit order has the same miss, minus the credit.
- One CSP = 100 shares per assignment. Can't fund the full collateral? That's Path 3 or Path 1.
- Account gates: cash account → collateral must be **settled**; Roth → fully cash-secured only;
  margin → check `cash_held_for_options_collateral` (`knowledge/accounts.md`).

## Path 3 — PMCC: the capital-light wheel alternative

A **poor man's covered call** = deep-ITM long-dated LEAPS standing in for the 100 shares, with
short calls sold against it (a diagonal spread). Community-cited construction rules:

- **LEAPS leg:** delta ≈ **0.70–0.85**, 12+ months out (12–18 is the cited sweet spot). High
  delta = stock-like movement with little extrinsic to bleed. Typically 25–35% of the capital
  of share ownership.
- **Short leg:** delta ≈ **0.20–0.30**, 30–45 DTE — same dial as a regular covered call.
- **Sanity check before entry:** net debit ≤ ~75% of the width between the strikes — otherwise
  the structure can't pay for itself even if called away at max.
- **Maintenance:** roll the LEAPS when its delta decays toward 0.70 or under ~6 months remain;
  never let both legs expire near each other.
- **What's different from a real CC:** no dividends; the LEAPS pays theta; an early-assigned
  short call can't be satisfied by delivering shares you don't own — the response is closing or
  exercising the spread, and ITM short calls into an ex-date are the assignment tripwire.
  Rolling the LEAPS is a taxable close (`knowledge/tax.md`).

## Laddering entries

Splitting intended size into tranches — spaced **limit prices** (e.g., thirds at market, −5%,
−10%), spaced **CSP strikes**, or spaced **expirations** — trades best-case entry for variance
reduction and diversifies assignment timing. A recurring schedule is the simplest ladder (time-
based). Surface it as a structure choice, not a mandate.

## When the account class blocks the plan

- **Cash account:** CSP collateral must be settled (T+1 after any sale); same-day roll = good-
  faith violation → staged kosher roll (`knowledge/rolling.md`); no margin to bridge a gap.
- **Roth IRA:** CC/CSP/defined-risk fine; PMCC is defined-risk but needs the account's options
  entitlement for spreads — verify before promising the path; no margin ever; remember losses
  in the IRA are tax-dead (`knowledge/tax-loss-harvesting.md`).
- **Margin:** all paths open; GTC option opens still gate on **overnight** buying power.

When blocked, **say so and reroute**: "this Roth can't run that structure; the available paths
here are X and Y."

## APPLY-IT — read the gap, pick the path, dry-run the leg

```bash
# 1. Where am I now? (shares, cash, account class)
node cli/dist/index.js accounts --json                      # class gates the path menu
node cli/dist/index.js positions --account <N> --json       # current shares of the target
node cli/dist/index.js buying-power --account <N>           # settled cash / overnight BP / options collateral

# 2. The strategy-stage oracle (works pre-position too — discussion mode)
node cli/dist/index.js wheel <SYM> --account <N>            # stage + the literal next-leg dry-run command
#    sub-100-shares → "accumulate or fresh CSP" is exactly this module's fork

# 3a. Accumulation path — gap math, then the schedule
node cli/dist/index.js quote <SYM> --json                   # gap $ = (100 − shares) × last
node cli/dist/index.js buy -s <SYM> -a <N> -m <USD>         # fractional tranche (dry-run default)
node cli/dist/index.js recurring create --account <N> --symbol <SYM> --amount <USD> --frequency weekly  # autopilot (double-gated)

# 3b. CSP-acquisition path — enumerate, then dry-run quote
node cli/dist/index.js options expirations <SYM> --json
node cli/dist/index.js options enumerate <SYM> --expiration <D> --type put
node cli/dist/index.js options strategy-quote cash-secured-short-put \
  --account <N> --symbol <SYM> --expiration <D> --leg short_put=<K> --pricing-mode safe-sell-probe --json

# 3c. PMCC path — model the diagonal with per-leg expirations
node cli/dist/index.js options enumerate <SYM> --expiration <FAR_D> --type call   # LEAPS candidates (delta 0.70–0.85)
node cli/dist/index.js options strategy-quote call-debit-spread \
  --account <N> --symbol <SYM> --expiration <NEAR_D> \
  --leg long_call=<LEAPS_K> --leg short_call=<SHORT_K> \
  --param long_call_expiration=<FAR_D> --param short_call_expiration=<NEAR_D> \
  --pricing-mode mid --json                                  # check: net debit ≤ ~75% of width
```

**Decision procedure:** (1) read shares + settled cash + class; (2) if shares ≥ 100 → it's a
wheel/CC question, hand off to `wheel`; (3) if cash ≥ strike×100 → CSP acquisition is live —
quote it at the strike the user would pay; (4) if neither, price the PMCC floor (LEAPS ask ×
100) against buying power and the account's entitlement; (5) otherwise accumulation — emit the
gap in dollars, the cycles-to-goal at the proposed cadence, and the `recurring create` dry-run;
(6) any send: both gates, echo contract, order-history evidence, log the THREAD ("building to
100 sh for CC; leg 0: accumulation") in `trading-log.md` so the next session knows the campaign.

## Deep dives

- `knowledge/wheel.md` — the loop this usually builds toward; stage classifier; leg commands.
- `knowledge/rolling.md` — managing the short legs once they exist.
- `knowledge/accounts.md` — buying-power family, settled cash, class gating.
- `docs/options-strategies-knowledge-base-2026-06-03.md` — PMCC in the full strategy menu.
- `docs/strategy-deep-dive-the-wheel-2026-06-04.md` — CSP-as-acquisition math (VRP appendix).

## Sources

- [Option Alpha — Poor Man's Covered Call](https://optionalpha.com/learn/poor-mans-covered-call) (LEAPS/short-leg delta construction)
- [TradingBlock — PMCC visual guide](https://www.tradingblock.com/strategies/poor-mans-covered-call-pmcc)
- [Days to Expiry — PMCC setup guide](https://www.daystoexpiry.com/blog/poor-mans-covered-call) (≤75%-of-width debit check, roll triggers)
- [Investopedia — Cash-Secured Put](https://www.investopedia.com/cash-secured-put-5248055) (get-paid-to-wait mechanics)
- [Investopedia — Dollar-Cost Averaging](https://www.investopedia.com/terms/d/dollarcostaveraging.asp) (time-laddered accumulation)

<!-- made with love by Zayd Khan / cold @ www.zayd.wtf -->
