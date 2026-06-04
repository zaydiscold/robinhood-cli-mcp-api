# Strategy deep-dive: Rolling options

> Advanced, multi-perspective study (mechanics · variants · decision rules · Greeks/math · RH-specific
> mechanics · tax · current practitioner sentiment · failure modes). **Descriptive background, NOT advice
> and NOT risk guidance** — every "rule" is a lever with tradeoffs; risk/sizing are the operator's call.
> Extends `options-strategies-knowledge-base-2026-06-03.md` (line 27) and the `options roll-plan` command.
> Tax law lives in `tax-aware-options-strategies.md`; this adds the *rolling-specific* angles. Compiled
> 2026-06-04 from a multi-agent study.

## 1. What rolling is + the variants

A **roll** is not a primitive — it's **close the existing leg + open a replacement** on the same
underlying, executed as a pair. Close a short = **buy-to-close** (`side: buy, position_effect: close`);
close a long = **sell-to-close**. Then mirror-open the new leg (`position_effect: open`).

| Variant | Strike | Expiry | Canonical use |
|---------|--------|--------|---------------|
| Roll **out** | same | later | Buy time/theta; defend a tested short |
| Roll **up** | higher | same | Short call: raise the cap as stock rises. Long call: chase |
| Roll **down** | lower | same | Short put: cut assignment risk / lower the strike |
| Roll **up-and-out** | higher | later | CC defense — let a winner run while still taking a net credit |
| Roll **down-and-out** | lower | later | CSP defense — stock fell through; push out + lower for a credit |

"Out" supplies the extra extrinsic that funds the strike move and keeps the roll a **net credit** — the
prized outcome. **Net credit** = you're paid to extend (improves/holds basis, never adds capital at
risk). **Net debit** = you pay to delay (a flag — see failure modes). Repo math:
`net = closeContribution + openContribution`, each `= +limit if selling, −limit if buying`;
`direction = net >= 0 ? "credit" : "debit"`.

