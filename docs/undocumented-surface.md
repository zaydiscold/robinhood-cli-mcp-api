# Undocumented Surface

The full Robinhood route map combines Robinhood's official Crypto OpenAPI with community brokerage tooling and sanitized authenticated browser capture. The unified map is saved as `api-map/robinhood-routes.json`; the browser-backed brokerage subset remains in `api-map/brokerage-routes.json`.

Official Crypto routes are first-class executable routes in the personal CLI and MCP server. Use `crypto execute` / `robinhood_crypto_execute` for `trading.robinhood.com` routes; use `brokerage execute` / `robinhood_brokerage_execute` for browser-backed brokerage/account routes.

Current counts after the 2026-05-27 deep CDP merge:

- 275 unified route entries.
- 16 official Crypto route entries from Robinhood's published OpenAPI.
- 259 brokerage/account route templates.
- 217 latest authenticated browser route templates.
- 263 normalized unified OpenAPI paths and 266 unified operations in `api-map/openapi/robinhood-unified.openapi.json`.
- 249 normalized OpenAPI paths and 250 operations in `api-map/openapi/robinhood-brokerage-seed.openapi.json`.
- 72 read.
- 182 sensitive-read.
- 4 write-safe.
- 3 write-mutate.
- 8 write-or-sensitive.
- 6 destructive.

2026-05-26 CDP capture:

- Evidence: `api-map/browser-cdp-routes-2026-05-26.json`.
- Source proof: a sanitized CDP capture (`cdp-stock-account-sanitized-2026-05-26.json`) from the browser capture workspace.
- Pages: `/stocks/NVDA`, `/stocks/AAPL`, `/stocks/TSLA`, `/`, `/account`, `/account/history`, `/account/settings`.
- API extraction: 120 `api.robinhood.com` request events collapsed into 93 route templates.
- Stored: origin/path/query-key names, methods, request types, route labels, risk/category annotations.
- Not stored: cookies, auth headers, request bodies, response bodies, localStorage/sessionStorage values, account balances, positions quantities, order tickets.

2026-05-27 deep CDP capture:

- Evidence: `api-map/browser-cdp-routes-2026-05-27.json`.
- Source proof: a sanitized CDP capture (`cdp-stock-account-deep-sanitized-2026-05-27.json`) from the browser capture workspace.
- Pages: NVDA/AAPL/TSLA/HOOD/SPY/QQQ ticker pages, NVDA options, portfolio home, account root/history/settings/contact/security/notifications/documents/statements/transfers, BTC crypto, and markets.
- Raw route observations: 621 route templates.
- Actionable XHR/fetch merge: 217 latest browser routes across `api.robinhood.com`, `bonfire.robinhood.com`, `cashier.robinhood.com`, `dora.robinhood.com`, `identi.robinhood.com`, `minerva.robinhood.com`, and `nummus.robinhood.com`.
- Per-endpoint docs: 275 files in `api-map/markdown/endpoints/`, each with a top-level `Mutation: yes|no` field.

When a new undocumented route is discovered, record:

1. Discovery source.
2. Request method and body shape.
3. Auth/session requirements.
4. Response shape, with secrets redacted.
5. Rate-limit behavior.
6. Risk classification and whether it is safe for `brokerage execute`.
