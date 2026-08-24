<!-- GENERATED from knowledge/tax-reference.json by scripts/generate-tax-reference.mjs. -->

# Tax reference — source-backed US federal mechanics

> **When to load this:** any question about option taxation, wash sales, Section 1256,
> qualified covered calls, exercise holding periods, tax lots, box spreads, constructive
> sales, or whether a Robinhood estimate is suitable for filing. Start here before using
> narrative tax documents. Educational research only, not a personalized filing conclusion.

**Jurisdiction:** United States federal income tax  
**Reviewed:** 2026-08-24  
**Schema:** 1

General educational information only. Tax treatment is fact-dependent, state rules differ, and broker reporting is not a substitute for the Internal Revenue Code, regulations, IRS guidance, or advice from a qualified tax professional.

## Surface routing

- **CLI:** `robinhood-tax`, `robinhood-tax <topic>`, or `robinhood-tax --query "<text>"`.
- **API:** `import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference"`.
- **MCP:** use `robinhood_knowledge` to read `tax-reference`; this generated module is the same catalog rendered for agents.
- **Live account facts:** use `tax-lots`, `documents`, `history`, `recurring`, and `settings` separately. A reference lookup never authorizes a trade.

## Agent contract

1. State the jurisdiction and review date before summarizing a tax rule.
2. Separate primary-law or IRS guidance from broker-platform behavior and from planning inference.
3. Do not infer a filing result from a ticker, product label, or app estimate alone. Check the broker's year-end tax form and the taxpayer's complete facts.
4. Do not calculate personalized liability without filing status, taxable income, basis, carryovers, elections, state, and other relevant accounts.
5. For wash-sale, straddle, qualified-covered-call, conversion-transaction, box-spread, or constructive-sale ambiguity, surface the uncertainty and recommend professional review rather than adjudicating it.
6. Tax-reference reads never authorize a trade. Account reads may inform a plan, but every mutation remains dry-run by default and separately approved.

## Evidence lanes

| Lane | Meaning |
| --- | --- |
| `primary-law` | Primary law or regulation. Statute or regulation controls, subject to amendments, effective dates, and the user's facts. |
| `irs-guidance` | IRS guidance or reporting instruction. Official IRS explanation, ruling, publication, form, or instruction. Useful and authoritative in context, but not a replacement for the Code or regulations. |
| `broker-platform` | Broker-platform behavior. What Robinhood currently exposes, estimates, reports, or allows. Platform behavior does not decide federal tax law. |
| `planning-inference` | Planning inference. A conservative workflow or risk flag where the authorities do not provide a bright-line answer. Never present as settled law. |

## Topics

### Written equity-option recognition and character

**ID:** `option-writer-lifecycle`

A written non-Section-1256 equity option is generally recognized when it expires, is closed, or is exercised, not when premium is first received.

**Claims**

- **irs-guidance; certainty=high.** If a written equity option expires or is bought back in a closing transaction, the writer's result is generally short-term capital gain or loss.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025).
- **irs-guidance; certainty=high.** When a written call is exercised, the premium increases the amount realized on the stock sale; when a written put is exercised, the premium reduces the basis of stock acquired.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025).

**Caveats**

- Section 1256, dealer, business, hedging, and straddle rules can override the ordinary equity-option treatment.
- A roll closes one contract and opens another. The closed leg is a realization event even when the overall economic exposure continues.

### Wash sales involving stock and options

**ID:** `wash-sales`

The federal wash-sale window reaches 30 days before and 30 days after a loss sale and can include contracts or options to acquire substantially identical stock or securities.

**Claims**

