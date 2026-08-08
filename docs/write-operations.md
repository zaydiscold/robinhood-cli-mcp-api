# Write Operations

This is a personal `zaydiscold` repo. It is read/write capable.

## Behavior

- Read routes send live HTTP requests when the relevant caller-owned auth is present.
- `--dry-run` returns the execution plan without sending and always wins, even when the live-write switch is set.
- **Writes are env-gated.** Any route whose risk is `write-safe`, `write-mutate`,
  `write-or-sensitive`, or `destructive` is forced to a dry-run UNLESS
  `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set — the single master switch (no per-call `--live-write` needed).
  Without it, `resolveLiveWriteGate` returns `forcedDryRun: true` and the
  request is planned but never sent (the result carries a `liveWriteBlocked` reason).
- Reads (`read`, `sensitive-read`) always run live; no gate applies to them.
- Write-capable risks emit `[WRITES TO LIVE ROBINHOOD]` to stderr before sending.
- **Route provenance is enforced.** A live mutation must resolve to
  `verificationStatus: captured|live_verified` (or the method-specific equivalent).
  `inferred` and `deprecated` routes are forced to dry-run even when the master switch is armed.
- Raw CLI/MCP execution uses the same ownership verification, notional/session caps, route
  provenance, and append-only audit log as first-class writes; it is not a policy bypass.

## Risk Levels

- `read`: public or market-data style read.
- `sensitive-read`: account, position, document, user, or support-adjacent read.
- `write-safe`: live write that should not mutate account state, such as telemetry.
- `write-mutate`: live route expected to mutate account state.
- `write-or-sensitive`: route may mutate state or expose especially sensitive state.
- `destructive`: cancel, unlink, disable, or otherwise destructive route.

## Examples

```bash
# Read (runs live, no gate):
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --json

# Write, switch OFF → forced dry-run (safe; prints the plan + liveWriteBlocked reason):
robinhood-cli brokerage execute "https://api.robinhood.com/orders/" --method POST \
  --body-json '{"account":"...","instrument":"...","symbol":"F","type":"limit","time_in_force":"gfd","trigger":"immediate","price":"9.00","quantity":"1","side":"buy"}'

# Write, the ROBINHOOD_ALLOW_LIVE_WRITE=1 switch ON → sends live:
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli brokerage execute "https://api.robinhood.com/orders/" \
  --method POST --body-json '{...}'

# Crypto read:
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --json
```

Use exact-action consent for mutations: trade, transfer, cancel, unlink, or destructive calls should only be run live when the user asked for that specific live operation.

## Product-specific boundaries

The generic write gate does not manufacture a missing product contract:

- **Ordinary regular-session equity orders** have an implemented gated submit/history/cancel lifecycle.
- **Exact-lot sells** are live-read + dry-run-plan only. `tax-lots sell` fails closed before submission even when `ROBINHOOD_ALLOW_LIVE_WRITE=1` is armed. Do not strip the lot fields and call a generic sell “exact-lot proof.”
- **IPO Access** is read-only request planning. Submit/update/cancel method, URL, serializer, and disclosure acceptance contract remain `not_evaluated`; never improvise a generic order POST.
- **24-hour / overnight equity** has an evidence-backed whole-share limit dry-run contract, but live non-regular submission fails closed until account/session order-check and final review evidence are captured.
- A route being mapped, a request body being generated, or a preflight returning data is not evidence that a financial write was accepted. Reconcile real orders through order history and terminal state.

<!-- Zayd Khan // cold // www.zayd.wtf -->
