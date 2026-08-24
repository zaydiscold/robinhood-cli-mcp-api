# Tax-aware options mechanics for US federal research

> **Scope:** educational US federal income-tax mechanics for options and related Robinhood
> workflows. This document does not determine a user's filing position, tax liability, or whether a
> trade is economically appropriate. State rules, elections, business or dealer status, hedging,
> cross-account activity, and facts outside Robinhood can change the result.

**Reviewed:** 2026-08-24  
**Authoritative repository source:** [`../knowledge/tax-reference.md`](../knowledge/tax-reference.md)

This document explains how the mechanics interact with options workflows. The generated tax
reference contains the maintained claims, evidence lanes, caveats, and official source URLs. When
this narrative and the generated reference disagree, stop and reconcile the discrepancy before
using either one.

## How to read a claim

Every material tax statement belongs to one of four lanes:

| Lane | What it means |
| --- | --- |
| Primary law or regulation | Statute or regulation controls, subject to effective dates and the complete facts |
| IRS guidance or reporting instruction | Official IRS explanation, ruling, publication, form, or instruction |
| Broker-platform behavior | What Robinhood currently exposes, estimates, allows, confirms, or reports |
| Planning inference | A conservative workflow or flag where no bright-line answer exists |

A Robinhood help article can establish current product or reporting behavior. It cannot decide the
meaning of the Internal Revenue Code. A planning heuristic can reduce operational risk. It cannot be
presented as settled law.

Query the maintained catalog before relying on a section below:

```bash
node cli/dist/tax-cli.js
node cli/dist/tax-cli.js option-writer-lifecycle
node cli/dist/tax-cli.js wash-sales
node cli/dist/tax-cli.js section-1256
node cli/dist/tax-cli.js qualified-covered-calls
node cli/dist/tax-cli.js box-spreads
```

