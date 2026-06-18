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
  a **substantially identical** option within the 61-day window disallows the loss (IRC §1091).
  "Substantially identical" has **no bright-line** definition — it's a facts-and-circumstances test,
  broader than "same CUSIP." The practitioner consensus is that options are substantially identical
  at **same underlying AND same strike** — a roll that changes **both** strike AND expiration
  significantly reduces wash-sale risk, but this is **not a legal guarantee** (no IRS bright line
  exists). A normal roll-out for a credit virtually always changes the expiration, so it is **often**
  not a wash sale, but the only legally safe position is that any losing-leg BTC followed by a
  re-open in the same underlying within 30 days *could* be challenged. Danger zone: rolling a
  *loser* at the **same strike + near expiration**. **Only the losing leg** matters; a winning
  roll has no issue. The disallowed loss is **deferred** (added to the new leg's basis, old
  holding period tacks on), not destroyed. **See `knowledge/tax-loss-harvesting.md` for the full
  strict-vs-consensus table and `docs/tax-aware-options-strategies.md` for authoritative tax
  guidance.**
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

---

## Appendix A — Quantitative anatomy of a roll (dissertation-level)

> Rigorous, derivation-first treatment of the roll as a pair of Black–Scholes-priced transactions.
> Read-only research math; not advice, not a fill estimate, not permission to send an order. All
> closed-form claims below are stated under the stated BS assumptions; §A.7 documents exactly where
> those assumptions break against the live RH surface this repo trades.

### A.0 Symbols, conventions, and assumptions

| Symbol | Meaning | Units |
|--------|---------|-------|
| $S$ | underlying spot | $ |
| $K$ | strike | $ |
| $T$ | time to expiry (year-fraction, ACT/365) | yr |
| $r$ | continuously-compounded risk-free rate | /yr |
| $q$ | continuous dividend yield | /yr |
| $\sigma$ | (implied) volatility, per $\sqrt{\text{yr}}$ | /$\sqrt{\text{yr}}$ |
| $\tau$ | calendar time (so $T$ decreases as $\tau$ advances) | yr |
| $N(\cdot),\ \varphi(\cdot)$ | standard normal CDF and pdf | — |
| $V$ | BS option value (call $C$ / put $P$) | $ |
| $m$ | log-moneyness $\ln(S/K)$ | — |

**Sign convention for the operator.** A *credit* is cash received (positive to the account); a *debit*
is cash paid. For a **short** premium position (CC, CSP, credit spread — the dominant rolling context),
**buy-to-close (BTC) the near leg pays a debit equal to its market value**, and **sell-to-open (STO) the
far/restruck leg receives a credit equal to its market value.**

Black–Scholes price (with carry $b \equiv r-q$):
$$
C = S e^{-qT}N(d_1) - K e^{-rT}N(d_2),\qquad
P = K e^{-rT}N(-d_2) - S e^{-qT}N(-d_1),
$$
$$
d_1=\frac{\ln(S/K)+(r-q+\tfrac12\sigma^2)T}{\sigma\sqrt T},\qquad d_2=d_1-\sigma\sqrt T .
$$

**BS assumptions in force** (and where they fail — §A.7): GBM underlying with constant $\sigma$ over
the life of each leg; frictionless, continuous trading; one constant $r$; continuous proportional
dividends $q$; European exercise; a continuum of strikes/maturities; no bid/ask. The roll instruments
this repo touches are **American** (equity/ETF options) — only **index options (SPX/XSP/NDX/RUT/VIX)**
are truly European and cash-settled (see `index-options-1256-conclusion-2026-06-04.md`).

### A.1 Net credit/debit of a roll, formally

Let the **near (closed) leg** be priced $V_{\text{near}}=V(S,K_1,T_1,\sigma_1)$ and the **far/restruck
(opened) leg** $V_{\text{far}}=V(S,K_2,T_2,\sigma_2)$, with $T_2>T_1$ for a roll *out* and
$K_2\neq K_1$ for a roll up/down. For a short-premium roll:
$$
\boxed{\ \text{Net}\;=\;\underbrace{V_{\text{far}}}_{\text{STO credit (open)}}\;-\;\underbrace{V_{\text{near}}}_{\text{BTC cost (close)}}\ }
$$
$\text{Net}>0 \Rightarrow$ **net credit**; $\text{Net}<0 \Rightarrow$ **net debit**. This matches the repo
engine exactly: `net = closeContribution + openContribution` with each leg contributing $+\text{limit}$
when sold and $-\text{limit}$ when bought, so for a short roll $\text{closeContribution}=-V_{\text{near}}$
(buying) and $\text{openContribution}=+V_{\text{far}}$ (selling).

