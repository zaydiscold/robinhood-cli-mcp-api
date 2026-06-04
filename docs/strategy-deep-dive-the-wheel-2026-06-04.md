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
