# @zaydiscold/robinhood-cli-mcp

Stdio MCP server for personal Robinhood API-map inspection and execution.

## Tools

The source of truth for the tool list is the server's own `tools/list` response — counts written here rot, so query the running server. By family:

- **Route map + planning** — `robinhood_api_map_summary`, `robinhood_api_map_directory`, `robinhood_brokerage_describe`, `robinhood_recipes`, `robinhood_routes`, `robinhood_brokerage_routes`, `robinhood_browser_routes`, `robinhood_brokerage_plan`, `robinhood_account_context_workflows`, `robinhood_account_context_url`
- **Account + portfolio reads** — `robinhood_accounts`, `robinhood_positions`, `robinhood_portfolio` (one-call P&L in dollars), `robinhood_buying_power`, `robinhood_quote`, `robinhood_history`, `robinhood_watchlist`, `robinhood_stock_profile`, `robinhood_dividends` (income totals + cadence + projected $/mo·qtr·yr from current holdings), `robinhood_documents` (statements/trade confirms/1099s — returns download URLs only, never writes files), `robinhood_margin` (am I borrowing, how much, at what rate, billed when)
- **Options** — `robinhood_options_strategy_workflows`, `robinhood_options_strategy_plan`, `robinhood_options_contract_plan`, `robinhood_options_contract_link_bundle`, `robinhood_options_enumerate`, `robinhood_options_holdings`, `robinhood_options_inspect`, `robinhood_options_order_flow`, `robinhood_wheel`
- **Execution + settings (double-gated)** — `robinhood_buy`, `robinhood_sell`, `robinhood_cancel`, `robinhood_order_status`, `robinhood_brokerage_execute`, `robinhood_settings`, `robinhood_recurring`
- **Crypto** — `robinhood_crypto_routes`, `robinhood_crypto_sign`, `robinhood_crypto_plan`, `robinhood_crypto_execute`

Read/list/plan/sign tools are annotated read-only. `robinhood_routes` is the unified official Crypto plus brokerage/account map. `robinhood_brokerage_execute` and `robinhood_crypto_execute` are annotated as live/open-world write-capable tools; pass `dryRun: true` to avoid sending.

<!-- Zayd Khan // cold // www.zayd.wtf -->
