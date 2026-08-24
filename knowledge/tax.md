# Tax-aware operation: reference first, account facts second

> **When to load this:** any question about wash sales, Section 1256, option exercise or assignment,
> qualified covered calls, constructive sales, box spreads, holding periods, tax lots, year-end forms,
> or how a proposed Robinhood action could affect tax reporting. This module is an operating router.
> The source-backed rules live in [`tax-reference.md`](tax-reference.md).

## Binding posture

Tax content in this repository is educational US federal tax research, not a personalized filing
conclusion. State rules differ. The complete result can depend on filing status, taxable income,
basis, holding period, carryovers, elections, spouse activity, retirement accounts, other brokers,
and facts the Robinhood account cannot expose.

Use four evidence lanes and name the lane when it matters:

1. **Primary law or regulation**
2. **IRS guidance or reporting instruction**
3. **Broker-platform behavior**
4. **Planning inference**

A Robinhood estimate or product label is not federal tax law. A planning inference is not a legal
conclusion. A tax read never authorizes a trade.

## Start with the maintained reference

```bash
# List the reviewed topics
node cli/dist/tax-cli.js

# Read one topic
node cli/dist/tax-cli.js wash-sales
node cli/dist/tax-cli.js section-1256
node cli/dist/tax-cli.js qualified-covered-calls
node cli/dist/tax-cli.js box-spreads

# Search across claims, caveats, evidence lanes, and source IDs
node cli/dist/tax-cli.js --query "exercise holding period"

# Structured output for scripts or agents
node cli/dist/tax-cli.js tax-lots-specific-identification --json
```

API applications use:

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
```

MCP clients read the generated `tax-reference` module through `robinhood_knowledge`. The generated
Markdown and the CLI/API catalog are built from the same versioned source.

## Then gather live account facts

Reference mechanics and account evidence are separate. Use the smallest live surface that answers
the factual question.

### Accounts and eligibility

```bash
node cli/dist/index.js accounts --json
node cli/dist/index.js account-pulse --json
```

Identify taxable and retirement accounts explicitly. Do not treat losses inside an IRA or Roth IRA
as harvestable tax losses. Do not assume a transaction in one account is isolated from activity in
another account.

### Open tax lots and lot-aware planning

```bash
node cli/dist/index.js tax-lots list <SYMBOL> --account <ACCOUNT> --json
node cli/dist/index.js tax-lots plan-sell <SYMBOL> \
  --account <ACCOUNT> \
  --shares <QUANTITY> \
  --objective harvest_loss \
  --json
