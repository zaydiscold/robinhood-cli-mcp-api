# Greeks — operational math for an agent

> **When to load this:** any options read or plan that should report exposure — net Greeks on a
> position, scenario P&L ("what if the stock drops 1%?"), or sanity-checking a broker quote
> against Black-Scholes. Greeks are local sensitivities, not predictions: report the current net
> posture and the likely failure mode, never a promised P&L.

## Per-leg signed aggregation (the core formula)

Treat every multi-leg position as a portfolio of signed legs. Long legs add exposure; short legs
subtract it. Multiply by `ratio_quantity`, contract count, and the 100-share multiplier:

```
signed_leg = +1 for buy/long, -1 for sell/short
contract_multiplier = 100

net_delta = sum(signed_leg * delta * ratio_quantity * contracts * 100)
net_gamma = sum(signed_leg * gamma * ratio_quantity * contracts * 100)
net_theta = sum(signed_leg * theta * ratio_quantity * contracts * 100)
net_vega  = sum(signed_leg * vega  * ratio_quantity * contracts * 100)
net_rho   = sum(signed_leg * rho   * ratio_quantity * contracts * 100)
```

Prefer Robinhood's live Greeks (`marketdata/options/?ids=...`, surfaced by `options positions`,
`options inspect`, and `strategy-quote`) over model values; use the model only to check sign and
magnitude.

## Interpretation

| Greek | Operational meaning | Long option | Short option |
|---|---|---|---|
| Delta | $ exposure per $1 underlying move; net_delta ≈ share-equivalent | calls +, puts − | opposite of the sold contract |
| Gamma | how fast delta changes; high near ATM/expiry | +; benefits from movement | −; losses accelerate against the short |
| Theta | time decay per day | −; pays decay | +; collects decay |
| Vega | IV sensitivity per vol point | +; IV expansion helps | −; IV crush helps |
| Rho | rate sensitivity | small for short-dated retail | small but reportable |

Recurring trade-off: **long premium = long gamma/vega, short theta; short premium = short
gamma/vega, long theta.** The gamma–theta identity (delta-hedged, r≈q≈0):
`theta ≈ −0.5 × sigma² × S² × gamma` — you collect theta exactly in proportion to the gamma risk
you are short.

## Scenario math (first-order Taylor, dollars)

```
dS = modeled underlying move in dollars
dV = modeled IV move in vol points (e.g. +0.05 for +5 points)
dt = modeled calendar days (usually +1)

approx_pnl = net_delta*dS + 0.5*net_gamma*dS^2 + net_vega*dV + net_theta*dt
```

Standard scenario rows for any dry-run summary: spot ±1%, IV ±5 vol points, 1 day of theta,
breakevens, max-loss boundary. Answer in **dollars** — a −9% move on a $6 lot is noise; a −5%
move on a $1,600 call is the story.

## Unit-labeling traps (the silent error source)

Broker feeds may already report **theta per day** and **vega per vol point**; Black-Scholes
formulas typically produce **theta per year** and **vega per 1.00 volatility unit**. Normalize
before aggregating, and label units in every Greek summary:

```
per_contract_delta_dollars = delta * 100
per_contract_gamma_dollars = gamma * 100
per_vol_point_vega         = vega / 100
per_day_theta              = theta / 365
per_rate_point_rho         = rho / 100
```

If a feed omits a Greek, report it as missing — do not invent precision.

## Black-Scholes sanity baseline (check sign/scale, never settle with it)

```
d1 = (ln(S / K) + (r - q + sigma^2 / 2) * T) / (sigma * sqrt(T))
d2 = d1 - sigma * sqrt(T)

call_price = S * exp(-qT) * N(d1) - K * exp(-rT) * N(d2)
put_price  = K * exp(-rT) * N(-d2) - S * exp(-qT) * N(-d1)

call_delta = exp(-qT) * N(d1)
put_delta  = exp(-qT) * (N(d1) - 1)
gamma      = exp(-qT) * phi(d1) / (S * sigma * sqrt(T))
vega       = S * exp(-qT) * phi(d1) * sqrt(T)
call_rho   = K * T * exp(-rT) * N(d2)
put_rho    = -K * T * exp(-rT) * N(-d2)

call_theta = -S*exp(-qT)*phi(d1)*sigma/(2*sqrt(T)) - r*K*exp(-rT)*N(d2) + q*S*exp(-qT)*N(d1)
put_theta  = -S*exp(-qT)*phi(d1)*sigma/(2*sqrt(T)) + r*K*exp(-rT)*N(-d2) - q*S*exp(-qT)*N(-d1)
```

Caveats that matter operationally:

- **US equity options are American** — early exercise (dividends, deep ITM) breaks the European
  model; keep exercise/assignment flags separate from model Greeks. Only the index options
  (SPX/XSP/NDX/RUT/VIX) are European.
- **Delta is not assignment probability.** The risk-neutral ITM probability of a short put is
  `N(−d2)`, and `N(−d1) < N(−d2)` — displayed |delta| systematically **understates** it, with the
  gap growing with `sigma*sqrt(T)`. Report `N(−d2)` from the chain's IV when assignment odds
  matter; flag |delta| as a lower-bound shorthand.
- Greeks drift: delta/gamma move with spot, theta accelerates into expiry, vega shifts with the
  IV term structure. A net-Greek snapshot is a *now* number.

## Advanced watchpoints (report only if the feed provides them)

| Metric | Use |
|---|---|
| Charm | delta drift over time; 0DTE / near-expiry short premium |
| Vanna | delta change from IV moves; earnings / IV-crush windows |
| Vomma/volga | vega convexity; long-vol structures |
| Speed/color | gamma drift; fast expirations or large size |

## Aggression gating (structure, not vibes)

Compute aggression from structure: undefined loss, naked short calls, net short gamma/vega,
assignment sensitivity, near-expiration/0DTE, wide spreads, margin dependence score **up**;
defined risk, verified collateral/coverage, closing-only score **down**. The full
`risk_score` formula and gate labels live in the research doc below; include the score inputs in
dry-run output so the operator sees why a strategy is gated. Defined-risk ≠ suitable — size,
account type, and collateral can still make it wrong for *this* account.

## Deep dives

- `docs/options-greeks-strategy-research-2026-06-02.md` — full taxonomy, payoff checks, risk-score formula, dry-run schema, reject/warn states.
- `docs/options-quantitative-playbook-2026-06-03.md` — the operational checklist (`reviewContract`).
- `docs/strategy-deep-dive-the-wheel-2026-06-04.md` Appendix A — N(d1)/N(d2) derivations, gamma–theta identity, VRP.
- `knowledge/multi-leg.md` — where these numbers land in a dry-run summary.
