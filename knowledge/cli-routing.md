# CLI and route operations

Load this module when the first-class command surface is unclear, a route is not wrapped, auth or
built output is stale, or the API map needs maintenance. It is an operating reference, not a reason
to bypass the typed commands.

## First-class before raw

Use `robinhood-cli recipes "<intent>"` to route natural language to the narrowest command. Common
families are:

| Family | Commands |
|---|---|
| Account truth | `accounts`, `positions`, `portfolio`, `history`, `performance`, `buying-power`, `margin` |
| Orders | `orders open`, `order-status`, `pretrade`, `buy`, `sell`, `cancel`, `panic` |
| Options | `options positions`, `holdings`, `inspect`, `expirations`, `enumerate`, `chain`, `strategy-quote`, `roll-plan`, `close`, `workbench` |
| Portfolio intelligence | `risk`, `whatif`, `calendar`, `exposure`, `autopilot`, `sentinel`, `income`, `dividends` |
| Discovery | `brokerage search`, `quote`, `news`, `ratings`, `earnings`, `movers`, `stock profile`, `hotlist` |
| Account services | `watchlist`, `recurring`, `settings`, `documents`, `review`, `roll-ledger` |
| Route research | `recipes`, `api-map`, `brokerage describe`, `brokerage routes`, `brokerage plan`, `brokerage execute` |
| Official Crypto API | `crypto routes`, `crypto sign`, `crypto plan`, `crypto execute` |

The current CLI help and MCP `tools/list` are authoritative. Do not maintain a hardcoded command or
tool count in prose.

## Build and auth

Requirements: Node 20 or newer and pnpm.

```bash
pnpm install
pnpm --filter @zaydiscold/robinhood-cli build
pnpm --filter @zaydiscold/robinhood-cli-mcp build
node cli/dist/index.js --help >/dev/null
node scripts/equity-buy.mjs --preflight
```

The browser-session bearer lives in the gitignored repo-root `.env` as
`ROBINHOOD_BROKERAGE_TOKEN`. The engine loads it on import and attempts one refresh after a 401.
Force a refresh with `pnpm auth:refresh`, then retry the failed read once. Do not use the OAuth
refresh-token grant: rotating that token can invalidate the live web session.

The source route map is copied into built output. Runtime behavior therefore does not change after a
map edit until the CLI is rebuilt. Verify the built route count rather than asserting a fixed count:

```bash
node cli/dist/index.js brokerage routes --json \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])"
```

The installed `robinhood-cli` binary, a symlinked entrypoint, and `node cli/dist/index.js` should all
resolve to this checkout's current build. Diagnose runtime truth with `robinhood-cli doctor` before
assuming a source-only change is live.

## Raw route matching

`brokerage execute "<query>"` substring-matches a mapped route URL. It then fills placeholders,
appends query parameters, classifies the method/risk, checks the write gate, and sends or returns a
dry-run plan.

Rules:

1. Match the template, not a concrete account number: use `portfolios/{account_number}/` plus
   `--param account_number=<N>`.
2. Append dynamic query values with repeatable `--query-param key=value`; do not put them into the
   match query unless they are part of the canonical mapped template.
3. GET and POST can share a URL. Every raw write must pass `--method POST|PATCH|PUT|DELETE`.
4. Method-aware matching must fail closed if no mapped write route supports that method.
5. Keep the default truncated output unless raw evidence is necessary; `--full` can be very large.
6. A route-map entry proves only that a surface exists. It does not prove the current request body,
   account capability, or a verified first-class write.

```bash
# Describe before executing
robinhood-cli brokerage describe "portfolios/{account_number}/" --json

# Read a mapped route
robinhood-cli brokerage execute "portfolios/{account_number}/" \
  --param account_number=<ACCOUNT_NUMBER> --json --full

# Add query values after matching
robinhood-cli brokerage execute "positions/" \
  --query-param account_number=<ACCOUNT_NUMBER> \
  --query-param nonzero=true --json

# Preview a raw POST; no live write
robinhood-cli brokerage execute "orders/" --method POST \
  --body-json '<CURRENT_CAPTURED_BODY>' --dry-run --json
```