Decompose each option into **intrinsic** $I$ and **extrinsic (time) value** $X\ge 0$:
$V = I + X$, with $I_{\text{call}}=(S-K)^+$, $I_{\text{put}}=(K-S)^+$. Then
$$
\text{Net} = \big(I_{\text{far}}-I_{\text{near}}\big) + \big(X_{\text{far}}-X_{\text{near}}\big).
$$

**Pure roll-out (same strike, $K_2=K_1=K$, $\sigma$ flat).** Intrinsic is identical ($I_{\text{far}}=I_{\text{near}}$),
so the entire net is the **extrinsic increment**:
$$
\text{Net}_{\text{out}} = X(S,K,T_2,\sigma)-X(S,K,T_1,\sigma) \;>\;0 .
$$
This is **strictly positive** whenever $T_2>T_1$, because BS extrinsic value is **strictly increasing in
maturity** for fixed $(S,K,\sigma,r,q)$. Proof sketch: extrinsic value equals the price of the
corresponding *out-of-the-money-side* optionality, $X=V-I$, and $\partial V/\partial T = \Theta_{\text{cal}}>0$
in calendar-to-expiry terms for a vanilla option with non-negative carry on the relevant side; equivalently,
a longer option dominates a shorter one by the no-arbitrage calendar-spread bound
$V(T_2)\ge V(T_1)$ for $T_2\ge T_1$ (a long calendar can never have negative value under continuous
dividends with $r\ge q$; the rare $r<q$ deep-ITM exception is noted in §A.7). **Hence a roll *out* for the
same strike is essentially always a net credit** — the structural reason "always roll for a credit" is
even *achievable* as a default.

**ATM scaling — the $\sqrt T$ law.** At the money ($S=Ke^{-(r-q)T}$, so $d_1=\tfrac12\sigma\sqrt T$,
$d_2=-\tfrac12\sigma\sqrt T$), the BS value is approximately
$$
V_{\text{ATM}} \approx S e^{-qT}\,\big[N(d_1)-N(d_2)\big] \approx \frac{S e^{-qT}\sigma\sqrt T}{\sqrt{2\pi}}\;\;\Longrightarrow\;\; X_{\text{ATM}}\;\propto\;\sigma\sqrt T .
$$
(Using $N(x)-N(-x)\approx 2x\varphi(0)=x\sqrt{2/\pi}$ for small $x$.) Therefore the credit from rolling an
ATM short out from $T_1$ to $T_2$ is
$$
\text{Net}_{\text{out,ATM}} \approx \frac{S\sigma}{\sqrt{2\pi}}\big(\sqrt{T_2}-\sqrt{T_1}\big)\;>\;0 .
$$
**Concavity in $\sqrt T$** is the key practitioner fact: extrinsic added per unit of *extra calendar time*
shrinks the farther out you already are ($d(\sqrt T)/dT = 1/(2\sqrt T)$). A 30→60 DTE roll adds far more
credit per added day than a 300→330 DTE roll. This is the mathematical seed of the deferral problem (§A.5):
to *keep* manufacturing a fixed-dollar credit on a position moving against you, each successive roll must
reach disproportionately farther out in time.

