# Tax strategy routing: facts, rules, and stop conditions

> **When to load this:** the user names a strategy or structure and asks how its tax mechanics may
> work, what records matter, or what an agent should inspect. Examples include a covered call, cash-
> secured put, wheel, roll, loss harvest, Section 1256 index option, box spread, collar, dividend
> capture, short sale, or specific-lot disposition.

This module routes strategy language into a source-backed research workflow. It does **not** decide
whether a trade is good, calculate personalized tax liability, choose a filing position, or authorize
a mutation. Federal tax treatment depends on the actual contracts, account type, lots, dates,
elections, other accounts, and facts outside Robinhood.

**Tax research never authorizes a trade or sale.**

## Three surfaces, one catalog

### CLI

```bash
# List strategy guides
robinhood-cli tax strategy

# Resolve an id or alias
robinhood-cli tax strategy wheel
robinhood-cli tax strategy "covered call" --account-context taxable

# Search facts, tags, rule topics, and red flags
robinhood-cli tax strategy --query "dividend"

# Machine contract
robinhood-cli tax strategy box-spread --json

# Review age and catalog counts
robinhood-cli tax status --json
```

The dedicated `robinhood-tax` binary accepts the same arguments without the leading `tax`.

### Importable API

```ts
import {
  getTaxResearchStatus,
  getTaxStrategyGuide,
  listTaxStrategies,
  searchTaxStrategies,
} from "@zaydiscold/robinhood-cli/tax-strategy";

const guide = getTaxStrategyGuide({
  strategy: "covered call",
  accountContext: "taxable",
});
```

### MCP

1. Call `robinhood_knowledge` with the `tax-strategy-routing` module for the operating contract.
2. Read `tax-reference` for the linked source-backed rule topics.
3. Use only the broker-read tools named by the selected strategy guide to collect account facts.
4. Keep broker facts and tax-rule research in separate fields.
5. Do not call a mutation tool merely because the research guide contains a possible action.

The MCP knowledge route is intentionally separate from account reads. Reading a tax module must not
initialize a trade, supply consent, or imply that a tax-sensitive action is appropriate.

## Required response shape

Every agent response built from a strategy guide should contain these sections:

```text
strategy and account context
known broker facts
user-supplied or external facts
missing material facts
official rule topics
broker-platform behavior
planning inferences
not evaluated
sources
mutation status: not authorized
```

Never collapse `missing`, `uncertain`, and `not evaluated` into `no issue`. Never convert a broker
estimate into federal tax law. Never infer a filing result from the strategy name alone.

## Strategy catalog

| ID | Structure | Core rule families |
| --- | --- | --- |
| `covered-call` | Stock plus written call or buy-write | option-writer lifecycle, QCC, dividend holding period, lots, constructive sales |
| `cash-secured-put` | Written put backed by cash | option lifecycle, assignment basis, wash sales, retirement-account replacement |
| `wheel` | Repeated short puts, assignment, stock, and covered calls | event-by-event recognition, lots, wash sales, QCC, constructive sales |
| `option-roll` | Close one option and open another | closed-leg realization, replacement exposure, wash sales, QCC, straddles |
| `tax-loss-harvesting` | Loss sale plus replacement exposure | exact lots, 61-day acquisition ledger, wash sales, retirement accounts |
| `section-1256-index-options` | Qualifying index-option contracts | contract classification, annual mark-to-market, 60/40 character, Form 6781 |
| `box-spread` | Four-leg fixed-return structure | Section 1256, straddles, conversion transactions, elections, reporting |
| `collar-or-protective-put` | Stock hedged with puts and possibly calls | actual risk retained, constructive sale, straddles, QCC, dividend holding period |
| `dividend-capture` | Short holding-period dividend trade | qualified-dividend window, diminished-risk days, payments in lieu, lot result |
| `short-stock` | Short sale, including against a long position | Section 1233 character and holding period, payments, wash sales, constructive sales |
| `specific-lot-sale` | Sale using selected stock lots | timely identification, written confirmation, basis provenance, fallback, wash sales |

The machine source is [`tax-strategies.json`](tax-strategies.json). It links each strategy to reviewed
entries in [`tax-reference.json`](tax-reference.json) and fails closed when a topic, source, evidence
lane, account context, or alias is invalid.

## Operating sequence

### 1. Resolve the structure

Use `tax strategy <id-or-alias>` before retrieving account data. A phrase such as “roll,” “collar,”
“wheel,” or “index option” is not enough to establish the contracts or federal treatment.

### 2. Resolve account context

Classify the relevant account as taxable, traditional IRA, Roth IRA, or unknown. Do not assume that
a tax rule applicable to a taxable brokerage account has the same current consequence inside a
retirement account. Do not assume Robinhood sees every other account or spouse transaction.

### 3. Collect only named facts

The guide returns `requiredFacts` with a source classification:

- `brokerage`: obtain through a maintained CLI or MCP read
- `tax-form`: reconcile to official year-end forms and return records
- `user`: facts Robinhood cannot establish, including other brokers, spouse activity, purpose, and elections
- `external`: ex-dividend dates, issuer actions, regulations, or other non-account evidence

Do not invent values to complete a strategy template.

### 4. Follow the linked rule topics

The guide's `ruleTopics` and `supplementalClaims` are the source-backed legal-mechanics lane. The
reference catalog distinguishes primary law, IRS guidance, Robinhood behavior, and planning
inference. Preserve those labels in the answer.

Important examples:

- A roll is a close and a new open. Economic continuity does not itself defer the closed leg.
- A covered-call label does not prove qualified-covered-call status or eliminate constructive-sale
  and straddle questions.
- Section 1256 assigns 60% long-term and 40% short-term capital **character**. Those percentages are
  not tax rates.
- A fixed box-spread payoff does not create one automatic financing deduction or 60/40 result.
- For common-stock qualified dividends, the general federal holding test is more than 60 days in the
  121-day window, and days with diminished risk can be excluded.
- A payment in lieu of a dividend is not automatically a qualified dividend.
- Changing an option strike or expiration is not a universal wash-sale safe harbor.

Read the linked official sources before repeating a material claim. Do not quote a narrative module
as if it were the authority.

### 5. Preserve the stop conditions

Each strategy has explicit `stopConditions`. Stop and recommend qualified professional review when:

- a complete related-position set is unavailable
- other brokers, spouse activity, elections, or retirement accounts may be material
- basis or selected-lot confirmation is missing
- contract classification is uncertain
- the user asks for a definitive substantially-identical, qualified-covered-call, constructive-sale,
  conversion-transaction, deduction, or filing conclusion
- the requested output would require personalized rates, carryovers, or return-wide netting

### 6. Keep research and execution separate

A guide can name the broker reads required to understand a position. It does not recommend closing,
rolling, assigning, exercising, harvesting, or selecting a lot. Any later action starts a new flow:

```text
user requests action
  -> resolve account and exact instruments/lots
  -> refresh quotes and account capabilities
  -> build a dry-run
  -> echo exact action
  -> obtain exact approval
  -> gated send
  -> verify order history and selected lots
```

Tax research never supplies the approval step.

## Maintenance

When a strategy rule or workflow changes:

1. Update `knowledge/tax-strategies.json`.
2. Link only existing source-backed tax-reference topics and sources.
3. Add or update focused tests for aliases, facts, source closure, and stop conditions.
4. Update this module only when the operating contract or public strategy inventory changes.
5. Run `pnpm build`, `pnpm quality`, and `pnpm test:built`.

When controlling authority, IRS guidance, or Robinhood reporting behavior changes, update the tax
reference catalog first and align the strategy catalog's review date in the same change.
