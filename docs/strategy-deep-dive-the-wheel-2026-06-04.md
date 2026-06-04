# Strategy deep-dive: The Wheel

> Advanced, multi-perspective study (mechanics · Greeks · quant decision rules · tax · current
> practitioner sentiment · failure modes), grounded in this repo's actual order mechanics. **Descriptive
> background, NOT advice and NOT risk guidance** — every "rule" here is a lever with tradeoffs; risk and
> sizing are the operator's call. Extends the one-line summaries in
> `options-strategies-knowledge-base-2026-06-03.md` (lines 25/28). Tax depth: `tax-aware-options-strategies.md`.
> Compiled 2026-06-04 from a multi-agent study.

## 1. What it is

A continuous **short-premium income loop on a single underlying you'd be willing to own**. It alternates
two single-leg short positions joined by share assignment:

```
 (flat)                                  (own 100 sh/contract)
  Sell CSP  ──assigned at Kp──►  Sell Covered Call
  (short put) ◄──called away at Kc──  (short call)
   └ expires/BTC → keep credit, resell    └ expires/BTC → keep credit, resell
```

Both legs are **+theta / −vega / short-gamma** premium sales. Across a full turn the net economic
exposure is **long the underlying with a capped, premium-enhanced payoff** — you're effectively a
covered-equity holder being paid to set your buy and sell prices. Best understood as a *policy* (which
short leg to hold given whether you hold shares) plus management rules, not a single trade.

## 2. Lifecycle + exact RH order legs

- **CSP (entry):** `direction: credit`, leg `{side: sell, option: <put>, position_effect: open, ratio_quantity: 1}`, `type: limit`. "Cash-secured" is **not** a body flag — it's a collateral fact (`strike×100×n` cash, verified via `bonfire.../currency_buying_power/USD/`). Same legs as a *naked* put; only the collateral check distinguishes them.
- **Put assignment → shares:** a clearing event, no order. You buy 100 sh/contract at `Kp`; **effective basis = Kp − put_credit**.
- **Covered call (exit setup):** `direction: credit`, leg `{side: sell, option: <call>, position_effect: open, ratio_quantity: 1}`. Coverage (100 sh/contract, **same account**) is a hard-verified blocker. Discipline: **strike ≥ basis** so a call-away doesn't lock a loss.
- **Call assignment → called away** at `Kc`. Full-turn P&L `= put_credit + call_credit + (Kc − Kp)`.
- **Close/roll early:** buy-to-close `{side: buy, position_effect: close}`, `direction: debit`. A roll is close + open as a two-leg ticket (see the rolling deep-dive).
- **Most turns are the "expires worthless" sub-loops** — keep the credit, resell the same leg.

## 3. Greeks by leg (×100 multiplier; label units — RH theta is often per-day, vega/rho per-point)

| Leg | Delta | Gamma | Theta | Vega | Payoff |
|-----|-------|-------|-------|------|--------|
| CSP | + | − (short) | + | − | max profit = credit; **max loss = (Kp − credit), stock-like to 0**; BE = Kp − credit |
| CC (+100 sh) | + (capped) | − (from call) | + | − | max profit = call_credit + (Kc − basis); loss = stock to 0 less credits; upside **capped** above Kc |

Dynamics: as the stock falls toward the put strike, short gamma makes delta worsen *faster* (the assignment ramp); at assignment the option delta collapses into **+100 real share delta**. The CC premium after a drop is a **thin cushion, not a hedge**. **Vega is persistently negative across the whole cycle — the Wheel is structurally short volatility** (IV spikes hurt open legs; IV crush helps).

**Why the core risk is "holding a falling stock after assignment":** the CSP caps your gain at the credit but leaves loss open to zero; assignment converts a paper option loss into a real long-stock position above market; the at/above-basis CC is then far OTM and pays little. The Wheel's true max loss is **the max loss of owning the stock**, shifted down only by cumulative credits.

## 4. Quant / decision rules (levers + tradeoffs, not mandates)

- **Delta target ≈ 0.15–0.30** (community-cited; 0.30 ≈ ~30% assignment odds). Delta is the dial between **income mode** (lower delta, keep more, fewer assignments) and **acquisition mode** (higher delta).
- **30–45 DTE** — the theta-efficiency sweet spot; below ~21 DTE gamma/assignment risk per unit premium rises sharply.
- **Compare candidates by annualized return on committed collateral**, not raw credit. The defined-risk cousin (put-credit-spread) is far more capital-efficient but **can't be assigned into shares → it's not a Wheel entry.**
- **Management (choices):** *50–75% of max profit* → close & redeploy (raises consistency, forgoes slow tail decay); *21-DTE* → close/roll out of the high-gamma zone. Combine as "50% profit OR 21 DTE."
- **Roll vs take assignment vs close** at a tested short: **roll** (down-and-out, for a net credit) to defer + lower basis; **take assignment** if you want the shares and thesis holds; **close** for a loss if the willingness-to-own thesis broke. Roll only for a **net credit** (or a small debit that meaningfully improves the strike).
- **Good candidate:** a name you'd own anyway · liquid options (tight spread, healthy OI) · moderate-to-elevated IV rank · no unwanted binary events in the expiry. **Bad:** illiquid strikes, leveraged/inverse ETFs, names you'd never hold, secular decliners.

