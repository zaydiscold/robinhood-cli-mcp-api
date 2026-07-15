# Authenticated API-Map Capture, 2026-07-14

## Purpose

This pass upgrades the authenticated Chrome/CDP pipeline from a route inventory
into a value-free structural API map. The captured evidence can now describe:

- HTTP method, normalized route template, host, and query-key names;
- XHR/fetch type, observed status codes, and content types;
- read/write risk, authentication presence as a boolean, and UI surfaces;
- request-body and response-body field shapes without retaining values;
- capture timestamp, schema version, observation count, and provenance.

The live browser sweep is read-only. It must not submit an order, transfer money,
cancel an order, change account settings, alter a watchlist, or invoke any other
mutation.

## Why It Matters

The earlier route map proved that a route existed, but agents still had to guess
which fields a request accepted and what shape a response returned. Shape-only
schemas make `brokerage describe`, the generated OpenAPI, CLI route planning, and
MCP route discovery more precise while keeping private account data out of Git.

This also separates three different confidence levels that were previously easy
to blur:

1. community or source-code seed;
2. authenticated browser route observation;
3. authenticated browser route plus structural request/response observation.

## Capture Surfaces

The default read-only sweep covers these UI families when available:

| Family     | Example surface                      | Safe action                             | Forbidden action                               |
| ---------- | ------------------------------------ | --------------------------------------- | ---------------------------------------------- |
| Portfolio  | home, account selector, buying power | navigate and read                       | deposit, transfer, subscribe                   |
| Equities   | stock and ETF detail                 | change chart span, open research panels | submit or queue an order                       |
| Options    | chain, contract detail, holdings     | change expiration/type filters          | review, submit, close, or roll                 |
| History    | orders, dividends, transfers, cash   | filter and paginate                     | cancel or repeat an action                     |
| Documents  | statements, confirms, tax center     | list document metadata                  | download private document bodies into the repo |
| Watchlists | list and item views                  | open existing lists                     | add, remove, create, reorder                   |
| Recurring  | schedules and detail views           | inspect existing schedule metadata      | create, pause, edit, delete                    |
| Account    | settings, security, notifications    | read the current state                  | toggle or save any setting                     |
| Lending    | stock-lending status/history         | read status and history                 | enroll, disable, change election               |
| Research   | search, news, ratings, earnings      | search and navigate                     | reject unexpected writes                       |
| Crypto     | holdings and instrument detail       | navigate and read                       | submit, send, receive, or transfer             |

## Sanitization Contract

Raw captures belong under gitignored `info/`. A tracked capture must satisfy all
of these properties:

- URLs retain only allowed Robinhood origins, normalized paths, and query-key
  names. Query values are discarded.
- UUIDs, long numeric identifiers, account-style identifiers, and opaque path
  segments are replaced with placeholders.
- Authorization headers, cookies, session values, CSRF values, and all other
  header values are discarded. Only content type and an authentication-present
  boolean may survive.
- Request and response bodies are converted recursively into JSON Schema-like
  type shapes. No scalar value survives.
- Object traversal is bounded to six levels and 200 properties; array sampling
  is bounded to five elements; raw body parsing is bounded to 2 MB.
- Non-Robinhood origins, non-XHR/fetch requests, preflight requests, and malformed
  URLs are rejected.
- The sanitizer writes with owner-only permissions (`0600`).

The regression fixture includes fake bearer, cookie, account, order, and query
values and fails if any sentinel survives in sanitized JSON.

## Exact Pipeline

```text
authenticated Robinhood tab
        |
        v
Chrome/CDP request metadata and selected JSON bodies
        |
        v
gitignored raw capture in info/
        |
        v
sanitize-cdp-capture.mjs
  - origin allowlist
  - route normalization
  - value-free schema inference
  - bounded traversal
        |
        v
sanitized routeIndex JSON
        |
        v
merge-cdp-capture.mjs
  - deduplicate by method plus canonical host/path
  - union methods, query keys, statuses, schemas, and surfaces
  - preserve provenance and observation counts
        |
        v
generate-brokerage-openapi.mjs
  - requestBody shapes
  - status-specific response shapes
  - observed auth/security metadata
        |
        +--> CLI brokerage search/describe/plan/execute
        +--> MCP brokerage routes/describe/plan/execute
```

## Reproducibility