Prefer `positions --account <N>` and typed order commands to the raw examples above.

## Critical query shapes

| Task | Route shape | Operational note |
|---|---|---|
| Complete account graph | `bonfire.robinhood.com/transfer/accounts/` | Bare `accounts/` may under-report |
| Per-account portfolio | `portfolios/{account_number}/` | Use explicit account placeholder |
| Nonzero equity positions | `positions/` + `account_number`, `nonzero=true` | Returns instrument UUIDs |
| Instruments and tickers | `instruments/?ids={ids}` | Batch-resolve UUIDs |
| Quotes by instrument | `marketdata/quotes/?ids={ids}` | Batch price lookup |
| Custom watchlists | `discovery/lists/` + `owner_type=custom` | Owner type is mandatory |
| Equity order list/create | `orders/` | GET and POST share URL; method matters |
| Option chain metadata | `options/chains/{id}/` | Expirations and min-tick rules |
| Option contracts | `options/instruments/` with chain/date/type filters | Enumerate before ordering |
| Option order list/create | `options/orders/` | Method and live-write gate matter |
| Recurring schedules | `bonfire.robinhood.com/recurring_schedules/` | Prefer first-class `recurring` |
| Funding surfaces | cashier ACH/payment-instrument routes | High risk; read first, never infer body |

## Portfolio attribution

For “why am I down today?” do not hand-join positions and percentage moves. Use:

```bash
robinhood-cli portfolio --day
robinhood-cli portfolio --after-hours
robinhood-cli portfolio --by position --top 10 --json
```

The command composes account portfolios, positions, equity quotes, and option marks, then attributes
the change by underlying in dollars and prints a reconciliation line. Per-account
`equity_previous_close` can be unusable; the command knows the correct historical field and handles
the cross-account join.

## Account-aware web verification

API/CLI/MCP evidence is primary. Use the browser only to validate UI state or discover a UI-backed
route absent from the map. Attach to the existing logged-in debug session rather than opening another
profile. Account-pinnable URLs may use `?account_number=<N>`, but direct API account fields remain the
source of truth.

Useful research commands:

```bash
robinhood-cli api-map account-context --json
robinhood-cli api-map account-url stock-detail-order-ticket \
  --account <ACCOUNT_NUMBER> --symbol AAPL --instrument-id <UUID>
robinhood-cli api-map options-contract-plan \
  --account <ACCOUNT_NUMBER> --symbol AAPL --expiration <YYYY-MM-DD> \
  --type call --side buy --strike <STRIKE> --json
```

A browser click or review screen is never execution evidence.

## Adding or repairing a route

1. Search the current map and first-class commands before capturing anything new.
2. Capture the authenticated request from the web app; preserve method, host, path, query keys,
   headers needed for compatibility, and a sanitized request/response sample.
3. Add the route to `api-map/brokerage-routes.json` with a conservative risk classification and a
   canonical `url` field.
4. Rebuild the CLI so `cli/dist/api-map/` receives the source map.
5. Describe and dry-run the route through the built CLI.
6. Add a focused regression test for method selection, placeholders, or response parsing.
7. Document what was found, exact steps/tools, why it matters, sanitized raw evidence, and a
   reproducible check in `docs/undocumented-surface.md`.

Never test an unknown mutation live merely to discover its body. Capture the browser request or work
from an existing sanitized fixture first.

## Known footguns

- Watchlist reads need `owner_type=custom`; rename uses `display_name`; the Options Watchlist cannot
  be deleted; item reorder remains distinct from verified add/remove.
- Equity and option positions return UUIDs, not ticker strings. Resolve in batches.
- A forced write method must not degrade to a GET route with a weaker risk class.
- Option limits must follow each chain's current tick schedule.
- Crypto uses API-key/Ed25519 signing, not the brokerage bearer token.
- Cross-machine token transfer and network connectivity are separate problems. Verify both; never
  print `.env` while diagnosing either.

Deep references: [AGENTS.md](../AGENTS.md), [auth](../docs/auth.md),
[CLI/MCP architecture](../docs/cli-mcp-architecture.md), and
[undocumented surface](../docs/undocumented-surface.md).
