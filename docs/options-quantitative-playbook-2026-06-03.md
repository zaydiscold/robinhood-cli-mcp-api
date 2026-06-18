# Options Quantitative Playbook - 2026-06-03

This is the operational playbook for Robinhood CLI/MCP agents. It is for
research, planning, and dry-run review only. It is not investment advice and it
does not authorize live trading.

## Source Refresh

Primary references checked in this pass:

- OIC Greeks overview: `https://www.optionseducation.org/advancedconcepts/understanding-options-greeks`
- OIC Black-Scholes overview: `https://www.optionseducation.org/advancedconcepts/black-scholes-formula`
- OIC strategy catalog: `https://www.optionseducation.org/strategies/all-strategies-en`
- FINRA options overview: `https://www.finra.org/investors/investing/investment-products/options`
- Robinhood Options Strategy Builder: `https://robinhood.com/us/en/support/articles/about-the-options-strategy-builder/`

Useful source-backed facts for the CLI:

- OIC frames Greeks as theoretical guideposts, not guarantees. Inputs include
  underlying price, strike, time, implied volatility, rates, and dividends.
- OIC states Black-Scholes is not the only model and that American-style equity
  options are typically priced with binomial models because early exercise matters.
- FINRA states a standard-size option contract equals 100 shares, buying premium
  caps purchaser loss at premium paid, selling premium caps profit at premium
  received, and uncovered calls have theoretically unlimited loss.
- FINRA also calls out assignment, dividend, margin, and 0DTE/expiration risk.
- Robinhood Strategy Builder exposes multi-leg width/strike selection, bid/ask,
  breakeven, max gain/loss, Greeks, quantity, and limit price. The CLI review
  contract should mirror those checks before any order body is considered.

## Agent Output Contract

Every options response should separate local sensitivity math from expiration
payoff math:

```text
intent: open | close | roll | analyze
strategy_id: from api-map/options-strategy-workflows-2026-06-02.json
risk_label: conservative | moderate | aggressive
account: explicit account number or missing
legs: side, option_type, strike, expiration, instrument_id, position_effect, ratio_quantity
pricing: natural, mid, mark, limit, debit_or_credit
payoff: max_profit, max_loss, breakevens
greeks: net_delta, net_gamma, net_theta, net_vega, net_rho, units
checks: collateral, coverage, liquidity, assignment, expiration, concentration
api_plan: lookup routes, package quote route, dry-run order body, missing params
write_gate: dry_run | needs_exact_user_approval | blocked
```

The personal CLI now emits this as `reviewContract` from:

```bash
robinhood-cli api-map options-strategy-plan <strategy-id> --json
```

For live quote-backed spread planning, prefer:

```bash
robinhood-cli options strategy-quote <strategy-id> \
  --account <ACCOUNT_NUMBER> \
  --symbol <SYMBOL> \
  --expiration <YYYY-MM-DD> \
  --leg <leg_id>=<strike> \
  --json
```

This resolves exact option instrument ids, reads `marketdata/options/`, computes
side-aware natural/mid prices, asks `marketdata/options/strategy/quotes/` with
`types=long|short`, then fills the dry-run `options/orders/` body without
sending it.

## Greek Unit Rules

Sum signed legs after normalizing units:

```text
side = +1 for buy/long, -1 for sell/short
multiplier = 100

net_delta = sum(side * delta * ratio_quantity * contracts * 100)
net_gamma = sum(side * gamma * ratio_quantity * contracts * 100)
net_theta = sum(side * theta * ratio_quantity * contracts * 100)
net_vega  = sum(side * vega  * ratio_quantity * contracts * 100)
net_rho   = sum(side * rho   * ratio_quantity * contracts * 100)
```

Then label the source units:

- Delta: dollars per $1 underlying move after contract multiplier.
- Gamma: delta drift per $1 underlying move after contract multiplier.
- Theta: dollars per day. If formula theta is yearly, divide by 365.
- Vega: dollars per one volatility point. If formula vega is per 1.00 IV unit,
  divide by 100.
