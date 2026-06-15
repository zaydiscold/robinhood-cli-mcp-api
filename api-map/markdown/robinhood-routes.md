# Robinhood Unified Route Map

Source: official Robinhood Crypto Trading OpenAPI plus sanitized authenticated Chrome/CDP brokerage/account route captures through 2026-05-27.

Crypto operations are official Robinhood-published endpoints and should use Ed25519 signing. Brokerage/account operations are browser-backed route-map entries and use caller-owned brokerage token or browser cookie auth.

Current count: 327 route entries.
Official Crypto route entries: 16.
Brokerage/account route entries: 311.
Risk counts: destructive=11, read=92, sensitive-read=198, write-mutate=13, write-or-sensitive=7, write-safe=6.

Per-endpoint files are generated in `api-map/markdown/endpoints/`. Each starts with `Mutation: yes` or `Mutation: no`.

| Mutation | Risk | Methods | Categories | Host | Source | Route template |
|---|---|---|---|---|---|---|
| no | sensitive-read | GET | money-movement | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/acats-aggregation/fee_reimbursements/history` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/acats/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/accounts/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/?default_to_all_accounts=true` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/{0}/recent_day_trades/` |
| no | sensitive-read | GET | account | api.robinhood.com | live-verified-2026-06-11 (per-account detail; the bulk accounts/ endpoints omit some owned accounts — this is the type/cash fallback for those) | `https://api.robinhood.com/accounts/{account_number}/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/{account_number}/buying_power_breakdown` |
| no | read | GET | account, settings, cash | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/` |
| yes | write-mutate | POST | account, settings, cash | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/accounts/{account_number}/sweep_enrollment_state/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/stock_loan_payments/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/sweeps/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/sweeps/interest/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/accounts/sweeps/timeline_summary/` |
| no | read | inferred | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/received/transfers/` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/relationships/` |
| yes | write-or-sensitive | POST | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/relationships/` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/relationships/{0}/` |
| yes | destructive | DELETE | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/relationships/{0}/` |
| yes | destructive | POST | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/relationships/{0}/unlink/` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/transfers/` |
| yes | write-or-sensitive | POST | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/ach/transfers/` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/banking/cross-sell/creditcard/applications/{uuid}` |
| no | sensitive-read | GET | unknown | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/bw/config` |
| no | read | GET | account, history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/cash_journal/margin_interest_charges/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/{id}` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/{id}/{id}` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/accounts` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/accounts/{id}/aggregated_positions` |
| no | sensitive-read | GET | account, orders | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/accounts/{id}/orders` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/accounts/{id}/pnl_cost_basis` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/cash_settlement_executions` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/futures_account_eligibility/{account_number}` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/manual_cash_correction` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/ceres/v1/user_settings` |
| no | read | inferred | auth | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/challenge/{0}/respond/` |
| no | sensitive-read | GET | orders | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/combo/orders/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/corp_actions/adr_fees/` |
| no | read | GET | account, settings, dividends | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/` |
| yes | write-mutate | PATCH | account, settings, dividends | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/corp_actions/drip/account_settings/{account_number}/` |
| no | sensitive-read | GET | dividends | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/corp_actions/drip/enrollment/{account_number}/` |
| yes | write-or-sensitive | PATCH | dividends | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/corp_actions/drip/enrollment/{account_number}/` |
| no | read | GET | account, settings, dividends | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/` |
| yes | write-mutate | PATCH | account, settings, dividends | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/corp_actions/drip/instrument_settings/{account_number}/{instrument_id}/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/corp_actions/v2/split_payments/` |
| no | sensitive-read | GET | account, money-movement | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/crypto-transfers/account/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/devices/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/devices/disable_remove_device/` |
| no | sensitive-read | inferred |  | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/discovery/lists/` |
| yes | destructive | POST | watchlists | api.robinhood.com | manual | `https://api.robinhood.com/discovery/lists/` |
| no | sensitive-read | inferred | watchlists | api.robinhood.com | manual | `https://api.robinhood.com/discovery/lists/?owner_type=custom` |
| no | sensitive-read | inferred |  | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/discovery/lists/{0}/` |
| yes | destructive | PATCH,DELETE | watchlists | api.robinhood.com | manual | `https://api.robinhood.com/discovery/lists/{id}/` |
| no | sensitive-read | inferred |  | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/discovery/lists/default/` |
| no | sensitive-read | inferred |  | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/discovery/lists/items/` |
| yes | write-mutate | POST | watchlists | api.robinhood.com | cdp-2026-06-14 watchlist-capture (verified live: add+remove each returned 200; the REAL endpoint is discovery/lists/items/, NOT midlands/lists/items/) | `https://api.robinhood.com/discovery/lists/items/` |
| no | sensitive-read | inferred |  | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/discovery/lists/user_items/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/discovery/ratings/{id}/overview/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/dividends/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/edocs_v2/custodial/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/edocs_v2/ira/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/edocs_v2/managed/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/edocs_v2/rhc/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/edocs_v2/rhd/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/documents/joint_account` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/fundamentals/` |
| yes | write-safe | POST | telemetry-config | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/goku/{id}` |
| yes | write-safe | POST | telemetry-config | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/goku/lcm` |
| yes | write-safe | POST | telemetry-config | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/goku/lcmv2` |
| yes | write-safe | POST | telemetry-config | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized | `https://api.robinhood.com/goku/live_frontend_log_events` |
| no | read | GET | telemetry-config | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/hippo/ux-flags` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/inbox/notifications/badge` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/inbox/threads/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/instruments/` |
| no | read | GET | instruments, reference | api.robinhood.com | self-extension 2026-05-28: bulk ids= resolution for holdings → tickers/quotes | `https://api.robinhood.com/instruments/?ids={ids}` |
| no | read | GET | instruments, reference | api.robinhood.com | self-extension 2026-05-28: symbol->instrument_id + tradable_chain_id resolution | `https://api.robinhood.com/instruments/?symbol={symbol}` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/instruments/{0}/popularity/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/instruments/{0}/splits/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/instruments/{id}/shorting/` |
| no | read | GET | telemetry-config | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/kaizen/experiments/{id}/` |
| no | sensitive-read | GET | account, margin | api.robinhood.com | live-verified-2026-06-11 on the api host (200 with amount_borrowed/margin_interest_rate/next_billing_date). The margin-health read: answers 'am I borrowing, at what rate, billed when'. Sibling day_trades_card/ returns 404 (retired with the PDT elimination, FINRA 26-10). | `https://api.robinhood.com/margin/{account_number}/investing_info/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/margin/{account_number}/upgrade_restrictions` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/margin/{account_number}/upgrade_restrictions/` |
| no | read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/margin/calls/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/earnings/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/equities/summary/robinhood/{id}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/forex/estimated_price/{uuid}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/forex/fundamentals/{uuid}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/forex/historicals/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/forex/historicals/{0}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/forex/quotes/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/marketdata/forex/quotes/{0}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/fundamentals/{id}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/fundamentals/short/v1/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/hedgefunds/summary/{id}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/hedgefunds/transactions/{id}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/historicals/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/historicals/{id}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-06-04-injected-capture (observed; price historicals per symbol) | `https://api.robinhood.com/marketdata/historicals/{symbol}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/insiders/summary/{id}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/insiders/transactions/{id}/` |
| no | read | GET | marketdata, options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/options/` |
| no | read | GET | marketdata, options | api.robinhood.com | self-extension 2026-05-28: templated ids= form of marketdata/options for single/batch option mark (adjusted_mark_price) lookup; ids key from captured queryKeys | `https://api.robinhood.com/marketdata/options/?ids={ids}` |
| no | read | inferred | marketdata, options | api.robinhood.com | live-verified-2026-06-11 (batch daily closes for held contracts; powers pre-open day attribution in computePortfolioPnl) | `https://api.robinhood.com/marketdata/options/historicals/?ids={ids}&interval={interval}&span={span}` |
| no | read | inferred | marketdata, options | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/marketdata/options/historicals/{0}/` |
| no | read | GET | marketdata, options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/options/strategy/quotes/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/quotes/` |
| no | read | GET | marketdata, quotes | api.robinhood.com | self-extension 2026-05-28: bulk ids= resolution for holdings → tickers/quotes | `https://api.robinhood.com/marketdata/quotes/?ids={ids}` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/marketdata/quotes/{id}/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/markets/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/markets/{}/hours/{}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/markets/{market}/hours/{date}/` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/midlands/ach/iav_banks/{id}/` |
| no | read | inferred | watchlists | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/lists/default/` |
| no | read | inferred | watchlists | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/lists/items/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/movers/sp500/` |
| no | read | GET | sentiment, news, data | api.robinhood.com | sentiment-rd-2026-06-03 | `https://api.robinhood.com/midlands/news/?symbol={symbol}` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/news/{0}/?` |
| no | sensitive-read | GET | notifications | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/midlands/notification_settings/ui_resources/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/notifications/notification_tracker/` |
| no | sensitive-read | GET | notifications | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/midlands/notifications/stack/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/midlands/ratings/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/ratings/{0}/` |
| no | read | GET | marketdata | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/midlands/ratings/{id}/` |
| no | read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/referral/` |
| no | read | GET | search, instruments | api.robinhood.com | manual-search-2026-06-03 | `https://api.robinhood.com/midlands/search/?query={query}` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/tags/tag/{}/` |
| no | read | GET | sentiment, discovery, data | api.robinhood.com | sentiment-rd-2026-06-03 | `https://api.robinhood.com/midlands/tags/tag/{tag}/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/tags/tag/100-most-popular/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/midlands/tags/tag/top-movers/` |
| no | sensitive-read | GET | money-movement | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/nimbus/v1/asset_transfers` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/notifications/devices/` |
| no | read | inferred | auth | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/oauth2/token/` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options-product/tooltips/home-tab/` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/{id}/` |
| no | sensitive-read | inferred | account, options | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/options/aggregate_positions/` |
| no | sensitive-read | GET | account, options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/aggregate_positions/?account_numbers=` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/chains/` |
| no | read | inferred | options | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/options/chains/{0}/` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/chains/{id}/` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/chains/{id}/collateral/` |
| no | sensitive-read | GET | history-documents, options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/corp_actions/` |
| no | read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/events/` |
| no | read | GET | options, trading | api.robinhood.com | cdp-2026-06-04-dram-option-order-flow (observed; per-order fee schedule) | `https://api.robinhood.com/options/fees/` |
| no | read | GET | marketdata, options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/instruments/` |
| no | read | GET | options, instruments, reference | api.robinhood.com | self-extension 2026-05-28: list option instruments for a chain/expiry/type -> find strike + option id | `https://api.robinhood.com/options/instruments/?chain_id={chain_id}&expiration_dates={expiration_dates}&state=active&type={type}` |
| no | read | inferred | marketdata, options | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/options/instruments/{0}/` |
| no | sensitive-read | GET | options, settings, account | api.robinhood.com | web-ui-capture-2026-06-03 (account/settings/investing) | `https://api.robinhood.com/options/option_settings/{account_number}/` |
| yes | write-or-sensitive | PATCH | options, settings, account | api.robinhood.com | web-ui-capture-2026-06-03 (account/settings/investing toggle) | `https://api.robinhood.com/options/option_settings/{account_number}/` |
| no | sensitive-read | GET | options, orders | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/orders/` |
| yes | write-mutate | POST | account, options, trading | api.robinhood.com | self-extension 2026-05-28: options order PLACEMENT (POST). Same reason as equity orders; supports legs[] for single/multi-leg. Double-gated. | `https://api.robinhood.com/options/orders/` |
| no | sensitive-read | GET | options, orders | api.robinhood.com | self-extension 2026-06-11: single OPTIONS order lookup by ID, for the post-cancel/post-send evidence re-read (order-evidence rule). Live-verified 200 against a filled SPXW order. | `https://api.robinhood.com/options/orders/{0}/` |
| yes | destructive | POST | options, orders | api.robinhood.com | wire-writes 2026-05-29 | `https://api.robinhood.com/options/orders/{0}/cancel/` |
| no | read | GET | options, trading | api.robinhood.com | cdp-2026-06-04-dram-option-order-flow (observed; collateral pre-check, order passed url-encoded in ?order={json}) | `https://api.robinhood.com/options/orders/collateral/` |
| no | sensitive-read | inferred | account, options | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/options/positions/` |
| no | sensitive-read | GET | account, options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/positions/?account_numbers=` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized | `https://api.robinhood.com/options/should_show_options_upgrade_on_sdp/` |
| no | sensitive-read | GET | options | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/options/strategies/` |
| no | sensitive-read | GET | orders | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/orders/` |
| yes | write-mutate | POST | account, equity, trading | api.robinhood.com | self-extension 2026-05-28: equity order PLACEMENT (POST). Map was capture-built from reads only and lacked it; needed to place/manage stock orders. Double-gated via --live-write + ROBINHOOD_ALLOW_LIVE_WRITE=1. | `https://api.robinhood.com/orders/` |
| no | sensitive-read | GET | orders | api.robinhood.com | self-extension 2026-06-09: single order status lookup by ID | `https://api.robinhood.com/orders/{0}/` |
| yes | destructive | POST | orders | api.robinhood.com | wire-writes 2026-05-29 | `https://api.robinhood.com/orders/{0}/cancel/` |
| no | sensitive-read | GET | orders | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/orders/session/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/pathfinder/concierge/plus/status/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/pathfinder/issues/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/pathfinder/support_chats/` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/pluto/historical_activities/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/portfolios/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/portfolios/{account_number}/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/portfolios/historicals/{0}/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/positions/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/positions/?account_number=` |
| no | sensitive-read | GET | account | api.robinhood.com | self-extension 2026-05-28: templated account_number form so any account (individual, Roth/IRA, etc.) can be queried, not just primary; placeholder filled via --param | `https://api.robinhood.com/positions/?account_number={account_number}&nonzero=true` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/quotes/` |
| no | read | inferred | marketdata | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/quotes/historicals/` |
| no | sensitive-read | GET | unknown | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/settings/education_state/{id}/` |
| no | read | GET | account, settings, margin | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/settings/margin/{account_number}/` |
| yes | write-mutate | PUT | account, settings, margin | api.robinhood.com | settings-capture-2026-06-03 | `https://api.robinhood.com/settings/margin/{account_number}/` |
| yes | write-or-sensitive | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/subscription/subscription_fees/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/user/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/user/additional_info/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/user/basic_info/` |
| no | sensitive-read | inferred | account | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/user/investment_profile/` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/user/verify/email/info/` |
| yes | write-or-sensitive | inferred | money-movement | api.robinhood.com | brokerage-browser-map | `https://api.robinhood.com/wire/transfers` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/wonka/promotions/upsell_configs/BADGE` |
| no | sensitive-read | GET | account | api.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/wonka/promotions/upsell_configs/TRANSFER_HUB_ROW_UPSELL` |
| no | sensitive-read | GET | history-documents | api.robinhood.com | cdp-2026-05-26-stock-account-sanitized; cdp-2026-05-27-stock-account-sanitized | `https://api.robinhood.com/yoda/v1/list_advisor_trades` |
| no | sensitive-read | GET | money-movement | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/acats/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/account_switcher/instrument/v2/{uuid}/` |
| no | sensitive-read | GET | account, options | bonfire.robinhood.com | cdp-2026-06-04-dram-option-order-flow (observed; the real options-BP gate the web reads before an option open) | `https://bonfire.robinhood.com/accounts/{account_number}/options_buying_power` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/accounts/{id}/{id}` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/accounts/{id}/currency_buying_power/{uuid}/info_alert` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/accounts/{id}/currency_buying_power/USD` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/accounts/{id}/instrument_buying_power/{uuid}/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/accounts/{id}/unified/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/advisory/fees/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/app-comms/batch/surface/info-banner/` |
| yes | write-mutate | POST | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/app-comms/receipt/seen/{uuid}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/app-comms/surface/{id}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/app-comms/surface/alert-sheet` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/app-comms/surface/hero-card` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/app-comms/surface/status-banner` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/crypto-yields/v1/history/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/crypto/crypto_migrations` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/crypto/cryptobility/{uuid}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/crypto/fundamental_stats/{uuid}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/crypto/transfers/history/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/edocs_orchestrator/{id}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/education/tool_tips` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/education/tour/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/equities/history/{id}` |
| no | read | GET | equity, ipo-access | bonfire.robinhood.com | cdp (observed; RH IPO Access summary viewmodel — Idea A seed; full prospectus/IOI family TBD via interactive capture) | `https://bonfire.robinhood.com/equity_trading/ipo_access/viewmodels/summary/{ipo_id}/` |
| no | sensitive-read | GET | orders | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/equity_trading/order_type_selector/buy/` |
| no | read | GET | equity, trading | bonfire.robinhood.com | cdp (observed; web order-ticket SELL-side selector viewmodel) | `https://bonfire.robinhood.com/equity_trading/order_type_selector/sell/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/feature-discovery/features/investing_below_card` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/gold/{id}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/gold/get_subscription_list/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/gold/pill` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/gold/sweep_flow_splash/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/home/account_switcher/v2` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/disclosures/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/etp-details/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/historical-chart/` |
| no | sensitive-read | GET | account, marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/margin-requirements/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/qa/event-info/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/qa/events-section/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/stock_detail/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/{uuid}/v2/warnings/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/chart-bounds/` |
| no | read | GET | marketdata | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/instruments/spans/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/margin/{id}/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/margin/{id}/buying_power_hub_view` |
| no | sensitive-read | GET | account, telemetry-config | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/margin/{id}/eligibility` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/margin/{id}/investing_info/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/margin/{id}/settings/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/market_indices` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/onboarding/{id}/` |
| no | read | GET | options, marketdata | bonfire.robinhood.com | cdp-2026-06-04-injected-capture (observed; option strategy historical chart; strategy_code = {option_uuid}_S1) | `https://bonfire.robinhood.com/options/{strategy_code}/historical-chart/` |
| yes | write-safe | POST | options, trading, preview | bonfire.robinhood.com | settings-capture-2026-06-03 | `https://bonfire.robinhood.com/options/orders/marketability/` |
| yes | write-safe | POST | options, trading, preview | bonfire.robinhood.com | settings-capture-2026-06-03 | `https://bonfire.robinhood.com/options/orders/review` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/p2p/treatment/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/payment_instruments/v2/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/payment_instruments/v2/debitcard/{uuid}/` |
| no | sensitive-read | GET | money-movement, unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/paymenthub/unified_transfers/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/paymenthub/unified_transfers/{uuid}/contribution/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/portfolio/{id}/positions_v2` |
| no | sensitive-read | GET | money-movement | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/portfolio/acats/bonus-promo-info/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/portfolio/account/{id}/live` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/portfolio/performance/{id}` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/portfolio/performance/{id}/settings_v2/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/psp/eligible_programs` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/psp/gifts/history/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/questionnaire/questionnaire-completed/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/rad/gifting/gifts` |
| no | sensitive-read | GET | orders | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/recurring_schedules/` |
| yes | destructive | POST | recurring | bonfire.robinhood.com | wire-writes 2026-05-29 | `https://bonfire.robinhood.com/recurring_schedules/` |
| yes | destructive | PATCH,DELETE | recurring | bonfire.robinhood.com | wire-writes 2026-05-29 | `https://bonfire.robinhood.com/recurring_schedules/{0}/` |
| no | sensitive-read | GET | recurring | bonfire.robinhood.com | fix-recurring-read-gate 2026-05-29 | `https://bonfire.robinhood.com/recurring_schedules/{0}/` |
| no | sensitive-read | GET | orders | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/recurring_schedules/equity/next_investment_date/` |
| no | sensitive-read | GET | orders | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/recurring_tradability/equity/{uuid}/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/recurring_trade_logs/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/region` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/retirement/history/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/rewards/reward/gift/crypto/list/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/rewards/reward/stocks/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/rewards/sdp_referral/card/{uuid}` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/rhy/accounts/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/screeners` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/screeners/presets/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/settings_page//account_contact/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/settings_page//account_preferences/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/settings_page//notifications/` |
| no | read | GET | account, settings, stock-lending | bonfire.robinhood.com | settings-capture-2026-06-03 | `https://bonfire.robinhood.com/slip/{account_number}/status/` |
| yes | write-mutate | PUT | account, settings, stock-lending | bonfire.robinhood.com | settings-capture-2026-06-03 | `https://bonfire.robinhood.com/slip/{account_number}/status/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/slip/{id}/` |
| no | sensitive-read | GET | telemetry-config | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/slip/eligibility/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/slip/hub-card/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/sms/margin/{id}/{id}` |
| yes | write-mutate | POST | account, settings, cash | bonfire.robinhood.com | settings-capture-2026-06-03 | `https://bonfire.robinhood.com/sms/sweep/agree_and_enroll` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/tax_info/instrument/{uuid}/withholding_status/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/tax_info/withheld_amount/` |
| no | sensitive-read | GET | account | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/transfer/accounts/` |
| no | sensitive-read | GET | unknown | bonfire.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://bonfire.robinhood.com/user_status/stripe/` |
| no | sensitive-read | GET | money-movement | cashier.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://cashier.robinhood.com/ach/deposit_schedules/` |
| no | sensitive-read | GET | money-movement | cashier.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://cashier.robinhood.com/ach/relationships/` |
| no | sensitive-read | GET | unknown | dora.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://dora.robinhood.com/feed/` |
| no | sensitive-read | GET | unknown | dora.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://dora.robinhood.com/feed/instrument/{uuid}/` |
| no | read | GET | marketdata | dora.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://dora.robinhood.com/instruments/similar/{uuid}/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/sorting_hat/v1/user_state/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/sorting_hat/v4_web/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/user_info/address/residential/` |
| yes | write-or-sensitive | POST | account, agreements | identi.robinhood.com | settings-capture-2026-06-03 | `https://identi.robinhood.com/user_info/agreements/v2/sign/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/user_info/opt_out_consent/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/user_info/opt_out_consent/ccpa_marketing/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/user_info/privacy_consent/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/user_info/profile_info/` |
| no | sensitive-read | GET | unknown | identi.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://identi.robinhood.com/user_info/trusted_contact/` |
| no | sensitive-read | GET | account | minerva.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://minerva.robinhood.com/accounts/` |
| no | sensitive-read | GET | unknown | minerva.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://minerva.robinhood.com/cards/declined_transactions/` |
| no | sensitive-read | GET | history-documents, unknown | minerva.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://minerva.robinhood.com/history/transactions/` |
| no | sensitive-read | GET | account | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/accounts/` |
| no | sensitive-read | GET | unknown | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/activations/` |
| no | read | GET | marketdata, unknown | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/currency_pairs/` |
| no | read | GET | unknown | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/holdings/` |
| no | sensitive-read | GET | orders | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/orders/` |
| yes | write-mutate | POST | orders | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/orders/` |
| no | sensitive-read | GET | orders | nummus.robinhood.com | brokerage-browser-map | `https://nummus.robinhood.com/orders/{0}/` |
| yes | destructive | POST | orders | nummus.robinhood.com | wire-writes 2026-05-29 | `https://nummus.robinhood.com/orders/{0}/cancel/` |
| no | sensitive-read | GET | account | nummus.robinhood.com | cdp-2026-05-27-stock-account-sanitized | `https://nummus.robinhood.com/portfolios/{uuid}/` |
| no | sensitive-read | inferred | account | phoenix.robinhood.com | brokerage-browser-map | `https://phoenix.robinhood.com/accounts/unified` |
| no | read | GET | crypto, official, marketdata | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/marketdata/best_bid_ask/` |
| no | read | GET | crypto, official, marketdata | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/marketdata/estimated_price/` |
| no | sensitive-read | GET | crypto, official, trading, accounts | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/trading/accounts/` |
| no | sensitive-read | GET | crypto, official, trading, holdings | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/trading/holdings/` |
| no | sensitive-read | GET | crypto, official, trading, orders | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/trading/orders/` |
| yes | write-mutate | POST | crypto, official, trading, orders-write | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/trading/orders/` |
| yes | destructive | POST | crypto, official, trading, orders-write | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/trading/orders/{id}/cancel/` |
| no | read | GET | crypto, official, trading, trading-pairs | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v1/crypto/trading/trading_pairs/` |
| no | read | GET | crypto, official, marketdata | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/` |
| no | sensitive-read | GET | crypto, official, trading, accounts | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/accounts/` |
| no | read | GET | crypto, official, trading | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/estimated_price/` |
| no | sensitive-read | GET | crypto, official, trading, holdings | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/holdings/` |
| no | sensitive-read | GET | crypto, official, trading, orders | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/orders/` |
| yes | write-mutate | POST | crypto, official, trading, orders-write | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/orders/` |
| yes | destructive | POST | crypto, official, trading, orders-write | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/orders/{id}/cancel/` |
| no | read | GET | crypto, official, trading, trading-pairs | trading.robinhood.com | official-crypto-openapi | `https://trading.robinhood.com/api/v2/crypto/trading/trading_pairs/` |

<!-- Zayd Khan // cold // www.zayd.wtf -->