## 5. Tax (US — background, not advice; deeper in `tax-aware-options-strategies.md`)

- **Premium is always short-term** (IRC §1233) — you can't age a written option into LTCG. The Wheel's premium stream is short-term capital, period.
- **Assignment & basis:** CSP assigned → premium **reduces share basis** (Kp − premium); share holding period starts the day after. CC assigned → premium folds into the sale (proceeds = Kc + premium); gain character follows the **stock's** holding period.
- **Wash sale (the sharp edge — the Wheel structurally re-establishes identical exposure):** selling shares at a loss then writing a new CSP on the same name within 30 days can **disallow the share loss** (writing a put / buying a call counts as reacquiring); rolling a losing short into a near-identical strike/expiry can wash the option loss. Loss is **deferred** (added to replacement basis), not destroyed — but a wash **against an IRA** purchase is **permanently disallowed**. No bright-line "substantially identical" for options; different strike *and* expiry helps. (IRC §1091.)
- **Qualified-covered-call taint:** an OTM/ATM qualified CC keeps the share holding-period clock running; an **ITM** CC **suspends** it; a **deep-ITM/unqualified** CC pulls the position into the **straddle rules** (can reset holding period, defer losses) and can **disqualify dividends**. "Deep-ITM" is set by the regulation's lowest-qualified-benchmark table, not the "$5–10 ITM" shorthand. (IRC §1092(c), Treas. Reg. §1.1092(c)-1.)
- **Cash-account T+1 / "kosher roll":** options proceeds settle T+1; funding a same-day open on unsettled cash = good-faith violation (3/yr → 90-day restriction). The repo's **`options roll-plan --cash-account`** stages the open to next business day with fresh-checks. (Failure-mode #17.)
- **IRA:** natural fit — premium not currently taxed, no ST/LT distinction; but **CSP must be fully cash-secured, CC fully covered, no naked/margin**, and **no tax-loss harvesting**. Cross-account wash sales between a taxable account and an IRA on the same name still permanently disallow the taxable loss.
- **Only routine timing lever:** defer a profitable close / assignment-sale across the **Dec→Jan** boundary, or near the share-leg's 1-year ST→LT crossing (the rare cases worth raising — per the owned-contract tax note).

## 6. Current practitioner sentiment (~30 days to 2026-06-04; X densest per the signal-sourcing doctrine)

- **Dominant tone — "boring works, in this regime":** "the wheel is the only strategy where 'nothing happened today' is the goal… boring is the edge, boring compounds" (@WheelHouseAI, 05-28); "theta printer still humming… VIX ~18 = premium heaven" (@strikeiq, 04-30). Heavy "run it like a business / CSP = a paid limit order" framing (@darkstarproj).
- **Sharpest critique — "everything works in a bull market":** "the real test isn't now, it's the next 40% drawdown… if it only works when the market goes up, you're gambling & got lucky" (@Invest_Brandon, 06-03, high engagement). Modern restatement of the "wheel of pain": capped upside, full downside, masked by a bull tape.
- **The live debate is income-mandate vs growth-mandate:** defenders answer the "my CCs went deep-ITM and capped me" complaint with "it was never meant to maximize upside — it harvests premium/IV" (06-01).
- **Structured bear case** (beststockstrategy.com, 05-29): "worst risk/reward asymmetry — lose to the upside when right, to the downside when wrong"; capital-inefficient vs the short put alone; covered-call ETFs (JEPI/QYLD/XYLD/NUSI) "consistently underperform." Captures ~20–30% of bull-market upside with no downside protection.
- **Favored underlyings (in-window):** mega-cap tech you'd own anyway (AAPL/NVDA/AMZN/GOOGL/META/AMD); high-IV "perfect candidates" cited: $BE, $HIMS, $OPEN, $IREN. Standing warning against wheeling **leveraged/inverse ETFs** (a $NUGT naked-put blow-up anecdote). Reddit keeps a dedicated **r/Optionswheel** + steady r/thetagang/r/options threads (returns-benchmarking + "passive strategy for working people").
- **Consensus playbook:** wheel only names you'd own through a drawdown; ~0.15–0.30 delta, 30–45 DTE; take 50–75% profit early; roll tested shorts out/down-and-out **for a credit**; treat assignment as a non-event ("happy assignment → sell CCs"); ladder CCs across expirations; the acknowledged weak point is selling CCs *below basis* on a sunk name.

