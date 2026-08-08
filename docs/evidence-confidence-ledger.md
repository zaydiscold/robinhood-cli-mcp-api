# Capability Evidence and Confidence Ledger

Evidence date: 2026-08-08. This ledger separates broker integration evidence from deterministic calculations and educational material. It is not investment, legal, or tax advice.

Sanitized execution receipt: [`evidence-receipts/safe-live-walk-2026-08-08.json`](./evidence-receipts/safe-live-walk-2026-08-08.json). It intentionally contains no tokens, account/position/balance/order identifiers, or raw responses.

## Evidence tiers

| Tier                | Meaning                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `mapped`            | Route/schema/static bundle evidence only.                                    |
| `unit`              | Configured tests exercise core behavior and failure paths.                   |
| `live-read`         | Authenticated Robinhood returned real data and the CLI parsed semantic JSON. |
| `live-preflight`    | Account/instrument/order-check surfaces ran without submitting.              |
| `accepted-order`    | Robinhood accepted a real order and returned a durable identifier.           |
| `status-reconciled` | A separate history/status read proved the terminal order state.              |
| `fill-reconciled`   | Fill, position/cash effect, and intended contract were reconciled.           |

A live input does not validate downstream financial math. A generated order body, dry run, HTTP status, or mapped route does not prove submission. Historical mutation receipts are useful evidence but are not a current re-fire.

## Authenticated live-read walk: 2026-08-08

The following CLI families returned parseable semantic JSON from real authenticated or public Robinhood surfaces without writes:

- accounts, account pulse, positions, portfolio, buying power, history
- quotes, dividends, documents, margin
- options holdings, events, expirations, chain, and chain statistics
- performance, risk, calendar, news, ratings, earnings, movers, exposure, sentinel
- rewards, inbox summary, sweep interest, Gold fees
- IPO Access list, recurring list, settings show, watchlists, open orders
- pretrade
- tax-lot inventory on an actually held account/symbol pair
- IPO request-readiness viewmodels for a currently compatible offering/account pair

This proves current read wiring and parsers for representative inputs. It does not prove every pagination branch, empty/error state, account class, instrument class, or calculation.

## Capability-family truth

| Family                                         | Highest current evidence                                                         | What is proven                                                                          | What is not guaranteed                                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account/position/order/market reads            | `live-read`                                                                      | Representative authenticated responses parse now.                                       | Every account class, pagination branch, and provider edge case.                                                                                                                           |
| Ordinary equity order planning                 | `unit` + real-account dry run                                                    | Real account/symbol resolution and body/gate path execute without sending.              | Current live submit, cancellation, or fill behavior unless a specific transaction is authorized and reconciled.                                                                           |
| Ordinary equity order submit/cancel            | Captured contract + unit coverage; not re-fired in this audit                    | Engine, gates, idempotency, history, cancel, and watch logic exist.                     | Current broker acceptance or reconciliation. No retained sanitized ordinary-equity submit receipt was found; require an accepted order ID and terminal reconciliation for each live test. |
| Order status/watch                             | `unit`; live status needs an explicit real order ID                              | Poll/reconciliation logic is tested.                                                    | Status reconciliation when no durable order ID is supplied. The privacy-safe unified history output intentionally omits IDs.                                                              |
| Options chains/holdings/events                 | `live-read`                                                                      | Representative current contracts and account positions parse.                           | Every expiration, adjusted contract, or illiquid-chain edge case.                                                                                                                         |
| Options strategy quote/close/roll/autopilot    | `unit` + live inputs; plan-only                                                  | Deterministic plan construction and guards.                                             | Live multi-leg submission, fill ordering, collateral acceptance, or roll execution.                                                                                                       |
| 24-hour / overnight equity                     | `live-read` eligibility + dry-run/safety boundary                                | `all_day_hours` body construction and instrument/quote/spread checks execute.           | Live account/session preflight or submission. Live sends fail closed.                                                                                                                     |
| Tax-lot inventory                              | `live-read`                                                                      | Open lots, stable IDs, availability, and eligibility parse for a held taxable position. | Broker tax reporting correctness or future availability.                                                                                                                                  |
| Exact-lot planning                             | `unit` + live inventory                                                          | Stable-ID/quantity validation and candidate body generation.                            | Authenticated exact-lot review/submit. Never call a generic sell exact-lot proof.                                                                                                         |
| Exact-lot submission                           | `mapped` candidate only; fail-closed by design                                   | Missing contract is surfaced explicitly.                                                | Any live execution guarantee. It was not armed in this audit because no transaction-specific authorization was supplied.                                                                  |
| IPO Access list/request readiness              | `live-read` / `live-preflight`                                                   | Offering list and account-scoped education/disclosure/eligibility/review viewmodels.    | Submit/update/cancel method, serializer, acknowledgement persistence, allocation, or fill.                                                                                                |
| Recurring/settings/watchlist writes            | Unit coverage plus selected historical reversible receipts; reads re-walked live | Current read state and gated mutation implementation exist.                             | Every mutation today. Re-fire only with exact-action approval and readback.                                                                                                               |
| Generic brokerage/crypto execution             | Route/signing/planning tests; selected reads live                                | Mapping, signature/plan generation, and write gates.                                    | Every mapped endpoint or live write. Generic execute is not a validation bypass.                                                                                                          |
| Panic/cancel-all                               | `unit` + live open-order enumeration                                             | The would-cancel inventory and per-order gate path.                                     | Live cancellation of every product/order state without explicit approval and terminal reconciliation.                                                                                     |
| Local notes, roll ledger, snapshots, knowledge | `unit`/local runtime depending command                                           | Local file workflows and read contracts.                                                | Broker execution; local bookkeeping is never order evidence.                                                                                                                              |

