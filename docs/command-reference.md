# Command reference

Run commands from a built source checkout as `node cli/dist/cli-entry.js <command>`. If the package binary is linked, use `robinhood-cli <command>`. Append `--help` for the installed command's accepted flags, and `--json` where supported for structured results.

This guide routes tasks to maintained commands. It is not a guarantee that every mapped endpoint supports every account or a currently accepted live mutation. See the [capability evidence ledger](evidence-confidence-ledger.md), [agent skill](../SKILL.md), and [execution contract](write-operations.md).

## Accounts and portfolio

| Need | Command |
| --- | --- |
| Enumerate owned accounts and capability annotations | `accounts` |
| Compact account health and options buying power | `account-pulse` |
| Spendable cash and buying-power components | `buying-power` |
| Borrowing, maintenance fields, and recent risk liquidations | `margin` |
| Equity positions | `positions --account <ACCOUNT_NUMBER>` |
| Held option contracts, marks, and exposure analytics | `options holdings` or `options positions` |
| Day and extended-hours dollar attribution | `portfolio` |
| Account-scoped dollar drivers | `portfolio --account <ACCOUNT_NUMBER> --by position --top 10` |
| Broker historical performance display | `performance --span ytd` |
| Concentration and available Greeks | `exposure` |
| Position-risk scan | `risk` |
| Hypothetical scenarios | `whatif` |
| Upcoming events for held names | `calendar` |

`portfolio` reports its measured session and reconciliation fields. A position-weighted attribution, an account-equity change, and a broker historical return can differ; inspect their basis rather than treating them as interchangeable P&L.

Use accounts discovered at runtime. Do not copy account numbers, contract IDs, or order IDs from examples or old notes. The [accounts module](../knowledge/accounts.md) explains account types, settlement, and buying-power fields.

## Stocks, signals, and options research

```bash
robinhood-cli quote AAPL NVDA
robinhood-cli stock profile AAPL --account <ACCOUNT_NUMBER> --json
robinhood-cli options expirations NVDA
robinhood-cli options chain NVDA --width 6 --json
robinhood-cli options chain-stats NVDA --json
robinhood-cli options events --account <ACCOUNT_NUMBER> --limit 25 --json
robinhood-cli options history <CONTRACT_UUID> --json
```

Contract history accepts bounded points and the interval/span combinations shown by `options history --help`; it is not a complete lifetime trade ledger. `options enumerate` resolves instrument IDs before exact-contract planning. `options inspect`, `options workbench`, and `options snapshot` offer more focused or bulk analysis.

Use `news`, `ratings`, and `earnings` for the available signal reads. The [signals module](../knowledge/signals.md) covers source and timing limits. See [options exposure analytics](options-exposure-analytics.md) for intrinsic/extrinsic value, delta dollars, elasticity, break-even, and Greek interpretation.

## Strategy and roll planning

```bash
# Local strategy catalog and body templates
robinhood-cli api-map options-strategies --defined-risk
robinhood-cli api-map options-strategy-plan iron-condor --json

# Discover the current typed planners and their required inputs
robinhood-cli options strategy-quote --help
robinhood-cli options roll-plan --help
robinhood-cli options close --help
robinhood-cli pretrade --help
robinhood-cli wheel --help
```

The local catalog describes structures; a live strategy quote resolves contracts and available market data. A supported template does not establish that the selected account can execute it. Specify the account, expiration, strikes, leg roles, quantity, and price controls required by the typed planner.

A roll closes one position and opens another. Its net debit or credit does not erase the closed trade's P&L. Cash-account planning must check settled funds and account restrictions; a staged roll can preserve the intended later opening through `roll-ledger`. The ledger records intent, not execution proof.

Focused guides: [multi-leg structures](../knowledge/multi-leg.md), [rolling](../knowledge/rolling.md), [Greeks](../knowledge/greeks.md), [wheel](../knowledge/wheel.md), and [execution safety](../knowledge/execution-safety.md).

## Orders and review

