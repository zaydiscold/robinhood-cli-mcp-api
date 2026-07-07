# @zaydiscold/robinhood-cli

TypeScript CLI for the repo's mapped Robinhood brokerage/account surface and
official Crypto API helpers. This package is the human/script front door over
the shared engine in `cli/src/lib.ts`; the MCP server imports the same engine.

## Safety Model

- Reads run live with caller-owned auth.
- Brokerage writes are dry-run by default unless
  `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set.
- `--dry-run` always previews and sends nothing, even when the live-write switch
  is set.
- Use exact-action consent before trades, cancels, transfers, settings changes,
  or any destructive route.
- Order history is the only proof an order happened.

## Build

```bash
pnpm install
pnpm --filter @zaydiscold/robinhood-cli build
node cli/dist/index.js --help
```

The build copies `api-map/` into `cli/dist/api-map/`. Rebuild after route-map
edits or runtime behavior will still use the old dist copy.

## Common Reads

```bash
robinhood-cli accounts --json
robinhood-cli portfolio --after-hours --json
robinhood-cli positions --json
robinhood-cli options positions --json
robinhood-cli quote MRVL NVDA AAPL
robinhood-cli recipes "why am I down after hours"
robinhood-cli brokerage describe "orders/" --json
```

Prefer first-class commands over raw `brokerage execute`; they handle joins,
query params, account discovery, and instrument UUID resolution for you.

## Dry-Run and Live Writes

```bash
# Dry-run by default: builds the order plan and sends nothing.
robinhood-cli buy -s AAPL -a <ACCOUNT_NUMBER> -m 25

# Live: set the one switch inline for this command.
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli buy -s AAPL -a <ACCOUNT_NUMBER> -m 25

# Raw mapped write: method is mandatory when GET and POST share a URL.
robinhood-cli brokerage execute "https://api.robinhood.com/orders/" \
  --method POST --body-json '{...}' --json
```

`brokerage execute` matches mapped URL templates by substring and fills
`{placeholders}` with `--param name=value`. It is method-aware, so
`--method POST` resolves the write route instead of the read route.

## Crypto API

Crypto uses Robinhood's official signed Crypto Trading API and separate Ed25519
credentials:

```bash
robinhood-cli crypto sign \
  --api-key "$ROBINHOOD_CRYPTO_API_KEY" \
  --private-key-b64 "$ROBINHOOD_CRYPTO_PRIVATE_KEY_B64" \
  --path /api/v1/crypto/trading/accounts/ \
  --method GET

robinhood-cli crypto execute \
  "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" \
  --query-param symbol=BTC-USD --json
```

For the full operating guide, see the repo root `README.md`, `SKILL.md`,
`AGENTS.md`, and `docs/cli-mcp-architecture.md`.

<!-- Zayd Khan // cold // www.zayd.wtf -->
