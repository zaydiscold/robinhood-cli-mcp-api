# Dividend investing — yield math, dates, traps, and the income engine

> **When to load this:** the user asks about dividend income, yield, "when do I get paid,"
> DRIP, ex-dates, weekly-payer ETFs (QDTE-style), or "how much am I making per month?". The
> repo computes the income answers **in-engine** (`dividends`) — this module is the knowledge
> to interpret them and the procedure to apply them. Descriptive, not prescriptive — income
> preferences (the Ball Knowledge ledger flags QDTE-style payers) are the operator's call.

## Yield vs yield-on-cost — quote the one that drives decisions

- **Dividend yield** = annual dividend per share ÷ **current** price. The decision-relevant
  number: it's what new dollars earn today.
- **Yield-on-cost (YOC)** = annual dividend per share ÷ **your** original basis. A feel-good
  ratchet — it only goes up as dividends grow, but capital is redeployable at *current* prices,
  so YOC can't tell you whether to hold or switch. Report income in **dollars per period** first,
  yields second, YOC only if asked.

## Payout sustainability — is the dividend funded?

- **Payout ratio** = dividends ÷ net income. Rough zones: under ~60% comfortable for a mature
  payer, 80%+ tight, **over 100% means the dividend is funded by debt, share issuance, or
  return of capital** — a cut candidate.
- Free-cash-flow payout (dividends ÷ FCF) is the harder-to-game version. **REITs are measured
  against FFO/AFFO**, not net income (depreciation distorts earnings) — a REIT at "120% of
  earnings" can be fine at 75% of FFO.
- The history matters: a payer that has cut before cuts again more easily; long raise streaks
  (aristocrats) are defended by management as identity.

## Date mechanics — buy BEFORE the ex-date

Four dates per payment: **declaration → ex-dividend → record → payable.**

- **Own the shares before the ex-date** to receive the payment. Buy **on** or after the ex-date
  → the seller keeps it. Since the May 2024 move to **T+1 settlement**, the ex-date and record
  date generally fall on the **same day** (a purchase the day before ex-date settles in time).
- No free lunch: the open price on the ex-date is marked down by roughly the dividend. "Dividend
  capture" buys the payment and the price drop together; what's left after the drop is tax
  liability and spread costs.
- The ex-date is also the early-assignment tripwire for ITM short calls — extrinsic < dividend
  the night before ex-date gets assigned (see `knowledge/wheel.md` failure mode 3).

## Qualified vs ordinary — the 60-day holding rule

- A **qualified** dividend is taxed at long-term capital-gains rates (0/15/20%); an **ordinary
  (non-qualified)** one at ordinary rates up to 37%. On the same $1,000 of dividends that gap
  can be **$220+ of tax**.
- The holding test: you must hold the shares **more than 60 days during the 121-day period that
  begins 60 days before the ex-date**. Rapid in-and-out around the ex-date fails it.
- Structurally non-qualified regardless of holding: **REIT** distributions (mostly), most BDC
  income, and the **option-premium-derived distributions of covered-call ETFs** (see below).
- **Covered-call interaction:** writing a deep-ITM/unqualified call on the shares suspends the
  holding period and can disqualify the dividend — the QCC taint, detailed in `knowledge/tax.md`.

## Dividend traps — when high yield is the symptom

A 12% trailing yield on a common stock is usually a **falling price**, not a generous board:
yield = dividend ÷ price, so a halved price prints a doubled yield right up until the cut.
Checklist before believing a fat yield: payout ratio vs earnings AND FCF, revenue direction,
debt load, sector (is 8% normal here, like midstream/BDC, or a red flag?), and whether the
forward declared dividend already differs from the trailing one. The trailing yield is a
rear-view mirror.

## DRIP mechanics

DRIP auto-reinvests each payment into fractional shares, commission-free — compounding without
attention. Two operational facts agents must carry:

- **A DRIP reinvest is a purchase** — it can wash a tax-loss harvest on the same name
  (`knowledge/tax-loss-harvesting.md`). Robinhood DRIP toggles **account-wide or per-stock**,
  and both are first-class env-gated writes here.
- DRIP into a falling payer is automated averaging-down — fine if intended, surface it if not.

## Weekly-payer covered-call ETFs (QDTE-style) — distribution ≠ dividend

The QDTE/XDTE family sells 0DTE index calls daily and distributes weekly. Read these correctly:

