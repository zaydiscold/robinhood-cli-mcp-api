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
