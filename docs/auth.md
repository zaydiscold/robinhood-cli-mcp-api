# Authentication Notes

## Official Crypto API

Robinhood Crypto Trading API requests require:

- `x-api-key`: the API key from Robinhood Crypto account settings.
- `x-timestamp`: Unix timestamp in seconds.
- `x-signature`: Ed25519 signature over `apiKey + timestamp + path + method + body`.

The CLI supports signature generation:

```bash
robinhood-cli crypto sign \
  --api-key "$ROBINHOOD_API_KEY" \
  --private-key-b64 "$ROBINHOOD_PRIVATE_KEY_B64" \
  --timestamp 1698708981 \
  --path /api/v1/crypto/trading/accounts/ \
  --method GET
```

`ROBINHOOD_PRIVATE_KEY_B64` is the base64 Ed25519 private key seed from Robinhood's credential flow. Do not commit it.

The CLI also supports live official Crypto API execution with caller-owned credentials:

```bash
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" \
  --query-param symbol=BTC-USD \
  --dry-run \
  --json

ROBINHOOD_CRYPTO_API_KEY=... \
ROBINHOOD_CRYPTO_PRIVATE_KEY_B64=... \
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" \
  --query-param symbol=BTC-USD \
  --json
```

`ROBINHOOD_API_KEY` and `ROBINHOOD_PRIVATE_KEY_B64` are accepted as aliases for the official Crypto API credentials, but the `ROBINHOOD_CRYPTO_*` names are preferred when the same shell also has brokerage/session credentials.

## Brokerage / Account Surface

The brokerage/account executor sends requests with caller-owned session material from the environment:

- `ROBINHOOD_BROKERAGE_TOKEN`: bearer token for `Authorization: Bearer ...`.
- `ROBINHOOD_COOKIE`: full Cookie header for browser-session replay.
- `ROBINHOOD_CSRF_TOKEN`: optional `x-csrftoken` value when a route requires it.

Keep these outside the repo. The CLI never writes them to the API map, docs, proofs, or generated fixtures.

```bash
ROBINHOOD_BROKERAGE_TOKEN=... robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --json
ROBINHOOD_COOKIE=... robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --json
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --dry-run --json
```

Live execution is personal-side behavior. There is no `*_ALLOW_WRITES` environment gate in this repo; `--dry-run` is the opt-in non-sending mode.