- Rho: dollars per one rate point. If formula rho is per 1.00 rate unit, divide
  by 100.

Use Robinhood `marketdata/options/` values first. Use Black-Scholes only to
check sign and magnitude. Do not pretend model output is a market quote.

## Scenario Grid

When quotes and Greeks are available, include these rows:

| Scenario | Required check |
|---|---|
| Spot +1% and -1% | Directional delta/gamma sensitivity |
| IV +5 and -5 vol points | Long-vol or short-vol exposure |
| One calendar day later | Theta decay/accrual |
| At each breakeven | Payoff graph consistency |
| At max-loss boundary | Defined-risk proof or undefined-risk flag |

Small-move approximation:

```text
approx_pnl = net_delta*dS + 0.5*net_gamma*dS^2 + net_vega*dIV + net_theta*days
```

This is a local estimate only. Expiration payoff and assignment risk are separate
checks.

## Strategy Variant Map

| User phrase | Conservative/moderate path | Aggressive path | Agent rule |
|---|---|---|---|
| Sell a call | Sell-to-close, covered call, call credit spread | Naked short call | Ask which. Never infer naked exposure. |
| Sell a put | Cash-secured put, put credit spread | Naked short put | Verify cash collateral before calling it cash-secured. |
| Covered short put | Usually means cash-secured put in casual retail wording | Covered put: short stock plus short put | Show both candidates and require a choice. |
| Straddle | Long debit straddle | Short undefined-risk straddle | Ask long or short. |
| Strangle | Long debit strangle | Short undefined-risk strangle | Ask long or short. |
| Roll | Close old legs and open replacement legs | Roll into larger/naked/margin exposure | Verify `position_effect` per leg and net new risk. |

## Payoff Shortcuts

| Strategy | Required payoff check |
|---|---|
| Long call | Max loss = debit * 100; breakeven = strike + debit |
| Long put | Max loss = debit * 100; breakeven = strike - debit |
| Covered call | Verify 100 shares per short call in same account; upside capped |
| Cash-secured put | Verify cash collateral; max loss = (strike - credit) * 100 |
| Covered put | Verify existing short stock; do not confuse with cash-secured put |
| Naked short call | Max loss theoretically unlimited; exact confirmation required |
| Naked short put | Max loss = (strike - credit) * 100 if stock goes to zero; margin/collateral gate required |
| Credit spread | Max profit = credit * 100; max loss = (width - credit) * 100 |
| Debit spread | Max loss = debit * 100; max profit = (width - debit) * 100 |
| Long straddle | Max loss = debit * 100; breakevens = strike +/- debit |
| Short straddle | Max profit = credit * 100; undefined call-side risk and large put-side downside |
| Long strangle | Max loss = debit * 100; breakevens = call strike + debit and put strike - debit |
| Short strangle | Max profit = credit * 100; undefined call-side risk and large put-side downside |
| Iron condor | Max profit = credit * 100; max loss = widest wing - credit, scaled by 100 |

## Robinhood CLI/API Sequence

Use this exact sequence:

1. `robinhood-cli api-map account-context --json`
2. `robinhood-cli options expirations <SYMBOL> --json`
3. `robinhood-cli options chain <SYMBOL> --expiration <DATE> --type call|put --json`
4. Select the strategy:
   `robinhood-cli api-map options-strategies --query "<phrase>" --json`
5. Resolve and quote the strategy:
   `robinhood-cli options strategy-quote <id> --account <N> --symbol <SYMBOL> --expiration <DATE> --leg <leg_id>=<strike> --json`
6. Use `--pricing-mode safe-sell-probe` only for a dry-run control price that is far from market.
7. If exact ids are already known, build the raw dry-run body:
   `robinhood-cli api-map options-strategy-plan <id> --param key=value --json`
8. Stop unless every required field and every `reviewContract` check is satisfied.

Live execution is outside this playbook unless the user gives exact approval and
the single-switch gate is satisfied: `ROBINHOOD_ALLOW_LIVE_WRITE=1`.

<!-- Zayd Khan // cold // www.zayd.wtf -->