API applications use:

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
```

MCP clients read the generated `tax-reference` knowledge module with `robinhood_knowledge`.

## What this repository can observe and what it cannot decide

### It can observe or help plan

- owned Robinhood accounts and account class
- current positions and option contracts
- order and execution history visible to Robinhood
- open tax lots, adjusted basis when supplied, and quantity available
- recurring investments and visible account settings
- Robinhood documents and year-end forms when available
- the exact option strategy, legs, prices, position effects, and dates
- Robinhood's current platform descriptions for supported products
- dry-run order bodies and post-send order-history evidence

### It cannot independently decide

- complete federal or state tax liability
- filing status or taxable-income brackets
- activity at every other broker
- spouse transactions
- every retirement or employer-plan acquisition
- whether two instruments are substantially identical in every fact pattern
- whether a covered call satisfies every qualified-covered-call requirement
- whether a box spread or other fixed-return structure receives one particular character treatment
- whether a position is a hedge, straddle, mixed straddle, conversion transaction, constructive
  sale, dealer position, or business position under the user's complete facts
- whether a broker estimate fully reflects transferred basis, corporate actions, or adjustments

The correct output is often “mechanics known, filing conclusion fact-specific,” not a forced yes or no.

## 1. Written equity options: recognition follows the lifecycle

For a written non-Section-1256 equity option, receiving premium is not by itself the final taxable
event. The result is generally determined when the option:

- expires
- is closed in a buy-to-close transaction
- is exercised or assigned

A closing purchase realizes the closed contract. Opening another contract as part of a roll does not
erase or postpone the realization of the leg that was closed.

General lifecycle effects described by IRS guidance include:

| Event | General mechanic |
| --- | --- |
| Written option expires | Writer generally recognizes short-term capital gain |
| Writer buys to close | Difference between premium received and closing cost is generally short-term gain or loss |
| Written call is exercised | Call premium generally increases the amount realized on the stock sale |
| Written put is exercised | Put premium generally reduces the basis of stock acquired |

These are starting rules, not universal overrides. Section 1256, straddle, dealer, business, and
hedging provisions can change the simple equity-option treatment.

### Rolling across a tax-year boundary

A roll contains two actions:

1. close the existing contract
2. open a replacement contract

The old leg is recognized when it is actually closed. A trader cannot move that realized result to a
later year merely by calling the combined trade a roll. Timing may change only if the old contract
remains open across the boundary or the actual closing transaction occurs later.

Similarly, moving a likely stock disposition into a later year is not guaranteed. Assignment,
exercise style, ex-dividend behavior, market movement, and the exact contract control the outcome.
Do not describe a later expiration as certain tax deferral.

## 2. Purchased options, exercise, and holding period

The treatment differs depending on whether a purchased option is sold, expires, or is exercised.
When a call is exercised, its cost generally enters the acquired stock's basis. When a put is
exercised, the option can affect the amount realized on the underlying disposition. The holding
period for property acquired through exercise generally starts after exercise rather than inheriting
the option's holding period.

That produces an important distinction:

```text
sell a long option
!=
exercise the option and later sell delivered shares
```

The disposition method changes both the property being disposed of and the relevant holding period.
Do not assume a LEAPS holding period automatically transfers to acquired shares.

Before discussing exercise as a tax tactic, compare:

- intrinsic value
- remaining extrinsic value
- spread and liquidity
- dividend and assignment considerations
- account capability
- basis and holding-period consequences
- whether selling the option is operationally available

Tax mechanics do not make it sensible to destroy material extrinsic value.

## 3. Wash sales involving options

The federal wash-sale window reaches 30 days before and 30 days after a loss sale. IRS guidance
expressly includes certain contracts or options to acquire substantially identical stock or
securities and applies wash-sale rules to losses on contracts and options involving stock or
securities.

### What is clear

- the pre-sale window matters, not only the period after the sale
- replacement quantity can affect only part of a loss
- taxable-account replacement purchases can generally produce basis and holding-period adjustments
- an IRA or Roth IRA replacement can permanently disallow the taxable-account loss without a basis
  increase in the retirement account
- recurring investments and dividend reinvestment are acquisitions
- the taxpayer's obligation can extend beyond what one broker reports

### What is not a universal rule

There is no universal statutory strike-or-expiration safe harbor saying that changing one option
term automatically makes the replacement non-identical. A normal roll may be economically different,
but that does not let the repository adjudicate substantial identity as a bright-line calculation.

For material same-underlying option losses, report:

- old and new contract identifiers
- strike, expiration, type, side, and delta or economic exposure
- dates inside the control window
- account and outside-account facts
- whether the conclusion is primary authority, broker behavior, or planning inference

Use [`../knowledge/tax-loss-harvesting.md`](../knowledge/tax-loss-harvesting.md) for the complete
account-control workflow.

## 4. Qualified covered calls and the straddle framework

“Covered” is an economic description. “Qualified covered call” is a technical tax classification.
A call is not qualified merely because the account owns 100 shares.

The statute and regulation consider requirements including:

- exchange trading
- option term
- relationship between strike and applicable stock price
- the lowest-qualified-benchmark framework
- exclusions for certain dealer or ordinary-income positions
- the complete stock-and-option relationship

Do not reduce the regulation to “no more than $5 or $10 in the money.” Strike grids, stock price,
term, and regulatory adjustments matter.

Potential consequences around covered calls and straddles can include:

- loss deferral
- holding-period effects
- dividend holding-period complications
- different treatment of an in-the-money qualified call and a nonqualified structure
- interaction with other offsetting positions

The repository can calculate dates and inspect contracts. It cannot determine QCC status from a
strategy label alone. For a material appreciated position, surface the regulatory inputs and the
uncertainty rather than claiming the stock's holding-period clock definitely continues or resets.

## 5. Section 1256 contracts

Qualifying Section 1256 contracts are generally marked to market at year-end. Gain or loss is
characterized 60% long-term and 40% short-term regardless of actual holding period.

### Correction: the 60% component is real long-term capital character

The 60% component is not merely “long-term-like.” It is statutory long-term capital character. The
holding period is irrelevant to the allocation, but that does not make the character unreal.

Avoid hard-coded statements such as “this always produces a 26% rate.” The actual tax effect depends
on the return year, taxable income, netting, carryovers, elections, state treatment, and other facts.

### Confirm the contract, not just the ticker label

Do not infer Section 1256 status from:

- the phrase “index option”
- a search result
- a ticker alone
- cash settlement alone
- a marketing comparison with an ETF

Confirm the actual contract and reconcile the broker's year-end reporting. Robinhood currently
describes supported index-option products such as SPX, XSP, NDX, VIX, and RUT as cash-settled index
options with Section 1256 reporting, but current platform description and final tax treatment remain
separate evidence lanes.

### Year-end mark-to-market

Open qualifying contracts are generally treated as sold at fair market value on the last business
day of the year, with reporting through Form 6781. This can recognize a gain before the position is
closed for cash. It can also reset basis for the following year.

### Mixed positions

A structure combining Section 1256 and non-Section-1256 legs can invoke mixed-straddle rules or
elections. Do not apply the standalone 60/40 summary to the entire package without analyzing every
leg and election.

## 6. Box spreads and fixed-return structures

A box spread combines offsetting vertical spreads and can create a fixed expiration payoff. On a
European-style cash-settled product, the economics can resemble borrowing or lending.

The economic analogy does **not** produce one automatic tax result.

Depending on the contracts and facts, relevant provisions can include:

- Section 1256
- straddle rules
- mixed-straddle rules and elections
- conversion-transaction rules
- other timing and character provisions

### Correction: do not call the financing cost automatically deductible

Do not say:

- a short box's difference is automatically deductible Section 1256 capital loss
- a long box's return is automatically favorable 60/40 income
- a fixed payoff removes tax-characterization uncertainty

Instead report:

- exact contracts and product
- long or short box
- cash flows and expiration payoff
- broker reporting evidence
- whether all legs are Section 1256 contracts
- possible straddle or conversion-transaction interaction
- the conclusion as fact-specific

A personalized box-spread financing or tax conclusion belongs in professional-review territory.

## 7. Constructive sales

Section 1259 can recognize gain when an appreciated financial position is offset through specified
transactions that substantially eliminate continued exposure. The analysis depends on the actual
appreciated position, offsetting position, dates, and retained risk.

Do not use either shortcut:

```text
“plain covered calls are always safe”
“any protective collar is automatically a constructive sale”
```

Both are too categorical. A strategy name is not the statutory test. The repository should identify
potentially offsetting positions and dates, then surface the need for a complete analysis.

## 8. Tax lots and specific identification

Specific identification generally requires timely broker instructions and written confirmation.
Robinhood currently provides lot-selection and disposal-method features for eligible accounts, but
its app estimates are not tax-reporting documents and unavailable selected shares may be handled
according to broker fallback behavior.

Use:

```bash
node cli/dist/index.js tax-lots list <SYMBOL> --account <ACCOUNT> --json
node cli/dist/index.js tax-lots plan-sell <SYMBOL> \
  --account <ACCOUNT> \
  --shares <QUANTITY> \
  --objective harvest_loss \
  --json