## 7. Failure modes

1. **Falling stock after assignment** (signature failure) — long a depreciating asset; at/above-basis CC pays little; below-basis CC locks a loss. Floor = owning the stock to zero, less credits.
2. **Capped upside** — stock rips above Kc, called away below market; you forfeit the right tail. Structural cost of +theta/−gamma.
3. **Ex-dividend / early assignment on the short call** — ITM call with extrinsic < dividend is assigned the night before ex-div; shares gone before you can roll.
4. **Illiquid strikes** — wide spreads eat the edge and trap you on exit.
5. **IV crush vs entry timing** — selling into low IV gives thin credit for the same assignment risk.
6. **Wheeling a name you wouldn't own** — converts the strategy into naked-put speculation with a benign label.
7. **Cash-account settlement traps** — same-day roll on unsettled cash → GFV; use `--cash-account` staging.

## 8. Agent-operational mapping (robinhood-cli)

Every Wheel order is a single-leg `type: limit`, `trigger: immediate` **credit** ticket (strategy plans forbid market orders). Hard blockers: unverified collateral (CSP) or coverage (CC) in the **same account**; unacknowledged stock-like/undefined loss; missing limit/qty/TIF/ref_id; any live write without `--live-write` + `ROBINHOOD_ALLOW_LIVE_WRITE=1` (default = dry-run). Report net Greeks ×100 with unit labels; scenario rows ±1% spot, ±5 vol (shows the short-vega drag), 1-day theta, breakeven, max-loss (flag stock-like/undefined). **Log every leg to `trading-log.md` with the wheel thread** (CSP→assignment→CC→roll) so the next decision knows what it's rolling from.

