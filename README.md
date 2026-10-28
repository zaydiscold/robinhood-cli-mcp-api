# Robinhood CLI + MCP

> Trading at the speed of inference.

Read your Robinhood accounts, understand portfolio changes, research options, and prepare account-aware trade plans from a terminal or an AI agent. The CLI and MCP server share one TypeScript engine for account discovery, authentication, analytics, and order handling.

An independent, unofficial project for an account you own. It is not affiliated with Robinhood and is separate from Robinhood's official agent sandbox.

[Get started](#get-started) · [Use MCP](#use-with-an-ai-agent) · [Command reference](docs/command-reference.md) · [Agent guide](SKILL.md) · [Documentation](docs/README.md)

## What it does

| Task | Start here |
| --- | --- |
| Discover accounts and check buying power | `accounts`, `account-pulse`, `buying-power`, `margin` |
| See holdings and explain gains or losses in dollars | `positions`, `options positions`, `portfolio`, `performance` |
| Research a stock or option structure | `stock profile`, `options chain`, `options strategy-quote`, `options workbench` |
| Review orders, expirations, and past trades | `history`, `order-status`, `options events`, `review` |
| Inspect income and account services | `dividends`, `income`, `recurring list`, `settings show`, `documents list` |
| Prepare a trade, roll, or transfer | Typed planners and dry-run order commands |
| Explore or extend the API map | `brokerage routes`, `brokerage describe`, `brokerage plan`, `api-map` |

`--json` gives structured output for scripts, spreadsheets, and agents. Use `--help` on any command for its current inputs. The [capability evidence ledger](docs/evidence-confidence-ledger.md) distinguishes implemented, mapped, and live-verified behavior.

## Get started

### 1. Install from source

You need Node.js **20.19 or newer**, pnpm, Python 3, and Bash for the session-recovery helper. Sign into your own Robinhood account in a supported browser on the same machine. See the [authentication guide](docs/auth.md) for platform and browser details.

```bash
git clone https://github.com/zaydiscold/robinhood-cli-mcp-api.git
cd robinhood-cli-mcp-api
pnpm install
pnpm build
node cli/dist/cli-entry.js --help
```

These examples work directly from the checkout; no global binary link is required. If you have linked the package binary, `robinhood-cli` is the equivalent command.

### 2. Check the connection and discover accounts

```bash
node cli/dist/cli-entry.js doctor --json
node cli/dist/cli-entry.js accounts --json
```

The CLI attempts to reuse your existing signed-in browser session. It stores the session token in a local, gitignored `.env` and sends it to Robinhood to authenticate requests. It does not require you to put a password or token in a command or MCP configuration.

If recovery is needed, use `pnpm auth:refresh`. A read returning `401` may trigger one recovery and retry; account-changing requests are not automatically replayed. If Robinhood requires a fresh login or challenge, complete it in your browser. Never commit credentials or share raw authentication output.

### 3. Read the portfolio

```bash
# Account values and position-weighted dollar drivers
node cli/dist/cli-entry.js portfolio --json

# All-account equity and option holdings
node cli/dist/cli-entry.js positions --json
node cli/dist/cli-entry.js options positions --json

# Live quotes without an account mutation
node cli/dist/cli-entry.js quote AAPL NVDA --json
```

Use an account number discovered by `accounts` when a command supports `--account`. Account labels are helpful context; they do not establish account type or trading capability.

## Use with an AI agent

Build the project, then configure your MCP client to start:

```bash
node /absolute/path/to/robinhood-cli-mcp-api/mcp/dist/server.js
```

For example, with Claude Code:

```bash
claude mcp add robinhood-cli -s user -- \
  node /absolute/path/to/robinhood-cli-mcp-api/mcp/dist/server.js
```

The server resolves the local session through the shared engine. Do not paste a bearer token into the client configuration. Restart or reload the MCP server after a rebuild, and use its live `tools/list` response to verify the available tools.

Example requests:

- “Explain my portfolio's change in dollars, by account and underlying. Include the measured session and any reconciliation gap.”
- “Review my open calls: cost, current value, expiration, bid/ask spread, and missing Greeks.”
- “Inspect this roll and show a non-sending plan for the resolved account and contracts.”
- “Check order history and tell me whether this order actually filled.”

For a smaller tool catalog, set `ROBINHOOD_MCP_PROFILE` to `lean`, `core`, `trading`, `research`, or `admin`. Leaving it unset selects `full`. Profiles control tool discovery; they do not replace the write gate or user approval. See [MCP operations](knowledge/mcp-operations.md) for profile selection and [the MCP README](mcp/README.md) for client details.

Agents should start with [SKILL.md](SKILL.md), then load the focused [knowledge module](knowledge/README.md) for the task. They do not need the entire research library in every context.

## Reads, plans, and account changes

Account and market-data reads contact Robinhood. Knowledge lookups, route catalogs, and pure calculations can run locally. A dry-run plan may read account or market data, but does not send the planned account change.

**Account changes default to dry-run.** `ROBINHOOD_ALLOW_LIVE_WRITE=1` enables a process to attempt live writes; `--dry-run` or MCP `dryRun: true` still forces a preview. The switch is a capability setting, not standing permission to trade.

Before a live change, resolve the owned account, exact instrument or contracts, side, quantity, price or maximum notional, and session. Show the plan and obtain approval for that action. Verify the result through broker history; an HTTP success response alone is not evidence of a fill. If the outcome is uncertain, reconcile it before retrying.

This applies to orders, cancellations, transfers, recurring investments, and account settings. See the [execution contract](docs/write-operations.md).

## Reading the numbers

Treat analytics as estimates with an account scope, quote time, and stated basis:

- A marked position value is not a guaranteed sale price. Bid/ask spreads and market hours affect execution.
- A gross-holdings concentration percentage and a percentage of net account equity answer different questions. Neither automatically measures option delta or a leveraged fund's economic exposure.
- A maintenance risk band is derived analysis. Pending deposits, broker restrictions, and formal call notices require their own checks.
- A broker-displayed return is not an independently reconstructed, cash-flow-adjusted performance record. Transfers and missing history matter.
- Greeks, income forecasts, and scenarios change with their assumptions. Missing inputs remain unknown.

The tool is for research and account operation; it does not provide investment, tax, or legal advice. Use the [evidence ledger](docs/evidence-confidence-ledger.md) and relevant broker records when a decision depends on a capability or calculation.

## More detail

| Guide | Contents |
| --- | --- |
| [Command reference](docs/command-reference.md) | Task routing, read examples, planning, and specialist workflows |
| [Authentication](docs/auth.md) | Session discovery, storage, expiry, and recovery |
| [Agent operating skill](SKILL.md) | Account scope, evidence, planning, and approval contract |
| [Architecture](docs/cli-mcp-architecture.md) | Shared engine, CLI/MCP adapters, and route-map flow |
| [Documentation index](docs/README.md) | Options, tax, services, research, and dated verification notes |
| [Maintainer guide](AGENTS.md) | Development, testing, route changes, and implementation detail |
| [Roadmap](ROADMAP.md) | Product goals and outstanding work |

Personal notes, downloaded documents, and raw account captures are optional operator data, not installation prerequisites. Keep them out of public examples and packages. Source checkouts that use an encrypted `local/` workspace can follow [local encryption](docs/local-encryption.md); an encryption key is not required to use the public code.

## Contributing

Start with the [maintainer guide](AGENTS.md). Add shared business logic to the engine before wiring CLI or MCP adapters. For route changes, edit the canonical route metadata, regenerate its derived artifacts, and rebuild—the runtime reads the built API-map copy. Preserve account scope, dry-run defaults, and execution evidence across both interfaces.

Run the project's build, tests, and quality checks before proposing a change. Document live verification separately from fixtures and dry-runs, and keep the evidence sanitized.

MIT © Zayd Khan · [License](LICENSE) · [GitHub](https://github.com/zaydiscold) · [zayd.wtf](https://zayd.wtf)