## Financial calculations and educational material

| Surface                          | Inputs                                   | Validation actually present                                              | Required caveat                                                                                          |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Dividends/income projections     | Live brokerage events/positions          | Regression tests for aggregation and cadence logic; live command walked. | Not independently reconciled to every statement or future issuer action.                                 |
| Performance                      | Live account chart data                  | Parser/aggregation tests; live command walked.                           | Portfolio-wide client summation may differ from broker presentation/rounding.                            |
| Risk/concentration/exposure      | Live positions/options                   | Deterministic formula tests; live command walked.                        | Model output, not broker risk approval or liquidation prediction.                                        |
| What-if/Greeks                   | Live positions plus scenario assumptions | Deterministic scenario tests.                                            | Estimate only; not a broker quote, execution price, or guarantee.                                        |
| Tax-lot objectives/tax estimates | Live lots plus user-supplied rates       | Deterministic selection/math tests.                                      | Educational estimate, not tax-law adjudication, 1099-B/Form 8949 reconciliation, or personalized advice. |
| Wheel/rolling/strategy knowledge | Live positions plus educational rules    | Classification/plan tests.                                               | Not suitability, assignment probability, or execution guarantee.                                         |

The previous README phrase “every formula has been triple-checked” is intentionally rejected. The defensible statement is: formulas have regression tests, selected commands have been walked against live inputs, and independent statement/spreadsheet reconciliation remains necessary.

## Mutation graduation rule

A financial mutation is never upgraded from “implemented” to “verified” without all applicable artifacts:

1. exact account, instrument, side, size, order type, price/TIF/session, and maximum exposure;
2. transaction-specific user authorization;
3. live preflight/review evidence;
4. accepted durable order ID;
5. independent status/history reconciliation;
6. cancellation terminal state for non-fill tests, or fill + position/cash reconciliation for intentional fills;
7. product-specific proof—ordinary equity evidence cannot stand in for IPO, 24-hour, options, crypto, or exact-lot semantics.

## Release rule

Every new CLI command and MCP tool must be added here with its highest proven tier. If live evidence is unavailable, documentation must say `mapped`, `unit`, `plan-only`, or `not_evaluated`—never “works,” “verified,” or “guaranteed.”

## Complete canonical MCP capability inventory

All 93 public names declared in `cli/src/capabilities.ts` are classified below. “Representative live walk” means one privacy-safe semantic execution, not every argument/account/product/error branch.

