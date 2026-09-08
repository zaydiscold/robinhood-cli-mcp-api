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

Live execution is personal-side behavior. Writes are env-gated by `ROBINHOOD_ALLOW_LIVE_WRITE=1` — the single master switch; without it, every write is a dry-run. `--dry-run` is accepted but no longer the gate; the environment variable is the sole live-write control.

## Recovering a browser-session bearer

This is an **operator recovery procedure**, not a promise that every installed copy can refresh itself. `pnpm auth:refresh` discovers local Chromium state and configured CDP endpoints, ranks existing candidates by JWT expiry, validates a staged candidate with a read-only `accounts --json` request, and then atomically promotes it to `.env`. It does not log in, complete MFA, call an OAuth refresh-token grant, or mint a new 30-day browser session.

1. Start with the local sources. A LevelDB scan can legitimately find no usable token while a logged-in Chrome debug target still has `localStorage["web:auth_state"]` in memory. The refresh script checks CDP (including port 9222) as well as supported Chromium storage; a successful extractor must report `auth_state=yes token_written=yes`.
2. Do not infer that a remote browser or laptop is asleep or logged out from a Tailscale/SSH timeout. Check an independently authorized LAN route when one is available, then evaluate the browser state there. Do not put hostnames, addresses, account details, or copied credentials in public docs or tickets.
3. Run the supported recovery command from the repository root:

   ```bash
   pnpm auth:refresh
   ```

   The current implementation stages the candidate, enforces its configured minimum remaining lifetime, performs a live read-only account check, and only then uses an atomic replace. If selection or verification fails, it preserves the existing `.env`; do not overwrite a still-valid credential by hand.
4. For a recovery proof, require the account read to run with automatic refresh disabled: it proves the staged candidate itself, rather than a retry that discovered another credential. The engine supports this through its `autoRefresh: false` execution option, but the public CLI does **not** currently expose that switch and `scripts/refresh-auth.sh` does not set it. Therefore the script's built-in check is a supported read-only safeguard, not proof that automatic refresh was disabled; use an operator verifier that sets the option before declaring that stricter proof complete.
5. Treat browser-token expiry as observed metadata, not a fresh 30-day guarantee. A browser can already be partway through its session lifetime. Check the candidate's reported expiry and verify the live read rather than relying on the age of a file or prior login date.
6. Keep CLI, custom MCP, and cron on the same credential source. The custom MCP must launch with the repository as its working directory so its engine reads the same gitignored `.env`; cron should invoke the built CLI from that repository rather than copying a token into its definition. After a recovery, use read-only health checks such as `node cli/dist/index.js accounts --json` and the MCP's account-read tool. Do not use order, transfer, or other write commands as an auth test.

Useful safe inspection commands:

```bash
bash -n scripts/refresh-auth.sh
node cli/dist/index.js accounts --help
node cli/dist/index.js --help
```

For the public documentation map and its redaction rules, see the [documentation index](README.md).

<!-- Zayd Khan // cold // www.zayd.wtf -->