**By position:** CC → roll **up-and-out** to avoid being called away below market; CSP → roll
**down-and-out** to defer/avoid assignment and lower basis (the Wheel's core income move); long
option/LEAP → sell-to-close + buy-to-open (structurally debit-prone); spreads → roll the tested side
(close both legs, open two new). **As orders:** a margin **combo** (one `options/orders/` POST, mixed
`position_effect`, atomic) or **two orders** (close then open) — two orders is **mandatory in a cash
account** (the open can't be funded until the close settles).

## 2. When to roll vs close vs take assignment (levers, not mandates)

- **Roll** to keep the position alive (extend, harvest theta, defend, move a strike) **when the market
  lets you for an acceptable net — ideally a credit.**
- **Close** when the thesis is done / premium mostly captured / you just want the risk off (the 50% rule
  is a *close* trigger).
- **Take assignment** when the outcome is acceptable/desired (a CSP assigning = shares at a strike you
  accepted; the Wheel intends this). Assignment is a planned terminal state, not a failure.

**Guidelines (choices):** *"always roll for a net credit"* (a credit roll never increases capital at
risk to stay open; a debit roll does the opposite); *21-DTE management* (exit the high-gamma final
weeks); *50% profit / ~2× loss* conventions. **When rolling is the WRONG move:** (a) rolling for a
**debit to avoid realizing a loss** — converts a closed loss into a bigger open one + more time at risk;
(b) **chasing a runaway short** — each roll a smaller credit/debit while never catching the trend;
(c) **perpetual rolling** masking a wrong thesis. Neutral agent framing: surface the **net (credit/
debit), the change in capital at risk, and whether the strike move keeps pace** — then do what the
operator asks.

## 3. Greeks / math — compute the *delta* between old and new leg

- **Duration:** rolling out ↑T → more extrinsic (short collects more) but longer exposure.
- **Theta:** the farther leg has **lower per-day theta** — you trade decay *rate* for decay *runway*
  (why 21-DTE management exists: near-leg theta is rich, far-leg thinner).
- **Vega:** farther leg has **higher vega** — rolling out *increases* IV sensitivity (worse for a short
  if IV spikes; richer to sell if IV mean-reverts).
- **Gamma:** rolling out *reduces* gamma (peaks near expiry ATM) — the point of getting out of the
  high-gamma zone.
- **Delta:** rolling a short call *up* / short put *down* reduces |delta| (further OTM, less drag).
- **Breakeven / basis:** track **cumulative credit across the whole roll chain**, not just this roll
  (e.g. assigned-basis = new_strike − total_net_credit_collected).
- **Assignment/ex-div timing on the leg being closed:** an **ITM short call with extrinsic < the
  dividend** is a prime **early-assignment candidate the night before ex-div** — your shares get called
  away before you can roll. Check the ex-div calendar against any ITM short call you plan to roll; roll
  *before* ex-div to keep shares.

## 4. RH-specific mechanics (this repo)

`options roll-plan` resolves both contracts, quotes them live, computes the net, and emits **two dry-run
single-leg orders** (`closeOrder` + `openOrder`) — not a combo — so the cash-account staging is
expressible and each leg is priced independently. Defaults: close `safe-sell-probe`, open `mid` (dry-run
controls — **requote at natural/mid before any live order**; the dry-run net is not a fill estimate).

- **Cash-account "kosher roll" (`--cash-account`):** options proceeds settle **T+1**; funding a same-day
  open on unsettled cash = **good-faith violation** (3/yr → 90-day settled-only restriction). The flag
  stages `openOrder.notBeforeDate = nextBusinessDay()` with `requiresFreshChecks` (settled cash/BP after
  the close · fresh bid/ask/Greeks · same account/symbol/expiration/strike). Model: **close today →
  settle overnight → open next business day**; the open is a deferred, re-quoted, re-gated task.
- **⚠️ Known gap (fix candidate):** `nextBusinessDay()` skips Sat/Sun but **not market holidays** — a
  roll closed the business day before a holiday stages its open onto a closed-market day. Sanity-check
  the staged `notBeforeDate` against the exchange calendar until this is fixed.
- **GTC opens are gated by *overnight* buying power**, not regular BP — a staged GTC open can `400`
  "not enough overnight buying power" even when regular BP looks fine.
- **Account gating:** margin → same-day combo/two-order rolls; **cash → kosher roll only**; Roth IRA →
  defined-risk + CC/CSP only, no margin/naked.
- **Two-order rolls aren't atomic:** confirm the close **filled** (order history is the source of truth —
  failure-mode #20) before relying on the open.

## 5. Tax (US — rolling-specific; general law in `tax-aware-options-strategies.md`)

- **Wash sale on the LOSING leg (the central trap):** a roll that BTCs a leg at a **loss** and re-opens
  a **substantially identical** option within the 61-day window disallows the loss (IRC §1091). Consensus
  read: options are substantially identical at **same underlying AND same strike** — **changing strike OR
  expiration generally breaks it**, and a real roll almost always changes the expiration, so a normal
  roll-out for a credit is **usually not** a wash sale. Danger zone: rolling a *loser* at the **same
  strike + near expiration**. No IRS bright line. **Only the losing leg** matters; a winning roll has no
  issue. The disallowed loss is **deferred** (added to the new leg's basis, old holding period tacks on),
  not destroyed.
- **Holding period:** short-option rolls are **always short-term** (§1233) — you can't age premium into
  LTCG. Long-option rolls = a sale → frequent rolling keeps you perpetually short-term.
- **QCC taint when rolling CCs up to chase:** rolling a short call **up** as the stock rallies can push
  the strike ITM/deep-ITM → **suspends or resets the *stock's* LTCG clock** (and can disqualify
  dividends). "Deep-ITM" per the LQB table (Treas. Reg. §1.1092(c)-1). A roll re-writing a call with
  **≤30 days** life fails the QCC >30-day test. (Repo §2 has the LQB detail.)
- **§1256 — rolling index options (SPX/XSP/NDX/RUT/VIX) is materially cleaner:** every closed leg is
  **60/40 regardless of holding period** (no short-term-premium taint), and the **wash-sale rule does NOT
  apply** to §1256 contracts (they're marked-to-market) — so rolling a *losing* SPX position has **no
  wash-sale exposure at all.** Caveat: any §1256 leg open on 12/31 is MTM-deemed-sold. **The decision
  lever: rolling SPX/XSP sidesteps both the wash-sale rule and the short-term taint that rolling SPY/
  equity options creates — the cleanest "roll without tax friction" path.**
- **IRA:** no wash-sale/holding-period consequence in-account (but no tax-loss harvesting either); the
  one live risk is the **cross-account trap** — a substantially-identical re-open in an IRA **permanently
  disallows** a taxable-account loss with no basis add-back. IRAs can't roll on margin/naked → defensive
  rolls needing margin aren't available.

## 6. Current practitioner sentiment (~30 days to 2026-06-04; X primary, Reddit not directly indexable)

- **"Always roll for a credit" is near-gospel** — the canonical retail rulebook (@BhargavaVJ, 05-14, "10
  rules options sellers live by": #8 roll only for credit, #5 close at 50%, #3 30-45 DTE, #4 0.20-0.30
  delta, #10 know your taxes). Echoed by @strikeiq (05-18, "take 50-70% early & roll").
- **The live debate isn't whether to roll for a credit — it's when "rolling for a credit" is just
  deferring a loss you should take:** the critique is that if a credit is only available by rolling
  **90-120 days out**, the market is pricing real downside and you've trapped capital. "Rolling for a
  debit = throwing good money after bad." Stop-rolling triggers: thesis invalidated / key support breaks /
  credit only available too far out.
- **21-DTE / 50% management** (tastytrade-derived) remains the default short-premium frame.
- **Worked examples this cycle:** roll-**up**-not-out on a runaway winner (@myoptiondiary, 06-03, NBIS CC
  rolled up twice for credits, max profit $599 → $7,440); the five named directions (up/out/up-and-out/
  down/early, @ThetaEdgeHQ); CC roll-vs-cap decisions ($SOFI @CantoRobinHood; $PLTR roll-down-and-out
  @Rag59326331); CSP roll-down-and-out defense ($IBIT @TheFreedomArch); roll-into-a-LEAP ($HIMS
  @JasonMcMurray33); PMCC maintenance roll at 3-4 months left (@TOptionStrategy).
- **The gap this KB fills:** the crowd manages rolls for **P&L/credit**, not for wash-sale/holding-period
  optimization — tax barely surfaces beyond "know your obligations." Section 5 is exactly that edge.

## 7. Community-standard playbook (consensus, neutral)

1. **Roll for a net credit, not a debit.** 2. **Manage early — 21 DTE and/or 50% profit;** never hold to
expiry. 3. **Roll *out* for time/credit, *up/down* to follow the underlying;** combine as up-and-out
(defend a CC) / down-and-out (defend a CSP). 4. **Defend the tested side** — roll for credit while the
thesis holds, else take assignment or close. 5. **Know when to STOP** — credit only available far out,
support breaks, or only a debit works → take the loss, redeploy. 6. **Roll-up-not-out** to capture a
runaway winner. 7. **PMCC:** roll the long LEAP at ~3-4 months left, keep selling the short call.
8. **Account gating:** margin rolls instantly; **cash = T+1 kosher roll**; IRA = defined-risk only.

## 8. Failure modes (ranked, neutral)

1. **Rolling for a debit to dodge a realized loss** — bigger open loss + more time at risk.
2. **Chasing a runaway short** — each roll shrinks the credit / flips to debit; flag the trend toward debit.
3. **Early assignment around ex-dividend** — ITM short call (extrinsic < dividend) called away before you roll.
4. **Illiquid far-month strikes** — the `mid` dry-run looks fine; the real fill is far worse, and exit is costly.
5. **Cash-account GFV** — same-day close→open on unsettled cash; always stage via `--cash-account`.
6. **Holiday-staged open** — `nextBusinessDay()` ignores market holidays; verify the staged date is a trading day.
7. **Perpetual rolling** masking a wrong thesis — each roll must be re-justified as a fresh decision.
8. **Two-order roll non-atomicity** — confirm the close filled (order history) before relying on the open.

> **Log every roll to `trading-log.md` with the thread** (what you're rolling *from*: prior leg, strike,
> DTE, cumulative credit) so the next decision isn't re-derived from raw order history.

### Sources
RH order templates + `options roll-plan` (`cli/src/index.ts`); IRC §§1091/1092(c)/1233/1256 + Treas.
Reg. §1.1092(c)-1 (Option Samurai, Days-to-Expiry, OptionsTaxGuy, Fidelity, CBOE, Green Trader Tax);
X handles dated above; tastytrade 21-DTE/50% material; options-education syntheses of the r/thetagang
consensus. Multi-agent study, 2026-06-04. (Reddit bodies were not directly indexable this run; X posts
are primary/dated, education-site syntheses secondary.)
