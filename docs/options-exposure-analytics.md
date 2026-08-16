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

| Field                            | Formula                                         | Meaning                                                                       |
| -------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `intrinsicValuePerShare`         | call: `max(S-K, 0)`; put: `max(K-S, 0)`         | Exercise value now                                                            |
| `extrinsicValuePerShare`         | `P - intrinsic`                                 | Time + volatility + rate value still embedded in the mark                     |
| `intrinsicPctOfPremium`          | `intrinsic / P`                                 | How share-like the current premium is                                         |
| `extrinsicPctOfPremium`          | `extrinsic / P`                                 | How much of the mark can decay to zero even without an adverse intrinsic move |
| `positionValueUsd`               | `P × 100 × N`                                   | Current marked premium value                                                  |
| `deltaShares`                    | `Δ × 100 × N`                                   | Share-equivalent local directional exposure                                   |
| `deltaDollars`                   | `Δ × 100 × N × S`                               | Dollar-equivalent local directional exposure                                  |
| `elasticity`                     | `deltaDollars / abs(positionValueUsd)`          | Approximate option % move for a 1% underlying move, locally                   |
| `absoluteElasticity`             | `abs(elasticity)`                               | Direction-agnostic local effective leverage                                   |
| `premiumPerDeltaDollar`          | `abs(positionValueUsd) / abs(deltaDollars)`     | Premium capital tied up per $1 of local delta exposure                        |
| `extrinsicPerDeltaDollar`        | `abs(extrinsicValueUsd) / abs(deltaDollars)`    | Decayable premium paid per $1 of local delta exposure                         |
| `markBreakEvenAtExpiration`      | call: `K+P`; put: `K-P`                         | Expiration break-even if entering at the current mark                         |
| `costBasisBreakEvenAtExpiration` | call: `K+entry premium`; put: `K-entry premium` | Expiration break-even from the actual average opening premium, when available |
| `expectedMovePctToExpiration`    | `IV × sqrt(DTE/365) × 100`                      | One-standard-deviation magnitude approximation implied by current IV          |
| `breakEvenToExpectedMoveRatio`   | `abs(break-even move %) / expected move %`      | Expiration hurdle expressed in current implied-move units                     |
| `thetaUsdPerDay`                 | `Θ × 100 × N`                                   | Model-implied one-day theta change if other inputs stay fixed                 |
| `thetaPctOfPremiumPerDay`        | `thetaUsdPerDay / abs(positionValueUsd)`        | Theta burn relative to remaining marked premium                               |
| `gammaPnlForOnePctMoveUsd`       | `0.5 × Γ × (0.01S)^2 × 100 × N`                 | Gamma-only convexity contribution for a hypothetical 1% spot move             |
| `gammaToThetaOnePctMoveRatio`    | `abs(gamma 1% P&L) / abs(theta/day)`            | One-percent-move convexity relative to one modeled day of theta                |

## The important distinction

**Elasticity is local sensitivity, not guaranteed leverage.** An elasticity of `12x` means the current delta implies roughly a 12% option-price move for a 1% underlying move _at this instant_, if delta, IV, time, rates, and spreads do not change. OTM options can show enormous elasticity because their premium denominator is tiny while their absolute `deltaDollars` remains small. Gamma changes delta; IV can overwhelm the delta move; theta keeps running; wide or stale marks can make every ratio misleading.

For deep-ITM calls, intrinsic value dominates, delta approaches `1`, and elasticity usually falls toward `S / option price`. That is why a deep-ITM call can behave more linearly and share-like while still giving modest capital leverage. Rolling up and out typically sells some accumulated intrinsic/delta and buys more extrinsic/time: it can restore convexity, but it also raises break-even and reintroduces decay.

`extrinsicPerDeltaDollar` separates two contracts that have similar elasticity but very different quality as stock substitutes. Lower values mean less decayable premium is supporting each local dollar of directional exposure. This does **not** make the contract cheap in valuation terms: rates, dividends, borrow, IV skew, exercise style, and execution still matter.

`breakEvenToExpectedMoveRatio` is a hurdle gauge, not a probability or alpha score. `1.0x` means the current-mark expiration break-even is approximately one current-IV expected move away. The approximation assumes IV stays meaningful over the horizon and uses calendar-time square-root scaling; jumps, skew, drift, dividends, rates, changing IV, and early exits all break the simplification.

`gammaToThetaOnePctMoveRatio` asks a narrow question: how much **second-order** gain would a hypothetical 1% move add relative to one modeled day of theta? It excludes the much larger first-order delta P&L and says nothing about direction or move probability. Use it to compare convexity rent, never as a standalone buy signal.

## Read order

