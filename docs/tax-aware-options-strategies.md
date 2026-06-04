# Tax-Aware Options Strategies (US) — Mechanics, the Tax Angle, and the Catch

> **Educational, general information only — not tax, legal, or investment advice.** US federal tax rules referenced here (IRC §§ 1091, 1092, 1233, 1256, 1259, 1271–1275, and Treas. Reg. § 1.1092(c)-1) are intricate, fact-dependent, and change. State treatment differs. Anyone applying these should work from primary sources and a qualified tax professional for their own facts.

This doc covers seven interlocking topics, each laid out as **mechanic → tax benefit → the catch/limit**:

1. Deferring gains by rolling covered calls / options across tax years
2. Qualified vs. unqualified covered calls (holding-period taint)
3. Section 1256 contracts (broad-based index options: SPX/XSP) — 60/40 + mark-to-market
4. Box spreads as synthetic financing and a tax tool
5. LEAPS for long-term capital gains / stock replacement
6. Tax-loss harvesting with options + wash-sale interactions
7. Constructive sale rules (§ 1259)

The operator's specific framing — *"owning covered calls while bullish and rolling them to reduce/defer taxable gains for the year, kicking the can down the line"* — is addressed head-on in §1, with the important caveats spread across §§2, 6, and 7.

---

## 0. Foundational rule: when does an option actually create a taxable event?

For a **short option** (the call you write in a covered call), premium received is **not** income when collected. There is no taxable event until the position is **closed** — by expiration, by a closing purchase (buy-to-close), or by assignment/exercise. This deferral-by-default is the lever the whole "rolling" idea pulls on.

- **Expires worthless:** the premium becomes a gain in the year of expiration. For a short option this gain is **short-term, regardless of how long the option was open.**
- **Bought to close:** net gain/loss is realized in the year of the close, and for a short option it is **short-term regardless of duration.**
- **Assigned (the call is exercised against you):** the premium is *not* a separate item — it is rolled into the stock sale. The sale price of the shares becomes **strike + premium received**, and the character (long vs. short term) follows your *stock* holding period.

This asymmetry — "premium is short-term, but assignment folds into the stock's character" — is why covered-call tax planning is really *stock* tax planning with an option bolted on.

