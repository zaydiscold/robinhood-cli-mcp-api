# @zaydiscold/robinhood-cli

TypeScript CLI for the repository's mapped Robinhood brokerage/account surface, official Crypto API
helpers, and source-backed tax-mechanics research. This package is the human and script front door
over the shared engine used by the MCP server.

## Safety model

- Live-capable account reads send requests with caller-owned auth. Local, catalog, generated,
  reference, and plan commands do not.
- Brokerage writes are dry-run by default unless `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set.
- `--dry-run` always sends nothing, even when the process is armed.
- Use exact-action consent before trades, cancels, transfers, settings changes, or other mutations.
- Order history is the only proof an order happened.
- Tax research is educational, does not determine a filing result, and never authorizes a trade.

## Build

```bash
pnpm install
pnpm --filter @zaydiscold/robinhood-cli build
node cli/dist/cli-entry.js --help
```

The published `robinhood-cli` binary points to `dist/cli-entry.js`. It routes the local `tax`
subcommand without loading brokerage auth, and delegates every other command to the account CLI.

The build copies `api-map/` into `cli/dist/api-map/` and the tax reference and strategy catalogs into
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

## Tax research

Two source-backed layers are available through the main CLI, the dedicated binary, and importable
APIs.

### Rule topics

```bash
robinhood-cli tax
robinhood-cli tax wash-sales
robinhood-cli tax --query "qualified covered call"
robinhood-cli tax section-1256 --json
```

### Strategy-to-rule routing

A strategy guide lists required facts, maintained Robinhood reads, linked official rule topics, red
flags, stop conditions, and the facts that remain unevaluated. It does not select or authorize a
trade.

```bash
robinhood-cli tax strategy
robinhood-cli tax strategy wheel
robinhood-cli tax strategy "covered call" --account-context taxable
robinhood-cli tax strategy --query "dividend" --json
robinhood-cli tax status --json
```

The dedicated `robinhood-tax` binary accepts the same arguments without the leading `tax`:

```bash
robinhood-tax strategy box-spread --json
```

These commands perform local file reads. They do not load a Robinhood token or make a brokerage
request. Live account facts remain separate:

```bash
robinhood-cli tax-lots list <SYMBOL> --account <ACCOUNT_NUMBER> --json
robinhood-cli history --account <ACCOUNT_NUMBER> --json
robinhood-cli options events --account <ACCOUNT_NUMBER> --json
robinhood-cli recurring list --account <ACCOUNT_NUMBER> --json
robinhood-cli settings show --account <ACCOUNT_NUMBER> --json
robinhood-cli documents list --account <ACCOUNT_NUMBER> --year <YEAR> --json
```

Applications can import the same structured catalogs:

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
import {
  getTaxResearchStatus,
  getTaxStrategyGuide,
  listTaxStrategies,
} from "@zaydiscold/robinhood-cli/tax-strategy";
```

Every strategy guide explicitly returns:

```ts
{
  notPersonalizedAdvice: true,
  filingResultDetermined: false,
  tradeAuthorized: false
}
```

MCP clients read `tax-strategy-routing` and `tax-reference` through `robinhood_knowledge`, then use
the named account tools to collect live facts. Research and account evidence remain distinct.

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
