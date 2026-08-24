---
name: robinhood-cli
description: >
  Use this skill when the user asks to inspect, research, plan, or operate a Robinhood account through
  the repository's CLI, MCP server, or importable API. It routes account reads, portfolio analysis,
  equities, options, orders, watchlists, recurring investments, settings, tax lots, tax documents,
  tax-mechanics research, endpoint discovery, and operator knowledge while preserving the dry-run,
  account-scope, exact-consent, and order-evidence contracts.
version: 3.0.0
author: Zayd (@zaydiscold)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags:
      [
        robinhood,
        trading,
        finance,
        api,
        mcp,
        cli,
        brokerage,
        crypto,
        stocks,
        options,
        tax,
        tax-lots,
        research,
      ]
    related_skills: []
---

# Robinhood CLI + MCP operating skill

> **REAL-MONEY CONTROL PLANE:** this repository can submit trades, cancel orders, alter recurring
> investments, and change account settings on an account the operator owns. Reads and dry-runs may
> proceed when they are necessary to answer the request. Every state-changing action requires the
> user's exact approval for the resolved action and remains subject to the repository's write gate.

This file is the **router and binding operating contract**. It is deliberately not the full API
manual. Load one focused module from [`knowledge/`](knowledge/README.md) for the task, use
[`AGENTS.md`](AGENTS.md) for maintainer-level detail, and use [`docs/`](docs/README.md) only when the
focused module links to a deeper study.

## 30-second operating contract

1. **Discover, do not assume.** Enumerate accounts at runtime. Never invent or reuse an account
   number from prose, examples, memory, or another user.
2. **Prefer a first-class command or MCP tool.** Use raw route execution only when the capability
   has no maintained wrapper.
3. **Read before planning.** Resolve the account, instrument, contract, position, live quote, and
   account capability before constructing an action.
4. **Classify the exact action.** A sell-to-close, covered call, cash-secured put, credit spread,
   naked short, recurring-investment edit, and account-setting toggle are not interchangeable.
5. **Dry-run is the resting state.** `ROBINHOOD_ALLOW_LIVE_WRITE=1` gives the process permission to
   attempt writes. It does not replace exact user approval. `--dry-run` or `dryRun:true` always wins.
6. **Echo the resolved action before a live mutation.** Include account tail and label, symbol or
   exact option contract, side, position effect, quantity, price or maximum notional, time in force,
   and session.
7. **Order history is the only proof.** A plan, UI state, HTTP `201`, response body, or tool success
   message is not execution evidence. Re-read the order from brokerage history.
8. **Unknown means unknown.** Never label an uncertain order outcome retry-safe and never resend the
   original order merely because the response was interrupted.
9. **Research is not authorization.** Tax, market, strategy, and due-diligence reads can inform a
   plan. They never authorize a trade or account change.
10. **Use structured output as authority.** Tables and prose help humans. CLI JSON and MCP
    `structuredContent` are the machine contract.

## Progressive disclosure

Load the smallest layer that can answer the question:

| Layer | Source | Purpose |
| --- | --- | --- |
| Router | This `SKILL.md` | Safety contract, surface selection, and intent routing |
| Focused operation | [`knowledge/*.md`](knowledge/README.md) | Commands, decision rules, and task-specific failure modes |
| Deep research | [`docs/*.md`](docs/README.md) | Dated evidence, methodology, and long-form analysis |
| Full maintainer reference | [`AGENTS.md`](AGENTS.md) | Auth, route map, command inventory, write internals, and raw examples |
| Runtime truth | CLI `--help`, MCP `tools/list`, generated API map | What the installed build actually exposes now |

When documents disagree, do not choose the most convenient sentence. Report the discrepancy and
prefer, in order: current runtime behavior, current generated contracts, primary evidence, focused
module, dated deep research, then legacy prose.

## Choose the surface

### CLI

Use the CLI for human-in-the-loop work, shell automation, readable dry-runs, and reproducible
commands. The normal executable is:

```bash
node cli/dist/index.js --help
```

Use the dedicated source-backed tax reference CLI for tax mechanics:

```bash
node cli/dist/tax-cli.js
node cli/dist/tax-cli.js wash-sales
node cli/dist/tax-cli.js --query "qualified covered call"
```

Installed package binaries are `robinhood-cli` and `robinhood-tax`.

### MCP

