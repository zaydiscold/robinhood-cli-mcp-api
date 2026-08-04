# Authenticated Robinhood Legend contract pass — 2026-08-04

## Evidence

A controlled reload of an authenticated Robinhood Legend page was captured through Chrome DevTools' **Export HAR (sanitized)** action. The raw export was reduced locally and deleted. The retained artifact is:

- `research/captures/robinhood-legend-boot-2026-08-04.routes.json`
- 8,770 requests reduced to 207 unique method/host/path/query-key/status shapes
- no headers, cookie objects, query values, request payloads, response bodies, account numbers, or generated asset hashes retained

## Fresh authenticated contracts

The pass live-observed account graph and buying-power reads, Ceres futures subaccounts, aggregated futures positions and P&L cost-basis counts, recent-order summaries, options settings/history/positions/chains/stats, equity/futures/crypto buying power, Gold subscription and sweep interest, alerts, earnings, SSR/shorting context, screeners, streaming token/bootstrap, and multi-span performance-summary requests.

## Product decisions

### `account-pulse`

The promoted read-only composite fans out across the complete `transfer/accounts/` graph and returns:

- account last four + label
- options buying-power object
- recent-order count and failed asset-type diagnostics
- normalized options expiration/short-share settings without the raw account echo
- optional Ceres futures account types, aggregated-position count, and cost-basis-contract count
- per-surface warnings instead of whole-command failure

### Ceres classification

`GET /ceres/v1/accounts?rhsAccountNumber=...` resolved `SWAP`, `FUTURES`, and `CFTC_30_7` rows for a supported account and no rows for others. Therefore Ceres is treated as an optional futures subsystem. It is **not** presented as universal brokerage P&L.

### Performance summary remains mapped-only

The browser proved `/portfolios/v2/performance/summary` with query keys `rhsAccountNumber`, `spans`, `metrics`, and sometimes `assetClasses`. Three guessed comma-separated enum sets failed live. No wrapper is shipped until public-bundle/runtime evidence establishes the exact value grammar. Method/path/query-key evidence alone is not a complete request contract.

## Safety

All promoted behavior is read-only. No order review/submission, transfer, enrollment, settings mutation, or money movement is performed.
