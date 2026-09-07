# @zaydiscold/robinhood-cli-mcp

Stdio MCP server for agent access to the same Robinhood engine used by the CLI. The server does not
maintain a second trading implementation: it imports `@zaydiscold/robinhood-cli/lib`, so auth, route
matching, write gates, order deduplication, idempotency, OTC/fractional guards, account discovery, and
order evidence stay aligned with the CLI.

## Run

```bash
pnpm --filter @zaydiscold/robinhood-cli-mcp build
node mcp/dist/server.js
```

Register with an MCP client using the absolute path to `mcp/dist/server.js`. Only include
`ROBINHOOD_ALLOW_LIVE_WRITE=1` in the server environment when the operator intentionally wants the
process to be capable of live writes.

```bash
claude mcp add robinhood-cli -s user -- \
  node /absolute/path/to/robinhood-cli-mcp-api/mcp/dist/server.js
```

After pulling or rebuilding, restart the server or reload the client. The running server's
`tools/list` response is the live truth; hardcoded counts in docs will rot.

## Safety model

- Account and market-data tools send live reads when caller-owned auth and required inputs are
  present.
- Knowledge, route catalogs, generated references, dry-run plans, and pure analysis are local or
  generated surfaces; they do not become live brokerage reads merely because MCP exposes them.
- Write-capable tools are dry-run by default unless `ROBINHOOD_ALLOW_LIVE_WRITE=1` is present.
- `dryRun: true` always forces a preview, even when the process is armed.
- Every write response exposes `executed` and `executionStatus` so a dry-run cannot read like a
  completed order.
- Exact user approval is still required for the fully resolved mutation. A process switch is not
  standing consent.
- Order history, not a `201`, UI state, or successful tool call, is the execution proof.
- Tax and strategy research never authorizes a trade or determines a filing result.

## Tax and strategy research

MCP uses the existing knowledge surface for the operating contract and the account tools for live
facts:

1. Call `robinhood_knowledge` with `action:index` and locate `tax-strategy-routing`.
2. Read `tax-strategy-routing` for strategy IDs, required response shape, and stop conditions.
3. Read `tax-reference` for source-backed federal rule topics and official source IDs.
4. Use only the named account tools to collect lots, history, option events, recurring activity,
   settings, dividends, or documents.
5. Keep broker-observed facts, user-supplied facts, official rules, planning inferences, and
   not-evaluated items separate.
6. Return mutation status as not authorized unless the user later requests an exact action through a
   separate execution flow.

CLI and API equivalents are:

```bash
robinhood-cli tax strategy wheel --json
robinhood-cli tax strategy "covered call" --account-context taxable --json
```

```ts
import { getTaxStrategyGuide } from "@zaydiscold/robinhood-cli/tax-strategy";
```

The structured strategy catalog is intentionally local. MCP account reads are performed separately
so tax research cannot silently initialize or authorize a brokerage mutation.

## Tool families

Query `tools/list` for the complete roster. Stable families include:

- Route map and planning: `robinhood_api_map_summary`, `robinhood_api_map_directory`,
  `robinhood_brokerage_describe`, `robinhood_recipes`, `robinhood_brokerage_plan`, and route-list
  tools.
- Account and portfolio reads: `robinhood_accounts`, `robinhood_portfolio`,
  `robinhood_positions`, `robinhood_buying_power`, `robinhood_quote`, `robinhood_history`, and
  `robinhood_performance`.
- Options: `robinhood_options_chain`, `robinhood_options_expirations`,
  `robinhood_options_enumerate`, `robinhood_options_strategy_quote`,
  `robinhood_options_roll_plan`, `robinhood_options_close`, `robinhood_options_holdings`,
  `robinhood_options_inspect`, and `robinhood_options_events`.
- Execution lifecycle: `robinhood_buy`, `robinhood_sell`, `robinhood_cancel`,
  `robinhood_order_status`, `robinhood_orders_open`, `robinhood_panic`, and `robinhood_pretrade`.
- Account control and memory: `robinhood_settings`, `robinhood_recurring`,
  `robinhood_watchlist*`, `robinhood_knowledge`, `robinhood_roll_ledger`, and `robinhood_hotlist`.
- Analysis and discovery: `robinhood_dividends`, `robinhood_documents`, `robinhood_margin`,
  `robinhood_review`, `robinhood_income`, `robinhood_risk`, `robinhood_whatif`,
  `robinhood_calendar`, `robinhood_exposure`, `robinhood_autopilot`, `robinhood_sentinel`,
  `robinhood_search`, `robinhood_news`, `robinhood_ratings`, `robinhood_earnings`, and
  `robinhood_movers`.
- Crypto: `robinhood_crypto_routes`, `robinhood_crypto_sign`, `robinhood_crypto_plan`, and
  `robinhood_crypto_execute`.

For the complete operating contract, start with `SKILL.md`; for architecture, see
`docs/cli-mcp-architecture.md`.

<!-- Zayd Khan // cold // www.zayd.wtf -->
