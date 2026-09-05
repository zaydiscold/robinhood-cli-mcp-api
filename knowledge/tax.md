# Tax-aware operation: strategy router, rules, then account facts

> **When to load this:** a tax-mechanics question needs live Robinhood account facts, tax lots,
> option events, recurring purchases, settings, or year-end documents. Load
> [`tax-strategy-routing.md`](tax-strategy-routing.md) when a named structure is involved, and load
> [`tax-reference.md`](tax-reference.md) before repeating a material federal rule.

## Binding posture

Tax content in this repository is educational US federal tax research, not a personalized filing
conclusion. State and local rules differ. A complete result can depend on filing status, taxable
income, basis, holding periods, carryovers, elections, spouse activity, retirement accounts, other
brokers, and facts Robinhood cannot expose.

Use and name four evidence lanes:

1. **Primary law or regulation**
2. **IRS guidance or reporting instruction**
3. **Broker-platform behavior**
4. **Planning inference**

A Robinhood estimate or product label is not federal tax law. A planning inference is not a filing
position. Tax research does not authorize a trade, roll, exercise, assignment response, lot
selection, recurring change, or sale.

## Start with the maintained research surfaces

```bash
# List reviewed rule topics and strategy guides
robinhood-cli tax

# Read or search rule topics
robinhood-cli tax wash-sales
robinhood-cli tax section-1256
robinhood-cli tax qualified-covered-calls
robinhood-cli tax --query "exercise holding period"

# Map a named structure to facts, reads, rules, red flags, and stop conditions
robinhood-cli tax strategy wheel
robinhood-cli tax strategy "covered call" --account-context taxable
robinhood-cli tax strategy --query "dividend"

# Machine-readable research status
robinhood-cli tax status --json
```

The dedicated `robinhood-tax` binary accepts the same arguments without the leading `tax`.

API applications use:

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
import { getTaxStrategyGuide } from "@zaydiscold/robinhood-cli/tax-strategy";
```

MCP clients read `tax-strategy-routing` and `tax-reference` through `robinhood_knowledge`, then use
the named account tools for live facts. Structured account data and tax research remain separate
fields.

## Gather live account facts after routing

### 1. Account identity and class

```bash
robinhood-cli accounts --json
robinhood-cli account-pulse --json
```

Preserve the selected account number internally and display only the label and masked tail. Explicitly
classify taxable, traditional IRA, Roth IRA, or unknown. Do not infer that an account is tax-free or
that a loss is usable merely from a product name.

### 2. Exact stock lots

The current command grammar requires a symbol and subcommand:

```bash
# Read stable open-lot IDs and basis provenance
robinhood-cli tax-lots list <SYMBOL> \
  --account <ACCOUNT_NUMBER> \
  --json

# Build a non-sending exact-lot plan
robinhood-cli tax-lots plan-sell <SYMBOL> \
  --account <ACCOUNT_NUMBER> \
  --shares <QUANTITY> \
  --objective harvest_loss \
  --json

# After a fill, verify which lots Robinhood selected or closed
robinhood-cli tax-lots order <ORDER_ID> \
  --account <ACCOUNT_NUMBER> \
  --json
