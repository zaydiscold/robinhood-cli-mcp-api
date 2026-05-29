# robinhood-cli Skill

Use this skill when an agent needs to inspect Robinhood API surfaces, classify route risk, execute personal brokerage/account calls, execute official Crypto API calls, or prepare official Crypto API signatures.

## Install

```bash
pnpm install
pnpm build
```

## Commands

```bash
robinhood-cli api-map summary --json
robinhood-cli api-map routes --host trading.robinhood.com --json
robinhood-cli brokerage routes --risk read --json
robinhood-cli brokerage route "https://api.robinhood.com/accounts/" --json
robinhood-cli brokerage execute "https://api.robinhood.com/accounts/" --dry-run --json
robinhood-cli crypto routes --json
robinhood-cli crypto sign --api-key "$ROBINHOOD_API_KEY" --private-key-b64 "$ROBINHOOD_PRIVATE_KEY_B64" --path /api/v1/crypto/trading/accounts/ --method GET
robinhood-cli crypto execute "https://trading.robinhood.com/api/v2/crypto/marketdata/best_bid_ask/" --query-param symbol=BTC-USD --dry-run --json
```

## Agent Rules

- Treat `api-map/robinhood-routes.json` as the unified route map: official Robinhood Crypto OpenAPI plus community seed plus sanitized CDP capture.
- Treat `api-map/brokerage-routes.json` as the browser-backed brokerage/account subset used by `brokerage execute`.
- Personal repo commands may make live brokerage and official Crypto calls when auth env is present.
- Use `--dry-run` when an agent needs a non-sending test.
- Do not trade, transfer, cancel, unlink, or mutate unless the user explicitly asked for that exact live operation.
- If you discover a route that is not in `api-map/`, add it to the map, classify risk conservatively, and document the discovery method in `docs/undocumented-surface.md`.
