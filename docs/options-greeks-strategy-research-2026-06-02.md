# Options Greeks and Strategy Research - 2026-06-02

This note is for the Robinhood CLI/MCP skill layer. It is not investment advice and it does not authorize live trading. The purpose is to make options requests machine-checkable: classify the strategy, compute the rough exposure, build a dry-run order body, and force exact confirmation before any live write.

2026-06-03 enhancement: the operational agent checklist now lives in
`docs/options-quantitative-playbook-2026-06-03.md`, and the personal CLI emits
that checklist as `reviewContract` from `api-map options-strategy-plan`.

## Sources Used

- FINRA options overview / Greeks redirect target: `https://www.finra.org/investors/investing/investment-products/options`
- Robinhood advanced options strategies: `https://robinhood.com/us/en/support/articles/advanced-options-strategies/`
- Robinhood Options Strategy Builder: `https://robinhood.com/us/en/support/articles/about-the-options-strategy-builder/`
- OCC options disclosure document landing page: `https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document`
- Robinhood-hosted OCC Characteristics and Risks PDF: `https://cdn.robinhood.com/assets/robinhood/legal/Characteristics%20and%20Risks%20of%20Standardized%20Options.pdf`
- OIC strategy catalog: `https://www.optionseducation.org/strategies/all-strategies-en`

2026-06-03 source check: FINRA redirects the older Greeks article URL to its
current options overview; OCC returned a Cloudflare challenge from curl but the
landing page remains the canonical disclosure-document source; Robinhood's
advanced-options page returned HTTP 200.

Additional 2026-06-03 source check: OIC treats Greeks as theoretical guideposts
driven by underlying price, strike, time, implied volatility, rates, and
dividends; OIC notes American-style equity options are usually modeled with
binomial methods because early exercise matters; FINRA states standard contracts
usually represent 100 shares and naked-call loss is theoretically unlimited;
Robinhood Strategy Builder exposes strategy legs, max gain/loss, breakeven,
Greeks, quantity, and limit-price surfaces in the web workflow.

How checked: Codex web search/open was used for the source pages, then these
headers were refreshed locally:

```bash
curl -L -I --max-time 20 https://www.finra.org/investors/investing/investment-products/options
curl -L -I --max-time 20 https://robinhood.com/us/en/support/articles/advanced-options-strategies/
curl -L -I --max-time 20 https://robinhood.com/us/en/support/articles/about-the-options-strategy-builder/
curl -L -I --max-time 20 https://www.optionseducation.org/advancedconcepts/understanding-options-greeks
curl -L -I --max-time 20 https://www.optionseducation.org/advancedconcepts/black-scholes-formula
curl -L -I --max-time 20 https://www.optionseducation.org/strategies/all-strategies-en
curl -L -I --max-time 20 https://cdn.robinhood.com/assets/robinhood/legal/Characteristics%20and%20Risks%20of%20Standardized%20Options.pdf
```

FINRA, Robinhood, OIC, and the Robinhood-hosted OCC PDF returned HTTP 200 in
the local refresh. The OCC landing page returned HTTP 403 to curl, so keep the
Robinhood-hosted OCC PDF as the directly fetchable disclosure copy.

## Core Greek Math

For an options portfolio, think in signed legs. Long legs add Greek exposure; short legs subtract it.

```
signed_leg = +1 for buy/long, -1 for sell/short
contract_multiplier = 100

net_delta = sum(signed_leg * delta * ratio_quantity * contracts * 100)
net_gamma = sum(signed_leg * gamma * ratio_quantity * contracts * 100)
net_theta = sum(signed_leg * theta * ratio_quantity * contracts * 100)
net_vega  = sum(signed_leg * vega  * ratio_quantity * contracts * 100)
net_rho   = sum(signed_leg * rho   * ratio_quantity * contracts * 100)
```

The Greeks are local sensitivities, not permanent truths. Delta and gamma change as spot moves; theta accelerates into expiration; vega changes with implied volatility and term structure. A planner should report the current net posture and the likely failure mode, not pretend to predict final P/L.

