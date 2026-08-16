# Option exposure analytics

`options positions`, `options snapshot`, `robinhood_options_holdings`, and `robinhood_options_inspect` expose the same local first-order diagnostics for each contract. They are live-read analytics, not forecasts or order recommendations.

## Fields and formulas

Let:

- `S` = underlying spot
- `K` = strike
- `P` = current option mark per share
- `Δ` = option delta
- `Θ` = option theta per share per day
- `N` = contracts
- multiplier = 100 shares per standard equity-option contract

| Field | Formula | Meaning |
|---|---|---|
| `intrinsicValuePerShare` | call: `max(S-K, 0)`; put: `max(K-S, 0)` | Exercise value now |
| `extrinsicValuePerShare` | `P - intrinsic` | Time + volatility + rate value still embedded in the mark |
| `intrinsicPctOfPremium` | `intrinsic / P` | How share-like the current premium is |
| `extrinsicPctOfPremium` | `extrinsic / P` | How much of the mark can decay to zero even without an adverse intrinsic move |
| `positionValueUsd` | `P × 100 × N` | Current marked premium value |
| `deltaShares` | `Δ × 100 × N` | Share-equivalent local directional exposure |
| `deltaDollars` | `Δ × 100 × N × S` | Dollar-equivalent local directional exposure |
| `elasticity` | `deltaDollars / abs(positionValueUsd)` | Approximate option % move for a 1% underlying move, locally |
| `absoluteElasticity` | `abs(elasticity)` | Direction-agnostic local effective leverage |
| `premiumPerDeltaDollar` | `abs(positionValueUsd) / abs(deltaDollars)` | Premium capital tied up per $1 of local delta exposure |
| `markBreakEvenAtExpiration` | call: `K+P`; put: `K-P` | Expiration break-even if entering at the current mark |
| `costBasisBreakEvenAtExpiration` | call: `K+entry premium`; put: `K-entry premium` | Expiration break-even from the actual average opening premium, when available |
| `thetaUsdPerDay` | `Θ × 100 × N` | Model-implied one-day theta change if other inputs stay fixed |
| `thetaPctOfPremiumPerDay` | `thetaUsdPerDay / abs(positionValueUsd)` | Theta burn relative to remaining marked premium |

## The important distinction

**Elasticity is local sensitivity, not guaranteed leverage.** An elasticity of `12x` means the current delta implies roughly a 12% option-price move for a 1% underlying move *at this instant*, if delta, IV, time, rates, and spreads do not change. OTM options can show enormous elasticity because their premium denominator is tiny while their absolute `deltaDollars` remains small. Gamma changes delta; IV can overwhelm the delta move; theta keeps running; wide or stale marks can make every ratio misleading.

For deep-ITM calls, intrinsic value dominates, delta approaches `1`, and elasticity usually falls toward `S / option price`. That is why a deep-ITM call can behave more linearly and share-like while still giving modest capital leverage. Rolling up and out typically sells some accumulated intrinsic/delta and buys more extrinsic/time: it can restore convexity, but it also raises break-even and reintroduces decay.

## Read order

1. **Quote quality:** bid, ask, spread, update timestamp, volume/open interest.
2. **Absolute exposure:** `deltaShares` and `deltaDollars`.
3. **Premium composition:** intrinsic vs extrinsic dollars and percentages.
4. **Local leverage:** elasticity and premium-per-delta-dollar.
5. **Time risk:** theta dollars/day, theta %/day, and days to expiration.
6. **Expiration hurdle:** current-mark and cost-basis break-evens.
7. **Then** gamma, IV/vega, event risk, and the full payoff.

Never rank contracts by elasticity alone. A nearly worthless OTM contract can have spectacular elasticity and almost no useful probability-weighted exposure.

## Data-quality behavior

Missing/nonpositive spot, mark, or delta produces `NaN` fields plus explicit warnings such as `spot_unavailable`, `option_price_unavailable`, and `delta_unavailable`. A materially negative extrinsic value raises `negative_extrinsic_quote_violation`, which usually means stale or crossed inputs rather than free money.
