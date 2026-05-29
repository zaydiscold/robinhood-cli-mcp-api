# Write Operations

This is a personal `zaydiscold` repo. It is read/write capable.

## Behavior

- `brokerage execute` sends live HTTP requests when `ROBINHOOD_BROKERAGE_TOKEN` or `ROBINHOOD_COOKIE` is present.
- `crypto execute` sends live HTTP requests to Robinhood's official Crypto Trading API when `ROBINHOOD_CRYPTO_API_KEY` and `ROBINHOOD_CRYPTO_PRIVATE_KEY_B64` are present.
- `--dry-run` is opt-in and returns the execution plan without sending.
- There is no `ROBINHOOD_PP_ALLOW_WRITES` or equivalent environment gate here.
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
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --dry-run --json
ROBINHOOD_BROKERAGE_TOKEN=... robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --json
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --dry-run --json
ROBINHOOD_CRYPTO_API_KEY=... ROBINHOOD_CRYPTO_PRIVATE_KEY_B64=... robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --json
```

Use exact-action consent for mutations: trade, transfer, cancel, unlink, or destructive calls should only be run when the user asked for that specific live operation.