Aggression should be computed from structure, not vibes. Defined-risk debit buys,
sell-to-close exits, covered calls, and same-width verticals are less aggressive
than naked short calls or short straddles because the loss boundary is known before
the ticket is sent. A strategy can still be unsuitable if size, expiration, account
type, or collateral is wrong, so the CLI should separate "defined risk" from
"appropriate for this user/account."

For small scenario checks, use a local Taylor approximation:

```text
dS = modeled underlying price move in dollars
dV = modeled implied-volatility move in volatility points, e.g. +0.05 for +5 vol points
dt = modeled calendar-day move, usually +1 for tomorrow

approx_pnl =
  net_delta * dS
  + 0.5 * net_gamma * dS^2
  + net_vega * dV
  + net_theta * dt
```

Normalize first. Broker feeds may already report theta per day and vega per
volatility point. Black-Scholes formulas often produce theta per year and vega
per 1.00 volatility unit. The CLI should label units in every Greek summary.

Optional advanced watchpoints:

| Metric | Use |
|--------|-----|
| Charm | Delta drift as time passes; useful for 0DTE/near-expiration short premium |
| Vanna | Delta change from implied-volatility movement; useful around earnings or IV crush |
| Vomma/volga | Vega convexity; useful for long-volatility structures |
| Speed/color | Gamma drift; mostly relevant for fast expiration or large size |

If Robinhood does not return these, do not invent precision. Report them as
missing and keep the first-order Greeks.

## Pricing Model Baseline

Use Black-Scholes only as a baseline sanity model. Robinhood quotes and Greeks come
from live market data; the CLI should prefer broker/API values when present. The
closed-form model is still useful for checking sign, scale, and agent reasoning.

Definitions:

```text
S = underlying price
K = strike price
T = time to expiration in years
r = risk-free rate
q = dividend yield, use 0 if unknown
sigma = implied volatility
N(x) = standard normal cumulative distribution
phi(x) = standard normal density

d1 = (ln(S / K) + (r - q + sigma^2 / 2) * T) / (sigma * sqrt(T))
d2 = d1 - sigma * sqrt(T)
```

European option price baseline:

```text
call_price = S * exp(-qT) * N(d1) - K * exp(-rT) * N(d2)
put_price  = K * exp(-rT) * N(-d2) - S * exp(-qT) * N(-d1)
```

Greeks:

```text
call_delta = exp(-qT) * N(d1)
put_delta  = exp(-qT) * (N(d1) - 1)
gamma      = exp(-qT) * phi(d1) / (S * sigma * sqrt(T))
vega       = S * exp(-qT) * phi(d1) * sqrt(T)
call_rho   = K * T * exp(-rT) * N(d2)
put_rho    = -K * T * exp(-rT) * N(-d2)
```

Operational scaling:

```text
per_contract_delta_dollars = delta * 100
per_contract_gamma_dollars = gamma * 100
per_vol_point_vega         = vega / 100
per_day_theta              = theta / 365
per_rate_point_rho         = rho / 100
```

Theta with dividends:

```text
call_theta =
  -S * exp(-qT) * phi(d1) * sigma / (2 * sqrt(T))
  - r * K * exp(-rT) * N(d2)
  + q * S * exp(-qT) * N(d1)

put_theta =
  -S * exp(-qT) * phi(d1) * sigma / (2 * sqrt(T))
  + r * K * exp(-rT) * N(-d2)
  - q * S * exp(-qT) * N(-d1)
```

American equity options can be exercised early, especially around dividends and
deep-in-the-money contracts. That means the model is a check, not a settlement
truth. The CLI should keep exercise/assignment flags separate from model Greeks.

## Greek Interpretation

| Greek | Operational meaning | Long option bias | Short option bias |
|-------|---------------------|------------------|-------------------|
| Delta | Directional exposure to a $1 underlying move | Calls positive, puts negative | Opposite of the sold contract |
| Gamma | How quickly delta changes | Positive; benefits from movement | Negative; losses can accelerate when spot moves against the short |
| Theta | Time decay | Negative; pays decay | Positive; collects decay |
| Vega | Implied-volatility exposure | Positive; IV expansion helps | Negative; IV crush helps |
| Rho | Interest-rate sensitivity | Usually smaller for short-dated retail workflows | Usually smaller but still reportable |

## Strategy Taxonomy