Use MCP when an agent client needs typed discovery and structured results. The selected capability
profile controls the visible tool set. **Call `tools/list`; never rely on a hard-coded tool count.**
A missing tool may mean the server is stale, the profile excludes it, or the build was not restarted.
Load [`knowledge/mcp-operations.md`](knowledge/mcp-operations.md) for setup and diagnosis.

Tax research is available through the generated `tax-reference` knowledge module using
`robinhood_knowledge`. Live tax-lot, document, history, recurring, and settings facts remain separate
account tools.

### Importable API

Use the package API for applications and tests that need the shared engine without parsing CLI text:

```ts
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
import { placeEquityOrder } from "@zaydiscold/robinhood-cli";
```

Do not recreate order bodies, write gates, account checks, retry policy, or evidence logic in a new
adapter. CLI, MCP, scripts, and applications must call the same canonical engine functions.

## Intent router

| User intent | First surface | Focused module |
| --- | --- | --- |
| What accounts exist or what can this account do? | `accounts`, `account-pulse`, `buying-power` | [`knowledge/accounts.md`](knowledge/accounts.md) |
| What do I own? | `positions`, `options positions`, `options holdings` | [`knowledge/accounts.md`](knowledge/accounts.md) |
| Why am I up or down today or after hours? | `portfolio --day` or `portfolio --after-hours` | [`knowledge/cli-routing.md`](knowledge/cli-routing.md) |
| Quote or research a ticker | `quote`, `stock profile`, `news`, `ratings`, `earnings` | [`knowledge/signals.md`](knowledge/signals.md) |
| Price or analyze an option strategy | `options strategy-quote`, `options workbench` | [`knowledge/multi-leg.md`](knowledge/multi-leg.md), [`knowledge/greeks.md`](knowledge/greeks.md) |
| Roll or defend an option | `options roll-plan` | [`knowledge/rolling.md`](knowledge/rolling.md) |
| Build or manage a wheel | `wheel` | [`knowledge/wheel.md`](knowledge/wheel.md) |
| Buy or sell stock | `buy` or `sell`, dry-run first | [`knowledge/execution-safety.md`](knowledge/execution-safety.md) |
| Review open or completed orders | `orders open`, `order-status`, `order-watch` | [`knowledge/execution-safety.md`](knowledge/execution-safety.md) |
| Cancel one or all open orders | `cancel` or `panic` | [`knowledge/execution-safety.md`](knowledge/execution-safety.md) |
| Manage a watchlist | `watchlist` subcommands | [`knowledge/cli-routing.md`](knowledge/cli-routing.md) |
| Manage recurring investments | `recurring` subcommands | [`knowledge/accounts.md`](knowledge/accounts.md) |
| Change DRIP, PDT, lending, sweep, or expiration settings | `settings` subcommands | [`knowledge/accounts.md`](knowledge/accounts.md) |
| Review tax mechanics or product structure | `robinhood-tax` or `tax-reference` knowledge | [`knowledge/tax-reference.md`](knowledge/tax-reference.md) |
| Inspect tax lots or plan a lot-aware sale | `tax-lots` | [`knowledge/tax.md`](knowledge/tax.md) |
| Harvest losses | tax reference first, then live lots/history/automation checks | [`knowledge/tax-loss-harvesting.md`](knowledge/tax-loss-harvesting.md) |
| Download statements or tax forms | `documents list` or `documents download` | [`knowledge/tax.md`](knowledge/tax.md) |
| Inspect an unwrapped endpoint | `brokerage describe`, `brokerage plan`, then `brokerage execute` | [`knowledge/cli-routing.md`](knowledge/cli-routing.md) |
| Add or verify a route | generated map and evidence workflow | [`docs/undocumented-surface.md`](docs/undocumented-surface.md) |

## Account discovery and scope

A login can expose multiple taxable, retirement, crypto, or other account classes. The plain
`accounts/` endpoint can under-report. Use the first-class `accounts` surface, which resolves the
owned account graph, then preserve the selected account explicitly through every subsequent read,
plan, and write.

Before an account-scoped mutation:

1. Enumerate owned accounts.
2. Match the user's description to account type, nickname, and current holdings.
3. Echo the selected account label and masked tail.
4. Refuse an unowned, malformed, missing, or ambiguous account.
5. Re-run account capability and buying-power checks when the action depends on them.

Never infer that the account holding an existing position is also the account intended for a new
position.

## Read and planning workflow

For a normal account question:

```text
intent
  -> choose first-class surface
  -> discover account or instrument identifiers
  -> perform live read or local reference lookup
  -> preserve missing data as missing
  -> report timestamps, account scope, and limitations
```

