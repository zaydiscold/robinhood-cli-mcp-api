# Security Research: Robinhood Account-Number Context Routing - 2026-06-03

This note documents an authorized, user-owned account-context finding. It is not
a public vulnerability claim and it is not evidence of cross-user access. All
account numbers, account labels, balances, UUIDs, tokens, headers, and response
bodies are redacted or represented as placeholders.

## What Was Found

Robinhood web routes often accept `?account_number={account_number}` as a
navigation-level account selector. In some places it propagates into API query
parameters; in other places it only preselects a dropdown or is ignored while the
page uses internal selected-account state.

The highest-signal surfaces are:

| Surface | Route pattern | Current finding |
|---------|---------------|-----------------|
| Investing settings | `/account/settings/investing?account_number={account_number}` | Strong account propagation into margin, DRIP, and options-settings reads |
| Stock detail/order ticket | `/stocks/{symbol}({instrument_uuid})?account_number={account_number}` | Strong propagation into positions, orders, dividends, buying power, and option-chain discovery |
| Options chain/builder | `/options/chains/{symbol}?account_number={account_number}` | Mixed: account propagates to chain/instrument/collateral APIs, but expiration/strike/strategy are UI/API state, not URL state |
| Stock lending | `/account/stock-lending?account_number={account_number}` | Mixed: user observed dropdown preselection; captured reads can still use default context |
| Transfer/deposit/debit-card hub | `/account/transfers?account_number={account_number}` | High-risk retest target; previous capture did not prove direct query propagation |
| Recurring investments | `/account/recurring?account_number={account_number}` | Mixed: hub loads schedules broadly; row-level calls use schedule account |
| Legend | `/legend/layout/{layout_uuid}?account_number={account_number}` | Ignored: Legend appears to use its own selected-account state |

## Why It Matters

For CLI/MCP automation, the bug class is not "can any account number be read."
The immediate risk is wrong-account context: a browser URL can silently select or
suggest the account used by a write-capable page. That matters for orders,
options, margin/DRIP settings, recurring investments, stock lending, transfers,
and debit-card/payment-instrument pages.

Therefore:

- Web URLs may be useful for opening the right UI surface.
- API automation must prefer explicit `account_number`, `account_numbers`,
  `account`, or account-URL fields in the request body.
- Every write remains double-gated and exact-approval gated.
- Money movement, margin, DRIP, options-settings, order placement, order cancel,
  recurring edits, debit-card changes, and account deactivation are not safe to
  automate from URL state alone.

## How It Was Found

Inputs and tools:

- User-owned Robinhood web session and user-owned account numbers visible in the UI.
- Sanitized CDP route captures already stored in `api-map/browser-cdp-routes-2026-06-02.json`.
- Machine-readable workflow map in `api-map/account-context-browser-workflows-2026-06-02.json`.
- Desktop screenshots from `2026-06-02 19:10` local time, converted from HEIC to temporary PNGs with `sips`.
- Route-map inspection with `jq` and repo tests.

No cookies, bearer tokens, request headers, request bodies, balances, order
tickets, or private response bodies were copied into this repo.

## Raw Evidence, Redacted

Strong settings propagation:

```text
settings/margin/{account_number}/
corp_actions/drip/enrollment/{account_number}/
corp_actions/drip/account_settings/{account_number}/
options/option_settings/{account_number}/
ceres/v1/accounts?rhsAccountNumber={account_number}
sms/margin/{account_number}/multi_account_eligibility
```

Strong stock/order-ticket propagation:

```text
positions/?account_number={account_number}&instrument={instrument_uuid}&nonzero=true
orders/?account_numbers={account_number}&instrument={instrument_uuid}
dividends/?account_number={account_number}&instrument_id={instrument_uuid}
options/chains/?account_number={account_number}&equity_instrument_id={instrument_uuid}
accounts/{account_number}/instrument_buying_power/{instrument_uuid}/
tax_lots/eligibility/{account_number}/
equity_trading/order_type_selector/sell/
equity_trading/order_type_selector/buy/
```

Options chain state:

```text
options/chains/?account_number={account_number}&underlying_symbol={symbol}
options/instruments/?account_number={account_number}&chain_id={chain_id}&expiration_dates={expiration}&state=active&type={call_or_put}
marketdata/options/?ids={option_instrument_ids}&include_all_sessions=true
marketdata/options/strategy/quotes/?ids={option_instrument_ids}&ratios={ratios}&types={long_or_short}&include_all_sessions=true
options/chains/{chain_id}/collateral/?account_number={account_number}
options/orders/
```

Legend internal account state:

```text
wormhole/bw/orders/recent?accountNumber={selected_account_number}
portfolios/v2/performance/summary?rhsAccountNumber={selected_account_number}
options/positions/?account_numbers={selected_account_number}
accounts/{selected_account_number}/options_buying_power/
```

## Reproducibility

Safe retest steps:

1. Start a dedicated non-default Chrome test profile with a single debug port.
2. Log into the user-owned Robinhood account in that profile.
3. Open one route at a time with `?account_number={owned_account_number}`.
4. Capture only sanitized URL templates and query keys from XHR/fetch requests.
5. Compare the supplied account number with downstream API route families.
6. Mark behavior as `propagates`, `mixed`, `ignored`, `not-applicable`, or
   `stale-route`.
7. Do not click submit/review/live-write buttons. Do not mutate settings.

Retest targets:

```text
/account/settings/investing?account_number={account_number}
/account/stock-lending?account_number={account_number}
/account/transfers?account_number={account_number}
/account/recurring?account_number={account_number}
/account/history?account_number={account_number}
/account/reports-and-statements?account_number={account_number}
/account/tax-center?account_number={account_number}
/account/settings?account_number={account_number}
/stocks/{symbol}({instrument_uuid})?account_number={account_number}
/options/chains/{symbol}?account_number={account_number}
/legend/layout/{layout_uuid}?account_number={account_number}
```

## Open Questions

- Does every `/account` page with an account dropdown accept the query as a
  dropdown preselector?
- Which money-movement surfaces bind the URL account, and which require a body
  or internal account selector?
- Does the options chain page consistently propagate `account_number` to
  collateral and tradability calls across account types?
- Does Robinhood expose a stable query or hash fragment for expiration/strike
  selection, or is that state fully API/UI-local?
- Does Legend expose a reliable selected-account endpoint that is safer than
  inferring from the layout URL?

## Automation Rule

Treat this as context-routing intelligence. It improves navigation and endpoint
mapping, but every real action must still be built from explicit API fields,
dry-run output, and exact user approval.

<!-- made with love by Zayd Khan / cold -->