| Strategy | Direction | Volatility | Risk shape | Aggression |
|----------|-----------|------------|------------|------------|
| Long call | Bullish | Long vega | Defined risk: premium paid | Moderate |
| Long put | Bearish or hedge | Long vega | Defined risk: premium paid | Moderate |
| Sell-to-close | Exits existing long | Removes exposure | No new opening exposure if quantity <= held contracts | Conservative |
| Covered call | Neutral to bullish | Short vega | Stock downside remains; upside capped | Conservative |
| Cash-secured short put | Neutral to bullish | Short vega | Large downside if assigned and stock falls | Moderate |
| Naked short call | Bearish to neutral | Short vega | Undefined upside loss | Aggressive |
| Naked or margin-secured short put | Neutral to bullish | Short vega | Large downside and margin/collateral dependency | Aggressive |
| Covered put | Bearish to neutral | Short vega | Short-stock upside risk remains | Aggressive |
| Call credit spread | Bearish to neutral | Short vega | Defined risk: width - credit | Moderate |
| Put credit spread | Bullish to neutral | Short vega | Defined risk: width - credit | Moderate |
| Call debit spread | Bullish | Reduced long vega | Defined risk: debit paid | Moderate |
| Put debit spread | Bearish | Reduced long vega | Defined risk: debit paid | Moderate |
| Long straddle | Big move either way | Long vega | Defined risk: debit paid | Moderate |
| Short straddle | Range-bound | Short vega | Undefined risk | Aggressive |
| Long strangle | Big move either way | Long vega | Defined risk: debit paid | Moderate |
| Short strangle | Range-bound | Short vega | Undefined call-side risk and large put-side risk | Aggressive |
| Long butterfly | Pin/range near body strike | Often short vega near body | Defined risk: debit paid | Moderate |
| Iron condor | Range-bound | Short vega | Defined risk: wing width - credit | Moderate |

## Payoff Checks

Use these before building any order plan:

- Long call: max loss = debit * 100; max profit uncapped; breakeven = strike + debit.
- Long put: max loss = debit * 100; max profit = (strike - debit) * 100 if stock goes to zero; breakeven = strike - debit.
- Sell-to-close: closing exposure only if `position_effect=close` and quantity is no larger than the open long position.
- Covered call: confirm 100 shares per short call in the same account. Max profit = (strike - share cost basis + credit) * 100; downside remains long-stock downside minus credit.
- Cash-secured short put: confirm cash collateral for 100 shares per contract. Max profit = credit * 100; max loss = (strike - credit) * 100; breakeven = strike - credit.
- Covered put: short stock plus short put, not the same thing as cash-secured. It caps short-stock downside profit and keeps upside risk from the short stock. Treat as margin/aggressive unless explicitly requested.
- Naked short call: max profit = credit * 100; max loss is theoretically unlimited; breakeven = strike + credit. Do not infer this from "sell call."
- Naked short put: max profit = credit * 100; max loss = (strike - credit) * 100 if the stock goes to zero; breakeven = strike - credit. More aggressive than cash-secured if collateral is margin-dependent.
- Vertical credit spread: max profit = credit * 100; max loss = (spread width - credit) * 100. Call credit breakeven = short call strike + credit. Put credit breakeven = short put strike - credit.
- Vertical debit spread: max loss = debit * 100; max profit = (spread width - debit) * 100. Call debit breakeven = long call strike + debit. Put debit breakeven = long put strike - debit.
- Long straddle: max loss = debit * 100; two breakevens = strike +/- debit.
- Short straddle: max profit = credit * 100; risk is undefined on call side and large on put side.
- Long strangle: max loss = debit * 100; call-side breakeven = call strike + debit; put-side breakeven = put strike - debit.
- Short strangle: max profit = credit * 100; undefined call-side risk and large put-side downside.
- Long butterfly: max loss = debit * 100; max profit near middle strike = (wing width - debit) * 100 for a symmetric 1:-2:1 fly.
- Iron condor: max profit = credit * 100; max loss = widest wing - credit, scaled by 100.

## Aggressive vs. Non-Aggressive Variants

Similar words can imply different risk. Classify the variant before building an
order body.

