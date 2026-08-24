# Tax-loss harvesting: control the window before realizing the loss

> **When to load this:** the user asks to harvest losses, offset gains, sell losing lots before
> year-end, preserve exposure after a loss sale, or evaluate a wash-sale risk. Load the maintained
> [`tax-reference`](tax-reference.md) first. This module turns the mechanics into a conservative
> account-control workflow. It does not decide a filing position or authorize a sale.

## The point of the workflow

A loss sale can affect capital-gain netting, the limited deduction against other income, and future
carryovers. Its value depends on the return year, character of gains and losses, taxable income,
carryovers, state law, and the investor's future actions. Avoid made-up tax savings based on a single
marginal rate.

The operational goal is narrower:

1. Identify a real loss in a taxable account.
2. Identify the exact lots and available quantities.
3. Review the full 61-day control window.
4. Stop automatic or cross-account replacement acquisitions.
5. Decide whether to remain out of the position or use a defensible non-identical exposure.
6. Dry-run the exact sale and any replacement separately.
7. Obtain exact approval before a live mutation.
8. Verify the filled order, closed lots, and year-end reporting.

## Authority and uncertainty

Start with:

```bash
node cli/dist/tax-cli.js wash-sales
node cli/dist/tax-cli.js retirement-account-wash-sales
node cli/dist/tax-cli.js tax-lots-specific-identification
```

The binding evidence distinction is:

- **Primary law and IRS guidance:** wash-sale window, contracts or options to acquire property,
  basis and holding-period adjustments, and IRA/Roth IRA treatment.
- **Broker-platform behavior:** what Robinhood detects, estimates, allows, confirms, or reports.
- **Planning inference:** conservative controls where “substantially identical” lacks a universal
  bright-line test.

Do not merge those layers into one claim.

## The 61-day control window

The federal wash-sale window includes:

```text
30 days before the loss sale
+ the loss-sale date
+ 30 days after the loss sale
```

The review therefore starts **before** the proposed sale. A recent purchase can already affect the
loss even if the user promises not to repurchase afterward.

Potential replacement acquisitions include more than an intentional share purchase:

- the same stock or security
- a contract or option to acquire substantially identical stock or securities
- recurring investments
- dividend reinvestment
- purchases in another taxable account
- purchases in an IRA or Roth IRA
- spouse activity when relevant
- activity at another broker

The Robinhood repository cannot observe every outside account or spouse transaction. A clean local
history means “not found here,” not “legally impossible.”

## Options are not governed by a universal strike-and-expiration safe harbor

Do not use a rule such as “change either the strike or expiration and the wash sale is avoided.” The
authorities do not provide one universal numerical test for whether two option positions are
substantially identical.

For a same-underlying replacement:

- record the contracts, dates, strikes, expirations, deltas, and economic exposure
- label the conclusion fact-specific
- distinguish a conservative control from settled law
- do not promise that a routine roll is safe
- recommend qualified review when the loss is material or the replacement is economically close

A different underlying or index may reduce similarity, but “correlated” does not automatically mean
“not substantially identical.” Same-index funds from different issuers can also require analysis.

## IRA and Roth IRA replacement risk

A taxable-account loss followed by a substantially identical acquisition in the taxpayer's IRA or
Roth IRA can be permanently disallowed without increasing the retirement account's basis. That is a
different consequence from the usual taxable-account basis adjustment.

Before a proposed harvest, explicitly inspect:

- recurring purchases in every visible retirement account
- DRIP settings
- standing orders
- recent and planned manual purchases
- any cross-account automation outside Robinhood that the user discloses

Do not describe retirement-account loss activity as tax-loss harvesting. Losses inside the account
do not create the same taxable-account deduction.

## Exact-lot workflow

### 1. Identify taxable accounts

```bash
node cli/dist/index.js accounts --json
node cli/dist/index.js account-pulse --json
```

Keep taxable and retirement accounts separate. Resolve the account the user means, then preserve it
explicitly through every lot, history, plan, and order call.

### 2. Read open lots

```bash
node cli/dist/index.js tax-lots list <SYMBOL> --account <ACCOUNT> --json
```

Use stable `open_lot_id`, adjusted basis, acquisition date, quantity available, eligibility, and
provenance. Missing adjusted basis is not zero. An acquisition date alone is not a reliable lot
identifier.

### 3. Build a non-sending lot plan

```bash
node cli/dist/index.js tax-lots plan-sell <SYMBOL> \
  --account <ACCOUNT> \
  --shares <QUANTITY> \
  --objective harvest_loss \
  --json
```

Or identify exact lots where the command supports them:

```bash
node cli/dist/index.js tax-lots plan-sell <SYMBOL> \
  --account <ACCOUNT> \
  --lot <OPEN_LOT_ID>:<QUANTITY> \
  --json
```

