# Tax-Lot Strategy Playbook

> Evidence and link check: 2026-08-08. US federal educational material only—not individualized tax, legal, or investment advice. Tax treatment depends on the taxpayer, account type, state, transaction history, elections, and current law. Broker estimates are not filing records; reconcile Form 1099-B against Form 8949/Schedule D and use a qualified tax professional for material decisions.

## What “taking advantage of tax lots” actually means

Every purchase creates a separate inventory lot with its own acquisition date, quantity, adjusted basis, holding period, and unrealized result. The investment exposure may look identical, but choosing the units disposed can change:

- how much gain or loss is recognized now;
- whether the result is generally short-term or long-term;
- which low-basis or high-basis inventory remains for later;
- whether a loss risks wash-sale deferral or permanent loss through an IRA replacement;
- whether appreciated inventory can be donated instead of sold;
- the future tax cost embedded in the remaining portfolio.

Tax-lot strategy does **not** make economic gains disappear. It changes timing, character, inventory, and optionality. A lower current bill can create a lower remaining basis and a larger future gain. The right comparison is lifetime after-tax outcome plus portfolio quality—not “tax saved on this order.”

## Source hierarchy

Use sources in this order:

1. **IRS law-facing guidance and forms** for tax treatment and reporting.
2. **Robinhood’s current help and live account data** for platform mechanics.
3. **Credentialed/institutional explanations** for planning patterns.
4. **Videos** for demonstrations and intuition—not as legal authority.

When sources disagree, the IRS controls the federal-tax explanation and Robinhood controls only its current product behavior. Re-check both before acting because interfaces, elections, and tax rules change.

## Tax-lot strategy matrix

| Intent                                    | Candidate lot posture                                                               | Why it may help                                                                                                                                | What can make it wrong                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Raise cash with the smallest current gain | Highest adjusted basis first                                                        | Usually reduces current realized gain                                                                                                          | May consume losses, sacrifice a near-long-term holding period, or leave a dangerously concentrated low-basis remainder           |
| Deliberately realize gains                | Lowest basis first or specifically chosen appreciated lots                          | Uses an intentionally available gain budget; can reset basis                                                                                   | Capital-gain stacking, NIIT, state tax, credits, ACA/Medicare effects, and future rate assumptions can reverse the benefit       |
| Prefer long-term character                | Long-term lots first                                                                | Long-term gains often receive preferential federal rates                                                                                       | A larger long-term gain can cost more than a small short-term gain; holding-period rules can be modified by special transactions |
| Preserve lots near long-term status       | Sell other lots first                                                               | Protects a potentially valuable holding-period transition                                                                                      | Market risk during the wait may dominate the tax difference                                                                      |
| Harvest losses                            | Specific loss lots, usually highest basis                                           | Losses can offset capital gains through annual netting and may offset a limited amount of other income, with carryforward treatment for excess | Wash sales, replacement risk, transaction friction, portfolio drift, and a reduced basis in the replacement position             |
| Rebalance tax-efficiently                 | Sell overweight lots with the least tax cost; direct cash flows toward underweights | Coordinates portfolio and tax objectives                                                                                                       | Tax minimization can preserve a bad or oversized position for too long                                                           |
| Donate appreciated assets                 | Long-term appreciated lots, often the lowest-basis eligible lots                    | May avoid realizing embedded gain while supporting charitable intent                                                                           | Deduction limits, appraisal/receipt rules, charity acceptance, holding period, itemization, and DAF fees/constraints             |
| Simplify records                          | Consolidate cash flows and avoid unnecessary tiny lots                              | Fewer lots make reconciliation and specific identification easier                                                                              | Disabling dividend reinvestment changes compounding/cash management and should not be done solely for administrative neatness    |
| Preserve estate-planning optionality      | Often retain highly appreciated lots pending professional estate analysis           | Some inherited assets may receive basis adjustment under current law                                                                           | Gifts generally follow different basis rules; laws and estate facts vary; investment concentration can outweigh tax optionality  |