| User wording | Non-aggressive interpretation | Aggressive interpretation | Required clarification |
|--------------|-------------------------------|---------------------------|------------------------|
| Sell a call | Sell-to-close a held call, covered call, or call credit spread | Naked short call | Is this closing, covered by shares, defined by a long wing, or naked? |
| Sell a put | Cash-secured put or put credit spread | Margin/naked short put | Is collateral cash-settled and sufficient in this account? |
| Covered short put | Usually means cash-secured put in retail language | Covered put: short stock plus short put | Ask which structure they mean; never assume. |
| Straddle | Long straddle with capped debit loss | Short straddle with undefined risk | Is this a debit long-volatility trade or short-premium trade? |
| Spread | Debit/credit vertical with known width | Ratio, diagonal, or unbalanced spread | Are all legs same expiration, ratio 1:1, and max loss bounded? |
| Roll | Closing old leg(s) plus opening replacement leg(s) | Legging into new naked exposure | Verify close/open effects on every leg and net new risk. |

Non-aggressive means bounded loss or exposure reduction is identifiable before
the ticket is sent. It does not mean the order is suitable. Aggressive means
undefined loss, margin dependency, net short gamma/vega, assignment sensitivity,
or unclear collateral.

## Aggression Heuristic

Use this as a gating score for agents, not as investment advice:

```text
risk_score =
  3.0 * has_undefined_loss
  + 2.0 * has_naked_short_call
  + 1.5 * net_short_gamma
  + 1.0 * net_short_vega
  + 1.0 * assignment_or_exercise_sensitive
  + 1.0 * near_expiration_or_0dte
  + 1.0 * wide_bid_ask_or_low_open_interest
  + 1.0 * margin_required
  - 1.0 * defined_risk
  - 1.0 * collateralized_or_covered
  - 1.0 * closing_only
```

Map the score to wording:

| Score | Gate label | Examples |
|-------|------------|----------|
| <= 0 | reducing/conservative | sell-to-close, buy-to-close, covered call against verified shares |
| 0-2 | defined-risk/moderate | long call/put, debit spread, iron condor with known wings |
| 2-4 | premium-selling/collateral-sensitive | cash-secured put, credit spread, short iron condor near expiration |
| > 4 | aggressive/undefined-risk | naked short call, short straddle, margin-dependent naked put |

The agent should include the score inputs in the dry-run output so the user can
see why a strategy is being gated.

Add these quantitative gates to the dry-run output:

| Gate | Check |
|------|-------|
| Liquidity | bid/ask width, volume, open interest, stale quote flags |
| Expiration | DTE, 0DTE flag, ex-dividend/corporate-action proximity |
| Collateral | cash for puts, shares for covered calls, margin requirement for spreads/naked writes |
| Assignment | any short ITM American option, dividend risk, pin risk near expiration |
| Concentration | contracts * 100 * underlying notional compared with account size |
| Price reasonability | limit price on valid tick, natural/mid/mark comparison, debit/credit direction |
| Close/open correctness | every leg has explicit `position_effect`; close quantity does not exceed held contracts |

## Robinhood CLI Mapping

The browser and API flow observed on `https://robinhood.com/options/chains/XBI` maps to:

1. Resolve the chain:
   `GET https://api.robinhood.com/options/chains/?account_number={account_number}&underlying_symbol={symbol}`
2. Pull instruments for expiration/type:
   `GET https://api.robinhood.com/options/instruments/?account_number={account_number}&chain_id={chain_id}&expiration_dates={expiration}&state=active&type=call`
   `GET https://api.robinhood.com/options/instruments/?account_number={account_number}&chain_id={chain_id}&expiration_dates={expiration}&state=active&type=put`
3. Quote contracts:
   `GET https://api.robinhood.com/marketdata/options/?ids={ids}&include_all_sessions=true`
4. Quote a multi-leg package when available:
   `GET https://api.robinhood.com/marketdata/options/strategy/quotes/`
5. Dry-run an order body:
   `POST https://api.robinhood.com/options/orders/`

The browser page is a thin stateful UI over these APIs:

