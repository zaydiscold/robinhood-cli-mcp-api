# TODO — robinhood-cli hardening roadmap

## High priority

- [ ] **Web app version auto-scrape**: The `x-robinhood-web-app-version` header rotates periodically. Scrape it from the live browser (CDP) during `scripts/refresh-auth.sh` or on first API call. Currently hardcoded to `2026.24.2030+bc12ef34` in lib.ts.

- [ ] **Order status ticker resolution**: `order-status` shows instrument UUID instead of ticker symbol. Add an instrument lookup call to resolve the UUID to a symbol for display.

- [ ] **Options order live test**: The `buy` command was tested live with equity orders. Options orders use a different body schema (legs, strategy, etc.) and need a live test pass to verify `order_form_version` and other fields.

- [ ] **ref_id on all orders**: Both buy and sell now include `ref_id` for Robinhood-level idempotency. MCP buy/sell tools should also include `ref_id`.

## Medium priority

- [ ] **Summary/dashboard command**: Combine portfolio + bp + top positions into one view. `portfolio` already does most of this; a `summary` alias with different defaults would suffice.

- [ ] **Dollar-value aggregation in positions**: `positions` shows per-account breakdown. Add a `--all` flag that aggregates quantities and values across accounts by symbol.

- [ ] **MCP dedup parity**: CLI buy/sell have dedup checks. MCP `robinhood_buy` and `robinhood_sell` do not — they should use the same `logTrade` + dedup pattern.

- [ ] **Settings MCP read parity**: The CLI `settings show` reads DRIP, PDT, sweep, lending, options level. The original MCP `robinhood_settings` handles reads via its `show` sub-action — verify parity.

## Low priority

- [ ] **Bonfire endpoint mapping**: ~50 more endpoints on `bonfire.robinhood.com` are observable in the browser but not in our route map. Categories: dividends, tax documents, monthly statements, price alerts, instant deposits, debit card management.

- [ ] **Crypto endpoint live test**: Crypto routes exist in the map and MCP tools exist (`robinhood_crypto_*`) but haven't been tested for live order placement.

- [ ] **Browser CDP capture automation**: The route map was built from manual CDP captures. Automate: log into Robinhood in Chrome, drive through all feature pages, capture XHR requests, diff against existing routes, add new ones.

- [ ] **Order confirmation flow**: The web app shows a confirmation modal before placing orders. Capture that DOM flow for order review/safety patterns.

- [ ] **Per-instrument DRIP settings**: The CLI `settings` command shows account-wide DRIP. Per-instrument DRIP (toggle DRIP on/off per symbol) exists in the route map but no CLI command.

## Documentation

- [ ] **API map changelog**: Track route additions/removals over time so the map's freshness is auditable.
- [ ] **MCP tool catalog in SKILL.md**: Full 33-tool inventory with descriptions.
- [ ] **Error code reference**: Common Robinhood API errors and their fixes (order_form_version, subpenny, fractional, app version gate).

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