No row is an automatic recommendation. State the objective and compare alternatives before selecting IDs.

## The decision tree before any taxable sale

1. **Is the account taxable?** Tax-loss harvesting inside an IRA/Roth does not create a current deductible capital loss.
2. **Is the sale economically justified?** Taxes are a constraint, not the investment thesis.
3. **Is adjusted basis complete and credible?** Transferred securities, corporate actions, return of capital, reinvestments, and prior wash sales can alter basis.
4. **What is the actual objective?** Cash, diversification, risk reduction, loss harvesting, gain harvesting, charitable giving, or holding-period management.
5. **What is the year-to-date tax context?** Separate short-term and long-term realized amounts, carryforwards, income-dependent thresholds, and likely state treatment.
6. **What else happens in the 61-day wash window?** Check purchases 30 days before through 30 days after a loss sale across the taxpayer’s relevant accounts, spouse activity where applicable, DRIP, recurring buys, options/contracts, and IRAs.
7. **What portfolio exposure replaces the sale?** Avoid letting tax tactics create an accidental market bet.
8. **Which exact stable lot IDs and quantities implement the decision?** Never substitute a date label or aggregate average for execution identity.
9. **Can Robinhood still honor them?** Re-read `quantity_available` immediately before planning. Concurrent orders can consume inventory and trigger fallback behavior.
10. **How will the result be verified?** Inspect order-selected lots, closed lots after fill, and year-end forms.

## Strategy modules

### 1. Highest-basis-first: defer gain, don’t confuse it with elimination

Selling highest-basis shares usually realizes the smallest gain—or the largest loss—at the current price. This is useful when current liquidity matters and there is no deliberate reason to recognize additional gain.

Before choosing it, compare:

- holding period of each candidate lot;
- whether a selected loss creates wash-sale exposure;
- the basis and concentration left behind;
- current versus plausible future marginal rates;
- charitable or estate use for the low-basis remainder.

**Failure mode:** repeatedly selecting highest basis can leave a portfolio containing only old, highly appreciated, hard-to-diversify shares. That is tax deferral paired with shrinking flexibility.

### 2. Lowest-basis-first and tax-gain harvesting

Intentionally realizing gains can be rational when a taxpayer has an available low federal long-term-capital-gain band, capital-loss carryforwards, a temporarily low-income year, or a desire to reset basis without changing exposure.

Unlike loss sales, selling at a gain and immediately rebuying the same security is not generally barred by the wash-sale loss rule. That does **not** make the maneuver automatically tax-free or wise. Model:

- capital-gain stacking on top of ordinary taxable income;
- state tax and potential NIIT;
- effects on income-sensitive benefits, premiums, credits, and deductions;
- whether losses or deductions already absorb the gain;
- transaction spread and market movement;
- the new holding period after repurchase.

Use current IRS thresholds and a tax return projection; never hard-code last year’s bracket into an agent.

### 3. Loss harvesting: tax deferral with portfolio constraints

A loss can be valuable when it offsets a gain that would otherwise be taxed, or when it survives as a carryforward for future use. Its value is not simply `loss × top tax rate` because timing, annual netting, future rates, replacement basis, and carryforward usability matter.

A disciplined harvest compares:

```text
expected tax benefit of recognition and timing
− spread/fees/slippage
− expected cost of imperfect replacement exposure
− expected future tax cost from lower replacement basis
− operational and compliance risk
```

A replacement should maintain the intended exposure without making an unsupported declaration that two securities are—or are not—“substantially identical.” The phrase lacks a universal ticker-level safe list. Broadly similar is not automatically legally distinct, and different tickers are not automatic proof.

### 4. The wash-sale control plane

For a candidate loss sale, inventory the entire 61-day window:

- same security purchases in any relevant taxable brokerage;
- spouse purchases where the rule applies;
- IRA/Roth IRA purchases;
- dividend reinvestment and recurring investment plans;
- employee equity activity;
- option exercise, assignment, or contracts to acquire;
- automated strategies at other brokers;
- planned purchases during the next 30 days.

