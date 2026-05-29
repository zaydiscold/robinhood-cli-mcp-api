# Browser Capture 2026-05-26

## What Was Found

An authenticated Chrome/CDP sweep found 93 unique `https://api.robinhood.com` route templates across stock pages and account pages. Those routes were merged into:

- `api-map/browser-cdp-routes-2026-05-26.json`
- `api-map/robinhood-routes.json`
- `api-map/brokerage-routes.json`
- `api-map/openapi/robinhood-unified.openapi.json`
- `api-map/openapi/robinhood-brokerage-seed.openapi.json`
- `api-map/markdown/robinhood-routes.md`
- `api-map/markdown/brokerage-routes.md`

## How

The capture used a dedicated CDP browser capture workspace and visited:

- `/stocks/NVDA`
- `/stocks/AAPL`
- `/stocks/TSLA`
- `/`
- `/account`
- `/account/history`
- `/account/settings`

The stored proof is sanitized as `cdp-stock-account-sanitized-2026-05-26.json` in the browser capture workspace.

## Why It Matters

The capture moves the personal repo beyond community route guesses. It shows which route families Robinhood web currently touches for ticker pages, portfolio views, account history, and settings, and it adds method, query-key, and route-label evidence for agents planning future calls.

## 2026-05-27 Deep Recapture

The follow-up authenticated CDP pass visited 19 surfaces:

- `/stocks/NVDA`, `/stocks/AAPL`, `/stocks/TSLA`, `/stocks/HOOD`, `/stocks/SPY`, `/stocks/QQQ`
- `/stocks/NVDA/options`
- `/`, `/account`, `/account/history`, `/account/settings`, `/account/settings/account_contact`, `/account/settings/security`, `/account/settings/notifications`
- `/account/documents`, `/account/statements`, `/account/transfers`
- `/crypto/BTC`, `/markets`

Raw route observations: 621 sanitized route templates. Actionable XHR/fetch merge: 217 latest browser route templates across `api.robinhood.com`, `bonfire.robinhood.com`, `cashier.robinhood.com`, `dora.robinhood.com`, `identi.robinhood.com`, `minerva.robinhood.com`, and `nummus.robinhood.com`.

The merged personal API map now has 275 unified route entries after mixing in Robinhood's official Crypto OpenAPI, plus 259 brokerage/account route templates. The unified OpenAPI has 263 paths and 266 operations. It also writes 275 per-endpoint Markdown files under `api-map/markdown/endpoints/`; each starts with `Mutation: yes` or `Mutation: no`.

Deep proof:

- `cdp-stock-account-deep-sanitized-2026-05-27.json` (browser capture workspace)
- `api-map/browser-cdp-routes-2026-05-27.json`

## Raw Evidence Policy

The proof stores URL origin/path/query-key names, methods, request types, masked route labels, and risk/category annotations. It does not store cookies, auth headers, request bodies, response bodies, account balances, holdings quantities, order tickets, or storage values.

## Reproducibility

```bash
pnpm merge:cdp path/to/cdp-stock-account-deep-sanitized-2026-05-27.json
pnpm generate:api-map
pnpm test
```
