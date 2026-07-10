# Safety and workflow features — 2026-07-10

These features are offline or read-only unless explicitly noted. None sends an order.

## Doctor

`robinhood-cli doctor --json` checks Node compatibility, credential-file permissions without
printing values, source/dist route-map parity, inferred mutation counts, required knowledge files,
the live-write gate, share-safe state, and the active MCP profile. MCP: `robinhood_doctor`.

## Durable order lifecycle

`order-watch --id <id>` and `robinhood_order_watch` poll order history through terminal state. A
timeout or transport failure triggers a final history read before `unknown`. Results always report
`retrySafe: false`: an unknown send is never retried before history proves the outcome.

## Options workbench

`options workbench` and `robinhood_options_workbench` analyze an exact leg package: signed premium,
expiry payoff samples, Greeks, collateral/review payloads, roll alternatives, and an approval card
bound to the supplied order body. This is pure analysis.

## Portfolio time machine

`portfolio-snapshot capture|list|diff` and `robinhood_portfolio_snapshot` persist JSONL snapshots
under `local/portfolio-snapshots.jsonl` by default with mode 600. Capture uses the shared portfolio
engine; list/diff are local-only. Diffs include total and per-position drift.

## Share-safe output

Use global CLI `--share-safe` or set `ROBINHOOD_SHARE_SAFE=1`. Recursive redaction masks account
numbers, balances/cash/equity/buying power, order/document identifiers, signed URLs, credentials,
and private notes while preserving public market analytics. `robinhood_share_safe` previews it.

## MCP schemas and profiles

Every MCP tool declares an output schema. New tools have field-specific contracts; legacy tools use
an honest object contract until narrowed. `ROBINHOOD_MCP_PROFILE` accepts `core`, `trading`,
`research`, `admin`, or `full` (default). Protocol tests require exact registry parity for `full`.
