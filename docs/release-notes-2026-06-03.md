# Release Notes: 2026-06-03

This pass focuses on options execution planning, account-settings safety, docs
navigation, and agent usability. No live trades, transfers, or account-setting
mutations are part of this release.

## Added

- `options strategy-quote` support for per-leg expirations, package bid/ask
  pricing, strategy quote URLs, natural/mid/protective limit math, net Greeks,
  and dry-run `options/orders/` bodies.
- `options roll-plan` for staged cash-account rolling: close now, open later,
  recheck settled cash and live quotes before the replacement leg.
- `api-map options-contract-links` for exact-contract API resolution plus
  account-pinned chain/link bundle output.
- `stock profile <symbol>` plus MCP `robinhood_stock_profile` for quote,
  fundamentals, description, borrow, and optional account-scoped buying-power
  and margin context.
- `docs/README.md` as the public docs index.
- `docs/account-settings-capability-map-2026-06-03.md` and
  `api-map/account-settings-capability-map-2026-06-03.json` for funding,
  recurring, DRIP, high-yield cash/sweeps, stock lending, options settings,
  futures, event contracts, and margin/account-type boundaries.

## Changed

- Split mixed read/write runtime routes by method so reads stay live and writes
  stay double-gated:
  - ACH relationships
  - ACH transfers
  - DRIP enrollment
  - Nummus orders
  - agentic account config
- Regenerated brokerage and unified OpenAPI/Markdown/curl outputs.
- Updated route-map counts to 285 brokerage/account entries and 301 unified
  route entries.
- Refined README top/bottom presentation, referral placement, socials, and star
  history.
- Expanded `SKILL.md` with account capability, options strategy, and MCP tool
  references.

## Verified

- Built CLI route map reports:
  - 285 brokerage/account route entries.
  - zero write methods with read-level risk.
  - zero combined `GET` plus write-method route entries.
  - zero explicit GET-only routes carrying write-level risk.
- Sanitized live account graph read returned status `200` and an account/funding
  shape with deposit, withdrawal, and recurring-source eligibility fields.
- Earlier strategy smoke pass covered long calls, naked shorts, call/put debit
  spreads, call/put credit spreads, iron condors, calendar-style rolls, and
  cash-account staged roll dry-run bodies.

## Boundaries

- High-yield cash/sweep, stock-lending enablement, futures enablement, event
  contract enablement, options-level changes, and account-type/margin switching
  remain route-map or browser-observed surfaces unless a fresh captured mutation
  route/body is added and explicitly approved.
- Exact unopened-contract URL selection is still not claimed. Exact contract
  resolution is API-first; web/app links are navigation handoffs.