Ordinary taxable-account wash-sale treatment generally defers the disallowed loss into replacement-share basis and adjusts holding period. IRS Revenue Ruling 2008-5 identifies the harsher IRA/Roth scenario: a taxable loss followed by an IRA replacement purchase can be disallowed without increasing IRA basis.

The CLI must return `washSale.status = not_evaluated` unless it has complete history **and** forward intent. Robinhood-only data cannot certify taxpayer-wide safety.

### 5. Holding-period management

For many capital assets, one year or less is generally short-term and more than one year is long-term. Treat the broker’s supplied term as evidence and a calendar calculation as an estimate because transferred holding periods, gifts, wash-sale adjustments, options, conversions, and corporate actions can complicate the clock.

For a near-transition lot, compare:

- tax-character difference if sold now versus later;
- dollar gain on that specific lot;
- market risk and liquidity needs during the wait;
- alternative lots available now;
- whether a hedge or option would create another tax issue.

Never let the tax calendar force continued ownership of a position whose risk is unacceptable.

### 6. Tax-aware rebalancing and concentration reduction

Use incoming cash, dividends, and new contributions to buy underweights before selling appreciated overweights. When a sale is still needed:

1. quantify concentration risk first;
2. rank candidate lots by basis, term, and gain/loss;
3. construct several lot packages that reach the same target exposure;
4. compare current realization and remaining embedded gain;
5. choose risk reduction over tax perfection when they conflict.

The goal is not the smallest tax line; it is the best after-tax portfolio that still matches the investor’s risk decision.

### 7. Donate the right appreciated lots

For an investor who already intends to give, donating eligible long-term appreciated securities directly may be more tax-efficient than selling and donating cash. A common lot posture is to consider the most appreciated eligible shares, preserving cash and higher-basis inventory for other uses.

Confirm before transfer:

- recipient charity or donor-advised fund accepts the asset;
- asset and holding period satisfy applicable deduction treatment;
- deduction ceilings, carryforwards, substantiation, appraisal, and itemization rules;
- transfer completes by the intended tax-year deadline;
- the charity—not the donor—controls liquidation after donation.

Do not sell first if the strategy requires an in-kind donation. Do not use a CLI sell planner as a donation planner; transfer contracts are a separate product surface.

### 8. Basis hygiene and tiny-lot control

Good strategy fails on bad records. Preserve:

- original confirmations and transfer statements;
- corporate-action notices;
- prior wash-sale adjustments;
- return-of-capital adjustments;
- Robinhood selected/closed-lot evidence;
- year-end Form 1099-B and corrections;
- the final Form 8949/Schedule D reconciliation.

Dividend reinvestment creates additional lots and can accidentally trigger wash sales. Turning DRIP off may simplify tracking, but it changes investment behavior and should require an explicit decision.

### 9. Mutual funds and average-basis elections

Average basis is not a universal stock-lot shortcut. IRS guidance limits its use to eligible mutual-fund/regulated-investment-company shares and certain dividend reinvestment plans. The election, change/revocation mechanics, and single- versus double-category history matter. Read current Publication 550 and broker-specific rules before changing methods. For ordinary stock specific identification, use exact shares/lots and obtain broker confirmation.

### 10. Gifts, inheritance, and special-property traps

Gifted shares generally do not follow the same basis logic as inherited property. Inherited-property basis adjustments, dual-basis gift rules, community property, employee stock, QSBS, collectibles, options, straddles, constructive sales, and corporate actions can all defeat a generic highest/lowest-basis rule.

The safe agent behavior is to surface the special-property flag and stop at `needs_tax_review`, not improvise.

## Robinhood operating workflow

### Read inventory

```bash
node cli/dist/index.js tax-lots list <SYMBOL> --account <ACCOUNT> --json
```

Confirm:

- `eligibility.eligible`;
- every selected lot has `isSelectable = true`;
- stable `openLotId` exists;
- `quantityAvailable` covers the candidate quantity;
- adjusted tax basis is present;
- broker term and open date are visible.

