# Robinhood Account-Context Routing - 2026-06-02

This note documents the authenticated browser finding that Robinhood web URLs sometimes propagate `?account_number=...` into the API layer. All account numbers, names, balances, UUIDs, and position-specific identifiers are redacted or replaced with placeholders.

## What Was Found

Some web routes use `account_number` as a strong account selector, while others preserve the query but continue using the page's default selected account or an internal account switcher.

| Surface | Web route shape | Observed behavior | Automation guidance |
|---------|-----------------|-------------------|---------------------|
| Stock detail/order ticket | `/stocks/{symbol}({instrument_uuid})?account_number={account_number}` | Propagates | Strong navigation signal; API automation should still pass explicit account fields |
| Options chain/builder | `/options/chains/{symbol}?account_number={account_number}` | Mixed | URL is a shell; expiration/type/strike/strategy state lives in API queries and UI state |
| Investing settings | `/account/settings/investing?account_number={account_number}` | Propagates | Sensitive/write-capable; read-first only unless exact action is approved |
| Stock lending | `/account/stock-lending?account_number={account_number}` | Mixed | User observed dropdown preselection; captured reads can still use default portfolio context |
| Account hub/dropdown pages | `/account/{section}?account_number={account_number}` | Mixed | Treat every dropdown page as a candidate, but verify per-section API calls before automation |
| History/reports/statements/tax | `/account/{history|reports|tax...}?account_number={account_number}` | Mixed | Private read-heavy pages; use API filters and keep docs sanitized |
| Legend layout | `/legend/layout/{layout_uuid}?account_number={account_number}` | Ignored | Legend uses its own account combobox/state; useful for endpoint discovery |
| Transfers hub | `/account/transfers?account_number={account_number}` | Ignored | Money-movement surface; use API-first explicit account planners |
| Recurring hub | `/account/recurring?account_number={account_number}` | Mixed | Hub loads all schedules; row-level calls use schedule account |
| Classic home | `/?classic=1` | Not applicable | Discovery surface for right rails/watchlists |
| Legacy stock options path | `/stocks/{symbol}/options?account_number={account_number}` | Stale route | Returned Robinhood 404 in this pass |

The machine-readable version lives in `api-map/account-context-browser-workflows-2026-06-02.json`.

## How It Was Found

Tooling:

- Authenticated Chrome session controlled via Chrome DevTools MCP.
- Background tabs to avoid disrupting the user's active Robinhood tabs.
- Network request list inspection only. No cookies, bearer tokens, request bodies, balances, or private response bodies were copied.

Reproduction outline:

1. Open a Robinhood web route with `?account_number={owned_test_account}`.
2. Let the page settle.
3. Inspect network requests.
4. Record whether the supplied account number appears in downstream API route families.
5. Redact all account numbers and IDs before writing evidence.

## Raw Evidence, Redacted

Strong propagation on stock detail/order ticket:

```text
positions/?account_number={account_number}&instrument={instrument_uuid}&nonzero=true
orders/?account_numbers={account_number}&instrument=...
dividends/?account_number={account_number}&instrument_id={instrument_uuid}
options/chains/?account_number={account_number}&equity_instrument_id={instrument_uuid}
bonfire/accounts/{account_number}/instrument_buying_power/{instrument_uuid}/
tax_lots/eligibility/{account_number}/
```

Strong propagation on investing settings:

```text
settings/margin/{account_number}/
corp_actions/drip/enrollment/{account_number}/
corp_actions/drip/account_settings/{account_number}/
options/option_settings/{account_number}/
ceres/v1/accounts?rhsAccountNumber={account_number}
sms/margin/{account_number}/multi_account_eligibility
```

Ignored or internal state on Legend:

```text
wormhole/bw/orders/recent?accountNumber={selected_account_number}
hippo/bw/layouts/{layout_uuid}
portfolios/v2/performance/summary?rhsAccountNumber={selected_account_number}
options/positions/?account_numbers={selected_account_number}
accounts/{selected_account_number}/options_buying_power/
```

Mixed recurring behavior:

```text
recurring_schedules/?asset_types=equity&asset_types=crypto
accounts/{schedule_account_number}/instrument_buying_power/{instrument_uuid}/
cashier/ach/relationships/{relationship_uuid}/
```

