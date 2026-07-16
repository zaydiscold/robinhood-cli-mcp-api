# Portfolio route-template regression — 2026-07-16

## What was found

PR #36 (`39d31c74`) bundled an MCP discovery-efficiency change with a route-map
regeneration. Commit `45e7226` consolidated captured routes by HTTP method, origin,
and pathname while discarding the executable query template. That deleted distinct
first-class read routes sharing the same path:

- `instruments/?symbol={symbol}`
- `instruments/?ids={ids}`
- `marketdata/quotes/?ids={ids}`
- `marketdata/options/?ids={ids}`
- `marketdata/historicals/{symbol}/`
- `options/instruments/?chain_id=...`
- `positions/?account_number={account_number}&nonzero=true`

The MCP profile reduction was not the cause. The query-template collapse in the API
map was the cause.

The incident also exposed a separate reporting error. The portfolio engine presented
`equity - adjusted_equity_previous_close` as authoritative regular-session P&L even
when that broker baseline diverged materially from fully priced position P&L. The
adjusted account delta is now diagnostic only; regular-session P&L is derived from
the complete priced position set, while after-hours P&L remains the account-level
`extended_hours_equity - equity` delta.

## How it was reproduced

All steps were read-only.

1. Compare the executable route map immediately before and after `45e7226`:

   ```bash
   git show 45e7226^:api-map/brokerage-routes.json
   git show 45e7226:api-map/brokerage-routes.json
   ```

   The pre-change map contained the query-template variants. The regenerated map did
   not.

2. Run the installed portfolio command from the checkout used by Hermes:

   ```bash
   robinhood-cli portfolio --top 0 --json
   ```

   Before repair, quote and option-mark reads failed, `complete` was false, and all
   168 position valuations were reported unavailable or mispriced.

3. Restore query-aware operation keys, regenerate the API artifacts, rebuild both
   packages, and repeat the same read.

   After repair, the live result had 168 priced positions, 86 resolved underlyings,
   `mispricedPositions: 0`, and a complete report. The regular-session position sum
   was negative while the broker-adjusted account delta was positive with a large
   reconciliation residual, proving the second issue.

4. Verify the Hermes registration and live tool roster:

   ```bash
   hermes mcp test robinhood-cli
   ```

   Hermes launched `mcp/dist/server.js` from this checkout and discovered the lean
   15-tool profile. The checkout itself was still on the deleted PR branch at
   `b076933` while GitHub `main` was at `39d31c7`, so source, build, and branch parity
   were not guaranteed.

## Why it matters

A route catalog is an executable allow-list, not just documentation. Query shapes on
the same pathname can represent different first-class operations. Collapsing them can
silently break quotes, option marks, account scoping, and portfolio valuation while
leaving the MCP server healthy enough to answer with authoritative-sounding totals.

Account-level adjusted-equity baselines can also include broker adjustments that do
not equal market P&L. A large residual must not be translated into a confident gain or
loss headline when fully priced holdings show the opposite direction.

## Sanitized evidence

- Breaking commit: `45e7226a9d56b5fbcf1a2d3bd1d99d8c79335f06`
- PR merge: `39d31c74a9b7aed9e79fa87fe12602f4c76dc3dc`
- Route count immediately before regeneration: 313
- Route count immediately after the breaking regeneration: 361
- Repaired route count: 368
- Broken live portfolio: 168 mispriced positions
- Repaired live portfolio: 168 priced positions, 86 underlyings, zero mispriced
- Verification: 437 CLI tests + 18 MCP tests passed; quality and API-map contracts passed

No account numbers, credentials, cookies, order identifiers, or raw private brokerage
responses are stored in this document.

## Permanent guards

- `canonicalOperationKey()` includes normalized query templates.
- The capture merge preserves sorted query keys as placeholders.
- API-map tests assert that the seven first-class query-template routes survive.
- Portfolio tests pin priced-position P&L, after-hours account deltas, missing-mark
  degradation, and the diagnostic-only account-equity delta.
- New portfolio snapshots use schema version 2. Snapshot diffs understand both the
  legacy account-delta schema and the priced-position schema, and compare a v1/v2
  pair on the regular-close equity basis so after-hours movement is not counted as
  a false portfolio-value change.
- `SKILL.md` documents the query-template invariant and live portfolio acceptance
  check.

## Reproducibility

```bash
node scripts/test-cdp-capture.mjs
corepack pnpm test
corepack pnpm quality
python3 scripts/check-skill-integrity.py
node scripts/equity-buy.mjs --preflight
robinhood-cli portfolio --top 0 --json
hermes mcp test robinhood-cli
```

The last three commands touch live read-only account data. Redact account identifiers
and balances before sharing their output.