**Roll up/down with the move (changing $K$).** Restriking changes intrinsic *and* extrinsic. For a short
call rolled **up** ($K_2>K_1$) while the stock rallied, $I_{\text{far}}<I_{\text{near}}$ (less intrinsic
bought back is offset by the higher strike), and the credit condition becomes a horse-race between the
**extrinsic gained from duration** and the **intrinsic + extrinsic given up by moving the strike OTM**:
$$
\text{Net}\;=\;\underbrace{(X_{\text{far}}-X_{\text{near}})}_{\ge 0\ \text{if } T_2>T_1,\ \text{often}<0\ \text{if } K_2\ \text{far OTM}}\;+\;\underbrace{(I_{\text{far}}-I_{\text{near}})}_{\le 0\ \text{for short call rolled up}} .
$$
**Net-credit condition (general):**
$$
\boxed{\ V(S,K_2,T_2,\sigma_2)\;\ge\;V(S,K_1,T_1,\sigma_1)\ }
$$
i.e. *the new leg you sell must be worth at least the old leg you buy back.* Rolling **out** relaxes this
(adds $T$, which adds value); rolling **up a short call** or **down a short put** tightens it (moves the
strike away from the money, which subtracts value). The two compose: **up-and-out / down-and-out** is the
practitioner default precisely because the duration term ($+$) is used to *fund* the strike move ($-$) and
still clear $\text{Net}\ge 0$. Quantitatively, the maximum strike-distance you can roll while staying a
credit grows with $\Delta T$ via the $\sigma\sqrt{T_2}$ extrinsic budget.

### A.2 Greeks delta of the roll (new leg minus old leg)

Define the **roll Greek** as the post-roll book sensitivity minus the pre-roll one. For a short position
(the book holds $-1$ contract), the *position* Greek is $-\mathcal{G}$; rolling swaps $-\mathcal{G}_{\text{near}}\to-\mathcal{G}_{\text{far}}$,
so the change in the **position** Greek is $\Delta\mathcal{G}^{\text{pos}} = -(\mathcal{G}_{\text{far}}-\mathcal{G}_{\text{near}})$.
We report the **per-contract leg** deltas $\Delta\mathcal G \equiv \mathcal G_{\text{far}}-\mathcal G_{\text{near}}$ and let
the operator apply the $-1$ for a short and the $\times 100$ multiplier. BS Greeks:
$$
\Delta_{\text{call}}=e^{-qT}N(d_1),\quad
\Gamma=\frac{e^{-qT}\varphi(d_1)}{S\sigma\sqrt T},\quad
\nu=S e^{-qT}\varphi(d_1)\sqrt T,\quad
\Theta_{\text{call}}=-\frac{S e^{-qT}\varphi(d_1)\sigma}{2\sqrt T}-rK e^{-rT}N(d_2)+qSe^{-qT}N(d_1).
$$

**Theta — decreases (in magnitude) rolling out. $|\Theta|\propto 1/\sqrt T$ (ATM).** The dominant
(decay) term is $-\dfrac{Se^{-qT}\varphi(d_1)\sigma}{2\sqrt T}$. At the money $\varphi(d_1)\approx\varphi(0)$
is roughly $T$-independent, so
$$
|\Theta_{\text{ATM}}|\;\approx\;\frac{S\sigma\varphi(0)}{2\sqrt T}\;\propto\;\frac{1}{\sqrt T}\;\;\Longrightarrow\;\;
\frac{|\Theta_{\text{far}}|}{|\Theta_{\text{near}}|}\approx\sqrt{\frac{T_1}{T_2}}<1 .
$$
Rolling 30→60 DTE roughly **multiplies per-day theta by $\sqrt{30/60}\approx0.71$** — you collect ~29% less
decay *per day* but over a longer runway. This is the exact mechanism behind **21-DTE management**: theta
is *steepest* in the final weeks, so a short harvested there earns decay fastest but also lives in the
highest-gamma zone. Consistent with Tannous & Zhang (2008), who show the time-value of at/near-the-money
options decays at a rate that **decreases over (calendar) time** — i.e. the decay rate is front-loaded —
which is the put-rolling analogue of the $1/\sqrt T$ statement.

**Vega — increases rolling out. $\nu\propto\sqrt T$ (ATM).** With $\varphi(d_1)\approx\varphi(0)$,
$$
\nu_{\text{ATM}}\approx S e^{-qT}\varphi(0)\sqrt T\;\propto\;\sqrt T\;\;\Longrightarrow\;\;\frac{\nu_{\text{far}}}{\nu_{\text{near}}}\approx\sqrt{\frac{T_2}{T_1}}>1 .
$$
Rolling 30→60 DTE roughly **multiplies vega by $\sqrt{2}\approx1.41$.** For a *short*, position vega is
$-\nu$, so rolling out makes the book **more short vega** — better if IV is rich and mean-reverts (you sold
more vol), worse if IV spikes after the roll (mark-to-market pain scales with the larger $\nu$). This is the
quantitative content of "rolling out increases IV sensitivity."

