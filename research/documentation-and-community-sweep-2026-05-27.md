# Robinhood Documentation And Community Sweep - 2026-05-27

## What Was Checked

This sweep combined official docs, public GitHub/npm references, X/Bird signal, and authenticated browser capture. The goal was to avoid a browser-only map: official Crypto API docs and public brokerage wrapper knowledge are tracked beside the CDP-discovered account/stocks/options surface.

## Official Sources

- `https://docs.robinhood.com/crypto/trading/` documents the official Robinhood Crypto Trading API, including Ed25519 signatures, `x-api-key`, `x-signature`, `x-timestamp`, v1/v2 account and trading endpoints, market data, holdings, orders, and cancellations.
- `https://robinhood.com/us/en/support/articles/crypto-api/` documents API credential creation from web classic, API action permissions, v1/v2 behavior, US availability, and fee-tier notes.
- `https://robinhood.com/us/en/newsroom/robinhood-crypto-trading-api` gives public launch context for market data, portfolio/account info, and crypto orders.

No official public stock/options/brokerage API docs were found in this lap. The non-crypto brokerage/account surface remains browser-backed and community-cross-checked.

## Public / Community Sources

- `https://github.com/jmfernandes/robin_stocks` remains the main broad unofficial brokerage wrapper source.
- `https://robin-stocks.readthedocs.io/` documents account, positions, order, options, and market-data helpers that align with many `api.robinhood.com` route families.
- npm signal includes `rhx`, `@opentabs-dev/opentabs-plugin-robinhood`, and `robinhood-for-agents`; these are tracked as public integration signals, not authoritative specs.

## Added To Map

- `api-map/documentation-sources-2026-05-27.json` records official, community, and browser evidence sources with mutation notes.
- `api-map/robinhood-routes.json` is the unified official Crypto plus brokerage/account route inventory.
- `api-map/openapi/robinhood-unified.openapi.json` is the mixed OpenAPI surface for agents that want one spec.
- `api-map/brokerage-routes.json` remains the browser-backed brokerage/account subset used by brokerage execution commands.
- `api-map/browser-cdp-routes-2026-05-27.json` is the latest authenticated browser capture.
- `api-map/markdown/endpoints/` contains one file per merged endpoint, each starting with `Mutation: yes|no`.

## 2026-05-27 Crypto Execution Follow-Up

Robinhood's official Crypto Trading API is now not just signed by the CLI; it is executable through the same personal live-capable model as brokerage routes.

- `crypto execute` signs and sends mapped `trading.robinhood.com` routes with `x-api-key`, `x-timestamp`, and `x-signature`.
- `ROBINHOOD_CRYPTO_API_KEY` and `ROBINHOOD_CRYPTO_PRIVATE_KEY_B64` are the preferred env names; `ROBINHOOD_API_KEY` and `ROBINHOOD_PRIVATE_KEY_B64` remain accepted aliases.
- `--dry-run` returns the exact URL, signing path, risk label, mutation flag, and required auth headers without sending.
- Duplicate official paths such as `/api/v2/crypto/trading/orders/` are method-selected so POST order placement inherits `write-mutate`, not the GET order-list `sensitive-read` risk.
- MCP now exposes `robinhood_crypto_plan` and `robinhood_crypto_execute` beside the existing map, brokerage, and signing tools.

## Risk Notes

Official Crypto routes are live write-capable in the personal CLI. The personal repo has no env gate; use `--dry-run` when testing. The PP-side package keeps writes gated with `ROBINHOOD_PP_ALLOW_WRITES=1`.