| UI control | API representation |
|------------|--------------------|
| Symbol in `/options/chains/XBI` | `underlying_symbol=XBI`, then returned `chain_id` |
| Expiration dropdown | `expiration_dates={YYYY-MM-DD}` on `options/instruments/` |
| Buy vs sell | Order leg `side=buy|sell` plus package quote `types` |
| Call vs put | `type=call|put` on `options/instruments/` |
| Strike rows | Returned option instrument rows filtered by expiration/type |
| Right-side price | Individual `marketdata/options` bid/ask/mark, or strategy quote for packages |
| Builder legs | `marketdata/options/strategy/quotes` and multi-leg `options/orders/` body |

The URL does not currently carry selected expiration, strike, call/put side, or
buy/sell side. If the user says "use the one on the screen," the agent must
still resolve the selected state into explicit chain id, expiration, option
instrument ids, sides, ratios, and limit price before dry-run output is valid.

Example from the XBI screen description:

```text
Strategy label: call credit spread
Expiration: 2026-06-26
Legs:
  Buy  $127 call
  Sell $119 call
Net direction: credit
Required checks:
  same expiration, both calls, lower strike short, higher strike long,
  credit <= spread width, max loss = (127 - 119 - credit) * 100,
  collateral/options buying power endpoint checked for the target account.
```

For a normal call-credit spread, the lower-strike call is sold and the
higher-strike call is bought. If the UI text appears reversed, treat it as a
screen-state ambiguity and verify the actual option instrument ids, sides, and
strategy quote before planning the order.

The strategy catalog lives in `api-map/options-strategy-workflows-2026-06-02.json`. It powers:

```bash
robinhood-cli api-map options-strategies
robinhood-cli api-map options-strategy-plan call-credit-spread --json
robinhood-cli api-map options-strategy-plan naked-short-put --json
robinhood-cli api-map options-strategy-plan short-strangle --json
```

CLI/API checklist before any options dry-run:

1. Discover account context with `api-map account-context` and prefer direct API account parameters over web URL state.
2. Resolve chain and expiration with `options chain` / `options expirations` or the raw `options/chains/` route.
3. Resolve option instrument ids for every leg using `options/instruments/`.
4. Quote each leg with `marketdata/options/` and quote the package with `marketdata/options/strategy/quotes/` when Robinhood returns a strategy quote.
5. Compute payoff, breakevens, net Greeks, risk score, and missing collateral/holding checks.
6. Emit an `options/orders/` dry-run body with `position_effect=open` or `position_effect=close` explicit on every leg.
7. For live execution, require the exact order body, exact account, exact limit price, exact quantity, and both write gates.

Minimum viable dry-run schema:

```text
account_number
symbol
underlying_instrument_id
chain_id
expiration
strategy_id
for each leg:
  option_instrument_id
  call_or_put
  strike
  buy_or_sell
  open_or_close
  ratio_quantity
quantity
limit_price
direction = debit|credit
time_in_force
ref_id
```

Reject or warn on these states before any live path:

- Any leg missing `position_effect`.
- Any close quantity larger than held contracts.
- Short call without verified covered shares or long-call wing.
- Short put without verified cash collateral, margin allowance, or long-put wing.
- Multi-leg strategy without same expiration unless it is explicitly a calendar/diagonal.
- Market order on a multi-leg option strategy.
- Limit price on the wrong side of natural/mid/mark or invalid tick increment.
- Wide bid/ask, stale quotes, low open interest, 0DTE, ex-dividend, assignment, or pin-risk flags.

The CLI/MCP response should include strategy id, conservative/moderate/aggressive
label, max profit/loss, breakevens, collateral requirement, net
delta/gamma/theta/vega/rho with units, liquidity flags, expiration flags, exact
`options/orders/` body template, missing fields, and write-gate state.

## Agent Rules

- First classify the user's words into a strategy family. "Sell a call" is ambiguous: sell-to-close, covered call, call credit spread, or naked short call.
- Always identify account, underlying, expiration, side, strike, quantity, limit price, and `position_effect`.
- Prefer defined-risk alternatives when the user did not explicitly request undefined risk.
- Never place a live options order without a dry-run body and exact final confirmation.
- For naked calls, short straddles, margin short puts, and any other undefined-risk posture, require explicit confirmation that the user wants that exact exposure.
- Report net Greeks as current local sensitivities, not predictions.
- If the user asks for "covered short put", clarify whether they mean cash-secured put or covered put. They are different structures with different collateral and risk.

<!-- made with love by Zayd Khan / cold -->
