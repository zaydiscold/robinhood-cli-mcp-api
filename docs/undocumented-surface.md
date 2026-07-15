# Undocumented Surface

The full Robinhood route map combines Robinhood's official Crypto OpenAPI with community brokerage tooling and sanitized authenticated browser capture. The unified map is saved as `api-map/robinhood-routes.json`; the browser-backed brokerage subset remains in `api-map/brokerage-routes.json`.

Official Crypto routes are first-class executable routes in the personal CLI and MCP server. Use `crypto execute` / `robinhood_crypto_execute` for `trading.robinhood.com` routes; use `brokerage execute` / `robinhood_brokerage_execute` for browser-backed brokerage/account routes.

Current counts after the 2026-07-14 authenticated structural-schema pass:

- 377 unified route entries.
- 16 official Crypto route entries from Robinhood's published OpenAPI.
- 361 brokerage/account route entries.
- 214 latest authenticated browser operation templates, method-split so GET and
  PATCH/POST schemas cannot contaminate each other.
- 343 normalized unified OpenAPI paths and 365 unified operations in
  `api-map/openapi/robinhood-unified.openapi.json`.
- 329 normalized brokerage OpenAPI paths and 349 brokerage operations in
  `api-map/openapi/robinhood-brokerage.openapi.json`.
- 99 read.
- 236 sensitive-read.
- 11 write-safe.
- 13 write-mutate.
- 7 write-or-sensitive.
- 11 destructive.

2026-07-14 authenticated structural-schema pass:

- Evidence: `api-map/browser-cdp-routes-2026-07-14.json`.
- Detailed capture protocol, coverage, corrections, new route families, raw
  evidence policy, and reproducibility:
  `docs/authenticated-api-map-capture-2026-07-14.md`.
- Coverage: 17 read-only web surfaces, 1,430 sanitized observations, seven API
  hosts, 214 operation templates, 204 response shapes, and 79 operations not in
  the pre-pass map.
- Stored: route/query/header-shape metadata, status codes, content types,
  auth-presence boolean, observation counts, sanitized request/response schemas,
  and capture provenance.
- Never stored: cookies, auth values, query values, account identifiers, balances,
  holdings, order/document/transfer identifiers, or scalar request/response values.

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

2026-06-03 equity-order gate + instrument search (verified live):

- **`POST api.robinhood.com/orders/` — the WEB body.** The legacy mobile body
  (`type`/`quantity`/`price`/`side`) is rejected with _"Your app version is missing important
  stock trading updates. You can still place orders on the web."_ Clearing the gate needs
  (1) web-app headers — now sent by the engine: `x-robinhood-api-version`,
  `x-robinhood-web-app-version`, `x-hyper-ex: enabled`, web `user-agent`, `origin`/`referer` —
  and (2) `order_form_version: 7` + a live bid/ask collar
  (`bid_price`/`ask_price`/`bid_ask_timestamp`) + `market_hours` + `position_effect: open`.
  Dollar-notional MARKET orders on a fractional-tradable name use the NATIVE
  `dollar_based_amount: {amount, currency_code}` body — the broker derives the fill quantity, and
  NO `quantity`/`price` is sent (matching robinhood.com exactly; engine parity landed 2026-06-14,
  `placeEquityOrder`, pinned by `equity-order.test.ts`). The collar (`bid_price`/`ask_price`/
  `bid_ask_timestamp`) is taken from the same live quote so it is fresh — a stale collar is the one
  thing the dollar path rejects on; a one-sided/dead book omits the collar fields rather than sending
  0/NaN. Whole-share, any LIMIT order, and OTC all use `price` + `quantity` (no native dollar form).
  Full body shapes in `AGENTS.md`.
- **Session awareness (`markets/{mic}/hours/{date}/`, verified live).** The engine classifies the
  CURRENT US-equity session from Robinhood's own hours endpoint — `is_open` + `opens_at`/`closes_at`
  (regular) + `extended_opens_at`/`extended_closes_at` — so it is holiday- and half-day-aware (never a
  hardcoded 9:30–16:00 clock; the ET-clock heuristic is the fallback only). Fractional dollar orders
  stay `market_hours: "regular_hours"` (the only value RH accepts there), but `placeEquityOrder` now
  returns the detected `session` and a `sessionWarning` when a fractional/market order is placed
  off-session — it will QUEUE to the next regular session, not fill now. Pinned by
  `equity-order.test.ts` (`computeMarketSession` classification + the queue warnings). Landed 2026-06-14.
- **OTC names** (`otc_market_tier` non-empty, `fractional_tradability: "position_closing_only"`,
  e.g. RNECY) **reject `type: market`** — buy AND sell are both supported, but only as whole
  shares with a marketable **limit** at the marketable side (buy at the ask, sell at the bid;
  the shared engine auto-limits when no explicit price is given).
- **Rate limit:** `orders/` burst-limits _fractional_ orders — ~9 then HTTP **429**
  (_"Too many requests for fractional orders"_ / _"throttled, available in N seconds"_, ~48s
  cooldown). Honor it by sleeping the directed seconds and retrying the same `ref_id` (429 =
  nothing placed). Insufficient funds returns 400 _"You can only purchase 0 shares"_ /
  _"Not enough buying power."_
