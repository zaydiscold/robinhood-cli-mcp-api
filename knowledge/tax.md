# Tax-aware operation — §1256, LEAPS, wash sales, QCC, IRA

> **When to load this:** the user picks between SPX and SPY exposure, rolls a losing leg in a
> taxable account, holds LEAPS near the 1-year line, writes covered calls on appreciated stock,
> or asks any "what does this do to my taxes" question. Educational background only — not tax
> advice; surface the mechanics and let the operator (and their tax professional) decide.
> Default posture: **stay silent on tax unless one of the edge cases below is live.**

## §1256 index options — real, on Robinhood, and hidden from search

**Verified 2026-06-04:** Robinhood DOES offer true cash-settled, broad-based index options —
**SPX, SPXW (weeklys/0DTE), XSP, NDX (+NDXP), VIX (+VIXW), RUT (+RUTW)**. The consumer `search`
bar and `instruments/?symbol=` HIDE them (they return only ETF proxies / empty results). They
live under the options API:

```bash
node scripts/rh-get.mjs "https://api.robinhood.com/options/chains/?account_number=<N>&underlying_symbol=SPX"
# fingerprint of a true index option: underlying_type="index" + EMPTY underlying_instruments (cash-settled)
# SPY control: underlying_type="equity" + a 100-share deliverable
```

Why it matters (IRC §1256):

- **60/40 rule:** every gain/loss is 60% long-term / 40% short-term **regardless of holding
  period** — blended max federal rate ≈ 26–28% vs up to 37% short-term on equity options.
- **Mark-to-market:** any §1256 position open on 12/31 is deemed sold at FMV (Form 6781) — you
  can owe tax on unrealized gains; plan liquidity for the year-end mark.
- **Loss carryback:** §1256 losses can be carried back 3 years against prior §1256 gains.
- **No wash-sale rule** on §1256 contracts — rolling a *losing* SPX leg has no wash-sale exposure
  (the cleanest "roll without tax friction" path; see `knowledge/rolling.md`).
- **The SPY trap:** SPY/QQQ/IWM are ETF options — American-style, NOT §1256, early-assignable.
  Picking SPX over SPY is a live platform choice, worth surfacing when the user picks the
  underlying.
- European-style SPX also enables the **box-spread** synthetic loan/lend play (implied interest
  flows through §1256 60/40; American-style boxes can be blown up by early assignment).
- Caveats: opening index options may need an entitlement tier (`can_open_position:true` on reads
  is not order-proof); SPX min ticks are 0.05/0.10 with cutoff $3 — read the chain's `min_ticks`.

## LEAPS — long-term treatment, and the exercise trap

- Hold the LEAP **>12 months and SELL it** → long-term capital gain with ~25–35% of the capital
  of share ownership.
- **Exercising resets the clock:** the delivered shares' holding period starts at exercise; the
  option's holding time does not tack on. To keep LTCG on the option's gain, sell — don't
  exercise. (The single most common LEAP tax mistake.)
- **Rolling a LEAP is a sale** — realizes the closed leg (short-term if held <12 months); frequent
  rolling keeps you perpetually short-term. PMCC short legs import the QCC/straddle questions.
- No dividends, pays theta — not a free stock substitute.

## Wash sales (IRC §1091) — the rolling-losers flag

- Selling at a **loss** and acquiring a **substantially identical** position within the 61-day
  window (30 before + sale day + 30 after) disallows the loss. The loss is **deferred** (added to
  the replacement's basis, holding period tacks on), not destroyed — with one exception below.
- Cuts both ways with options: a losing option re-opened near-identically is washed; and **buying
  a call within 30 days of harvesting a stock loss disallows the stock loss** (the classic trap).
  The Wheel structurally re-establishes identical exposure — selling shares at a loss then
  writing a new CSP on the same name within 30 days can wash the share loss.
- "Substantially identical" has **no bright line** for options. Changing strike and/or expiration
  helps; rolling a loser at the same strike + near expiration is the danger zone. Flag, don't
  adjudicate.
- The window spans **all accounts including IRAs** — a wash against an IRA purchase is
  **permanently disallowed** (no basis add-back).
- §1256 contracts are exempt (marked-to-market) — see above.
- Only the **losing** leg matters; rolling winners has no wash issue.

## Qualified covered calls — the holding-period taint

- A covered call is **qualified (QCC)** if exchange-traded, written >30 days before expiration,
  and **not deep-in-the-money** per the lowest-qualified-benchmark (LQB) table of Treas. Reg.
  §1.1092(c)-1 (the "$5–10 ITM" shorthand is not the rule; the LQB is).
- **OTM/ATM QCC:** the stock's LTCG clock keeps running. **ITM QCC:** the clock is **suspended**
  while the call is open. **Deep-ITM/unqualified:** the straddle rules apply — can reset the
  holding period, defer losses, and **disqualify dividends** (61-day rule).
- The bullish roll-up pattern is exactly where this bites: chasing a rally can push the strike
  ITM and freeze a clock that was about to cross 1 year — a month of premium vs LTCG rates on a
  large embedded gain.
- Premium itself is **always short-term** (§1233): a written option's gain can never be aged into
  LTCG; assignment folds the premium into the *stock* sale (proceeds = strike + premium) and the
  gain character follows the stock's holding period.

## IRA nuances (Roth here)

- Premium is not currently taxed; no ST/LT distinction → no holding-period management needed.
- **No tax-loss harvesting** — losses in the IRA are simply gone as a tax item.
- No in-account wash-sale tracking; the live risk is **cross-account**: an IRA re-open can
  permanently disallow a taxable-account loss.
- Structural limits: CSPs must be fully cash-secured, CCs fully covered; no margin/naked.

## The rare holding-period edge cases (only times to raise tax unprompted)

1. A position within ~days/weeks of crossing the **1-year short→long-term line** — compute from
   the fill `timestamp` (`options inspect <uuid>` / `executions[].timestamp`).
2. Near a **tax-year boundary** — deferring a profitable close into January moves the gain a year
   out (Nov/Dec: choosing Jan/Feb expirations pushes a likely assignment into next year).

Everything else: don't volunteer tax commentary on routine quotes, reads, or orders.

## One-liners worth keeping

- Deferral ≠ elimination: rolling defers recognition only for what hasn't been **closed**; a
  buy-to-close realizes in the year of the close.
- Constructive sale (§1259): a plain covered call is not one; pairing deep-ITM short calls with
  protective puts that lock the position in can be — instant recognition.
- Box spread "interest" is a §1256 **capital** loss — useful against capital gains, not an
  ordinary interest deduction.

## Deep dives

- `docs/tax-aware-options-strategies.md` — all seven topics in full (rolling-deferral, QCC/LQB, §1256, boxes, LEAPS, wash sale, §1259), with primary-law citations.
- `docs/index-options-1256-conclusion-2026-06-04.md` — the live evidence that SPX/XSP/NDX/VIX/RUT exist on RH, with reproducible read-only commands.
- `docs/strategy-deep-dive-rolling-options-2026-06-04.md` §5 — rolling-specific tax angles.
- `knowledge/rolling.md` — where the wash-sale flag fires in practice.
- `knowledge/tax-loss-harvesting.md` — the harvesting workflow: red-lot discovery, the 30-day checks, FIFO lot reality, and the dry-run sell/replace procedure.