| MCP tool                                 | Highest current evidence                             |
| ---------------------------------------- | ---------------------------------------------------- |
| `robinhood_account_context_url`          | `unit` / local, catalog, signing, or static workflow |
| `robinhood_account_context_workflows`    | `unit` / local, catalog, signing, or static workflow |
| `robinhood_account_pulse`                | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_accounts`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_api_map_directory`            | `unit` / local, catalog, signing, or static workflow |
| `robinhood_api_map_summary`              | `unit` / local, catalog, signing, or static workflow |
| `robinhood_autopilot`                    | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_brokerage_describe`           | `unit` / local, catalog, signing, or static workflow |
| `robinhood_brokerage_execute`            | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_brokerage_plan`               | `unit` / plan-only                                   |
| `robinhood_brokerage_routes`             | `unit` / local, catalog, signing, or static workflow |
| `robinhood_browser_routes`               | `unit` / local, catalog, signing, or static workflow |
| `robinhood_buy`                          | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_buying_power`                 | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_calendar`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_cancel`                       | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_crypto_execute`               | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_crypto_plan`                  | `unit` / plan-only                                   |
| `robinhood_crypto_routes`                | `unit` / local, catalog, signing, or static workflow |
| `robinhood_crypto_sign`                  | `unit` / local, catalog, signing, or static workflow |
| `robinhood_dividends`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_doctor`                       | `unit` / local, catalog, signing, or static workflow |
| `robinhood_documents`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_earnings`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_exposure`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_gold_fees`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_history`                      | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_hotlist`                      | `unit` / local, catalog, signing, or static workflow |
| `robinhood_inbox_summary`                | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_income`                       | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_ipo_access`                   | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_ipo_access_request_plan`      | `live-preflight` (no submit)                         |
| `robinhood_knowledge`                    | `unit` / local, catalog, signing, or static workflow |
| `robinhood_margin`                       | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_movers`                       | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_news`                         | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_options_chain`                | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_options_chain_stats`          | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_options_close`                | `unit` / plan-only                                   |
| `robinhood_options_contract_link_bundle` | `unit` / plan-only                                   |
| `robinhood_options_contract_plan`        | `unit` / plan-only                                   |
| `robinhood_options_diagnostics`          | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_enumerate`            | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_events`               | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_options_expirations`          | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_options_history`              | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_holdings`             | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_options_inspect`              | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_order_flow`           | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_roll_plan`            | `unit` / plan-only                                   |
| `robinhood_options_snapshot`             | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_strategy_plan`        | `unit` / plan-only                                   |
| `robinhood_options_strategy_quote`       | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_strategy_workflows`   | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_options_workbench`            | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_order_status`                 | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_order_watch`                  | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_orders_open`                  | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_panic`                        | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_performance`                  | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_portfolio`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_portfolio_snapshot`           | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_positions`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_pretrade`                     | `live-preflight` (no submit)                         |
| `robinhood_quote`                        | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_ratings`                      | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_recipes`                      | `unit` / local, catalog, signing, or static workflow |
| `robinhood_recurring`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_review`                       | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_review_note`                  | `unit` / local, catalog, signing, or static workflow |
| `robinhood_rewards`                      | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_risk`                         | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_roll_ledger`                  | `unit` / local, catalog, signing, or static workflow |
| `robinhood_routes`                       | `unit` / local, catalog, signing, or static workflow |
| `robinhood_search`                       | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_sell`                         | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_sentinel`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_settings`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_share_safe`                   | `unit` / local, catalog, signing, or static workflow |
| `robinhood_stock_profile`                | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_sweep_interest`               | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_tax_lot_order`                | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_tax_lot_plan`                 | `unit` / plan-only                                   |
| `robinhood_tax_lot_sell`                 | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_tax_lots`                     | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_watchlist`                    | `live-read` (representative 2026-08-08 walk)         |
| `robinhood_watchlist_add`                | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_watchlist_buy`                | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_watchlist_create`             | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_watchlist_items`              | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_watchlist_remove`             | `unit` / gated mutation; not re-fired in this audit  |
| `robinhood_whatif`                       | `unit` or mapped; no direct 2026-08-08 live walk     |
| `robinhood_wheel`                        | `unit` or mapped; no direct 2026-08-08 live walk     |