- **`GET api.robinhood.com/midlands/search/?query=<q>`** — Robinhood's global instrument search
  (the web search bar). Returns `instruments[]` (+ `lists`) with full instrument objects
  (symbol, name, tradability, fractional_tradability, otc_market_tier). Read-only; added to the
  map and wrapped as `brokerage search`. Use it to resolve a name/theme to the exact ticker
  (e.g. "oracle 2x" → ORCX/ORCU) instead of guessing.
- Reference impl: `cli/src/index.ts` `brokerage buy` / `brokerage search`, `scripts/equity-buy.mjs`,
  `scripts/rh-get.mjs`. Receipts (account numbers + order ids) stay in gitignored `info/`.

## 2026-06-15 — Watchlist write surface (`discovery/lists/items/`)

Captured live to wire `watchlist add/remove/create` across CLI + MCP. **Corrects a prior assumption**:
the write endpoint is `discovery/lists/items/`, _not_ `midlands/lists/items/` (the `midlands/lists/*`
entries are unrelated read routes).

1. **Discovery source.** CDP network capture on `robinhood.com` (Add-to-Lists modal → Save), then
   independently API-verified each verb with the session bearer.
2. **Request method + body shape.**
   - Add/remove items — `POST https://api.robinhood.com/discovery/lists/items/`, body keyed by list id:
     `{ "<list_id>": [ { "object_id": "<instrument_uuid>", "object_type": "instrument", "operation": "create" | "delete" } ] }`
     (`create` = add, `delete` = remove; batches many items / many lists in one call). `object_id` is the
     instrument UUID (resolve via `instruments/?symbol=`), never the ticker. `object_type` mirrors the
     list's `allowed_object_types` (`instrument` for equities, `currency_pair`/`option_strategy` otherwise).
   - Create list — `POST https://api.robinhood.com/discovery/lists/`, body `{ "display_name": "...", "icon_emoji"?: "..." }` → 201 (server defaults emoji 💡 + the standard equity `allowed_object_types`).
   - Delete list — `DELETE https://api.robinhood.com/discovery/lists/{id}/` → 204.
3. **Auth/session.** Web-session bearer (`Authorization: Bearer …`) + the standard web headers (origin/referer/`x-robinhood-web-app-version`). Same auth as every other brokerage write.
4. **Response shape.** Items POST echoes the request body (200). Create returns the full list object (id, display_name, owner UUID, allowed_object_types, item_count). Lists are **user-level, not account-scoped** — no `account_number` anywhere.
5. **Rate-limit behavior.** None observed across the capture + verification writes.
6. **Risk classification.** `discovery/lists/items/` POST = `write-mutate` (reversible add/remove);
   `discovery/lists/` POST + `discovery/lists/{id}/` PATCH/DELETE = `destructive`. All env-gated; safe
   for `brokerage execute` only behind both write gates. Wired as first-class `watchlist add/remove/create`.

## 2026-06-19 — Portfolio performance / equity curve (`bonfire …/portfolio/performance/{id}/`)

Wired the first-class `performance` command + `robinhood_performance` MCP tool over the desktop web
app's own portfolio-chart route. **Corrects the prior "deferred — phoenix is TLS-walled" conclusion:**
that was one dead path (`portfolios/historicals/` 404s; `phoenix.robinhood.com` refuses the TLS
handshake), but the modern app reads the equity curve from a reachable `bonfire` route.

1. **Discovery source.** Cross-referenced the route map + CDP `queryKeys`, then live-verified every span (242 pts day · 252 year · 382 all, back to account inception).
2. **Request.** `GET https://bonfire.robinhood.com/portfolio/performance/{account_number}/?display_span={day|week|month|3month|ytd|year|all}&include_all_hours=true&chart_type=historical_portfolio`.
   - **The span param is `display_span`, NOT `span`** (passing `span=` is silently ignored → always `day`).
   - **The trailing slash is required** — `…/performance/{id}` (no slash) returns 200 with an EMPTY body; `…/performance/{id}/` returns the curve. The route-map entry carries the trailing slash for exactly this reason.
   - **Per-account only.** No all-accounts variant (`…/performance/` → 500). Sum client-side for a portfolio-wide curve.
3. **Auth/session.** Standard web-session bearer + web headers. Read-only.
4. **Response shape.** `lines[identifier="returns"].segments[].points[]`; each point's dollar value is `cursor_data.primary_value.value` (formatted string) and its return fraction is `y` (both populated on 100% of points). `performance_baseline.amount` = start equity. The high-precision `price_chart_data` block is INCONSISTENT (null on year/all) — do NOT depend on it. `x` is a 0..1 layout fraction, not a timestamp; the timestamp is `cursor_data.label.value`.
5. **Rate-limit behavior.** None observed across the span sweep.
6. **Risk classification.** `sensitive-read`; safe for `brokerage execute` (read). Wired as `performance` / `robinhood_performance`, engine `computePerformance` (pinned by `cli/test/performance.test.ts`).

When a new undocumented route is discovered, record:

1. Discovery source.
2. Request method and body shape.
3. Auth/session requirements.
4. Response shape, with secrets redacted.
5. Rate-limit behavior.
6. Risk classification and whether it is safe for `brokerage execute`.

<!-- Zayd Khan // cold // www.zayd.wtf -->