- The headline **"distribution rate" (often 30–50% annualized) is not a dividend yield.** Per the
  funds' **19a-1 notices**, recent distributions have been estimated at up to **100% return of
  capital (ROC)** — the fund handing back (option premium and/or your own) capital, with final
  tax character only known at fiscal year-end.
- **ROC is not taxed when received** — it reduces your cost basis; once basis hits zero, further
  ROC is taxed as capital gain. Tax-deferred, not tax-free — and it means the 1099 picture looks
  nothing like the cash flow.
- **NAV erosion is the structural risk:** distributing more than the strategy earns shrinks the
  NAV — total return (price + distributions) is the only honest scoreboard. Quote total dollars,
  never the distribution rate alone.
- Upside is capped daily (calls sold at/near the money each morning); downside is essentially
  the index's. In a sustained rally these lag hard; in chop they shine.
- Cadence (weekly vs monthly vs quarterly) is income *smoothing*, not extra return — the
  compounding difference at equal total payout is marginal.

## APPLY-IT — the income engine, then the decisions

The repo computes cadence and projections **in-engine** — agents must use the command, not
hand-math (cadence comes from the median payable-date gap; projections from **current holdings
only**, so a sold payer never inflates the forecast):

```bash
node cli/dist/index.js dividends                    # totals (all-time/YTD/12mo), per-symbol cadence,
                                                    # projected $/mo · $/qtr · $/yr from current holdings
node cli/dist/index.js dividends --upcoming         # pending payouts: amount, payable, EX-DATE, account
node cli/dist/index.js dividends --by-month         # last 12 months of received income by month
node cli/dist/index.js dividends --symbol <SYM>     # one payer's history + cadence
node cli/dist/index.js dividends --account <N>      # one account                # MCP: robinhood_dividends

# Context reads for sustainability questions:
node cli/dist/index.js stock profile <SYM> --json   # P/E, market cap, fundamentals for payout-ratio context
node cli/dist/index.js history --days 90 --account <N> --json   # fill dates → qualified-holding check

# DRIP control (env-gated writes; explicit approval + the live-write switch on):
node cli/dist/index.js settings show --account <N>
node cli/dist/index.js settings drip --account <N> --enable                    # account-wide
node cli/dist/index.js settings drip --account <N> --disable --instrument <ID> # per-stock
```

**Decision procedure:** (1) "how much am I making?" → `dividends`, lead with the projected
$/month line; (2) "when's my next payment?" → `dividends --upcoming`, read amount + payable
date; (3) "do I get SYM's next dividend if I buy now?" → `dividends --upcoming` (or the
declared ex-date) — buy must land **before** the ex-date; (4) "is this yield safe?" → payout
ratio + FCF + history via `stock profile` and outside research (`knowledge/signals.md`); for a
QDTE-style payer, pull the fund's 19a-1 before calling its distribution "yield"; (5) "is this
dividend qualified for me?" → fill timestamps from `history` vs the 121-day window;
(6) DRIP changes → echo account + scope, the live-write switch on, verify with `settings show` re-read.

## Deep dives

- `knowledge/tax.md` — QCC dividend disqualification, IRA treatment of dividends.
- `knowledge/tax-loss-harvesting.md` — DRIP as a wash-sale acquisition.
- `docs/options-strategies-knowledge-base-2026-06-03.md` — covered-call ETF mechanics in the strategy menu.
- `ball-knowledge.md` — the operator's income-preference entries (QDTE-style weekly payers).

## Sources

- [Fidelity — Qualified dividends](https://www.fidelity.com/tax-information/tax-topics/qualified-dividends) (61-of-121-day holding rule)
- [Vanguard — How are dividends taxed?](https://investor.vanguard.com/investor-resources-education/taxes/dividends)
- [Investor.gov — Ex-Dividend Dates](https://www.investor.gov/introduction-investing/investing-basics/glossary/ex-dividend-dates-when-are-you-entitled-stock-and)
- [DTCC — T+1 Dividend Processing FAQ](https://www.dtcc.com/-/media/Files/PDFs/T2/T1-Dividend-Processing-FAQ.pdf) (ex-date/record-date alignment under T+1)
- [Investopedia — Dividend Payout Ratio](https://www.investopedia.com/terms/p/payoutratio.asp) · [Investopedia — Yield on Cost](https://www.investopedia.com/terms/y/yield-on-cost.asp)
- [Roundhill — QDTE fund page](https://www.roundhillinvestments.com/etf/qdte/) (19a-1 notices, ROC composition, distribution-rate disclosures)

<!-- made with love by Zayd Khan / cold @ www.zayd.wtf -->