### Compare dry-run objectives

```bash
node cli/dist/index.js tax-lots plan-sell <SYMBOL> --account <ACCOUNT> \
  --shares <QTY> --objective highest_basis --json

node cli/dist/index.js tax-lots plan-sell <SYMBOL> --account <ACCOUNT> \
  --shares <QTY> --objective long_term_first --json

node cli/dist/index.js tax-lots plan-sell <SYMBOL> --account <ACCOUNT> \
  --lot <OPEN_LOT_ID>:<QTY> --json
```

Do not compare only the headline estimate. Compare the selected IDs, term mix, unknown inputs, remaining lots, wash-sale state, and portfolio consequence.

### Live-write boundary

`tax-lots sell` and `robinhood_tax_lot_sell` are dry-run boundaries. Every live exact-lot request must fail closed until an authenticated, account-scoped Robinhood review/check/submit contract is captured and implemented. A generic `/orders/` route, third-party body example, environment switch, or static UI asset is not sufficient evidence.

For an order independently placed through Robinhood, use order-specific selected/closed-lot reads to verify what actually happened. Robinhood’s support deadline for corrections is time-sensitive; consult current help rather than relying on a cached cutoff.

## Year-round operating system

### On every taxable purchase

- record the acquisition as a distinct lot;
- capture source, basis confidence, and intended role;
- know whether DRIP or recurring purchases are active.

### Monthly

- scan taxable positions for missing basis and corporate-action changes;
- inspect concentration and near-long-term lots;
- identify—not automatically execute—loss and gain candidates;
- check whether another account or automation creates wash-sale exposure.

### Before a planned sale

- run the ten-step decision tree;
- compare at least two lot packages;
- re-read availability;
- stop at dry run in the custom CLI.

### After a Robinhood order

- read selected lots from the order route;
- read closed lots after fill;
- reconcile quantities, proceeds, basis, and term;
- preserve evidence before Robinhood’s correction window expires.

### Year end and tax filing

- do not wait until the final market day to discover missing basis;
- reconcile all brokers and accounts, not Robinhood alone;
- identify wash-sale adjustments and carryforwards;
- compare broker forms with the trade ledger;
- use Form 8949/Schedule D and current instructions as filing authority.

## Learning path: convert knowledge into capability

This playbook follows the `Learn` skill’s rule: define the exit test first, retrieve before rereading, and prove transfer on an unseen case.

### Exit test

Given an unseen taxable position with eight lots, incomplete basis on one lot, one lot near long-term status, a DRIP purchase inside the lookback window, an IRA purchase, year-to-date short/long results, and a target number of shares to sell, the learner must:

1. reject unsafe/unknown assumptions;
2. produce at least three valid lot packages using stable IDs and exact quantities;
3. explain current realization versus remaining embedded gain;
4. identify wash-sale and holding-period risks;
5. choose a package for each of three different objectives;
6. state what additional data is required before action;
7. produce a Robinhood dry-run command;
8. explain how the result would be verified and reported.

Passing requires no invented basis, no claim of wash-sale safety, no IRA harvesting, exact quantity conservation, and explicit separation between investment choice and tax consequence.

### Four-session sequence

| Session          | Retrieval first                                                  | New material                                              | Production                                               |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 1. Inventory     | Define lot, basis, term, and specific identification from memory | Product mechanics and source hierarchy                    | Annotate an eight-lot table without choosing a sale      |
| 2. Objectives    | Reproduce the strategy matrix cold                               | Highest/lowest basis, term, gain/loss harvesting          | Build three packages for the same sale quantity          |
| 3. Failure modes | Draw the 61-day window and account scope                         | IRA trap, DRIP, options, missing basis, concurrent orders | Red-team a seemingly “safe” harvest                      |
| 4. Transfer      | Explain the full decision tree without notes                     | Reporting and evidence retention                          | Complete the unseen exit test and compare against rubric |

### Retrieval prompts