```

A plan or app screen is not adequate identification, broker confirmation, or execution evidence.
Specific-lot work depends on the actual instruction, selected lot IDs, fill, broker lot record, basis
provenance, and year-end reporting. If selected shares are unavailable, the broker may fall back to a
default method. Surface that risk before any action.

### 3. Equity and option lifecycle

```bash
robinhood-cli history --account <ACCOUNT_NUMBER> --json
robinhood-cli options holdings --account <ACCOUNT_NUMBER> --json
robinhood-cli options events --account <ACCOUNT_NUMBER> --json
robinhood-cli orders open --account <ACCOUNT_NUMBER> --json
robinhood-cli order-status --id <ORDER_ID> --json
```

Build a dated event ledger. Keep an option close, replacement open, expiration, exercise, assignment,
stock acquisition, stock disposition, and dividend as separate facts. A net roll debit or credit is
not the tax result. Order history is the only proof an order happened.

### 4. Automatic acquisitions and settings

```bash
robinhood-cli recurring list --json
robinhood-cli settings show --account <ACCOUNT_NUMBER> --json
```

For wash-sale and holding-period work, inspect recurring buys, DRIP, related accounts, and any other
known acquisition automation. Robinhood cannot prove that no spouse, IRA, Roth IRA, or outside-broker
acquisition occurred.

### 5. Dividends and payment dates

```bash
robinhood-cli dividends --account <ACCOUNT_NUMBER> --json
robinhood-cli calendar --account <ACCOUNT_NUMBER> --json
```

Dividend amounts and dates are account facts, not automatic qualified-dividend conclusions. For
common stock, the general federal qualified-dividend test uses more than 60 days in the 121-day
window. Days with diminished risk can be excluded. Payments in lieu are not automatically qualified
dividends. Read the `dividend-capture` or `covered-call` strategy guide and the official source-backed
claims before summarizing the result.

### 6. Official tax documents

```bash
robinhood-cli documents list --account <ACCOUNT_NUMBER> --year <YEAR> --json
robinhood-cli documents download --type 1099 --year <YEAR> --json
```

Use app and CLI figures for planning. Reconcile filing work to official year-end forms and complete
records, including transferred basis, corporate actions, wash-sale adjustments, other brokers, Form
6781, and relevant elections.

## Automatic rule flags

### Written equity options

A written non-Section-1256 equity option is generally recognized when it expires, is closed, or is
exercised, not merely when premium cash arrives. A roll closes one contract and opens another. Load:

```bash
robinhood-cli tax option-writer-lifecycle
robinhood-cli tax strategy option-roll
```

### Exercise and assignment

Exercise can move option cost or premium into stock basis or sale proceeds. The acquired property's
holding period generally starts after exercise. Load:

```bash
robinhood-cli tax option-exercise-holding-period
```

### Wash sales and retirement accounts

The window reaches 30 days before and 30 days after a loss sale. Contracts or options to acquire
substantially identical stock or securities can matter. There is no universal strike-or-expiration
safe harbor. An IRA or Roth IRA acquisition can have a particularly adverse result. Load:

```bash
robinhood-cli tax wash-sales
robinhood-cli tax retirement-account-wash-sales
robinhood-cli tax strategy tax-loss-harvesting
```

### Section 1256

Qualifying contracts are generally marked to market at year end and characterized 60% long-term and
40% short-term regardless of holding period. Those percentages are capital character, not tax rates.
Confirm the actual contract and return-year broker reporting. Load:

```bash
robinhood-cli tax section-1256
robinhood-cli tax strategy section-1256-index-options
```

### Covered calls, collars, and dividend holding periods

Qualified-covered-call status is a technical safe harbor, not shorthand for every covered call.
Stock price, strike grid, term, complete related positions, and regulation matter. Hedging can also
affect stock and dividend holding periods and can raise constructive-sale questions. Load:

```bash
robinhood-cli tax qualified-covered-calls
robinhood-cli tax constructive-sales
robinhood-cli tax strategy covered-call
robinhood-cli tax strategy collar-or-protective-put
```

### Box spreads

A fixed payoff does not produce one automatic federal tax result. Section 1256, straddle,
conversion-transaction, election, purpose, and reporting questions can interact. Load:

```bash
robinhood-cli tax box-spreads
robinhood-cli tax strategy box-spread
```

### Short sales

Short-sale character and holding-period rules can depend on substantially identical long property.
A short against an appreciated position can also raise constructive-sale questions. Dividend-related
payments require separate classification. Load:

```bash
robinhood-cli tax strategy short-stock
```

## Response contract

For a tax-sensitive question, report:

1. Jurisdiction, review date, strategy, and account context.
2. Broker-observed facts with timestamps and account scope.
3. User-supplied and external facts.
4. Missing material facts.
5. Primary law and IRS guidance.
6. Broker-platform behavior.
7. Planning inference.
8. What remains not evaluated.
9. Official source links.
10. Mutation status: not authorized.

## What not to do

- Do not calculate final liability from a guessed marginal rate.
- Do not call a strategy categorically tax-efficient.
- Do not infer taxable or tax-free treatment from an account or product name.
- Do not claim every index option is a Section 1256 contract.
- Do not claim changing strike or expiration automatically avoids a wash sale.
- Do not call a covered call qualified without applying the actual requirements.
- Do not call a box-spread cost automatically deductible financing expense.
- Do not treat Form 1099-DIV box 1b as conclusive when the taxpayer holding-period test fails.
- Do not treat a payment in lieu as automatically qualified dividend income.
- Do not treat a lot plan, UI state, HTTP success, or roll ledger as execution evidence.
- Do not recommend a trade merely because one possible tax outcome seems favorable.

## Focused follow-ups

- [`tax-strategy-routing.md`](tax-strategy-routing.md): strategy-to-facts and rule routing
- [`tax-reference.md`](tax-reference.md): reviewed claims, caveats, and source IDs
- [`tax-loss-harvesting.md`](tax-loss-harvesting.md): harvesting control workflow
- [`execution-safety.md`](execution-safety.md): dry-run, approval, and order-evidence contract
- [`accounts.md`](accounts.md): account discovery and capability gating
- [`../docs/tax-aware-options-strategies.md`](../docs/tax-aware-options-strategies.md): detailed options-tax mechanics
- [`../docs/tax-lot-intelligence-and-exact-lot-selling.md`](../docs/tax-lot-intelligence-and-exact-lot-selling.md): lot inventory and execution boundaries
