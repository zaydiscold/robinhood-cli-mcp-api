# Undocumented Surface

The full Robinhood route map combines Robinhood's official Crypto OpenAPI with community brokerage tooling and sanitized authenticated browser capture. The unified map is saved as `api-map/robinhood-routes.json`; the browser-backed brokerage subset remains in `api-map/brokerage-routes.json`.

Official Crypto routes are first-class executable routes in the personal CLI and MCP server. Use `crypto execute` / `robinhood_crypto_execute` for `trading.robinhood.com` routes; use `brokerage execute` / `robinhood_brokerage_execute` for browser-backed brokerage/account routes.

Current counts after the 2026-06-03 options/account-settings hardening pass:

- 301 unified route entries.
- 16 official Crypto route entries from Robinhood's published OpenAPI.
- 285 brokerage/account route entries.
- 250 latest authenticated browser route templates.
- 267 normalized unified OpenAPI paths and 282 unified operations in `api-map/openapi/robinhood-unified.openapi.json`.
- 253 normalized brokerage OpenAPI paths and 266 brokerage operations in `api-map/openapi/robinhood-brokerage.openapi.json`.
- 77 read.
- 194 sensitive-read.
- 4 write-safe.
- 6 write-mutate.
- 6 write-or-sensitive.
- 14 destructive.

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
- Per-endpoint docs: 301 files in `api-map/markdown/endpoints/`, each with a top-level `Mutation: yes|no` field.

2026-06-02 account-context and XBI options-chain pass:

- Evidence: `api-map/browser-cdp-routes-2026-06-02.json`.
- Workflow map: `api-map/account-context-browser-workflows-2026-06-02.json`.
- Options strategy map: `api-map/options-strategy-workflows-2026-06-02.json`.
- Security note: `docs/security-research-account-number-context-routing-2026-06-03.md`.
- Pages: stock detail/order ticket with account query, investing settings, stock lending, Legend layout, transfers, recurring, classic home, stale stock-options route, and `https://robinhood.com/options/chains/XBI`.
- Actionable XHR/fetch merge: 250 latest browser route templates.
- Key finding: `?account_number=` strongly propagates on stock detail/order-ticket and investing settings; is mixed on options chain, stock lending, account hub, history/documents/tax, and recurring; and is ignored by Legend and transfers in the sanitized capture.
- Options-chain finding: `/options/chains/{symbol}` defaults to the nearest expiration in UI, while expiration/type/side are stateful UI controls backed by `options/chains`, `options/instruments`, `marketdata/options`, and strategy quote/order routes.
- Docs: `docs/account-context-routing-2026-06-02.md` and `docs/options-greeks-strategy-research-2026-06-02.md`.

When a new undocumented route is discovered, record:

1. Discovery source.
2. Request method and body shape.
3. Auth/session requirements.
4. Response shape, with secrets redacted.
5. Rate-limit behavior.
6. Risk classification and whether it is safe for `brokerage execute`.