- Why can highest-basis-first increase future tax exposure?
- When can lowest-basis-first be intentional rather than reckless?
- What data is required before claiming a loss sale is wash-sale safe?
- Why is a replacement purchase inside an IRA worse than an ordinary taxable-account wash sale?
- Why is “held for 365 days” not enough to prove long-term treatment?
- Which lot is usually most attractive for charitable donation, and what must be verified first?
- Why can tax minimization conflict with risk reduction?
- What evidence proves that Robinhood actually used the intended lots?

### Scoring rubric

| Dimension         | Fail                                | Pass                                             |
| ----------------- | ----------------------------------- | ------------------------------------------------ |
| Identity          | Uses dates, labels, or average cost | Uses stable IDs and exact quantities             |
| Data quality      | Treats missing basis as zero        | Stops or isolates unknown basis                  |
| Wash sale         | Checks Robinhood only               | Demands taxpayer-wide history and forward intent |
| Tax framing       | Claims guaranteed savings           | Labels assumptions, timing, and exclusions       |
| Portfolio framing | Optimizes tax in isolation          | Preserves investment/risk objective              |
| Execution         | Suggests live CLI submission        | Stops at dry run until contract evidence exists  |
| Verification      | Trusts order acceptance             | Reconciles selected/closed lots and tax forms    |

## Video curriculum

Video identities were verified through YouTube’s oEmbed endpoint on 2026-08-08. Videos explain concepts; their claims must be checked against current IRS/Robinhood guidance.

### Core sequence