| Need | Command |
| --- | --- |
| Build an equity order preview | `buy` or `sell` |
| List pending orders | `orders open` |
| Read one resolved order | `order-status` |
| Follow an order's state | `order-watch` |
| Read transaction history | `history` |
| Review matched historical round trips | `review` |
| Add a local lesson to a reviewed trade | `review note` |
| Prepare one cancellation | `cancel` |
| Prepare bulk cancellation | `panic` |

Read history in the requested account and date window. Matched round trips alone can omit expirations, transferred basis, unmatched fills, open positions, or other cash flows. Do not present them as a complete tax or portfolio return calculation.

Orders and cancellations are account changes. Keep the write switch unset for previews, and use explicit `--dry-run` when previewing from a process already capable of live writes. Resolve and approve the exact action before sending. [Order history is the execution evidence](write-operations.md).

## Income, services, and settings

| Need | Command |
| --- | --- |
| Dividend history, cadence, and current-holdings projection | `dividends` |
| Dividend and qualifying short-option premium summary | `income` |
| Custom lists | `watchlist list` |
| Recurring investment schedules | `recurring list` |
| Current settings | `settings show` |
| Cash-sweep rate and its evidence/fallback | `sweep-interest` |
| Subscription billing history | `gold-fees` |
| Privacy-normalized reward metadata | `rewards` |
| Aggregate inbox state | `inbox-summary` |
| IPO offerings and eligibility | `ipo-access list` or `ipo-access show <SYMBOL>` |
| Non-sending IPO request readiness | `ipo-access plan-request <SYMBOL>` |

Income projections are estimates; option premium cash flow is not automatically profit. Recurring, watchlist, DRIP, lending, expiration, sweep, and other setting changes remain subject to the same write contract. See the [settings capability map](account-settings-capability-map-2026-06-03.md) for supported versus mapped surfaces.

## Money movement

Start with `deposit-inventory`, `internal-transfer-inventory`, or `withdrawal-inventory`, then use `money-movement-quote` for the current source, destination, rail, amount, fees, and offered route. A quote is a read; sending money requires exact approval and the typed executor's preflight.

Reconcile a sent transfer with its server-issued receipt. An interrupted response or pending device approval never authorizes a blind replay. Retirement movements require their contribution or distribution semantics; do not infer them from an account label.

See [deposits](../knowledge/deposits.md), [internal transfers](../knowledge/internal-transfers.md), and [withdrawals](withdrawals.md).

## Tax lots and documents

```bash
robinhood-cli tax status --json
robinhood-cli tax strategy "covered call" --account-context taxable --json
robinhood-cli tax-lots list AAPL --account <ACCOUNT_NUMBER> --json
robinhood-cli documents list --help
robinhood-cli documents download --help
```

`tax-lots plan-sell` uses exact open-lot IDs to build a non-sending plan. Tax research, broker records, and filing conclusions are separate. Cross-broker activity, spouse activity, basis transfers, elections, and retirement activity may require facts outside Robinhood. See [tax strategy routing](../knowledge/tax-strategy-routing.md) and [tax operation](../knowledge/tax.md).

Document downloads write private local files. Keep account documents out of public repositories and shared command output. An optional encrypted operator workspace is documented in [local encryption](local-encryption.md).

## API discovery and maintenance

```bash
robinhood-cli recipes "after hours"
robinhood-cli brokerage routes --json
robinhood-cli brokerage describe '<EXACT_ROUTE_TEMPLATE>' --json
robinhood-cli brokerage plan '<EXACT_ROUTE_TEMPLATE>' --method GET --json
robinhood-cli api-map account-context --json
robinhood-cli api-map options-contract-plan --help
robinhood-cli api-map options-contract-links --help
```

Prefer a typed command over `brokerage execute`. Raw route matching is method-aware; pass path placeholders with `--param` and dynamic query values with repeatable `--query-param` flags. A mapped route records a discovered surface, not proof of a currently accepted mutation body.

Browser account selectors and exact-contract links have their own verification limits. Direct API account fields remain the operational source of truth. See [CLI routing](../knowledge/cli-routing.md), [contract navigation](options-contract-navigation-2026-06-03.md), and the [maintainer guide](../AGENTS.md).
