# TODO — robinhood-cli hardening roadmap

## High priority

- [x] **Web app version auto-scrape**: Done 2026-06-11 — `pnpm version:refresh` (`scripts/scrape-web-app-version.mjs`) CDP-attaches to a debug Chrome (port 9222), loads the login page (the SPA shell sends the header pre-auth, no RH login needed), captures `x-robinhood-web-app-version` from the network stream, and writes it to `.env`. Live-verified: captured `2026.24.3589+55c48b8f7a1c`. (Earlier finding: the version is NOT in the homepage HTML — the login-page network capture is the reliable route.)

- [x] **Order status ticker resolution**: ~~`order-status` shows instrument UUID instead of ticker symbol.~~ Done 2026-06-11 — shared `getOrderStatus()` resolves the UUID via `instruments/?ids=`; CLI `order-status` and MCP `robinhood_order_status` both use it.

- [ ] **Options order live test**: The `buy` command was tested live with equity orders. Options orders use a different body schema (legs, strategy, etc.) and need a live test pass to verify `order_form_version` and other fields.

- [x] **ref_id on all orders**: Done 2026-06-11 — `placeEquityOrder()` (shared engine) stamps `ref_id` on every buy/sell from BOTH the CLI and MCP surfaces.

## Medium priority

- [ ] **Summary/dashboard command**: Combine portfolio + bp + top positions into one view. `portfolio` already does most of this; a `summary` alias with different defaults would suffice.

- [ ] **Dollar-value aggregation in positions**: `positions` shows per-account breakdown. Add a `--all` flag that aggregates quantities and values across accounts by symbol.

- [x] **MCP dedup parity**: Done 2026-06-11 — CLI `buy`/`sell` and MCP `robinhood_buy`/`robinhood_sell` now call the SAME `placeEquityOrder()` engine (dedup + `logTrade` + `ref_id` + OTC guard); MCP tools gained the `force` param. Pinned by `cli/test/equity-order.test.ts`.

- [x] **Settings MCP read parity**: Verified 2026-06-11 — MCP `robinhood_settings` `action=show` reads the same DRIP/expiration/PDT/lending/sweep set as CLI `settings show`.

## Low priority

- [ ] **Bonfire endpoint mapping**: ~50 more endpoints on `bonfire.robinhood.com` are observable in the browser but not in our route map. Categories: dividends, tax documents, monthly statements, price alerts, instant deposits, debit card management.

- [ ] **Crypto endpoint live test**: Crypto routes exist in the map and MCP tools exist (`robinhood_crypto_*`) but haven't been tested for live order placement.

- [ ] **Browser CDP capture automation**: The route map was built from manual CDP captures. Automate: log into Robinhood in Chrome, drive through all feature pages, capture XHR requests, diff against existing routes, add new ones.

- [ ] **Order confirmation flow**: The web app shows a confirmation modal before placing orders. Capture that DOM flow for order review/safety patterns.

- [ ] **Per-instrument DRIP settings**: The CLI `settings` command shows account-wide DRIP. Per-instrument DRIP (toggle DRIP on/off per symbol) exists in the route map but no CLI command.

## Documentation

- [ ] **API map changelog**: Track route additions/removals over time so the map's freshness is auditable.
- [x] **MCP tool catalog in SKILL.md**: Done 2026-06-11 — full 37-tool table in SKILL.md §MCP Tools (counts de-hardcoded to "live truth: tools/list").
- [x] **Error code reference**: Done 2026-06-11 — `docs/error-code-reference-2026-06-11.md`, mirroring the `classifyRobinhoodError()` taxonomy one-for-one.

---

## Carried over — June 3, 2026 (from pre-hardening `todo.md`, consolidated at PR #1 merge)

### Auth
- [ ] Fix `pnpm auth:refresh` — can't find Chrome session (headless CDP browser ≠ real Chrome)
- [ ] Alternative: log into robinhood.com in real Chrome, let refresh-auth.sh pick up the token
- [ ] Or: manually copy bearer token from Chrome DevTools → .env

### Route map cleanup
- [x] Remove the 2 agentic GET/PATCH entries — both return 404, endpoint doesn't exist (removed, 307→305 routes)
- [ ] The `agentic_allowed` flag on accounts is a Robinhood server-side property, not toggleable via REST
- [ ] Good news: your own CLI doesn't need agentic_allowed — it trades on any account via web bearer token

### Live auth needed for these verified endpoints (all in api-map, just need working token):
- [ ] `margin/{id}/investing_info/` — margin used, maintenance, available
- [ ] `margin/{id}/settings/` — margin tier, PDT protection toggle (PUT)
- [ ] `margin/{id}/day_trades_card/` — PDT counter
- [ ] `settings/margin/{account}/` — PDT protection toggle
- [ ] `corp_actions/drip/account_settings/{account}/` — DRIP toggle (PATCH)
- [ ] `corp_actions/drip/instrument_settings/{account}/{id}/` — per-stock DRIP (PATCH)
- [ ] `accounts/{account}/sweep_enrollment_state/` — cash sweep toggle (POST)
- [ ] `slip/{account}/status/` — stock lending toggle (PUT)
- [ ] `options/option_settings/{num}/` — options trading settings (PATCH verified!)
- [ ] `accounts/{account}/options_buying_power` — options buying power
- [ ] `options/orders/collateral/` — options collateral pre-check
- [ ] `options/orders/review` — options order review (POST)
- [ ] `options/orders/marketability/` — marketability check (POST)

### Future dashboard ideas
- [ ] Build a `portfolio --deep` command that pulls margin + DRIP + sweep + lending + options settings in one shot
- [ ] Add after-hours tracking (positions endpoint has intraday_quantity, can diff vs yesterday)
- [ ] Map the Kaizen experiments response — shows which features are gated for your account
- [ ] Capture the options P&L endpoint (the web UI shows per-position options P&L, route unknown)
- [ ] Tax-loss harvesting helper (FRCB is $0.01, LWLG bleeding, UI underwater)

### Portfolio snapshot (Jun 3 live)
| Account | Value |
|---------|-------|
| ••••6346 IRA Roth | $[redacted] (equity $[redacted] + options $[redacted]) |
| ••••0497 far 9mo plus | $[redacted] (equity $[redacted] + options $[redacted], margin $[redacted]) |
| ••••9919 near 3mo-roll | $[redacted] (equity $[redacted] + options $[redacted]) |
| ••••9911 Agentic | $0 |
| ••••2523 Agentic-long | $0 |
| **TOTAL** | **$[redacted]** |

<!-- made with love by Zayd Khan / cold -->