```bash
# Raw input is private and gitignored.
pnpm sanitize:cdp info/cdp-raw-2026-07-14.json \
  info/cdp-sanitized-2026-07-14.json portfolio-home

pnpm merge:cdp info/cdp-sanitized-2026-07-14.json
pnpm generate:api-map
pnpm test:api-map
pnpm quality
pnpm test
```

Before merging, inspect the staged diff for accidental values and run a sentinel
scan against account numbers, cookies, authorization strings, balances, holdings,
order IDs, document identifiers, and transfer identifiers. Do not publish the raw
capture or browser screenshots containing financial data.

## Raw Evidence

The structural sanitizer and its adversarial fixture are implemented in:

- `scripts/lib/cdp-capture.mjs`
- `scripts/sanitize-cdp-capture.mjs`
- `scripts/test-cdp-capture.mjs`
- `scripts/merge-cdp-capture.mjs`
- `scripts/generate-brokerage-openapi.mjs`

## Authenticated Sweep Results

The live pass used the shared debug Chrome session plus background Computer Use
window inspection. CDP attached to the already-authenticated Robinhood Legend
tab, then opened a separate background tab so the operator's layout was not
replaced. Each surface was navigated directly, observed for five to six seconds,
and had representative JSON bodies converted to schemas before the next
navigation (Chrome discards many older response bodies after later navigations).

Coverage:

- 17 read-only surfaces: Legend/portfolio, AAPL, XBI options chain, BTC, markets,
  history, documents, reports/statements, tax center, recurring, transfers,
  stock lending, general settings, security, notifications, and investing;
- 1,430 sanitized XHR/fetch observations before method/path grouping;
- 214 captured operation templates across seven Robinhood API hosts;
- 206 GET, six POST, and two PATCH operation templates;
- 204 operations with at least one value-free response shape and three with a
  request-body shape;
- observed status codes 200, 201, 400, and 404;
- 157 sensitive reads, 49 public/non-account reads, and eight automatic
  write-safe UI/telemetry operations;
- 79 operation templates not present in the pre-pass brokerage map;
- the merged map now contains 361 brokerage/account route entries and 377 unified
  brokerage plus official-Crypto entries.

Representative new or newly verified families include:

- Legend: `hippo/bw/layouts`, groups, widget settings, chart comparisons/drawings,
  `wormhole/bw/orders/recent`, and `portfolios/v2/performance/summary`;
- pre-trade/account: `orders/order_checks/presubmit_data`, futures buying power,
  option buying power, currency buying power, margin upgrade restrictions, and
  recent day trades;
- market data: SSR, fundamentals, insider/hedge-fund summaries and transactions,
  option-chain stats, indexes, base indicators, and the market-data token route;
- futures: products, eligibility, account state, aggregated positions, cost-basis
  P&L, and order reads;
- account surfaces: activity-report orchestration, tax-center hub, stock-lending
  hub/status, contact/preferences/notifications cards, Gold fee/boost history,
  DRIP enrollment, and subscription state.

Route corrections and anomalies:

- `/account/documents` redirected to
  `/account/reports-statements/activity-reports`.
- `/account/settings` redirected to `/account/settings/account_contact`.
- The attempted `/account/settings/notifications` page redirected to account
  contact, while its underlying `settings_page/notifications/` API returned 400.
  The route remains captured with the failure status rather than being presented
  as a verified successful read.
- Three other observed GETs returned 404: an IAV-bank detail, a referral-card
  lookup, and trusted-contact state. They remain evidence of attempted web-app
  calls, not proof that a successful endpoint contract exists.
- Normal page loading emitted two Legend PATCHes plus telemetry POSTs and a
  notification-receipt `seen` POST. These were observed, never replayed, and are
  classified `write-safe`; no brokerage order, transfer, cancellation, watchlist
  change, recurring change, or account-setting save occurred.

The route card exposed by both CLI `brokerage describe` and MCP
`robinhood_brokerage_describe` now returns status codes, auth observation,
content types, observation count, UI surfaces, provenance, request schema, and
status-specific response schemas. Human-readable CLI output stays compact; the
full schemas appear only in JSON/structured output for one requested route.

This document and the tracked API-map artifacts intentionally contain no account
numbers, balances, holdings, cookies, authorization values, scalar response
values, document identifiers, or order identifiers. Private sanitized working
captures remain under gitignored `info/` with owner-only permissions.

<!-- Zayd Khan // cold // www.zayd.wtf -->