```

Maintain these distinctions:

```text
lot inventory
!= lot plan
!= order submission
!= filled order
!= broker-selected or closed-lot evidence
!= year-end tax reporting
```

If the authenticated exact-lot submission contract is unavailable or unverified, the live path must
fail closed. A generic sell order cannot be described as an exact-lot sale merely because a separate
plan selected lots.

## 9. CLI, API, and MCP workflow

### Reference mechanics

```bash
node cli/dist/tax-cli.js <TOPIC>
```

### Account facts

```bash
node cli/dist/index.js accounts --json
node cli/dist/index.js tax-lots list <SYMBOL> --account <ACCOUNT> --json
node cli/dist/index.js history --account <ACCOUNT> --json
node cli/dist/index.js recurring list --json
node cli/dist/index.js settings show --account <ACCOUNT>
node cli/dist/index.js documents list --year <YEAR> --json
```

### Non-sending action plan

```bash
node cli/dist/index.js sell \
  --symbol <SYMBOL> \
  --account <ACCOUNT> \
  --shares <QUANTITY> \
  --dry-run \
  --json
```

A reference read never supplies the consent required for the sale. Before a live mutation, echo the
account, exact instrument or lot contract, side, quantity, price or maximum notional, relevant tax
uncertainty, and the fact that tax treatment is not guaranteed.

### API

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";

const washSaleMechanics = getTaxReference({ topic: "wash-sales" });
```

