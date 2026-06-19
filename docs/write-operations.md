# Write Operations

This is a personal `zaydiscold` repo. It is read/write capable.

## Behavior

- `brokerage execute` sends live HTTP requests when `ROBINHOOD_BROKERAGE_TOKEN` or `ROBINHOOD_COOKIE` is present.
- `crypto execute` sends live HTTP requests to Robinhood's official Crypto Trading API when `ROBINHOOD_CRYPTO_API_KEY` and `ROBINHOOD_CRYPTO_PRIVATE_KEY_B64` are present.
- `--dry-run` is opt-in and returns the execution plan without sending.
- **Writes are env-gated.** Any route whose risk is `write-safe`, `write-mutate`,
  `write-or-sensitive`, or `destructive` is forced to a dry-run UNLESS
  `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set — the single master switch (no per-call `--live-write` needed).
  Without it, `resolveLiveWriteGate` returns `forcedDryRun: true` and the
  request is planned but never sent (the result carries a `liveWriteBlocked` reason).
- Reads (`read`, `sensitive-read`) always run live; no gate applies to them.
- Write-capable risks emit `[WRITES TO LIVE ROBINHOOD]` to stderr before sending.

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

Use exact-action consent for mutations: trade, transfer, cancel, unlink, or destructive calls should only be run when the user asked for that specific live operation.

<!-- Zayd Khan // cold // www.zayd.wtf -->