1. **[Tax Loss Harvesting – A Step-By-Step Walkthrough](https://www.youtube.com/watch?v=3QpChdtU6y8)** — The White Coat Investor. A practical brokerage lot-screen walkthrough; transcript reviewed 2026-08-08. Strong on seeing mixed-term gains/losses, selecting candidates, replacement exposure, charitable use of appreciated lots, and why accumulated carryforwards reduce the marginal value of another harvest. Platform clicks are Vanguard-specific and tax discussion remains educational.
2. **[Tax-loss Harvesting | Vanguard Advice](https://www.youtube.com/watch?v=T641JWRhgZk)** — Vanguard. Institution-level conceptual overview. Use for first exposure; captions were unavailable to the transcript tool, so treat the linked page/video—not this document—as the content source.
3. **[Ways To Help Reduce Taxes On Stocks & Bonds – Market Sense](https://www.youtube.com/watch?v=MMS2gvWLh9k)** — Fidelity Investments, 2026-03-10. Broadens the frame beyond one tactic to tax-efficient investing, direct indexing, and loss harvesting.

### Strategy extensions

- **[What is Tax Gain Harvesting?](https://www.youtube.com/watch?v=O-caF9sR4H0)** — Retirement Planning Education. Introduces intentional gain realization and basis reset; verify thresholds for the current tax year.
- **[How to Pay 0% in Capital Gains Tax](https://www.youtube.com/watch?v=BUBZBbNQXJ0)** — CarsonAllaria Wealth Management, 2023-12-18 per search metadata. Useful for gain-harvesting context and interactions; do not reuse historical thresholds.
- **[Donating non-cash assets to a donor-advised fund](https://www.youtube.com/watch?v=1qFTq1oa96c)** — Fidelity Charitable. Explains donating appreciated non-cash assets rather than selling first.
- **[Tax benefits of donor-advised funds](https://www.youtube.com/watch?v=sqqtvipnZhY)** — Fidelity Charitable. Covers deduction, potential capital-gain avoidance, and charitable-account structure from the provider’s perspective; compare fees and alternatives.
- **[Tax-Loss Harvesting for Financial Advisors: Live Workflow Demo](https://www.youtube.com/watch?v=GXPC3P5DIpg)** — Alphathena. Useful for seeing household-level monitoring and advisor workflow, but it is a product demonstration and therefore a lower-authority source.

## Articles and primary references

### Federal authority

- IRS, [Publication 550 (2025), Investment Income and Expenses](https://www.irs.gov/publications/p550) — specific identification, basis methods, holding period, wash sales, netting, mutual-fund average basis, and special cases.
- IRS, [Topic No. 409, Capital Gains and Losses](https://www.irs.gov/taxtopics/tc409) — short/long classification, netting, deduction limit, and carryforward overview.
- IRS, [Topic No. 703, Basis of Assets](https://www.irs.gov/taxtopics/tc703) — basis fundamentals.
- IRS, [Instructions for Form 8949 (2025)](https://www.irs.gov/instructions/i8949) — transaction reporting and basis-adjustment mechanics.
- IRS, [Revenue Ruling 2008-5](https://www.irs.gov/pub/irs-drop/rr-08-05.pdf) — IRA/Roth replacement-purchase wash-sale treatment.
- IRS, [Mutual funds: costs and distributions FAQ](https://www.irs.gov/faqs/capital-gains-losses-and-sale-of-home/mutual-funds-costs-distributions-etc) — mutual-fund basis questions and Publication 550 pointers.

### Robinhood mechanics

- Robinhood, [Tax lots](https://robinhood.com/us/en/support/articles/tax-lots/) — eligibility, selection priority, availability, FIFO fallback, estimates, and correction mechanics; retrieved 2026-08-08.
- Robinhood, [Wash sales](https://robinhood.com/us/en/support/articles/wash-sales/) — platform reporting and customer responsibility across accounts; retrieved 2026-08-08.
- Product contract and exact CLI behavior: [`tax-lot-intelligence-and-exact-lot-selling.md`](tax-lot-intelligence-and-exact-lot-selling.md).

### Institutional strategy explanations

- Charles Schwab, [Save on Taxes: Know Your Cost Basis](https://www.schwab.com/learn/story/save-on-taxes-know-your-cost-basis) — compares basis methods and their realization effects.
- Charles Schwab, [How to Lower Your Taxes by Harvesting Gains](https://www.schwab.com/learn/story/how-to-save-money-with-tax-gain-harvesting) — gain harvesting and basis reset.
- Charles Schwab, [How to Cut Your Tax Bill with Tax-Loss Harvesting](https://www.schwab.com/learn/story/how-to-cut-your-tax-bill-with-tax-loss-harvesting) — loss harvesting and explicit risk warning.
- Vanguard, [Cost basis methods available at Vanguard](https://investor.vanguard.com/investor-resources-education/taxes/cost-basis-methods-available-at-vanguard) — specific identification, FIFO, average cost, and minimum-tax methods.
- Vanguard, [Tax-loss harvesting explained](https://investor.vanguard.com/investor-resources-education/taxes/offset-gains-loss-harvesting) — deferral, replacement basis, and future-rate tradeoffs.
- Fidelity, [Tax-loss harvesting](https://www.fidelity.com/viewpoints/personal-finance/tax-loss-harvesting) — candidate selection, wash-sale risk, and basis-method considerations.
- Fidelity, [Capital Gains and Cost Basis](https://www.fidelity.com/tax-information/tax-topics/capital-gains-cost-basis) — term and basis fundamentals.
- Fidelity, [Gifting appreciated assets](https://www.fidelity.com/learning-center/wealth-management-insights/gifting-appreciated-assets) — charitable use of long-term appreciated property.

## Verification checklist for future updates

- [ ] Every tax threshold is linked to the current tax year or omitted.
- [ ] IRS/Robinhood pages were opened—not inferred from old snippets.
- [ ] Video URL, title, and channel were rechecked.
- [ ] No video is treated as legal authority.
- [ ] Live exact-lot submission remains fail-closed unless authenticated review/check/submit evidence is added with tests.
- [ ] Robinhood repo `SKILL.md`, Hermes `robinhood-cli`, and standalone `tax-lot-strategy` all reference the same current playbook.
- [ ] Missing basis remains unknown; wash-sale state remains `not_evaluated` without complete inputs.
- [ ] Any examples conserve exact quantities and distinguish current realization from remaining embedded gain.
