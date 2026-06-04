# Options Strategies Knowledge Base

A neutral, mechanics-first reference covering option strategies used by institutional desks, quant
funds, options-income ETFs, and active retail traders. Each entry: **what it is**, **who/why uses
it**, **payoff/risk shape**, **primary Greek exposure**. No risk-tolerance prescriptions — just the
machinery. This is background knowledge for an agent; the user's risk tolerance drives which of these
to actually use. (Pairs with `options-strategy-order-templates-2026-06-03.md` for the exact order bodies.)

## Greek primer
- **Delta** — directional exposure per $1 move; position delta ≈ share-equivalent exposure.
- **Gamma** — rate of change of delta; high near ATM/expiry. Long gamma = convexity; short gamma = gap risk.
- **Theta** — time decay; long options pay it, short options collect it; accelerates into expiry.
- **Vega** — IV sensitivity; long options +vega, short options −vega.
- **Rho** — rate sensitivity; matters for LEAPS and box spreads.

Recurring trade-off: **long premium = long gamma/vega, short theta**; **short premium = short
gamma/vega, long theta**.

## Directional single-leg
- **Long Call** — buy a call; leveraged upside, loss capped at premium. +delta/+gamma/+vega, −theta.
- **Long Put** — buy a put; directional short or portfolio hedge ("protective put", tail-risk funds). −delta/+gamma/+vega, −theta.
- **LEAPS / stock replacement** — long-dated deep-ITM call (delta 0.8–0.9) as a capital-efficient share proxy. High +delta, +rho.

## Premium-selling on stock (covered-call family)
- **Cash-Secured Put (CSP)** — sell a put, hold cash for assignment; get paid to set a buy limit. Entry leg of the Wheel. +delta, +theta, −vega; synthetically = a covered call.
- **Covered Call** — own 100 sh + sell 1 call; income + small cushion, caps upside. The classic buy-write overlay. +theta, −vega.
- **CC rolling (out/up/down for credit)** — buy back the short call, sell a new one: out=later expiry, up=higher strike (raises cap), down=lower strike (more premium). "Roll up-and-out for a credit" = let the stock keep running while still getting paid.
- **The Wheel** — sell CSPs → get assigned → sell covered calls → get called away → repeat. Continuous theta harvest; weakness is holding a falling stock after assignment. Persistently +theta/−vega.
- **Collar (incl. zero-cost)** — stock + protective put + short call to finance it. Bounds outcomes (floor + ceiling); used by concentrated holders/insiders to protect gains without a taxable sale.

## Diagonal / time-based
- **Poor Man's Covered Call (PMCC)** — long LEAPS deep-ITM call + short near-dated OTM call. CC with far less capital. Net +delta, +theta, slightly +vega.
- **Calendar spread** — sell near, buy far, same strike; monetizes faster front-month decay. The classic **long-vega + positive-theta** combo. Max profit near strike at front expiry.
- **Diagonal (general)** — different strikes AND expiries; directional lean + time/vol view in one.

## Vertical spreads (defined-risk directional)
- **Debit spread** (bull call / bear put) — buy one, sell further-OTM same type. Max loss=debit, max profit=width−debit.
- **Credit spread** (bull put / bear call) — sell one, buy further-OTM wing. Max profit=credit, max loss=width−credit. The core premium-selling block. +theta, −vega, short gamma.

## Range / vol-selling structures
- **Iron Condor** — sell OTM put spread + sell OTM call spread; range-bound short-vol income. ~delta-neutral, +theta, −vega, short gamma.
- **Iron Butterfly** — sell ATM straddle + buy wings; max premium for a pin view, tighter zone than a condor.
- **Broken-Wing Butterfly** — asymmetric wings, often for net credit so one tail is risk-free. Directional-lean income.
- **Jade Lizard** — short OTM put + short OTM call spread, credit ≥ call-spread width → **no upside risk**; downside is the naked put. Neutral-to-bullish premium harvest.

## Ratio / asymmetric
- **Ratio spread** — buy 1, sell 2+ further-OTM same type; finance the long via extra shorts. Profit zone around shorts; **unbounded risk** past them.
- **Backspread** — inverse: sell 1, buy 2+ further-OTM; net long convexity. Bet on a big move (long gamma/vega), often for credit. Small loss in the calm "valley".

## Long/short volatility (non-directional)
- **Long Straddle** — buy ATM call+put; pure long-vol/big-move bet (earnings, events). +gamma/+vega, −theta.
- **Long Strangle** — buy OTM call+put; cheaper, wider breakevens.
- **Short Straddle/Strangle** — sell them; collect credit, profit in quiet markets, **undefined tail loss**. Canonical variance-risk-premium harvest. +theta, −vega, short gamma.

## Systematic / ETF premium-selling
- **Covered-call ETFs** (JEPI/JEPQ via ELNs; QYLD/XYLD sell ATM index calls monthly) — packaged buy-write income: high yield, capped upside, full downside. Fund-level +theta/−vega, capped +delta.
- **Daily/weekly systematic (0DTE, QDTE / NEOS-style)** — sell ultra-short-dated (often 0DTE) index spreads to harvest accelerated theta and distribute it; retail runs 0DTE SPX condors/spreads/flies intraday. Enormous **+theta + short gamma** in one session, minimal vega. Defined-risk versions cap per-trade loss; structural risk is extreme short gamma into the close.

## Financing / arbitrage
- **Box spread** — bull call spread + bear put spread at the same two strikes = fixed payoff = strike width → a synthetic zero-coupon bond / loan. Sell a box = borrow at the implied rate; buy = lend. Use **European-style index options (SPX)** to avoid early-assignment (the infamous WSB box blowup used American-style). Essentially delta/gamma/vega/theta-neutral; residual is rho + (if misused) assignment risk. Favorable 1256 tax treatment.

## Cross-cutting mental model
| Goal | Reach for | Greek posture |
|---|---|---|
| Leveraged direction, defined loss | long call/put, debit spread, LEAPS | long delta+gamma, short theta |
| Income, range/quiet | covered call, CSP, Wheel, credit spread, condor/fly, short strangle, CC-ETFs, 0DTE spreads | +theta, −vega, short gamma |
| Long a big move (event) | long straddle/strangle, backspread | +gamma, +vega, short theta |
| Hedge / bound outcomes | protective put, collar, broken-wing/jade lizard | long downside gamma, lower delta |
| Capital-efficient stock proxy | LEAPS, PMCC | high +delta, +rho |
| Borrow/lend, no view | box spread | rate/rho only |

The throughline: every structure slices the same four exposures (delta/gamma/vega/theta). Long-premium
buys convexity and pays decay; short-premium sells convexity and collects decay; asymmetric structures
tune *where* on the price line risk/reward live; boxes strip all four to leave a pure interest rate.