```

A plan is not execution evidence. Specific identification depends on the actual broker instruction,
availability of the selected shares, the filled order, the broker's selected or closed-lot record,
and year-end reporting. Preserve stable lot IDs and exact quantities rather than identifying lots by
acquisition date alone.

### History and automatic acquisitions

```bash
node cli/dist/index.js history --account <ACCOUNT> --json
node cli/dist/index.js recurring list --json
node cli/dist/index.js settings show --account <ACCOUNT>
```

For a wash-sale review, inspect purchases before and after the loss sale, recurring investments,
dividend reinvestment, other taxable accounts, and IRA or Roth IRA activity. The repository cannot
see every broker, spouse transaction, or outside acquisition, so absence in this account is not proof
that no replacement acquisition exists.

### Tax documents

```bash
node cli/dist/index.js documents list --year <YEAR> --json
node cli/dist/index.js documents download --type 1099 --year <YEAR> --json
```

Use app and CLI figures for planning. Reconcile filing work to the broker's year-end forms and the
taxpayer's complete records, including transferred basis, corporate actions, wash adjustments, and
other brokers.

## Mechanics that deserve an automatic flag

### Written equity options

A written non-Section-1256 equity option is generally recognized when it expires, is closed, or is
exercised, not merely when cash premium arrives. Buying to close realizes the closed leg even when a
new leg is opened as part of a roll. Assignment can fold premium into stock proceeds or basis.

Load:

```bash
node cli/dist/tax-cli.js option-writer-lifecycle
```

### Exercise and assignment

The disposition method matters. Exercise can move option cost or premium into stock basis or sale
proceeds, and the acquired property's holding period generally starts after exercise. Do not treat a
long option's holding period as automatically tacking onto delivered shares.

Load:

```bash
node cli/dist/tax-cli.js option-exercise-holding-period
```

### Wash sales

The statutory window includes 30 days before and 30 days after the loss sale. Options and contracts
to acquire substantially identical property can matter. The authorities do not supply one universal
strike-or-expiration safe harbor for options, so do not pronounce a same-underlying replacement safe
from contract terms alone.

An IRA or Roth IRA acquisition can permanently disallow a taxable-account loss without increasing
the retirement account's basis. Treat automatic purchases as real acquisitions.

Load:

```bash
node cli/dist/tax-cli.js wash-sales
node cli/dist/tax-cli.js retirement-account-wash-sales
```

### Section 1256

Qualifying Section 1256 contracts are generally marked to market at year-end and characterized 60%
long-term and 40% short-term regardless of holding period. The 60% component is actual statutory
long-term capital character. Do not replace the statute with a hard-coded blended tax rate.

Confirm the actual contract and broker reporting. A ticker, the phrase “index option,” or an app
search result is not enough. Mixed straddles and elections can change the simple result.

Load:

```bash
node cli/dist/tax-cli.js section-1256
```

### Qualified covered calls and straddles

Qualified-covered-call status is a technical safe harbor. It is not shorthand for every covered
call and cannot be reduced to a fixed dollar amount in the money. Stock price, available strike grid,
term, applicable regulatory benchmark, and complete position matter.

Load:

```bash
node cli/dist/tax-cli.js qualified-covered-calls
```

### Box spreads and conversion transactions

A fixed economic payoff does not produce one automatic tax characterization. Depending on contract
composition and facts, Section 1256, straddle, conversion-transaction, and other rules may interact.
Do not describe short-box financing cost as automatically deductible capital loss or long-box return
as automatically favorable 60/40 income.

Load:

```bash
node cli/dist/tax-cli.js box-spreads
```

### Constructive sales

Do not declare a collar, short sale, put, covered call, forward, or multi-leg structure outside
constructive-sale treatment based on its strategy name. The appreciated position, offsetting
transaction, dates, and retained risk must be analyzed.

Load:

```bash
node cli/dist/tax-cli.js constructive-sales
```

## Operator decision contract

For a tax-sensitive proposed action:

1. State the jurisdiction and tax-reference review date.
2. Identify the relevant evidence lane for each material claim.
3. Gather account, lot, history, recurring, settings, and document facts separately.
4. State what Robinhood can observe and what it cannot decide.
5. Preserve unknown or incomplete basis, holding-period, election, and cross-account facts.
6. Build a dry-run only after the operator asks for an action.
7. Echo account, symbol or contract, lot IDs, side, quantity, and price before any live mutation.
8. Verify the filled order and selected or closed lots after execution.
9. Reconcile year-end forms independently.

## What not to do

- Do not calculate a user's final tax liability from a marginal-rate guess.
- Do not infer “taxable” or “tax-free” from account or product names alone.
- Do not claim all index options receive Section 1256 treatment.
- Do not claim changing an option strike or expiration automatically avoids a wash sale.
- Do not call a covered call qualified without applying the relevant rules.
- Do not claim a box-spread loss is automatically deductible financing expense.
- Do not treat a tax-lot plan, HTTP success, or UI state as execution evidence.
- Do not recommend a trade merely because one tax outcome might be favorable.

## Focused follow-ups

- [`tax-reference.md`](tax-reference.md): reviewed claims, caveats, and source IDs
- [`tax-loss-harvesting.md`](tax-loss-harvesting.md): harvesting control workflow
- [`execution-safety.md`](execution-safety.md): dry-run, approval, and order-evidence contract
- [`accounts.md`](accounts.md): account discovery and capability gating
- [`../docs/tax-aware-options-strategies.md`](../docs/tax-aware-options-strategies.md): detailed options-tax mechanics
- [`../docs/tax-lot-intelligence-and-exact-lot-selling.md`](../docs/tax-lot-intelligence-and-exact-lot-selling.md): lot inventory and execution boundaries