Sources: [Fidelity — Tax implications of covered calls](https://www.fidelity.com/learning-center/investment-products/options/tax-implications-covered-calls), [The Blue Collar Investor — Tax implications of writing covered calls](https://www.thebluecollarinvestor.com/tax-implications-of-writing-covered-calls-against-long-term-holdings/).

---

## 1. Deferring gains by rolling covered calls / options across tax years

### Mechanic
"Rolling" = simultaneously **buy-to-close** the current short call and **sell-to-open** a new one (usually a later expiration, often a different strike). You stay bullish, keep the shares, and keep collecting premium. The year-end version of the idea: as December approaches with an open short call sitting on an **unrealized loss** (the call went against you because the stock rallied — which a bullish holder is happy about), you defer *recognizing* that buy-to-close loss/gain into the next tax year, or you push the *stock* disposition into the next year by choosing expirations that land in January/February.

Two distinct things can be deferred, and they are easy to conflate:

1. **Deferring the option's own realized result.** As long as you don't buy-to-close, the short call is open and nothing is realized. Roll into January and the close happens next year.
2. **Deferring the underlying stock gain.** If you'd otherwise be assigned (shares called away) this year, writing/rolling to a strike and expiration so that assignment — if it happens — occurs *next* year pushes the stock's capital gain into next year's return. A common pattern: in Nov/Dec, sell or roll to Jan/Feb expirations so an in-the-money call that gets assigned settles the stock sale in the new tax year.

### Tax benefit
- A gain you don't realize this year isn't taxed this year — classic **deferral**, the time-value-of-money win ("kick the can"). You keep the dollars that would have gone to tax working for you for another year.
- Year-to-year, deferral can also keep you under bracket thresholds, NIIT (3.8%) thresholds, or capital-gains-rate breakpoints in a given year.
- If you're genuinely bullish, rolling keeps the long stock exposure *and* the premium stream intact while you manage the timing of recognition.

### The catch / limits
- **Deferral is not elimination.** The gain reappears next year (often at a *higher* basis cost if you keep rolling up). You are betting your future tax rate ≤ today's, and that the strategy's frictions (commissions, bid/ask, the time you tie up capital below intrinsic value) cost less than the deferral is worth.
- **A buy-to-close is a closing event — you can't "not realize" a call you actually closed.** Rolling *does* realize the old call's gain/loss in the year you close it. Deferral only works if the close itself lands in the next year, or if you simply leave the position open across the boundary. Many people wrongly believe rolling itself defers the *already-closed* leg — it does not.
- **Short-option gains are short-term, period.** You cannot convert a written-call profit into long-term gain by holding the short call longer (§ 1233). Time only helps the *stock* leg.
- **Wash-sale interaction (the big one for the "loss" version).** If you buy-to-close the short call at a **loss** and re-establish a *substantially identical* short call within the 61-day window (30 days before/after), the loss can be disallowed and deferred into the new position's basis — which may or may not be what you wanted. (See §6.) A rolled short call at a meaningfully different strike *and* expiration is generally not substantially identical, but "substantially identical" has no bright line. Note: it is the **loss** legs that wash-sale touches; rolling a *winning* call has no wash-sale issue.
- **Don't taint the stock's long-term clock.** The reason a bullish holder rolls — moving to a higher strike as the stock climbs — can push you into *in-the-money* or *deep-ITM* calls that **suspend or reset the stock's holding period** (see §2). Deferring an option gain by a month is a bad trade if it costs you long-term capital-gains rates on a large embedded stock gain.
- **Constructive-sale risk** only arises with offsetting (e.g., deep-ITM short calls plus protective puts approximating a sale); a plain covered call alone is not a constructive sale (see §7).

Sources: [JustAnswer — Wash rule for rolling covered calls](https://www.justanswer.com/tax/obckw-need-understanding-wash-rule-applies-rolling.html), [Cash Flow Machine — Covered call tax strategy](https://cashflowmachine.net/covered-call-tax-strategy/), [Fidelity — Tax implications of covered calls](https://www.fidelity.com/learning-center/investment-products/options/tax-implications-covered-calls).

---

## 2. Qualified vs. unqualified covered calls — how deep-ITM CCs taint the LTCG holding period

This is the rule that most often surprises people doing the §1 strategy.

### Mechanic
Under the **straddle rules** of IRC § 1092 and the **qualified covered call (QCC)** safe harbor of § 1092(c)(4) / Treas. Reg. § 1.1092(c)-1, a covered call on stock you own is either:

- **Qualified (QCC):** traded on a national exchange, written **>30 days before expiration**, **not deep-in-the-money**, not written by an options dealer in their dealing activity, and not producing ordinary income/loss. QCCs are *exempt from the harsh straddle loss-deferral rules.*
- **Unqualified:** fails any QCC test — most commonly because it is **deep-in-the-money** (or has ≤30 days written life). Unqualified calls drag the whole stock+call position into the **straddle rules.**

**"Deep-in-the-money" is defined by the "lowest qualified benchmark" (LQB)** — a strike that is too far below the stock price is deep-ITM. The benchmark steps with stock price and time to expiration (Treas. Reg. § 1.1092(c)-1):

- Generally the LQB is the **highest available strike below the applicable stock price** (the prior day's closing/applicable stock price), with adjustments:
- **Stock ≤ $25:** the LQB can't be treated as lower than **85% of the stock price.**
- **Stock ≤ $150:** the LQB can't be lower than **stock price − $10** (i.e., a strike more than ~$10 ITM tends to be deep-ITM in this band).
- **Stock > $50 with the option written >90 days out:** the LQB becomes the **second-highest strike below the applicable stock price** (one extra strike of cushion for longer-dated calls).

A call struck **at or above** the LQB is qualified; **below** it is deep-ITM/unqualified. Practitioners often shorthand "deep ITM" as roughly $5–$10 in-the-money depending on price/expiration, but the regulation's LQB table is the controlling definition.

### Two distinct holding-period effects
1. **In-the-money QCC → holding period is *suspended*** for the stock while the call is open. Days the call is live don't count toward the >1-year long-term clock. (At-the-money and out-of-the-money QCCs do **not** suspend — the clock keeps running.)
2. **Deep-ITM / unqualified call → straddle rules apply,** which can **terminate/reset** the stock's holding period and **defer losses** on either leg while there's unrealized gain on the other.

### Tax benefit (when used correctly)
- Writing **OTM or ATM qualified calls** lets you collect premium **without touching the stock's holding-period clock** — so a near-long-term position keeps marching to the 1-year mark and the preferential LTCG rate.
- § 1092(f): if you close an **in-the-money QCC at a loss**, that loss is treated as **long-term** if a gain on the underlying would have been long-term at that point — preventing a character mismatch.

### The catch / limits
- **The whole point of being bullish-and-rolling-up can backfire.** As the stock rallies and you roll the call up to chase it, an aggressive strike can slip in-the-money or deep-ITM, **freezing or resetting** a holding period you needed to reach 1 year. The difference between the LTCG rate (0/15/20%) and ordinary rates (up to 37%) on a large embedded gain dwarfs a month of premium.
- **Dividend qualification can be lost.** Qualified-dividend treatment needs 61 days held in a 121-day window around the ex-date; an ITM call suspending the holding period can disqualify the dividend, bumping it to ordinary rates.
- **Straddle loss deferral:** with an unqualified call, a **loss** on either the stock or the call can't be deducted while the other leg has an unrealized gain at year-end — the opposite of the deferral you wanted, and it can strand losses you were counting on.

Sources: [LII — 26 USC § 1092(c)(4) qualified covered call](https://www.law.cornell.edu/uscode/text/26/1092), [eCFR — 26 CFR 1.1092(c)-1](https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/subject-group-ECFR9830aa50671aa9c/section-1.1092(c)-1), [Fidelity](https://www.fidelity.com/learning-center/investment-products/options/tax-implications-covered-calls), [Option Samurai — Qualified covered calls](https://optionsamurai.com/blog/qualified-covered-calls/), [The Blue Collar Investor — LTCG enhanced with covered call writing](https://www.thebluecollarinvestor.com/long-term-capital-gains-enhanced-with-covered-call-writing/).

---

## 3. Section 1256 contracts (SPX, XSP, broad-based index options) — 60/40 + mark-to-market

### Mechanic
IRC § 1256 covers regulated futures, options on futures, and **non-equity (broad-based index) options**. Cash-settled, broad-based index options qualify: **SPX, XSP, NDX, NQX, RUT, RUI, DJX, VIX, OEX/XEO**, and similar. (Notably, options on a single stock or on a **narrow-based** index/ETF — e.g., SPY options — do **not** qualify; SPY is an ETF and its options are taxed as ordinary equity options.)

Two defining tax features:
1. **60/40 rule:** every gain/loss is treated as **60% long-term, 40% short-term**, *regardless of actual holding period* — even a position held five minutes.
2. **Mark-to-market (MTM) at year-end:** any § 1256 position still open on **December 31** is treated as if **sold at fair market value** that day. Unrealized gains/losses are recognized, and basis resets to the 12/31 close for the new year. Reported on **Form 6781.**

### Tax benefit
- The blended **60/40 rate** beats fully short-term treatment for active traders. The max blended federal rate is roughly **~26–28%** vs. up to **37%** for short-term equity-option gains. Worked example widely cited: identical SPX vs. SPY exposure and profit can leave the SPX trader paying ~$23k where the SPY trader pays ~$40.8k — a difference flowing entirely from § 1256.
- **No holding-period management needed** to get part-LTCG rates — you get the 60% long-term slice instantly. Great for index traders who can't (or don't want to) hold a year.
- § 1256 losses can be **carried back 3 years** (election on Form 6781) against prior § 1256 gains — a flexibility ordinary capital losses lack.

### The catch / limits
- **Mark-to-market cuts both ways:** you can owe tax on **unrealized** year-end gains you haven't cashed out, and basis resets mean phantom income timing. Plan liquidity for the 12/31 mark.
- **The 60% "long-term" is statutory, not real** — it doesn't help you stack a true >1-year position into 0%/15% brackets the way actual LTCG holding does; it's a fixed blend.
- **Only broad-based, cash-settled index options qualify.** Get the product wrong (SPY instead of SPX, a single-name option, a narrow sector index) and you're back to ordinary equity-option rules. ETF-vs-index confusion is the classic error.
- **Straddle and offsetting-position rules** still apply when § 1256 and non-1256 legs are combined (mixed straddles); special elections (e.g., mixed-straddle election) may be needed.

Sources: [CBOE — Index options tax treatment](https://www.cboe.com/tradable_products/index-options-benefits-tax-treatment/), [tastytrade — Reporting § 1256 contracts](https://support.tastytrade.com/support/s/solutions/articles/43000561348), [Green Trader Tax — § 1256 contracts](https://greentradertax.com/trader-tax-center/tax-treatment/section-1256-contracts/), [Green Trader Tax — Options tax treatment 2026](https://greentradertax.com/tax-treatment-for-trading-options-in-2026-rules-pitfalls-and-planning-strategies/).

---

## 4. Box spreads as synthetic financing and a tax tool

### Mechanic
A **box spread** combines a bull call spread and a bear put spread at the same two strikes/expiration, producing a position whose payoff is **fixed and known at expiration** regardless of where the underlying lands. Built on **SPX** (European-style, cash-settled, broad-based), a long-dated box behaves like a **synthetic zero-coupon loan**:

- **Sell/short a box** → receive cash today, owe a fixed (larger) amount at expiration. That's a **synthetic loan you take out**; the gap is implied interest.
- **Buy/long a box** → pay cash today, receive a fixed (larger) amount at expiration. That's **synthetic lending** (a near-risk-free yield, competitive with T-bills).

Because SPX options are **§ 1256 contracts**, the implied interest flows through the § 1256 machinery rather than as ordinary loan interest.

### Tax benefit
- **As a borrowing tool (short box):** the implied "interest" cost is realized as a **§ 1256 capital loss split 60/40** — and thanks to mark-to-market, a *portion* of that loss can be recognized **each year the box is outstanding**, even before the box expires and the "interest" is actually paid. For someone with offsetting **capital gains**, this effectively makes borrowing cost **tax-deductible against capital gains** — something a margin loan or SBLOC interest often can't achieve cleanly (investment-interest deductions are limited and require itemizing).
- **Rates can be attractive** — long-dated SPX boxes have historically priced near or slightly above Treasury yields, often **below** broker margin rates and SBLOCs, with no margin-call-on-the-loan-itself dynamic of a stock-collateralized line (the box's payoff is fixed).
- **As a lending tool (long box):** a relatively **T-bill-like return taxed at the favorable 60/40 blend** rather than as ordinary interest income.

### The catch / limits
- **The "interest" is a capital loss, not an ordinary interest deduction** — it's only useful to the extent you have **capital gains** (or the $3,000/yr net capital-loss allowance) to absorb it. If your gains are mostly long-term, deductions against them save less than deductions against ordinary income would.
- **Complexity and execution risk:** boxes are multi-leg, can be mispriced/illiquid at the wrong strikes, and **must** use European-style, cash-settled, broad-based options (SPX) to avoid early-assignment risk and to land in § 1256. American-style equity-option boxes can be assigned early and blow up the "fixed" payoff. (There's a cautionary real-world case of a trader wiped out by an American-style box assignment.)
- **It's still leverage.** A short box is debt; the cash you pull out is borrowed and the obligation is fixed.
- **Reporting nuance:** characterizing the implied interest correctly (capital vs. interest) on Form 6781 is non-obvious; documentation matters and aggressive characterization invites scrutiny.

Sources: [Kitces — Box spreads vs. margin loans / SBLOCs](https://www.kitces.com/blog/box-spreads-borrowing-alternative-margin-loans-sblocs-heloc/), [CBOE — Long-dated box spreads](https://www.cboe.com/insights/posts/long-dated-box-spreads-a-better-way-to-buy-a-home-updated/), [SyntheticFi — Tax deductibility of box spreads](https://www.syntheticfi.com/blog/tax-deductibility-of-box-spreads), [Schwab — What are box spreads](https://www.schwab.com/learn/story/what-are-box-spreads), [Exceed Investments — Box spread lending](https://exceedinvestments.com/box-spread-lending-a-tax-efficient-way-to-leverage-investment-portfolios/).

---

## 5. LEAPS for long-term capital gains / stock replacement

### Mechanic
**LEAPS** (Long-term Equity AnticiPation Securities) are simply options expiring **>1 year out** (up to ~3 years). A **deep-ITM call LEAP** (delta ~0.80+) tracks the underlying nearly dollar-for-dollar while costing a **fraction of the share price** — a "**stock replacement**" position: most of the upside, far less capital deployed.

### Tax benefit
- **Hold the LEAP itself >12 months and sell it (don't exercise):** the gain is a **long-term capital gain** (0/15/20%), like stock held long-term. You captured most of the equity move using ~25–35% of the capital, freeing cash for diversification.
- **Capital efficiency** is itself a (non-tax) benefit that compounds the tax one: less capital tied up, same directional exposure.

### The catch / limits
- **Exercising RESETS the clock.** If you exercise the LEAP and take delivery of shares, the **shares' holding period starts on the exercise date** — your time holding the option does *not* tack on. To get long-term treatment on the *option's* gain you generally must **sell the option**, not exercise it. This is the single most common LEAP tax mistake.
- **Options have no dividends and decay (theta).** A stock-replacement LEAP forgoes dividends and bleeds time value; the breakeven requires the stock to move enough to cover the premium. It is *not* a free long-stock substitute.
- **Rolling a LEAP is a sale.** Rolling (close + reopen) realizes the gain/loss on the closed leg — if you've held <12 months that's short-term, and frequent rolling can keep you perpetually short-term.
- **Selling a LEAP at a loss** is subject to the **wash-sale rule** vs. the stock and other options on the name (see §6).
- LEAPS used as the long leg against a short call (a "**poor man's covered call**") import **straddle / QCC** considerations on the short leg (see §2).

Sources: [TradeAlgo — LEAPS options strategy guide](https://www.tradealgo.com/trading-guides/options/leaps-options-strategy-guide), [JustAnswer — LEAP exercise short-term gain rules](https://www.justanswer.com/tax/mzffe-regarding-leap-option-contracts-securities-regards.html), [Achievable — Taxes on options (Series 65)](https://app.achievable.me/study/finra-series-65/learn/investment-vehicle-characteristics-derivatives-options-taxes-on-options).

---

## 6. Tax-loss harvesting with options + wash-sale interactions

### Mechanic
**Tax-loss harvesting:** sell a losing position to realize a capital loss that offsets capital gains (and up to **$3,000/yr** of ordinary income; excess carries forward). The **wash-sale rule (IRC § 1091)** disallows the loss if you acquire a **"substantially identical"** security within **30 days before or after** the sale (a 61-day window).

Options are squarely inside § 1091, and in **two directions**:
1. **Options as the harvested security:** selling an option at a loss and re-buying a substantially identical option within the window triggers the wash sale.
2. **Options as the *replacement* that taints a stock loss:** sell stock at a loss, then **buy a call** (or, by IRS position, even establish certain option exposure) on the same stock within 30 days → the option counts as acquiring a substantially identical interest and **disallows the stock loss.**

### Tax benefit (when done cleanly)
- Realize losses to **offset realized gains** dollar-for-dollar — short-term losses first offset short-term gains (most valuable, since short-term gains are taxed highest), then cross over.
- A **disallowed** wash-sale loss isn't destroyed — it's **added to the basis** of the replacement and the old **holding period tacks on**, so it's deferred, not lost. Sometimes deferral into a position you keep is acceptable.
- Options let you **stay in the market** during the 31-day wait with *non*-substantially-identical exposure (e.g., harvest a single stock's loss, hold a broad sector ETF or a clearly different option for 31 days), preserving the directional bet without triggering the wash.

### The catch / limits
- **"Substantially identical" has no bright-line definition** — it's facts-and-circumstances, broader than "same CUSIP," and the IRS hasn't drawn clean lines for options (same underlying, similar strike/expiration is risky). Different underlying generally avoids it; same underlying with a near strike/expiry generally doesn't.
- **The window is 61 days** (30 before + sale day + 30 after) — and it spans **all your accounts**, including IRAs (a wash against an IRA purchase **permanently** disallows the loss, with no basis add-back to the IRA).
- **Rolling a losing short option can be a wash sale** if the new short option is substantially identical (see §1). Rolling a losing *long* option into a substantially identical one likewise defers the loss.
- **Buying a call to "hold your spot" after harvesting a stock loss is the classic trap** — it can disallow the very loss you just harvested.
- Harvesting only **defers** tax (lower basis → bigger gain later) unless you ultimately realize at a lower rate, donate the appreciated replacement, or get a step-up at death.

Sources: [Schwab — Primer on wash sales](https://www.schwab.com/learn/story/primer-on-wash-sales), [Fidelity — Wash-sale rules](https://www.fidelity.com/learning-center/personal-finance/wash-sales-rules-tax), [Morningstar — What is "substantially identical"](https://www.morningstar.com/financial-advisors/wash-sale-challenge-what-is-substantially-identical), [ASKramer Law — Tax-loss harvesting & the wash-sale rule](https://www.askramerlaw.com/publications/tax-loss-harvesting-part-ii), [TurboTax — Wash sale rule](https://turbotax.intuit.com/tax-tips/investments-and-taxes/wash-sale-rule-what-is-it-how-does-it-work-and-more/c5ANd7xnJ).

---

## 7. Constructive sale rules (IRC § 1259)

### Mechanic
Historically, "**short against the box**" — shorting a stock you already own at a gain — locked in the gain *economically* while deferring the *tax* indefinitely. The **Taxpayer Relief Act of 1997** added **IRC § 1259**, which treats certain offsetting transactions on an **appreciated financial position** as a **"constructive sale"** — you're taxed as if you sold, even though you didn't.

Triggers include, on an appreciated position you hold:
- a **short sale of the same or substantially identical** property ("short against the box"),
- an **offsetting notional principal contract**,
- a **futures/forward contract** to deliver the same/substantially identical property,
- and (for an already-short or already-derivative position) acquiring the offsetting long.

The effect: gain is recognized at the constructive-sale date as if sold at FMV; basis and a new holding period reset accordingly.

### Tax benefit / the legitimate use
- § 1259 is mostly a **limiter**, but it defines the **safe space**: positions that **don't** fully lock in the gain (a *collar* with meaningful spread between put and call strikes, an OTM protective put alone, a non-deep covered call) generally **avoid** constructive-sale treatment, so you can hedge downside while *still deferring* the underlying gain.
- **The 30-day reopening exception:** a transaction that would be a constructive sale is **not** one if you **close it within 30 days after the end of the tax year** *and* hold the appreciated position **unhedged for the 60 days** following that close. This permits short-term, year-end hedging without triggering recognition.

### The catch / limits
- **Get too tight and it's a sale.** A hedge that eliminates substantially all risk of loss *and* opportunity for gain (e.g., a zero-cost collar with put strike ≈ call strike, or a deep-ITM short call paired with a protective put approximating a synthetic short) is a **constructive sale** — instant taxable gain, defeating the deferral.
- **"Substantially identical" reappears** here with the same fuzziness as the wash-sale rule.
- The **30-day/60-day exception is narrow** and unforgiving on timing — miss the unhedged 60-day window and the original transaction is retroactively a constructive sale.
- A plain **covered call by itself is not** a constructive sale — but layering it with deep protection can cross the line, which is why §§2 and 7 must be read together when you're "rolling while bullish" *and* hedging.

Sources: [LII — 26 USC § 1259](https://www.law.cornell.edu/uscode/text/26/1259), [Asset Strategy — Constructive sale rule](https://assetstrategy.com/constructive-sale-rule/), [IRS Rev. Rul. 2002-44 (§ 1259)](https://www.irs.gov/pub/irs-drop/rr-02-44.pdf), [Green Trader Tax — Short selling IRS rules](https://greentradertax.com/short-selling-irs-tax-rules-are-unique/).

---

## Cross-cutting summary table

| Strategy | Core mechanic | Tax benefit | The catch |
|---|---|---|---|
| **Rolling CCs across years** (§1) | Keep short call open or close it next year; choose Jan/Feb expirations | Defers option gain and/or stock-sale gain into next year | Deferral ≠ elimination; closing leg realizes in year of close; short-option gains stay short-term; can taint stock LTCG clock |
| **Qualified vs. unqualified CC** (§2) | Strike vs. "lowest qualified benchmark"; >30 days written | OTM/ATM QCC keeps stock holding-period clock running | ITM QCC **suspends**; deep-ITM/unqualified triggers **straddle** rules + holding-period reset + loss deferral; can kill qualified dividends |
| **§ 1256 (SPX/XSP)** (§3) | Broad-based, cash-settled index options | **60/40** blended rate regardless of holding period; loss carryback | Year-end **mark-to-market** taxes unrealized gains; only broad-based/cash-settled qualify (not SPY/single names) |
| **Box spread** (§4) | SPX bull-call + bear-put = synthetic fixed loan | Implied interest = **§ 1256 60/40 capital loss**, recognized partly each year; cheap, gain-offsetting financing | Loss only useful vs. capital gains; multi-leg/execution risk; must be European/cash-settled; still leverage |
| **LEAPS / stock replacement** (§5) | Deep-ITM long call ~0.80 delta, >1yr | **Sell** after >12 mo = LTCG with ~⅓ the capital | **Exercising resets the clock**; no dividends + theta decay; rolling realizes gain; wash-sale on losses |
| **TLH + options** (§6) | Realize losses; options as harvested *or* replacement | Offset gains + $3k ordinary; disallowed loss adds to basis (deferral) | **Substantially identical** (no bright line); 61-day all-account window incl. IRAs; buying a call after a stock-loss harvest can disallow it |
| **Constructive sale** (§7) | § 1259 deems offsetting hedges a sale | Defines safe hedges (loose collars, OTM puts) that still defer gain | Tight/full hedges = instant taxable gain; narrow 30/60-day year-end exception |

---

### Bottom line for the operator's question

"Owning covered calls while bullish and rolling them to defer gains" is a real lever, but a *narrow* one: it defers **timing**, not the tax itself, and it only defers what hasn't yet been **closed**. The premium leg is always short-term; the real money is in **not tainting the stock's long-term holding period** (§2) and in respecting the **wash-sale** (§6) and **constructive-sale** (§7) boundaries when you roll up strikes or add protection. For pure index exposure, **§ 1256 products (SPX/XSP)** hand you part-LTCG rates without any holding-period gymnastics — often a cleaner path than managing equity-option timing. None of this is advice; the regulations are dense and fact-specific, and a tax professional should sign off on any actual plan.

---

*Compiled June 2026 from the sources hyperlinked inline. Primary law: IRC §§ 1091, 1092, 1233, 1256, 1259, 1271–1275; Treas. Reg. § 1.1092(c)-1; Form 6781.*