Options-chain/builder behavior:

```text
options/chains/?account_number={account_number}&underlying_symbol={symbol}
options/instruments/?account_number={account_number}&chain_id={chain_id}&expiration_dates={expiration}&state=active&type={call_or_put}
marketdata/options/?ids={option_instrument_ids}&include_all_sessions=true
marketdata/options/strategy/quotes/?ids={option_instrument_ids}&ratios={ratios}&types={long_or_short}&include_all_sessions=true
options/chains/{chain_id}/collateral/?account_number={account_number}
```

The browser URL `/options/chains/{symbol}` does not encode the selected
expiration, call/put side, buy/sell side, selected strike, or builder legs. The
screen defaults to the nearest expiration, but changing the expiration dropdown
changes API query state, not the location bar. For automation, the CLI should
enumerate expirations from `options/chains`, enumerate contracts from
`options/instruments`, quote legs from `marketdata/options`, and quote packages
from `marketdata/options/strategy/quotes` before building a dry-run order.

Classic right-rail screenshot evidence:

```text
Options card display menu: Last Price, Your Equity, Today's Return, Total Return
Options rows: contract label, expiration, quantity/action, visible price/return
Stocks rows: ticker, fractional shares, sparkline, visible price/return
Account dropdown: page-level selected account with multiple account choices
```

## Why It Matters

For the CLI/MCP:

- Account selection should be explicit in API routes and dry-run plans.
- Web URLs can be useful for opening the right page, especially stock detail/order tickets.
- Legend is useful for endpoint discovery, but the account context should be read from its selected account state or API calls, not inferred from URL query.
- Options-chain URLs are useful entry points, but not enough to reproduce a selected contract or spread. The chain state must be represented as chain id, expiration, option type, strike, side, and leg list.
- Money movement and settings pages must stay approval-gated.

For security research:

- This is account-context routing evidence, not a proven IDOR. The pass only used owned accounts and did not test cross-user account numbers.
- A real IDOR claim would require authorization-boundary testing that is outside this repo's normal automation scope.
- The high-value pattern is that `account_number` can act as a route-level account selector or dropdown preselector across parts of `/account`, stock detail, and options APIs. The risk model is context confusion and accidental wrong-account writes, not unauthorized access based on current evidence.

## Full-Scope Retest Matrix

Use a dedicated test Chrome profile/port, not the busy main profile. Keep the
tab count low and capture only URL templates/query keys.

| Route | Expected test |
|-------|---------------|
| `/account/settings/investing?account_number={account_number}` | Confirm `rhsAccountNumber`, margin, DRIP, and options settings calls |
| `/account/stock-lending?account_number={account_number}` | Confirm dropdown preselection vs default-context API reads |
| `/account/transfers?account_number={account_number}` | Confirm whether ACH/deposit/debit-card calls accept account context or ignore it |
| `/account/recurring?account_number={account_number}` | Confirm list-all hub vs row-level schedule account calls |
| `/account/history?account_number={account_number}` | Confirm history/doc filters without exposing private data |
| `/account/reports-and-statements?account_number={account_number}` | Confirm document account filters |
| `/account/tax-center?account_number={account_number}` | Confirm tax document account filters |
| `/stocks/{symbol}({instrument_uuid})?account_number={account_number}` | Confirm buy/sell ticket account dropdown, order type, unit, amount, and buying-power calls |
| `/options/chains/{symbol}?account_number={account_number}` | Confirm chain/instrument/collateral account propagation and UI-state-only expiration/strike handling |
| `/legend/layout/{layout_uuid}?account_number={account_number}` | Confirm Legend continues using internal selected account state |

## CLI Commands

```bash
robinhood-cli api-map account-context
robinhood-cli api-map account-context --behavior propagates
robinhood-cli api-map account-url stock-detail-order-ticket \
  --account <ACCOUNT_NUMBER> \
  --symbol XBI \
  --instrument-id <INSTRUMENT_UUID>
robinhood-cli api-map account-url options-chain-symbol-builder \
  --account <ACCOUNT_NUMBER> \
  --symbol XBI
```

<!-- made with love by Zayd Khan / cold -->
