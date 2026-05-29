# @zaydiscold/robinhood-cli-mcp

Stdio MCP server for personal Robinhood API-map inspection and execution.

## Tools

- `robinhood_api_map_summary`
- `robinhood_routes`
- `robinhood_browser_routes`
- `robinhood_brokerage_routes`
- `robinhood_brokerage_plan`
- `robinhood_brokerage_execute`
- `robinhood_crypto_routes`
- `robinhood_crypto_sign`
- `robinhood_crypto_plan`
- `robinhood_crypto_execute`

Read/list/plan/sign tools are annotated read-only. `robinhood_routes` is the unified official Crypto plus brokerage/account map. `robinhood_brokerage_execute` and `robinhood_crypto_execute` are annotated as live/open-world write-capable tools; pass `dryRun: true` to avoid sending.