- **primary-law; certainty=high.** A loss can be disallowed when substantially identical stock or securities are acquired within the statutory window.
  Sources: [`usc-1091`](#source-usc-1091), [`irs-pub-550-2025`](#source-irs-pub-550-2025).
- **irs-guidance; certainty=high.** Publication 550 expressly includes acquiring a contract or option to buy substantially identical stock or securities and applies wash-sale rules to losses on contracts and options to acquire or sell stock or securities.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025).
- **planning-inference; certainty=uncertain.** The authorities do not provide a universal strike-or-expiration safe harbor for deciding whether two options are substantially identical. Treat same-underlying replacements as a review flag rather than declaring them safe or washed from contract terms alone.
  Sources: [`usc-1091`](#source-usc-1091), [`irs-pub-550-2025`](#source-irs-pub-550-2025), [`robinhood-tax-faq`](#source-robinhood-tax-faq).

**Caveats**

- Broker wash-sale reporting is narrower than the taxpayer's complete obligation and may not coordinate every account, broker, spouse transaction, or substantially identical instrument.
- Wash-sale basis and holding-period adjustments are separate from economic gain or loss and may be only partially reflected in app estimates.

### Taxable losses followed by IRA or Roth IRA acquisitions

**ID:** `retirement-account-wash-sales`

A substantially identical acquisition in an IRA or Roth IRA can permanently disallow a taxable-account loss.

**Claims**

- **irs-guidance; certainty=high.** Revenue Ruling 2008-5 concludes that the taxable-account loss is disallowed when the individual's IRA or Roth IRA acquires substantially identical stock or securities in the wash-sale window, and the IRA's basis is not increased.
  Sources: [`irs-rev-rul-2008-5`](#source-irs-rev-rul-2008-5), [`irs-pub-550-2025`](#source-irs-pub-550-2025).

**Caveats**

- Review automatic acquisitions such as recurring investments, dividend reinvestment, and transactions in other accounts before treating a harvested loss as available.
- The ruling is specific to its facts; substantially identical analysis remains fact-dependent.

### Section 1256 contracts, 60/40 character, and mark-to-market

**ID:** `section-1256`

Qualifying Section 1256 contracts are generally marked to market at year-end, with gain or loss characterized 60% long-term and 40% short-term regardless of actual holding period.

**Claims**

- **primary-law; certainty=high.** The 60% component is long-term capital character and the 40% component is short-term capital character. The rule is statutory; holding period is irrelevant.
  Sources: [`usc-1256`](#source-usc-1256), [`irs-pub-550-2025`](#source-irs-pub-550-2025).
- **irs-guidance; certainty=high.** Open positions are generally treated as sold at fair market value on the last business day of the tax year and reported through Form 6781.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025), [`irs-form-6781`](#source-irs-form-6781).
- **broker-platform; certainty=medium.** Robinhood currently describes supported index options such as SPX, VIX, XSP, RUT, and NDX as cash-settled index options with Section 1256 reporting treatment.
  Sources: [`robinhood-index-options`](#source-robinhood-index-options), [`robinhood-tax-docs`](#source-robinhood-tax-docs).

**Caveats**

- Do not classify a contract from a ticker or the phrase 'index option' alone. Confirm the actual contract and year-end Form 1099-B or other broker reporting.
- Mixed straddles, hedges, and elections can change timing and character. A position consisting only of Section 1256 contracts is not the same as a mixed Section 1256/non-Section-1256 structure.
- Avoid hard-coded rate comparisons. The tax value depends on the return year, taxable income, netting, carryovers, state law, and other facts.

### Qualified covered calls and holding-period effects

**ID:** `qualified-covered-calls`

Qualified-covered-call status is a technical safe harbor under the straddle rules, not a generic label for any covered call.

**Claims**

- **primary-law; certainty=high.** Qualified status depends on statutory and regulatory requirements, including exchange trading, option term, and the lowest-qualified-benchmark rules.
  Sources: [`usc-1092`](#source-usc-1092), [`ecfr-qcc`](#source-ecfr-qcc).
- **irs-guidance; certainty=high.** Publication 550 explains that certain in-the-money qualified covered calls can exclude days from the stock's holding period and that nonqualified positions can fall under broader straddle rules.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025), [`ecfr-qcc`](#source-ecfr-qcc).

**Caveats**

- Do not reduce the regulation to a fixed dollar amount in-the-money. Strike grids, applicable stock price, term, and regulatory adjustments matter.
- Dividend holding-period treatment, loss deferral, and stock holding-period effects require the complete position and dates.

### Exercise, basis, proceeds, and the new property's holding period

**ID:** `option-exercise-holding-period`

Exercise generally converts the option into basis or proceeds adjustments, and the acquired property's holding period starts after exercise rather than inheriting the option's holding period.

**Claims**

- **irs-guidance; certainty=high.** The holding period for property acquired by exercising an option begins the day after exercise.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025).
- **irs-guidance; certainty=high.** A purchased call's cost generally enters the acquired stock's basis; written-put premium reduces basis; written-call premium increases stock-sale proceeds.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025).

**Caveats**

- Employee stock options, Section 1256 contracts, dealer activity, and noncapital property follow additional or different rules.
- Selling a long option can have different character from exercising it; use the actual disposition method.

### Specific tax-lot identification and broker confirmation

**ID:** `tax-lots-specific-identification`

Specific identification requires timely instructions to the broker and written confirmation; absent adequate identification, FIFO generally applies for ordinary shares.

**Claims**

- **irs-guidance; certainty=high.** Publication 550 says adequate identification generally requires telling the broker which particular shares are sold at the time of sale or transfer and receiving written confirmation within a reasonable time.
  Sources: [`irs-pub-550-2025`](#source-irs-pub-550-2025).
- **broker-platform; certainty=medium.** Robinhood currently supports specific-lot selection for eligible US taxable investing accounts and multiple default disposal methods, but app gain/loss estimates are not tax-reporting documents.
  Sources: [`robinhood-tax-lots`](#source-robinhood-tax-lots).
- **broker-platform; certainty=medium.** Robinhood says unavailable selected shares can fall back to the account's default disposal method, and adjustments after execution may require contacting support by its stated deadline.
  Sources: [`robinhood-tax-lots`](#source-robinhood-tax-lots).

**Caveats**

- A planning screen is not execution evidence. Verify the filled order, selected or closed lots, and year-end tax forms.
- Missing transferred basis, corporate actions, and wash-sale adjustments can make app estimates incomplete.

### Box spreads and tax-characterization uncertainty

**ID:** `box-spreads`

A box spread may have a fixed economic payoff, but that does not create one automatic federal tax characterization.

**Claims**

- **primary-law; certainty=high.** Depending on the instruments and facts, Section 1256, straddle rules, conversion-transaction rules, and other timing or character provisions may interact.
  Sources: [`usc-1092`](#source-usc-1092), [`usc-1256`](#source-usc-1256), [`usc-1258`](#source-usc-1258), [`irs-pub-550-2025`](#source-irs-pub-550-2025), [`irs-form-6781`](#source-irs-form-6781).
- **planning-inference; certainty=fact-specific.** Do not describe a short box's financing cost as automatically deductible Section 1256 capital loss or a long box's return as automatically favorable 60/40 income. The broker's reporting, contract composition, elections, purpose, and tax authorities must be reviewed together.
  Sources: [`usc-1092`](#source-usc-1092), [`usc-1256`](#source-usc-1256), [`usc-1258`](#source-usc-1258), [`irs-form-6781`](#source-irs-form-6781).

**Caveats**

- A fixed payoff does not eliminate execution, liquidity, settlement, leverage, reporting, or tax-characterization risk.
- Treat a personalized box-spread financing or tax conclusion as professional-review territory.

### Constructive sales of appreciated financial positions

**ID:** `constructive-sales`

Certain offsetting transactions can trigger gain recognition even though the appreciated position was not conventionally sold.

**Claims**

- **primary-law; certainty=high.** Section 1259 covers specified transactions that substantially eliminate continued exposure to an appreciated financial position and contains limited exceptions with precise timing conditions.
  Sources: [`usc-1259`](#source-usc-1259), [`irs-pub-550-2025`](#source-irs-pub-550-2025).

**Caveats**

- Do not declare a collar, covered call, put, short sale, forward, or multi-leg option structure safe from Section 1259 based only on its strategy name.
- The exact appreciated position, offset, dates, and risk retained must be analyzed.

### Broker estimates, year-end forms, and reconciliation

**ID:** `tax-documents-and-estimates`

App estimates are planning inputs; federal reporting should be reconciled to official year-end forms and the taxpayer's complete records.

**Claims**

- **broker-platform; certainty=medium.** Robinhood says tax-lot gain/loss and cost-per-share figures are estimates and directs customers to year-end tax forms for filing.
  Sources: [`robinhood-tax-lots`](#source-robinhood-tax-lots), [`robinhood-tax-docs`](#source-robinhood-tax-docs).
- **irs-guidance; certainty=high.** Section 1256 and straddle reporting can require Form 6781 adjustments beyond a simple transaction list.
  Sources: [`irs-form-6781`](#source-irs-form-6781), [`irs-pub-550-2025`](#source-irs-pub-550-2025).

**Caveats**

- Reconcile account transfers, missing basis, corporate actions, wash-sale adjustments, and transactions at other brokers.
- A broker's identical-security reporting logic may be narrower than the taxpayer's substantially-identical analysis.

## Sources

<a id="source-irs-pub-550-2025"></a>
### IRS Publication 550 (2025), Investment Income and Expenses

- **ID:** `irs-pub-550-2025`
- **Lane:** `irs-guidance`
- **Effective/review scope:** 2025 federal returns
- **Use:** Options, wash sales, basis identification, qualified covered calls, straddles, constructive sales, and Section 1256 reporting.
- **URL:** https://www.irs.gov/publications/p550

<a id="source-irs-form-6781"></a>
### IRS Form 6781, Gains and Losses From Section 1256 Contracts and Straddles

- **ID:** `irs-form-6781`
- **Lane:** `irs-guidance`
- **Effective/review scope:** Current IRS form page; use the revision for the return year
- **Use:** Reporting path for Section 1256 contracts and straddles.
- **URL:** https://www.irs.gov/forms-pubs/about-form-6781

<a id="source-irs-rev-rul-2008-5"></a>
### Revenue Ruling 2008-5

- **ID:** `irs-rev-rul-2008-5`
- **Lane:** `irs-guidance`
- **Effective/review scope:** Published 2008; verify later authority
- **Use:** Taxable-account loss followed by an IRA or Roth IRA acquisition of substantially identical property.
- **URL:** https://www.irs.gov/pub/irs-drop/rr-08-05.pdf

<a id="source-ecfr-qcc"></a>
### 26 CFR 1.1092(c)-1, Qualified covered calls

- **ID:** `ecfr-qcc`
- **Lane:** `primary-law`
- **Effective/review scope:** Current eCFR; check the displayed update date
- **Use:** Qualified-covered-call requirements and lowest-qualified-benchmark mechanics.
- **URL:** https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/subject-group-ECFR9830aa50671aa9c/section-1.1092(c)-1

<a id="source-usc-1091"></a>
### 26 USC 1091, Loss from wash sales of stock or securities

- **ID:** `usc-1091`
- **Lane:** `primary-law`
- **Effective/review scope:** Preliminary current United States Code
- **Use:** Statutory wash-sale rule.
- **URL:** https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1091&num=0&edition=prelim

<a id="source-usc-1092"></a>
### 26 USC 1092, Straddles

- **ID:** `usc-1092`
- **Lane:** `primary-law`
- **Effective/review scope:** Preliminary current United States Code
- **Use:** Loss deferral, holding-period, mixed-straddle, and qualified-covered-call framework.
- **URL:** https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1092&num=0&edition=prelim

<a id="source-usc-1233"></a>
### 26 USC 1233, Gains and losses from short sales

- **ID:** `usc-1233`
- **Lane:** `primary-law`
- **Effective/review scope:** Preliminary current United States Code
- **Use:** Short-sale and option-writer character rules.
- **URL:** https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1233&num=0&edition=prelim

<a id="source-usc-1256"></a>
### 26 USC 1256, Section 1256 contracts marked to market

- **ID:** `usc-1256`
- **Lane:** `primary-law`
- **Effective/review scope:** Preliminary current United States Code
- **Use:** Contract definition, annual mark-to-market, and 60/40 character.
- **URL:** https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1256&num=0&edition=prelim

<a id="source-usc-1258"></a>
### 26 USC 1258, Conversion transactions

- **ID:** `usc-1258`
- **Lane:** `primary-law`
- **Effective/review scope:** Preliminary current United States Code
- **Use:** Ordinary-income recharacterization and interest-equivalent concepts that can matter for fixed-return structures.
- **URL:** https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1258&num=0&edition=prelim

<a id="source-usc-1259"></a>
### 26 USC 1259, Constructive sales treatment for appreciated financial positions

- **ID:** `usc-1259`
- **Lane:** `primary-law`
- **Effective/review scope:** Preliminary current United States Code
- **Use:** Constructive-sale triggers and exceptions.
- **URL:** https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1259&num=0&edition=prelim

<a id="source-robinhood-index-options"></a>
### Robinhood Help, Index options

- **ID:** `robinhood-index-options`
- **Lane:** `broker-platform`
- **Effective/review scope:** Platform article checked 2026-08-24
- **Use:** Current product availability, cash settlement, exercise style, and Robinhood's Section 1256 reporting description.
- **URL:** https://robinhood.com/us/en/support/articles/index-options/

<a id="source-robinhood-tax-lots"></a>
### Robinhood Help, Tax lots

- **ID:** `robinhood-tax-lots`
- **Lane:** `broker-platform`
- **Effective/review scope:** Platform article checked 2026-08-24
- **Use:** Specific-lot selection, disposal methods, estimates, availability, priority, and fallback behavior.
- **URL:** https://robinhood.com/us/en/support/articles/tax-lots/

<a id="source-robinhood-tax-docs"></a>
### Robinhood Help, How to read your 1099

- **ID:** `robinhood-tax-docs`
- **Lane:** `broker-platform`
- **Effective/review scope:** Platform article checked 2026-08-24
- **Use:** Current consolidated tax-document presentation, including Section 1256 reporting.
- **URL:** https://robinhood.com/us/en/support/articles/how-to-read-your-1099/

<a id="source-robinhood-tax-faq"></a>
### Robinhood Help, Tax documents FAQ

- **ID:** `robinhood-tax-faq`
- **Lane:** `broker-platform`
- **Effective/review scope:** Platform article checked 2026-08-24
- **Use:** Robinhood's identical-option reporting rule and warning that taxpayer obligations may span accounts and substantially identical securities.
- **URL:** https://robinhood.com/us/en/support/articles/tax-documents-faq/

## Maintenance rule

Edit `knowledge/tax-reference.json`, run `pnpm generate:tax-reference`, and commit both files.
The quality gate fails when this rendered module is stale, a claim has no source, a source uses
an unknown evidence lane, or an identifier is duplicated.