For an equity action:

```text
intent
  -> account discovery
  -> ticker resolution
  -> instrument eligibility
  -> quote and market session
  -> account capability and buying power
  -> dry-run body
  -> exact approval
  -> gated send
  -> order-history evidence
  -> trading log
```

For an option action:

```text
intent
  -> classify strategy and exposure
  -> discover account
  -> enumerate exact option UUIDs
  -> verify expiration, strike, type, side, and position effect
  -> quote every leg and show Greek-input completeness
  -> pretrade/collateral review
  -> dry-run exact body
  -> exact approval
  -> gated send
  -> options-order-history evidence
```

Do not use ticker, strike, or human-readable OCC text where an exact option instrument ID is required.
Do not present a package Greek as complete when one or more leg inputs are missing.

## Raw brokerage executor

Prefer maintained commands. When raw execution is necessary:

```bash
node cli/dist/index.js brokerage describe "<route substring>" --json
node cli/dist/index.js brokerage plan "<route substring>" --method GET --json
node cli/dist/index.js brokerage execute "<route substring>" \
  --method GET \
  --query-param key=value \
  --json
```

The raw CLI **does support repeatable `--query-param key=value` flags**. Query values are appended
after the mapped route is selected. Do not embed arbitrary query text to bypass route selection.

When the same URL supports multiple verbs, pass `--method`. Method is part of the safety identity.
A write method must never inherit a read route's risk classification. An inferred mutation remains
non-sending until the route and request contract have sufficient evidence.

## Live-write contract

`ROBINHOOD_ALLOW_LIVE_WRITE=1` is the process-level switch. The default without it is a dry-run.
Keep it inline for one CLI invocation rather than permanently exporting it.

A live mutation requires all of the following:

- The user explicitly requested this exact action.
- The owned account was resolved and echoed.
- Instrument or contract identity was resolved.
- Side, effect, quantity, price/notional, TIF, and session are known.
- Account capability, collateral, buying power, and relevant caps were checked.
- A dry-run of the exact body was shown or summarized.
- No recent duplicate or unresolved prior outcome blocks the action.
- The route and method are eligible for live execution.
- The environment switch is enabled.

Useful defense-in-depth environment controls include an account allow-list, per-order maximum, and
process/session maximum. Run `doctor` before an armed session and treat missing guardrails as a
warning, not as harmless configuration trivia.

After a send:

1. Preserve the generated idempotency reference.
2. Follow broker-directed retry behavior only where the canonical engine proves retry safety.
3. Reconcile by reading order history.
4. Report `confirmed`, state, order ID, and any evidence warning.
5. Log the action and intent.
6. If evidence is unavailable, say **unconfirmed** and do not resend the original order.

## Tax and legal-mechanics research contract

Tax content in this repository is educational research, not a personalized filing conclusion. For
any tax question, load [`knowledge/tax-reference.md`](knowledge/tax-reference.md) first or query
`robinhood-tax`. It is generated from a versioned catalog and separates four evidence lanes:

1. **Primary law or regulation**
2. **IRS guidance or reporting instruction**
3. **Broker-platform behavior**
4. **Planning inference**

These lanes are not interchangeable. Robinhood's app estimate, product label, or help article does
not decide federal tax law. A planning inference must never be phrased as settled law.

Before giving a personalized numerical tax estimate, the necessary facts may include filing status,
taxable income, basis, holding period, capital-loss carryovers, elections, state, other brokers,
retirement accounts, spouse transactions, and automatic acquisitions. If those are absent, explain
the mechanics and uncertainty rather than inventing a liability.

Always flag, rather than adjudicate, ambiguous questions involving:

- substantially identical stock or options
- wash sales across taxable and IRA or Roth IRA accounts
- qualified covered calls and straddles
- mixed Section 1256 and non-Section-1256 positions
- conversion transactions or box spreads
- constructive sales
- missing or transferred basis

Use live account surfaces only to gather facts:

```bash
node cli/dist/tax-cli.js wash-sales
node cli/dist/index.js tax-lots list <SYMBOL> --account <ACCOUNT> --json
node cli/dist/index.js history --account <ACCOUNT> --json
node cli/dist/index.js recurring list --json
node cli/dist/index.js settings show --account <ACCOUNT>
node cli/dist/index.js documents list --year <YEAR> --json
```

A tax-lot plan is not lot-selection evidence. Verify the filled order, selected or closed lots, and
year-end tax forms. A tax-reference read never authorizes the sale it discusses.

