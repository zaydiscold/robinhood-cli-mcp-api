# @zaydiscold/robinhood-cli

TypeScript CLI for the repository's mapped Robinhood brokerage/account surface, official Crypto API
helpers, and source-backed tax-mechanics reference. This package is the human and script front door
over the shared engine used by the MCP server.

## Safety model

- Live-capable account reads send requests with caller-owned auth. Local, catalog, generated,
  reference, and plan commands do not.
- Brokerage writes are dry-run by default unless `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set.
- `--dry-run` always sends nothing, even when the process is armed.
- Use exact-action consent before trades, cancels, transfers, settings changes, or other mutations.
- Order history is the only proof an order happened.
- Tax research is educational reference content and never authorizes a trade.

## Build

```bash
pnpm install
pnpm --filter @zaydiscold/robinhood-cli build
node cli/dist/cli-entry.js --help
```

The published `robinhood-cli` binary points to `dist/cli-entry.js`. It routes the local `tax`
subcommand to the tax reference without loading brokerage auth, and delegates every other command to
the existing CLI implementation.

The build copies `api-map/` into `cli/dist/api-map/` and the tax catalog into
`cli/dist/knowledge/`. Rebuild after route-map or tax-catalog changes.

## Common reads

```bash
robinhood-cli accounts --json
robinhood-cli portfolio --after-hours --json
robinhood-cli positions --json
robinhood-cli options positions --json
robinhood-cli quote MRVL NVDA AAPL
robinhood-cli recipes "why am I down after hours"
robinhood-cli brokerage describe "orders/" --json
```

Prefer first-class commands over raw `brokerage execute`; they handle joins, query parameters,
account discovery, and instrument UUID resolution.

## Tax reference

The same source-backed catalog is available through the main CLI, the dedicated binary, and the
importable API.

```bash
# Main CLI
robinhood-cli tax
robinhood-cli tax wash-sales
robinhood-cli tax --query "qualified covered call"
robinhood-cli tax section-1256 --json

# Dedicated equivalent
robinhood-tax box-spreads
```

The command performs a local file read. It does not load a Robinhood token or make a brokerage
request. Live account facts remain separate:

```bash
robinhood-cli tax-lots list <SYMBOL> --account <ACCOUNT> --json
robinhood-cli history --account <ACCOUNT> --json
robinhood-cli recurring list --json
robinhood-cli documents list --year <YEAR> --json
```

Applications can import:

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
```

## Dry-run and live writes

```bash
# Dry-run by default: builds the order plan and sends nothing.
robinhood-cli buy -s AAPL -a <ACCOUNT_NUMBER> -m 25

# Live: set the process switch inline for this command.
ROBINHOOD_ALLOW_LIVE_WRITE=1 robinhood-cli buy -s AAPL -a <ACCOUNT_NUMBER> -m 25

# Raw mapped write: method is mandatory when GET and POST share a URL.
robinhood-cli brokerage execute "https://api.robinhood.com/orders/" \
  --method POST --body-json '{...}' --json
```

`brokerage execute` matches mapped URL templates by substring and fills placeholders with
`--param name=value`. It supports repeatable `--query-param key=value` values and is method-aware, so
`--method POST` resolves a mapped write route rather than inheriting the read route.

## Crypto API

Crypto uses Robinhood's official signed Crypto Trading API and separate Ed25519 credentials:

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

For the complete operating contract, see the repository root `SKILL.md`, focused `knowledge/`
modules, `AGENTS.md`, and `docs/cli-mcp-architecture.md`.

<!-- Zayd Khan // cold // www.zayd.wtf -->