### Sources
RH reverse-engineered order templates (this repo's `options strategy-quote`/workflows); OCC/FINRA on assignment & early-exercise; IRC §§1091/1092(c)/1233 + Treas. Reg. §1.1092(c)-1 (Fidelity/Schwab/Morningstar/Blue Collar Investor/Option Samurai); X handles & Reddit subs dated above; beststockstrategy.com (2026-05-29). Multi-agent study, 2026-06-04.

---

## Appendix A — Quantitative foundation: why the Wheel works, mathematically

> **Scope and honesty.** This appendix derives the Wheel's edge from first principles under the
> Black–Scholes–Merton (BSM) model, then states exactly where those assumptions fail in practice. It
> is descriptive financial mathematics, **not advice and not risk guidance**. Every result is an
> *identity under stated assumptions*, not a promise about realized P&L. The edge is real but
> conditional, paid for with negative skew and tail risk.

### A.0 Symbols and conventions

| Symbol | Definition |
|--------|------------|
| `S₀`, `S_T` | underlying price now / at expiry `T` |
| `K`, `Kp`, `Kc` | strike; put strike, call strike (Wheel legs) |
| `T` | time to expiry in years (`DTE/365`) |
| `r` | continuously-compounded risk-free rate |
| `q` | continuous dividend yield |
| `σ` | volatility (BSM: constant); `σ_imp` implied, `σ_real` realized |
| `N(·)`, `φ(·)` | standard normal CDF, PDF (`φ(x)=e^{−x²/2}/√(2π)`) |
| `ℚ`, `ℙ` | risk-neutral measure, real-world (physical) measure |
| `μ` | real-world expected drift of `S` under `ℙ` |
| `P`, `C` | Black–Scholes put / call price (per share) |
| `m` | contract multiplier = 100 shares/contract |

BSM assumes `S_T` lognormal: `ln S_T = ln S₀ + (μ − ½σ²)T + σ√T·Z`, `Z∼N(0,1)` under `ℙ`; under `ℚ`
the drift is replaced by `r − q`. All option-pricing expectations below are taken under `ℚ` and
discounted at `r`; real-world P&L expectations are under `ℙ`. **The entire edge of the Wheel lives in
the wedge between `ℚ` and `ℙ` — specifically `σ_imp > σ_real`.**

### A.1 Assignment probability vs. delta — and why "delta ≈ prob ITM" is only an approximation

**The d₁/d₂ decomposition.** The risk-neutral terminal distribution gives, for a short put struck at
`K`, the probability of finishing in-the-money (ITM ⇒ assigned at expiry, ignoring early exercise):

```
d₁ = [ ln(S₀/K) + (r − q + ½σ²)T ] / (σ√T)
d₂ = d₁ − σ√T = [ ln(S₀/K) + (r − q − ½σ²)T ] / (σ√T)

ℚ(S_T < K) = N(−d₂)            ← risk-neutral assignment probability of the short put
```

**Derivation of `N(−d₂)`.** Under `ℚ`, `ln(S_T/S₀) = (r−q−½σ²)T + σ√T·Z`. Then

```
ℚ(S_T < K) = ℚ( Z < [ln(K/S₀) − (r−q−½σ²)T] / (σ√T) )
           = N( [ln(K/S₀) − (r−q−½σ²)T] / (σ√T) )
           = N( −[ln(S₀/K) + (r−q−½σ²)T] / (σ√T) ) = N(−d₂).
```

**Delta of the short put.** The Black–Scholes put delta is `∂P/∂S = −e^{−qT}·N(−d₁)`. Practitioners
read |Δ| ≈ `e^{−qT}N(−d₁)` as "probability of assignment." The *true* risk-neutral assignment
probability is `N(−d₂)`.

**Why they differ — exactly.** Since `d₁ = d₂ + σ√T > d₂`, we have `N(−d₁) < N(−d₂)`, so for a short
put **delta systematically *understates* the risk-neutral ITM probability**:

```
N(−d₂) − N(−d₁) = N(−d₂) − N(−d₂ − σ√T) > 0,  growing with σ√T.
```

Three precise statements:
1. **They coincide only in the limit `σ√T → 0`** (very short-dated or very low-vol), where `d₁ ≈ d₂`.
2. **`N(d₁)` is not a probability at all** in the pricing decomposition — in `C = S₀e^{−qT}N(d₁) −
   Ke^{−rT}N(d₂)`, the term `N(d₂)` is the `ℚ`-probability of exercise, while `e^{−qT}N(d₁)` is the
   *delta* / the present value of the share-leg conditional on exercise (the asset-or-nothing piece).
   Delta answering "≈ prob ITM" is a numerical near-coincidence, not an identity.
3. **Even `N(−d₂)` is a *risk-neutral* probability, not the real-world one.** The physical assignment
   probability uses drift `μ` instead of `r−q`: `ℙ(S_T<K) = N(−d₂^ℙ)` with `d₂^ℙ = [ln(S₀/K) +
   (μ−q−½σ²)T]/(σ√T)`. Since equities carry `μ > r`, `d₂^ℙ > d₂`, so **the real-world chance of
   assignment is *lower* than both the delta and the `N(−d₂)` figure** the chain implies. The "30-delta
   put ≈ 30% assignment" heuristic is thus doubly conservative for a name with positive expected drift.

**Operational takeaway for the agent:** report assignment probability as `N(−d₂)` computed from the
chain's IV, and flag that the displayed |Δ| is a *lower bound* approximation that widens with DTE and
IV. (`docs/options-quantitative-playbook` and the SKILL Black–Scholes baseline already emit `d₁`/`d₂`.)

### A.2 Expected P&L of one CSP, of the covered call, and of the full Wheel cycle — locating the edge

**Payoff functions (per share, at expiry; credits are the option prices received at entry).**

Short cash-secured put, strike `Kp`, premium `P₀ = P(S₀,Kp)`:
```
Π_CSP(S_T) = P₀ − max(Kp − S_T, 0)      ⇒  max gain = P₀ ; floor = P₀ − Kp (at S_T=0)
breakeven  = Kp − P₀ ;  loss is "stock-like" below Kp.
```

Covered call after assignment (own 100 sh at effective basis `b = Kp − P₀`), short call `Kc`, premium
`C₀`:
```
Π_CC(S_T) = (S_T − b) + C₀ − max(S_T − Kc, 0)
          = (S_T − b) + C₀ − max(S_T − Kc, 0).
```

**Full Wheel turn that completes the loop (CSP assigned, then called away):**
```
Π_Wheel = P₀ + C₀ + (Kc − Kp).        ← the headline identity from §2/§3 of this doc
```
This is bounded above and exposed to the full downside of holding the share leg before the call-away —
the asymmetry the practitioner critique names.

**Risk-neutral expectation is *zero edge by construction* (the no-arbitrage trap).** Under `ℚ`, every
self-financing position earns `r` on its capital and nothing more. For the CSP financed by `Kp` in
cash at rate `r`:
```
E^ℚ[ discounted Π_CSP ] = 0    (the option is priced so the seller's risk-neutral excess return is 0).
```
So **under the pricing measure the Wheel has no edge.** If markets priced options with `σ_imp =
σ_real` and agents were risk-neutral, the strategy's expected excess return would be zero. The edge
must therefore come from a *measure mismatch*, not from the mechanics.

**Where the edge actually comes from — the variance/volatility risk premium (VRP).** Empirically,
option sellers are compensated because **implied variance exceeds subsequently realized variance**:

```
VRP_t  ≈  E^ℚ_t[ RV_{t,t+τ} ] − E^ℙ_t[ RV_{t,t+τ} ]  >  0      (on average, for equity indices).
```

Carr & Wu (2009) show the risk-neutral expected variance (the variance-swap rate) is **systematically
above** realized variance, i.e. a large, persistent, *negative* return to being long variance — hence a
positive return to *selling* it. Bollerslev, Tauchen & Zhou (2009) define the VRP as the difference
between risk-neutral (implied) and physical (realized) variance and show it predicts the equity premium.
For the S&P 500, 1990–2018, average VIX ≈ **19.3%** vs. realized ≈ **15.1%** — a ~**4.2 vol-point**
wedge (Bondarenko 2019). The put seller harvests precisely this wedge.

**Mapping VRP → the Wheel's premium.** A short put's value rises ~linearly in `σ` via vega
(`ν = ∂P/∂σ = S₀e^{−qT}φ(d₁)√T > 0`). Selling at `σ_imp` and bearing realized dynamics at `σ_real <
σ_imp` means the premium collected exceeds the actuarially fair (real-world) cost of the embedded
short-gamma exposure. To first order the per-trade physical edge is approximately the vega times the
vol wedge:
```
E^ℙ[ edge per CSP ] ≈ ν · (σ_imp − σ_real)   (plus higher-order skew/jump terms).
```
This is the formal statement of "**the Wheel is structurally short volatility and gets paid the VRP**"
from §3. It is *not* a free lunch: the same literature attributes the premium to a genuine **risk
premium** for bearing crash/variance risk (negative skew, fat left tail) — you are insured *against*,
and are paid to *write* insurance on, market downside.

### A.3 Greeks as derivatives — the +θ / −Γ / −ν tradeoff, formally

Closed-form BSM Greeks for the **short put** (multiply by `−1` of the long-put Greek; per share):

```
Long-put delta:  Δ_longput  = ∂P/∂S = −e^{−qT} N(−d₁)            ≤ 0
Short-put delta: Δ_shortput = −Δ_longput = +e^{−qT} N(−d₁)      ≥ 0   (positive — long-the-underlying tilt)
   equivalently Δ_shortput = e^{−qT}(1 − N(d₁)), since N(−d₁) = 1 − N(d₁).
Γ_shortput = − e^{−qT} φ(d₁) / (S₀ σ √T)                       < 0   (SHORT gamma)
ν_shortput = − S₀ e^{−qT} φ(d₁) √T                              < 0   (SHORT vega)
Θ_shortput = − [ long-put theta ]
   long-put Θ = −S₀φ(d₁)σe^{−qT}/(2√T) + qS₀e^{−qT}N(−d₁) − rKe^{−rT}N(−d₂)
   ⇒ Θ_shortput = + S₀φ(d₁)σe^{−qT}/(2√T) − qS₀e^{−qT}N(−d₁) + rKe^{−rT}N(−d₂)   (dominant term > 0)
```

The short call (covered-call leg) is the mirror: `Δ<0` from the call (capping upside), `Γ<0`, `ν<0`,
`Θ>0`. **Both Wheel legs are +θ / −Γ / −ν — the Wheel is uniformly short gamma and short vega and long
theta across the cycle**, confirming §3's table from the derivatives themselves.

**The gamma–theta identity (the engine of premium decay).** For any *delta-hedged* option position the
BSM PDE collapses to a tight relationship between time decay and convexity. Starting from the
Black–Scholes PDE `Θ + ½σ²S²Γ + (r−q)SΔ + qV − rV = 0` and imposing delta-neutrality with the common
`r≈q≈0` simplification:

```
Θ ≈ − ½ σ² S² Γ.                                  (the gamma–theta tradeoff)
```

Reading it for a **short** option (`Γ<0`): `Θ = −½σ²S²Γ > 0` — **you collect theta exactly in
proportion to the gamma risk you are short.** Per unit of time, a delta-hedged short-gamma book earns
`−½σ²S²Γ·dt` of decay but pays `−½ΓS²(dS)²·…` in re-hedging cost; the *fair* exchange rate between them
is set at `σ = σ_imp`. **If realized `(dS)²` comes in below implied (`σ_real < σ_imp`), the collected
theta overcompensates the realized gamma bleed — that is the VRP, expressed in Greeks.**

**What breaks when undelta-hedged — i.e., the actual Wheel.** The Wheel does *not* delta-hedge; it
*wants* the directional exposure (a CSP is "a paid limit order"). So the clean identity `Θ=−½σ²S²Γ` no
longer captures realized P&L — the un-hedged position also earns/loses `Δ·dS`, which dominates the
`½ΓdS²` term for moves of ordinary size. Decompose realized P&L over `dt` (Itô / delta–gamma–theta):
```
dΠ ≈ Δ dS + ½ Γ (dS)² + Θ dt + ν dσ.
```
For the short put: `Δ>0` helps on up-moves and hurts on down-moves; `½Γ(dS)²<0` is a *quadratic drag
that is symmetric in the sign of `dS`* — it bleeds on **any** large move, up or down; `Θ dt>0` is the
steady credit; `ν dσ<0` is the IV-spike penalty. The signature Wheel loss (stock craters after
assignment) is the regime where `Δ dS` (large negative) and `½Γ(dS)²` (negative) compound while the
`Θ dt` credit is far too small to offset — short gamma "accelerating into the move." The covered-call
premium is, as §3 says, **a thin cushion, not a hedge**, because its `Θ` and `C₀` are tiny next to the
share leg's `Δ·dS`.

### A.4 Optimal-management math — formalizing "close at 50% / 21-DTE", and Kelly sizing

**Marginal theta per unit gamma risk degrades into expiry.** Define the *decay-to-risk ratio* of a
short option as theta earned per unit of (dollar) gamma exposure carried:
```
ρ(T) ≡ |Θ| / (S₀² |Γ|).
```
Using the dominant theta term `|Θ| ≈ S₀φ(d₁)σ/(2√T)` and `S₀²|Γ| = S₀φ(d₁)/(σ√T)` (set `q=0`):
```
ρ(T) ≈ [ S₀φ(d₁)σ/(2√T) ] / [ S₀φ(d₁)/(σ√T) ] = σ²/2 = constant in T (per the PDE),
```
— but the *level* of dollar gamma `S₀²|Γ| = S₀φ(d₁)/(σ√T) → ∞` as `T→0`. So while the *exchange rate*
`Θ:ΓS²` stays at `σ²/2`, **the absolute gamma you must hold to keep earning theta blows up like
`1/√T`** near expiry. Equivalently, the *premium remaining to harvest* shrinks toward zero while the
*per-day gamma risk* explodes — the marginal trade of "hold the last weeks" buys little decay for a lot
of pin/gap risk. This is the precise content of the empirical "**final 21 days carry disproportionate
gamma risk relative to remaining theta**" finding (tastytrade backtests; daystoexpiry summary):

- **50%-of-max-profit close:** the *expected remaining* decay after capturing half the credit is less
  than half the *remaining* gamma/path risk (decay is front-loaded for ATM-ish shorts while variance of
  outcomes keeps accruing), so closing locks a high realized-Sharpe slice and frees collateral to
  recompound — at the cost of forgoing the slow, low-`ρ`-quality tail decay.
- **21-DTE roll/close:** exits before `S₀²|Γ| ∝ 1/√T` enters its steep regime, trading away the last,
  lowest-quality theta to avoid the highest-gamma window. tastytrade reports ~15–20% risk-adjusted
  improvement vs. holding to expiry; treat as backtest-conditional, not a law.

**Fractional-Kelly sizing for repeated premium selling.** Model each Wheel cycle as an i.i.d. bet with
gross multiplicative return `1 + f·X`, where `f` is the fraction of capital committed as put collateral
and `X` is the per-cycle return on that collateral (`X = Π_CSP/Kp`, bounded below by `−1` at `S_T=0`,
bounded above by `P₀/Kp`). The growth-optimal (Kelly) fraction maximizes expected log-wealth:
```
g(f) = E^ℙ[ ln(1 + f·X) ],     f* = argmax_f g(f).
```
For small per-bet edge/variance, the standard quadratic expansion gives the workhorse approximation
```
f* ≈ E^ℙ[X] / E^ℙ[X²] ≈ μ_X / (σ_X² + μ_X²),
```
with `μ_X = E^ℙ[X]` the mean cycle return (positive iff the VRP edge of §A.2 is positive) and `σ_X²` its
variance. **Critical caveat for short premium:** `X` is *sharply left-skewed and fat-tailed* (capped
upside `P₀/Kp`, large left tail toward `−1`). The quadratic expansion *understates* tail risk, so
full-Kelly is known to over-bet skewed payoffs and court ruin. The literature's response is
**fractional Kelly** (e.g. ½-Kelly): committing `c·f*`, `c∈(0,1)`, reduces variance (and drawdown) more
than proportionally to the growth it gives up — a convex tradeoff that is especially appropriate for
negatively-skewed sellers. Recent work specializes this to index put-writing with VIX-conditioned and
hybrid Kelly sizing (Kelly/VIX put-writing, arXiv 2508.16598). 

**Assumptions and limits (state them plainly):** Kelly assumes (i) i.i.d. bets — Wheel cycles are *not*
independent (vol clusters; a crash hits collateral and the next cycle's IV simultaneously), (ii) known
`μ_X, σ_X²` — these are *estimated with error* and `μ_X` (the VRP) is small and time-varying, (iii)
infinitely divisible reinvestment — collateral is lumpy (`Kp×100` per contract). Under estimation error
and serial dependence, the practical optimum sits **well below** full Kelly. This is sizing
*mathematics*, **not** a sizing recommendation — `f` is the operator's call (per SKILL's neutral stance).

### A.5 Empirical anchor — what index/academic evidence actually shows for Wheel-like selling

The Wheel has no long-run academic index of its own, but its two legs are exactly the CBOE benchmark
indices, and covered-call/put-write studies are the closest published evidence.

| Index / study | Strategy | Period | Ann. return | Ann. σ | Sharpe | Max DD |
|---|---|---|---|---|---|---|
| **PUT** (Bondarenko 2019) | monthly ATM SPX put-write, T-bill collateral | 6/1986–12/2018 | **9.54%** | **9.95%** | **0.65** | — |
| **S&P 500 TR** (same study) | buy-and-hold | 6/1986–12/2018 | 9.80% | 14.93% | 0.49 | −50.9% |
| **PUT** (Cboe/Bondarenko, 2006–18 window) | put-write | 2006–2018 | — | 9.91% | — | −32.7% |
| **WPUT** | weekly ATM put-write | 2006–2018 | — | lower | — | **−24.2%** |
| **BXM** (Whaley 2002; Callan; ACG 2012) | monthly ATM buy-write | ~1988–2011 | ~9.1% | ≈⅔ of SPX | 0.20 vs 0.15 (SPX) | shallower than SPX |

**What the evidence consistently shows:**
1. **Comparable or slightly lower total return, ~⅔ the volatility ⇒ higher Sharpe** than buy-and-hold
   (PUT 0.65 vs SPX 0.49; BXM > SPX). The improvement is *risk-adjusted*, driven by variance reduction,
   not by beating the index on raw return.
2. **The source of the risk-adjusted edge is explicitly the VRP** — Bondarenko (2019) attributes PUT's
   performance to the ~4.2-vol-point implied-minus-realized gap; Cboe's white paper headline is
   "volatility risk premium facilitated higher risk-adjusted returns."
3. **Materially smaller and shorter drawdowns** (PUT −32.7% vs SPX −50.9% in 2008; WPUT −24.2%; PUT's
   longest drawdown 29mo vs SPX 52mo). The capped-upside/full-downside asymmetry shows up as
   *underperformance in strong bull legs* (late-1990s) and *outperformance in selloffs* (2000–03,
   2008) — the §6 "everything works in a bull market" critique is the mirror image of this.
4. **Critical honest caveats:** these are *fully-collateralized, mechanical, ATM, index* writes — not
   leveraged single-name discretionary Wheels. Single-name Wheels add idiosyncratic gap/assignment risk
   the indices diversify away; leverage destroys the favorable Sharpe; and the VRP itself **compresses
   or inverts in crises** (realized > implied precisely when you are assigned). The covered-call ETF
   complex (JEPI/QYLD/XYLD) underperforming buy-and-hold (§6) is consistent: harvesting VRP is a
   *Sharpe* play and a *downside-dampener*, not a total-return maximizer.

### A.6 Where the BSM assumptions fail (and how each failure hits the Wheel)

| BSM assumption | Reality | Effect on the Wheel math above |
|---|---|---|
| Constant `σ` | vol is stochastic, mean-reverting, *clusters*; there is a **volatility skew** (OTM puts richer) | `N(−d₂)` and Greeks computed at one `σ` mis-state risk; the put you sell sits on the *expensive* (skew) side — which *helps* the seller's premium but signals priced crash risk |
| Lognormal `S_T`, no jumps | returns are fat-tailed, left-skewed; gaps and crashes occur | the `½Γ(dS)²` term and the left tail of `X` are *worse* than Gaussian ⇒ Kelly/variance math understates ruin risk; assignment can arrive via a gap, not a drift |
| No early exercise (European) | US equity options are **American**; short calls assigned the night before ex-dividend when extrinsic < dividend (§7 failure mode #3) | `N(−d₂)` is a *lower bound* on assignment probability; early assignment breaks the "expires worthless" base case |
| Frictionless / continuous hedging | bid/ask spreads, min-ticks, 100-share lots, T+1 cash settlement, taxes (§5), 429 rate limits | erodes the thin VRP edge; lumpy collateral breaks Kelly's divisibility; the gamma–theta identity assumes costless re-hedging the Wheel never does |
| `μ = r` (risk-neutral agents) | equities carry an equity premium and a *priced* variance risk premium | the *entire* real-world edge (§A.2) exists **only** because `ℙ ≠ ℚ`; remove the VRP and the Wheel's expected excess return is zero |

**One-line synthesis.** Under BSM the Wheel has *zero* risk-neutral edge; its real, repeatable edge is
the **variance risk premium** (`σ_imp > σ_real`), collected as positive theta in exchange for being
short gamma and short vega — i.e., for writing insurance against downside and volatility spikes. The
50%/21-DTE heuristics are crude optima of the theta-per-gamma-risk ratio as it degrades into expiry;
fractional-Kelly is the growth-optimal lens for sizing the repeated bet, heavily caveated by the
payoff's negative skew, serial dependence of volatility, and estimation error in the (small,
time-varying) edge.

### Appendix A sources (academic + index)

- **Carr, P. & Wu, L. (2009), "Variance Risk Premiums," *Review of Financial Studies* 22(3):1311–1341** — variance-swap-rate construction; documents the persistent negative return to long variance (positive to selling it). SSRN abstract_id=1359527; [NYU PDF](https://engineering.nyu.edu/sites/default/files/2019-01/CarrReviewofFinStudiesMarch2009-a.pdf).
- **Bollerslev, T., Tauchen, G. & Zhou, H. (2009), "Expected Stock Returns and Variance Risk Premia," *Review of Financial Studies* 22(11):4463–4492** — defines VRP as implied minus realized variance; shows it predicts the equity premium. [Duke PDF](https://public.econ.duke.edu/~boller/Published_Papers/rfs_09.pdf); SSRN abstract_id=948309.
- **Bondarenko, O. (2019), "Historical Performance of Put-Writing Strategies," Cboe white paper / SSRN abstract_id=3393940** — PUT 9.54% ann. / 9.95% σ / Sharpe 0.65 vs SPX 9.80% / 14.93% / 0.49 (6/1986–12/2018); VIX 19.3% vs realized 15.1% (1990–2018). [Cboe PDF](https://cdn.cboe.com/resources/education/research_publications/PutWriteCBOE19_v14_by_Prof_Oleg_Bondarenko_as_of_June_14.pdf).
- **Whaley, R. (2002), "Return and Risk of CBOE Buy Write Monthly Index," *Journal of Derivatives*** — BXM risk-adjusted improvement over SPX; with Callan Associates (2006) and Asset Consulting Group (2012) follow-ups (BXM ~9.1% at ~⅔ SPX volatility; Sharpe 0.20 vs 0.15). [Cboe Callan PDF](https://cdn.cboe.com/resources/education/research_publications/Callan_CBOE.pdf).
- **Cboe S&P 500 PutWrite (PUT) / WeeklyPut (WPUT) / PutWrite methodology & dashboards** — index construction and drawdown stats (WPUT −24.2% vs PUT −32.7% vs SPX −50.9%, 2006–18). [PUT factsheet](https://cdn.cboe.com/resources/indices/factsheet/CboeGlobalIndices_PUT-Index.pdf); [PutWrite methodology](https://cdn.cboe.com/api/global/us_indices/governance/Cboe_PutWrite_Indices_Methodology.pdf).
- **N(d₁) vs N(d₂) / delta-as-probability distinction** — Hull, *Options, Futures, and Other Derivatives* (risk-neutral exercise probability `N(d₂)` for calls, `N(−d₂)` for puts ≠ delta `N(d₁)`); [Columbia FE notes, Haugh](https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf).
- **Kelly / fractional-Kelly sizing** — Kelly (1956); MacLean, Thorp & Ziemba, "Good and Bad Properties of the Kelly Criterion" ([Berkeley PDF](https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf)); index put-write specialization "Sizing the Risk: Kelly, VIX, and Hybrid Approaches in Put-Writing" ([arXiv 2508.16598](https://arxiv.org/html/2508.16598v1)).
- **50% / 21-DTE management evidence** — tastytrade research on managing-winners and the 21-DTE gamma window (backtest-conditional, not peer-reviewed); summarized in [daystoexpiry "21-DTE rule"](https://www.daystoexpiry.com/blog/the-21-dte-rule-explained-when-and-why-to-close-options-positions-early).

> **Standing caveat.** Every figure above is regime- and assumption-conditional. The VRP is an
> *average* that compresses or goes negative exactly in the crises that assign the Wheel; index results
> do not transfer to leveraged or single-name discretionary Wheels. This is the mathematical "why it
> works," not a claim that it will — risk and sizing remain the operator's call.
