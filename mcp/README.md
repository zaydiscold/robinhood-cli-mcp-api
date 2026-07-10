# @zaydiscold/robinhood-cli-mcp

Stdio MCP server for agent access to the same Robinhood engine used by the CLI.
The server does not maintain a second trading implementation: it imports
`@zaydiscold/robinhood-cli/lib`, so auth, route matching, write gates, order
deduplication, `ref_id` behavior, OTC/fractional guards, and account discovery
stay aligned with the CLI.

## Run

```bash
pnpm --filter @zaydiscold/robinhood-cli-mcp build
node mcp/dist/server.js
```

Register with an MCP client using the absolute path to `mcp/dist/server.js`.
Only include `ROBINHOOD_ALLOW_LIVE_WRITE=1` in the server environment when the
operator intentionally wants writes to be able to go live.

```bash
claude mcp add robinhood-cli -s user -- \
  node /absolute/path/to/robinhood-cli/mcp/dist/server.js
```

After pulling or rebuilding, restart the server or reload the MCP client. The
running server's `tools/list` response is the live truth; hardcoded counts in
docs will rot.

## Safety Model

- Read/list/plan tools run live with caller-owned auth.
- Write-capable tools are dry-run by default unless
  `ROBINHOOD_ALLOW_LIVE_WRITE=1` is present in the server environment.
- `dryRun: true` always forces a preview, even when the switch is present.
- Every write response is wrapped with `executed` and `executionStatus` so a
  dry-run plan cannot read like a completed order.
- Order history, not a `201` alone and not a UI screen, is the execution proof.

## Tool Families

Query `tools/list` for the complete roster. The stable families are:

- Route map and planning: `robinhood_api_map_summary`,
  `robinhood_api_map_directory`, `robinhood_brokerage_describe`,
  `robinhood_recipes`, `robinhood_brokerage_plan`, route-list tools.
- Account and portfolio reads: `robinhood_accounts`, `robinhood_portfolio`,
  `robinhood_positions`, `robinhood_buying_power`, `robinhood_quote`,
  `robinhood_history`, `robinhood_performance`.
- Options: `robinhood_options_chain`, `robinhood_options_expirations`,
  `robinhood_options_enumerate`, `robinhood_options_strategy_quote`,
  `robinhood_options_roll_plan`, `robinhood_options_close`,
  `robinhood_options_holdings`, `robinhood_options_inspect`.
- Execution lifecycle: `robinhood_buy`, `robinhood_sell`, `robinhood_cancel`,
  `robinhood_order_status`, `robinhood_orders_open`, `robinhood_panic`,
  `robinhood_pretrade`.
- Account control and memory: `robinhood_settings`, `robinhood_recurring`,
  `robinhood_watchlist*`, `robinhood_knowledge`, `robinhood_roll_ledger`,
  `robinhood_hotlist`.
- Analysis and discovery: `robinhood_dividends`, `robinhood_documents`,
  `robinhood_margin`, `robinhood_review`, `robinhood_income`,
  `robinhood_risk`, `robinhood_whatif`, `robinhood_calendar`,
  `robinhood_exposure`, `robinhood_autopilot`, `robinhood_sentinel`,
  `robinhood_search`, `robinhood_news`, `robinhood_ratings`,
  `robinhood_earnings`, `robinhood_movers`, `robinhood_options_events`.
- Crypto: `robinhood_crypto_routes`, `robinhood_crypto_sign`,
  `robinhood_crypto_plan`, `robinhood_crypto_execute`.

For the architecture and improvement map, see
`docs/cli-mcp-architecture.md`.

<!-- Zayd Khan // cold // www.zayd.wtf -->