The plan must reject unknown IDs, unavailable quantities, mismatched totals, and missing basis. A
plan is not proof that Robinhood accepted or used the lots.

### 4. Review the lookback

```bash
node cli/dist/index.js history --account <ACCOUNT> --json
node cli/dist/index.js orders open --json
```

Filter and inspect at least the statutory lookback period. Include stock, option, and automated
activity that could create replacement exposure. Do not rely only on the local trading log.

### 5. Review automatic acquisitions

```bash
node cli/dist/index.js recurring list --json
node cli/dist/index.js settings show --account <ACCOUNT>
```

Flag matching recurring schedules and dividend reinvestment. A pause or settings change is a
separate account mutation and requires its own dry-run, exact approval, and verification.

### 6. Record outside-account facts

Ask the user to account for:

- other brokers
- IRA and Roth IRA accounts
- spouse activity when relevant
- employer plans or automatic purchases
- pending transfers

Do not represent the workflow as complete if these facts are unknown.

### 7. Evaluate replacement exposure

The least ambiguous way to avoid a replacement acquisition is to remain out of the substantially
identical property through the window. A different exposure may preserve some market sensitivity,
but it introduces tracking difference, market risk, and a fact-specific identity analysis.

Do not recommend a replacement solely to avoid tax. Report:

- the original exposure
- proposed replacement exposure
- overlap and differences
- the evidence lane for the identity conclusion
- the date the post-sale window closes
- market and execution consequences

### 8. Dry-run the exact sale

```bash
node cli/dist/index.js sell \
  --symbol <SYMBOL> \
  --account <ACCOUNT> \
  --shares <QUANTITY> \
  --dry-run \
  --json
```

A lot-aware plan and a generic equity sell are not automatically the same execution contract. If
exact-lot live submission is unavailable or unverified, fail closed rather than pretending the
selected-lot plan will control disposal.

### 9. Obtain exact approval

Before a live sale, echo:

- taxable account label and masked tail
- symbol
- exact quantity
- order type and price or maximum notional
- intended lot IDs and quantities, if the live path supports them
- estimated loss and basis provenance
- wash-window start and end dates
- known automatic and cross-account risks
- replacement action, if any, as a separate approval item

### 10. Verify execution and lot treatment

After the sale:

1. Read the order from brokerage history.
2. Confirm fill quantity, price, date, account, and state.
3. Read selected or closed-lot records when available.
4. Record the intended lot selection and the broker's observed result.
5. Preserve warnings if lot evidence is unavailable.
6. Reconcile the year-end tax form.

An HTTP success, UI estimate, or local plan is not tax-lot execution evidence.

## Ranked failure modes

1. **IRA or Roth IRA replacement:** potential permanent disallowance without basis increase.
2. **A purchase inside the pre-sale window:** the loss can be affected before the harvest is
   proposed.
3. **Recurring or DRIP acquisition:** automation silently creates replacement shares.
4. **Other accounts or brokers:** local Robinhood data is incomplete.
5. **Option substitution presented as automatically safe:** no universal strike/expiry safe harbor.
6. **Default disposal fallback:** unavailable selected shares may be handled by the broker's default
   method.
7. **Missing or transferred basis:** a red app position may not equal the filing basis.
8. **Partial wash sale:** replacement quantity can affect only part of the loss; do not treat the
   result as all-or-nothing without the actual quantities.
9. **Year-end timing:** trade execution date, holidays, and a window crossing January matter.
10. **Tax objective dominating investment risk:** tax deferral does not make a poor sale or
    replacement economically sound.

## Reporting template

Use this structure for a harvest analysis:

```text
Jurisdiction/review date:
Evidence lanes used:
Account scope:
Candidate lots and basis provenance:
Estimated loss by lot:
30-day lookback findings:
Automatic-acquisition findings:
Outside-account facts known/unknown:
Replacement identity uncertainty:
Window end date:
Dry-run status:
Live authorization: not granted / exact action granted
Post-trade order evidence:
Post-trade lot evidence:
Year-end reconciliation required:
```

## Sources and deeper material

- [`tax-reference.md`](tax-reference.md): source-backed wash-sale, retirement-account, and lot-identification claims
- [`tax.md`](tax.md): full tax-aware account router
- [`execution-safety.md`](execution-safety.md): live-write and evidence contract
- [`accounts.md`](accounts.md): account discovery and account-class separation
- [`../docs/tax-aware-options-strategies.md`](../docs/tax-aware-options-strategies.md): options-specific mechanics
- [`../docs/tax-lot-intelligence-and-exact-lot-selling.md`](../docs/tax-lot-intelligence-and-exact-lot-selling.md): detailed lot API contract