### MCP

Use `robinhood_knowledge` to read `tax-reference`, then use account tools separately for tax lots,
documents, history, recurring schedules, and settings. Preserve the distinction between local
reference content and live account data in the answer.

## 10. Examples framed as mechanics, not recommendations

### Rolling a losing covered call

Relevant mechanics:

- closing the old call realizes that leg
- a replacement call can raise wash-sale and QCC or straddle questions
- stock holding period and dividend treatment may require analysis
- a later expiration does not guarantee stock deferral or eliminate assignment risk

Required answer posture:

```text
Here is what closes, what opens, what becomes realized, what remains uncertain, and what account
facts are missing. This is not a recommendation to roll or a promise of a tax result.
```

### Comparing SPX and SPY options

Relevant mechanics:

- they are different products with different settlement, exercise, deliverable, liquidity, and tax
  reporting characteristics
- qualifying Section 1256 contracts receive 60/40 character and mark-to-market treatment
- ETF options generally follow ordinary equity-option rules
- current Robinhood availability and the taxpayer's actual form must be verified

Required answer posture:

```text
Compare the complete product and strategy economics first. Tax character is one input, not a reason
to replace one exposure with another automatically.
```

### Exercising a LEAPS call

Relevant mechanics:

- option cost generally enters delivered-share basis
- share holding period generally begins after exercise
- selling the option and exercising it are different dispositions
- remaining extrinsic value and liquidity matter

Required answer posture:

```text
Show the option-sale value, intrinsic and extrinsic value, exercise consequences, delivered-share
basis mechanics, and holding-period reset. Do not present exercise as a tax shortcut.
```

### Using a box spread for financing

Relevant mechanics:

- fixed expiration payoff
- execution and liquidity risk
- contract and settlement details
- potential Section 1256, straddle, mixed-straddle, and conversion-transaction interaction
- broker reporting and professional-review need

Required answer posture:

```text
Describe the cash flows and legal uncertainty. Do not call the financing cost automatically
interest-deductible or the return automatically tax-advantaged.
```

## Maintenance and source discipline

The maintained source catalog is [`../knowledge/tax-reference.json`](../knowledge/tax-reference.json).
To change a tax claim:

1. update the catalog
2. use a primary or official source where available
3. assign an evidence lane and certainty
4. include caveats
5. run `pnpm generate:tax-reference`
6. run `pnpm test:tax-reference`
7. update this narrative only when the operational explanation changes

Do not paste changing tax brackets, contribution limits, rate comparisons, or broker deadlines into
this document without a return year or review date. Prefer the current official source at query time.

## Related repository material

- [`../knowledge/tax-reference.md`](../knowledge/tax-reference.md): generated claims and official sources
- [`../knowledge/tax.md`](../knowledge/tax.md): account and document workflow
- [`../knowledge/tax-loss-harvesting.md`](../knowledge/tax-loss-harvesting.md): 61-day control procedure
- [`tax-lot-intelligence-and-exact-lot-selling.md`](tax-lot-intelligence-and-exact-lot-selling.md): lot API and execution evidence
- [`index-options-1256-conclusion-2026-06-04.md`](index-options-1256-conclusion-2026-06-04.md): dated Robinhood product evidence
- [`strategy-deep-dive-rolling-options-2026-06-04.md`](strategy-deep-dive-rolling-options-2026-06-04.md): rolling mechanics and risks