## Research and operator memory

Research should distinguish signal speed from evidence quality. Load [`knowledge/signals.md`](knowledge/signals.md)
for the source ladder. Treat `ball-knowledge.md`, the hotlist, trade notes, and prior logs as operator
context, not as current market fact or authorization.

Before relying on a memory entry:

- note its date
- verify current market or account facts
- distinguish observation from thesis
- preserve contradictory evidence
- do not convert a past trade into a standing instruction

## Output contract

- Use dollar-weighted impact for portfolio attribution and risk, not size-blind percentage rankings.
- Include account scope and `as of` time for live reads.
- Preserve `null`, unavailable, partial coverage, stale, and inferred states. Do not coerce them to
  zero or omit the limitation.
- Use exact units for price, quantity, notional, option multiplier, Greeks, and percentages.
- Keep raw credentials, account identifiers, signed URLs, order references, and private notes out of
  shareable output. Use the share-safe surface when output will leave the operator's environment.
- State whether a result is a live read, local reference, dry-run plan, live send, or post-send
  evidence.

## Failure modes that must stop the workflow

Stop or fail closed when any of these is true:

- Account identity is missing, ambiguous, unowned, or cannot be verified for a live mutation.
- A ticker or option contract was guessed rather than resolved.
- A write route or method is inferred, deprecated, or classified as a read.
- Quantity, price, notional, date, account, or UUID is invalid.
- A live quote is missing where order construction depends on it.
- A pending duplicate exists or the duplicate check failed.
- Buying power, collateral, or account capability cannot be established for a live action.
- The intended structure could create uncovered or otherwise unintended exposure.
- The dry-run body differs from the body about to be sent.
- The user approved a general idea but not the resolved action.
- A prior order outcome is unknown.
- A source-backed tax answer is being converted into a personalized filing conclusion without the
  necessary facts.

## Verification checklist

Before considering a task complete:

### Read or analysis

- Correct account, symbol, contract, and time window
- Current timestamp and data provenance
- Missing-data and coverage limitations visible
- Correct units and dollar weighting
- Structured result preserved

### Dry-run

- Exact route and method
- Exact account and instrument IDs
- Exact body, side, effect, quantity, price/notional, TIF, and session
- Eligibility, capability, buying power, collateral, duplicate, and cap checks
- Explicit statement that nothing was sent

### Live mutation

- Exact user approval
- `ROBINHOOD_ALLOW_LIVE_WRITE=1`
- Canonical shared engine
- Order-history or account-state evidence
- No retry of an unknown original action
- Intent logged

### Tax research

- Jurisdiction and review date
- Evidence lane for each material claim
- Primary or official source IDs
- Broker behavior separated from law
- Fact-specific uncertainty visible
- No implied trade authorization

## Maintainer rules

- CLI, MCP, scripts, and package APIs must share business logic rather than copy it.
- Add a capability to the registry before exposing it through MCP.
- Treat CLI `--help`, MCP `tools/list`, package exports, and generated maps as contracts.
- Update focused modules rather than expanding this router into another encyclopedia.
- Edit `knowledge/tax-reference.json`, run `pnpm generate:tax-reference`, and commit the generated
  Markdown when tax research changes.
- Run `pnpm quality`, `pnpm build`, and `pnpm test:built` before merging.
- Never weaken dry-run defaults, account ownership checks, notional caps, deduplication, route
  provenance, or post-send evidence merely to make a workflow easier.

## Canonical references

- [`knowledge/README.md`](knowledge/README.md): focused module index
- [`knowledge/execution-safety.md`](knowledge/execution-safety.md): mutation failure modes
- [`knowledge/accounts.md`](knowledge/accounts.md): account discovery and capabilities
- [`knowledge/mcp-operations.md`](knowledge/mcp-operations.md): MCP profiles and setup
- [`knowledge/tax-reference.md`](knowledge/tax-reference.md): source-backed tax mechanics
- [`knowledge/tax.md`](knowledge/tax.md): tax-aware account workflow
- [`knowledge/tax-loss-harvesting.md`](knowledge/tax-loss-harvesting.md): harvesting control procedure
- [`docs/write-operations.md`](docs/write-operations.md): write-gate contract
- [`docs/evidence-confidence-ledger.md`](docs/evidence-confidence-ledger.md): evidence levels
- [`docs/cli-mcp-architecture.md`](docs/cli-mcp-architecture.md): adapter and engine architecture
- [`AGENTS.md`](AGENTS.md): full maintainer reference