**Gamma — decreases rolling out. $\Gamma\propto 1/\sqrt T$ (ATM).**
$$
\Gamma_{\text{ATM}}\approx\frac{e^{-qT}\varphi(0)}{S\sigma\sqrt T}\;\propto\;\frac{1}{\sqrt T}\;\;\Longrightarrow\;\;\frac{\Gamma_{\text{far}}}{\Gamma_{\text{near}}}\approx\sqrt{\frac{T_1}{T_2}}<1 .
$$
Gamma peaks ATM near expiry and collapses with maturity; rolling out is precisely the act of **stepping out
of the high-gamma terminal zone.** A short is short gamma (position $-\Gamma$); rolling out *reduces* the
magnitude of that short-gamma risk per contract. Note the tight coupling $\Theta \approx -\tfrac12\sigma^2 S^2\Gamma$
(the BS PDE's gamma–theta identity at $r=q=0$): the same $1/\sqrt T$ factor governs both, so **you cannot
shed terminal gamma without simultaneously surrendering peak theta** — they are two faces of one quantity.

**Delta of the roll.** For a pure roll-out (same $K$), $\Delta_{\text{far}}-\Delta_{\text{near}}$ is second-order
(both legs share $S,K$); the dominant delta change comes from **restriking**. Rolling a short call **up**
($K_2>K_1$) lowers $N(d_1)$, so $\Delta_{\text{far}}<\Delta_{\text{near}}$ and the leg is *less* positive-delta;
for the short book (position $-\Delta$) this **reduces the negative delta drag** — the position is less hurt
by continued upside. Symmetrically, rolling a short put **down** moves it further OTM, $|\Delta|$ falls, and
assignment pressure eases. This is the formal version of "roll up/down to cut directional exposure."

Summary table (ATM, roll *out* $T_1\to T_2$, per contract):

| Greek | Scaling | Far/near ratio | Effect on a short book |
|-------|---------|----------------|------------------------|
| Extrinsic $X$ | $\propto\sqrt T$ | $\sqrt{T_2/T_1}>1$ | more credit to collect (good) |
| Theta $|\Theta|$ | $\propto 1/\sqrt T$ | $\sqrt{T_1/T_2}<1$ | slower decay/day (the cost of duration) |
| Vega $\nu$ | $\propto\sqrt T$ | $\sqrt{T_2/T_1}>1$ | more short-vega exposure |
| Gamma $\Gamma$ | $\propto 1/\sqrt T$ | $\sqrt{T_1/T_2}<1$ | less short-gamma risk (good) |

### A.3 The variance/volatility risk premium — why the credit has positive expectancy *at all*

A short-premium roll only carries positive expected value because option **implied** variance trades
systematically *above* subsequently **realized** variance — the **variance risk premium (VRP)**. Formally,
the VRP is
$$
\text{VRP}\;=\;\mathbb{E}^{\mathbb P}\!\big[\sigma_{\text{realized}}^2\big]\;-\;\mathbb{E}^{\mathbb Q}\!\big[\sigma^2\big]\;<\;0,
$$
i.e. the risk-neutral ($\mathbb Q$) expected variance embedded in option prices exceeds the physical
($\mathbb P$) expectation, so the *seller* of variance earns the (negative-of-VRP) premium on average.
Carr & Wu (2009, *Review of Financial Studies*, "Variance Risk Premia") document this is large and
significantly negative for the S&P 500 — the synthetic variance-swap rate sits well above realized variance —
and Bakshi & Kapadia (2003) show delta-hedged option positions earn negative average returns consistent with
a priced volatility risk. This premium is the entire *edge* a short-premium roll defers or harvests: the
roll keeps the operator *in* the variance-selling trade. Han & Zhou and the broader literature show VRP also
prices the cross-section of equity returns. **Caveat the model must carry:** the premium is time-varying and
has compressed materially in the post-2010 sample (Dew-Becker & Giglio document a decline in the traded VRP;
option alphas have drifted toward zero), so the assumption "rolling keeps me in a positive-EV trade" is
*conditional*, not a constant.

### A.4 Roll vs. close vs. hold as an expected-value decision

Frame the choice at the moment a short leg is tested. Let $L\ge 0$ be the **realized loss if closed now**
(current BTC cost minus the credit originally collected). Define two mutually exclusive policies over the
horizon $\Delta T = T_2-T_1$ (the extra time the roll buys):

**(a) Close now + redeploy.** Realize $-L$, free the collateral $\mathcal{C}$ (CSP cash or CC share value /
margin), and redeploy it at the per-period premium-selling edge. Let $\mu_e$ be the expected
profit *per unit collateral per unit time* from a *fresh* short-premium trade (the VRP edge of §A.3, net of
costs). Over $\Delta T$:
$$
\mathbb E[\Pi_{\text{close}}] \;=\; -L \;+\; \mu_e\,\mathcal{C}\,\Delta T .
$$

**(b) Roll out for a credit + hold the larger, longer position.** Collect the roll credit
$c=\text{Net}>0$ (§A.1), but keep the (now larger-notional, longer-duration) risk on the *same* tested
underlying. Let $g$ be the expected P&L *per unit time* of continuing to hold that specific position
(its own carry/decay net of expected adverse drift on a thesis that is, by assumption, already under
stress), and keep the collateral $\mathcal{C}'\ge\mathcal{C}$ tied up:
$$
\mathbb E[\Pi_{\text{roll}}] \;=\; c \;+\; g\,\Delta T .
$$

**Decision rule (roll is EV-superior iff):**
$$
\boxed{\ c + g\,\Delta T \;>\; -L + \mu_e\,\mathcal{C}\,\Delta T\ }
\quad\Longleftrightarrow\quad
\underbrace{(c+L)}_{\text{cash + loss not yet realized}} \;>\; \underbrace{(\mu_e\,\mathcal{C}-g)\,\Delta T}_{\text{opportunity cost of the trapped collateral}} .
$$

The right-hand term is the **capital-opportunity-cost** of the roll: every unit of time the collateral
$\mathcal{C}$ stays pinned to a stressed position is time it *cannot* earn the fresh VRP edge $\mu_e$
elsewhere. **This is the formal statement of "a far-out credit roll just defers the loss."** Observe:

- The credit $c$ is **bounded by the extrinsic budget** $\sim S\sigma(\sqrt{T_2}-\sqrt{T_1})$ (§A.1) — and
  by concavity in $\sqrt T$, buying a *given* $c$ costs **ever more $\Delta T$** the farther out you already
  are.
- The opportunity-cost term **grows linearly in $\Delta T$**. So a roll that must reach far out to clear a
  credit (large $\Delta T$ for small $c$) inflates the right side faster than the left: **the credit roll
  can be EV-negative even though $c>0$** (it "brings in cash"). The cash is real; the EV is not, once the
  forgone $\mu_e\,\mathcal C\,\Delta T$ is charged against it.
- Equivalently: rolling is loss-**deferral**, not loss-**avoidance** — the loss $L$ does not disappear, it is
  rolled into the basis of a position whose expected forward edge $g$ must now *beat* the clean redeployment
  alternative $\mu_e\mathcal C$. If the thesis is impaired, $g\le 0$ and the inequality almost surely fails.

**Break-even maximum tenor.** Setting the inequality to equality and solving for the longest $\Delta T$ that
still justifies a roll:
$$
\Delta T^\star \;=\; \frac{c+L}{\mu_e\,\mathcal{C}-g}\qquad(\text{valid when }\mu_e\mathcal C>g).
$$
Rolls requiring $\Delta T>\Delta T^\star$ are **negative-EV loss deferral**. This is the rigorous form of the
practitioner stop-rule "if a credit is only available 90–120 days out, take the loss" — that heuristic is an
estimate of $\Delta T^\star$ with $\mu_e\mathcal C$ standing in for "what else this capital could earn."

### A.5 "Always roll for a credit" under the model — when it holds, when it fails

The heuristic decomposes into two distinct claims:

1. **Achievability.** *A credit roll is almost always obtainable for a roll out.* **True** under the model
   (§A.1): $\text{Net}_{\text{out}}=X_{\text{far}}-X_{\text{near}}>0$ for $T_2>T_1$. The extrinsic-from-duration
   term funds it. **Holds robustly** for ATM/near-the-money shorts in liquid chains.

2. **Optimality.** *Therefore one should always roll for a credit rather than close.* **Conditional, and
   fails in two regimes:**
   - **Deferral regime (§A.4).** When $\Delta T>\Delta T^\star$ — the credit is only reachable far out, the
     trapped-collateral opportunity cost $\mu_e\mathcal C\,\Delta T$ exceeds $c+L$, and $g\le 0$ on an impaired
     thesis. The roll books cash and *destroys* expected value. "Rolling for a credit" here is a behavioral
     loss-realization dodge, not an edge.
   - **Runaway-trend regime.** When the underlying trends through strikes faster than the extrinsic budget can
     restrike-and-still-credit. Formally, the strike move that keeps pace, $\Delta K = K_2-K_1$, must satisfy
     the credit constraint $V(S,K_2,T_2,\sigma_2)\ge V(S,K_1,T_1,\sigma_1)$; but the **maximum credit-preserving
     strike step is capped by the extrinsic added**, $\sim S\sigma(\sqrt{T_2}-\sqrt{T_1})$, while the spot can
     move an *unbounded* amount. Once $|S-K_1|$ growth outruns that budget, each successive roll yields a
     **shrinking credit, then a forced debit** (the "chasing a runaway short" failure mode). The chain of
     credits is a *bounded* sum financed by a *possibly unbounded* adverse move — the structural reason
     successive rolls "can't keep pace." A debit roll to stay in then violates claim (1) outright and is the
     #1 ranked failure mode (§8).

**Net:** "always roll for a credit" is a sound *achievability default* (you can almost always get the credit
out) but an unreliable *optimality rule* (the credit can be negative-EV). The model says: roll for a credit
**when $\Delta T\le\Delta T^\star$ and the strike move keeps pace within the extrinsic budget**; otherwise the
credit is deferral and the EV-maximizing action is to close and redeploy at $\mu_e$.

### A.6 Worked numeric sanity check (illustrative, not a quote)

$S=100$, ATM short call, $\sigma=0.30$, $r=q=0$. Roll 30 DTE → 60 DTE, same strike $K=100$.
Using $X_{\text{ATM}}\approx S\sigma\sqrt T/\sqrt{2\pi}$ with $\sqrt{2\pi}\approx2.5066$:
$$
X_{30}\approx \frac{100\cdot0.30\cdot\sqrt{30/365}}{2.5066}\approx \$3.43,\quad
X_{60}\approx \frac{100\cdot0.30\cdot\sqrt{60/365}}{2.5066}\approx \$4.85.
$$
**Credit** $\approx X_{60}-X_{30}\approx\$1.42$ (× 100 = $142/contract). **Theta ratio**
$\sqrt{30/60}\approx0.71$ (29% less decay/day). **Vega ratio** $\sqrt{60/30}\approx1.41$ (41% more vega).
**Gamma ratio** $\approx0.71$. All four signs match §A.2. (The $\sqrt T$ approximations are accurate to a few
percent ATM; use the live RH Greeks from `marketdata/options/` for any actual decision — §A.7.)

### A.7 Where the Black–Scholes model breaks against the live RH surface

- **Early assignment (American exercise + dividends).** The closed-form credit assumes European exercise.
  An **ITM short call whose extrinsic value $X<$ the upcoming dividend** is a rational early-exercise target
  the night before ex-div — the shares are called away *before* the planned roll executes, voiding the roll
  entirely. Quant test: flag any ITM short call where $X_{\text{near}} < D\,e^{-r\,t_{\text{ex}}}$ near
  ex-dividend. Equity/ETF options on RH are American; only SPX/XSP/NDX/RUT/VIX are European and immune.
- **Discrete strikes.** $\Delta K$ is not continuous — the "credit-preserving strike step" of §A.5 must be
  rounded to the chain's listed strikes, and the per-chain `min_ticks`/`cutoff_price` (≈$3) constrain the
  achievable limit price. The continuum-of-strikes assumption (also underlying the VRP variance-swap
  replication of §A.3) is an approximation.
- **Transaction costs / bid-ask.** The frictionless net of §A.1 uses mid prices. Real fills cross the spread
  **twice** (BTC at/above ask on the near leg, STO at/below bid on the far leg), so the *realized* credit is
  $\text{Net}_{\text{mid}} - \tfrac12(\text{spread}_{\text{near}}+\text{spread}_{\text{far}})$. Far-month strikes
  are illiquid (wide spreads) — the repo's `mid` dry-run can look like a credit that the live fill turns into a
  debit (failure mode #4). The $\mu_e$ edge in §A.4 is *net of* these costs, which have risen in relative terms
  as the VRP compressed (§A.3) — a double reason the EV calculus is tighter than the gross credit suggests.
- **Constant-vol / flat-smile.** $\sigma_1\neq\sigma_2$ in reality: term structure and skew mean the far leg's
  IV differs from the near leg's, and a roll *down* (short put) typically sells *higher* IV (put skew), which
  *adds* to the credit beyond the duration term — a tailwind the flat-$\sigma$ derivation omits. Use the
  per-leg live IVs, not one $\sigma$.
- **Single $r$, no term premium.** Negligible intraday but matters for LEAP-tenor rolls (PMCC long-leg rolls),
  where rho and the carry term $b=r-q$ are non-trivial.

### A.8 References (academic + index research)

- Carr, P. & Wu, L. (2009). *Variance Risk Premia.* **Review of Financial Studies** 22(3), 1311–1341.
  [PDF](https://engineering.nyu.edu/sites/default/files/2019-01/CarrReviewofFinStudiesMarch2009-a.pdf) —
  the variance-swap rate vs. realized variance; large, significantly negative S&P 500 VRP (the seller's edge).
- Bakshi, G. & Kapadia, N. (2003). *Delta-Hedged Gains and the Negative Market Volatility Risk Premium.*
  **Review of Financial Studies** 16(2) — delta-hedged option positions earn negative average returns ⇒ priced
  volatility risk; the micro-foundation of short-premium expectancy.
- Han, B. & Zhou, Y. *Variance Risk Premium and the Cross-Section of Stock Returns.* SSRN
  [#1785540](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1785540) — VRP prices expected returns
  (~2%/month top-vs-bottom decile).
- Tannous, G. & Zhang, J. (2008). *Expected Time Value Decay of Options: Implications for Put-Rolling
  Strategies.* **The Financial Review** 43(3)
  [link](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6288.2008.00191.x) — time value of at/near-the-money
  options decays at a rate that **decreases over time** (front-loaded decay), the put-rolling analogue of the
  $|\Theta|\propto 1/\sqrt T$ result; informs *when* to roll a put.
- Dew-Becker, I. & Giglio, S. *The Decline of the Variance Risk Premium: Evidence from Traded and Synthetic
  Options.* SSRN [#5525882](https://papers.ssrn.com/sol3/Delivery.cfm/5525882.pdf?abstractid=5525882) — the VRP
  has compressed post-2010; option alphas drift toward zero (why §A.3's edge is conditional, not constant).
- Heston, S., Jones, C. & Khorram, M. *Option Momentum.*
  [PDF](http://faculty.marshall.usc.edu/Christopher-Jones/pdf/opmom.pdf) — cross-sectional dynamics of option
  returns relevant to dynamic (rolling) option management.
- Whaley, R. et al. — CBOE **BXM** (BuyWrite) and **PUT** (PutWrite) index methodology & reviews
  ([BXM methodology](https://cdn.cboe.com/api/global/us_indices/governance/BXM_Methodology.pdf);
  [Callan review](https://cdn.cboe.com/resources/education/research_publications/Callan_CBOE.pdf)) — the
  canonical *mechanical monthly roll* of ATM index calls/puts: BXM ≈ S&P total return at ~⅔ the volatility
  (1988–2006), the empirical realization of a disciplined credit-roll program and its bull-market drag.

> **Operator takeaway (neutral):** the math says rolling *out* almost always yields a credit ($\sqrt T$ extrinsic),
> shifts the book to lower theta / higher vega / lower gamma, and keeps the operator in a (historically, but no
> longer reliably) positive-VRP trade. Whether that credit is *worth taking* is the §A.4 inequality —
> $c+L$ vs. the trapped-collateral opportunity cost $(\mu_e\mathcal C-g)\Delta T$ — not the sign of the cash. Surface
> the credit, the change in capital at risk, $\Delta T$ vs. $\Delta T^\star$, and whether the strike move stays inside
> the extrinsic budget; then do what the operator asks.

<!-- Zayd Khan // cold // www.zayd.wtf -->