1. **Quote quality:** bid, ask, spread, update timestamp, volume/open interest.
2. **Absolute exposure:** `deltaShares` and `deltaDollars`.
3. **Premium composition:** intrinsic vs extrinsic dollars and percentages.
4. **Local leverage:** elasticity, premium-per-delta-dollar, and extrinsic-per-delta-dollar.
5. **Time risk:** theta dollars/day, theta %/day, and days to expiration.
6. **Expiration hurdle:** current-mark/cost-basis break-evens and break-even versus expected move.
7. **Convexity rent:** gamma P&L for a 1% move versus daily theta.
8. **Then** IV/vega, event risk, scenario P&L, and the full payoff.

Never rank contracts by elasticity alone. A nearly worthless OTM contract can have spectacular elasticity and almost no useful probability-weighted exposure.

## Where a real edge could exist

The chain does not reveal alpha by itself. A potentially lucrative angle exists only when a view about **magnitude, direction, timing, or volatility** is better than what the option price already implies—and survives the spread and theta.

### 1. Intrinsic-backed stock replacement

Look for high delta, high intrinsic percentage, low extrinsic-per-delta-dollar, low theta percentage, and executable spreads. This creates more linear exposure with less premium capital than shares. The tradeoff is finite expiry, no dividend ownership, rate/forward effects, and possible loss of the entire premium. Elasticity often looks less exciting precisely because the position is higher quality and more share-like.

### 2. Catalyst convexity

OTM options can make sense when a dated catalyst can produce a move larger/faster than the market-implied distribution. Require a written catalyst date and directional thesis; compare break-even to expected move; inspect IV and likely post-event IV crush; then include spread cost. High elasticity without that event-specific disagreement is usually a cheap-looking lottery ticket.

### 3. Roll audit instead of automatic roll-up

For the old and proposed contracts, compare:

- delta dollars retained or sold
- intrinsic dollars surrendered
- new extrinsic dollars purchased
- theta %/day before and after
- expiration break-even and break-even/expected-move ratio
- spread cost on **both** legs
- gamma/theta ratio before and after

Rolling up and out is not merely “taking profit while staying bullish.” It converts accumulated share-like exposure back into rented convexity. That can be intentional, but the CLI should make the conversion explicit.

### 4. Relative-value screen, not a trade signal

Compare contracts on the same underlying and catalyst window. A contract with slightly lower elasticity may dominate if it has materially higher delta, less extrinsic per delta-dollar, a tighter spread, and a break-even inside fewer implied moves. The result is a shortlist for scenario analysis—not an order recommendation.

## Official educational grounding

- OIC explains delta as the approximate option-price change for a one-point underlying move, all else equal, and notes that delta changes with moneyness, time, and volatility: https://www.optionseducation.org/referencelibrary/faq/option-price-behavior
- OIC describes deep-ITM options as having larger delta: https://www.optionseducation.org/advancedconcepts/delta
- OIC's Rule of 16 material grounds square-root-of-time conversion of annualized IV into an expected daily move: https://www.optionseducation.org/news/understanding-the-rule-of-16-in-plain-terms
- OIC separates intrinsic and time value and warns that exercising a call requires paying cash for the shares: https://www.optionseducation.org/referencelibrary/faq/options-exercise

## Every-print diagnostics

Every analytics payload now includes `diagnostics.favorable`, `diagnostics.unfavorable`, and `diagnostics.notEvaluated`; the human `options positions` table prints all three **plus the raw DTE, IV, gamma, vega, spread %, open interest, volume, theta %/day, break-even move, and warnings**. A high elasticity number can therefore never appear alone without the facts that make it fragile.

Current deterministic flags:

- favorable: intrinsic backing present; delta at least `0.70`; absolute theta burn at most `0.5%` of premium/day; or local elasticity at least `3x`
- unfavorable: no intrinsic backing; delta below `0.35`; theta burn at least `1%` of premium/day; expiration break-even move at least `10%`; expired contract or 14 calendar days or fewer; spread at least `10%` of mark; open interest below `100`; volume below `10`; or high elasticity paired with at least `75%` extrinsic premium
- not evaluated: each missing DTE, theta, spread, IV, gamma, vega, open-interest, or volume input is named explicitly instead of silently disappearing

These thresholds are screeners, not trade rules. The raw values remain in the same payload so operators can audit why each flag fired.

## Data-quality behavior

Missing/nonpositive spot, mark, or delta produces `NaN` fields plus explicit warnings such as `spot_unavailable`, `option_price_unavailable`, and `delta_unavailable`. A materially negative extrinsic value raises `negative_extrinsic_quote_violation`, which usually means stale or crossed inputs rather than free money.
