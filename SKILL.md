---
name: robinhood-cli
description: >
  Use this skill when the user asks to inspect, research, plan, or operate a Robinhood account through
  the repository's CLI, MCP server, or importable API. It routes account reads, portfolio analysis,
  equities, options, orders, watchlists, recurring investments, settings, tax lots, tax documents,
  tax-rule and tax-strategy research, endpoint discovery, and operator knowledge while preserving
  account scope, missing-data honesty, dry-run defaults, exact consent, and order-history evidence.
version: 3.1.0
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
> proceed when necessary to answer the request. Every state-changing action requires exact user
> approval for the fully resolved action and remains subject to the repository's write policy.

This file is the binding router, not the complete manual. Load the smallest focused module from
[`knowledge/`](knowledge/README.md), use [`AGENTS.md`](AGENTS.md) for maintainer-level detail, and
open deep research under `docs/` only when the focused module directs you there.

## 30-second operating contract

1. **Discover, do not assume.** Enumerate accounts, instruments, contracts, and current capabilities
   at runtime. Never reuse an account number or contract ID from prose, examples, memory, or another
   user.
2. **Prefer maintained first-class surfaces.** Use a CLI command or MCP tool before raw route
   execution. Raw access is a fallback, not the normal path.
3. **Read before planning.** Resolve account, asset, position, quote, session, buying power,
   collateral, and account capability before constructing a possible action.
4. **Classify the exact structure.** A sell-to-close, covered call, cash-secured put, credit spread,
   naked short, roll, recurring edit, and setting toggle are materially different operations.
5. **Dry-run is the resting state.** `ROBINHOOD_ALLOW_LIVE_WRITE=1` makes a process capable of
   attempting writes. It does not replace exact user approval. `--dry-run` or `dryRun:true` always
   forces a preview.
6. **Echo the resolved action.** Before a live mutation, state the account label and masked tail,
   symbol or exact option instruments, side, position effect, quantity, price or maximum notional,
   time in force, and session.
7. **Order history is the only proof.** A plan, app screen, HTTP `201`, response body, or successful
   tool call is not execution evidence. Re-read the order from brokerage history.
8. **Unknown stays unknown.** Never label an uncertain order outcome retry-safe. Never resend an
   original order merely because the response was interrupted.
9. **Research is not authorization.** Market, strategy, tax, and legal-mechanics research can inform
   a plan. It never authorizes a trade, roll, exercise, assignment response, lot selection, or
   account change.
10. **Structured output is authoritative.** CLI JSON and MCP `structuredContent` are the machine
    contract. Human tables and prose summarize that contract but must not contradict it.

## Progressive disclosure

Load the smallest layer that can answer the request:

| Layer | Source | Purpose |
| --- | --- | --- |
| Router | This `SKILL.md` | Safety contract, surface selection, and intent routing |
| Focused operation | [`knowledge/*.md`](knowledge/README.md) | Commands, decision rules, and task-specific failure modes |
| Machine-backed reference | generated catalogs, API maps, and validated JSON | Versioned claims and cross-surface contracts |
| Deep research | `docs/*.md` | Dated evidence, methodology, and long-form analysis |
| Maintainer reference | [`AGENTS.md`](AGENTS.md) | Auth, route map, implementation, and raw examples |
| Runtime truth | CLI `--help`, MCP `tools/list`, package exports | What the installed build exposes now |

When sources conflict, do not choose the sentence that makes an action easier. Report the conflict
and prefer, in order:

```text
current runtime
> current machine-backed contract
> primary evidence
> focused operating module
> dated deep research
> legacy prose
```

Use [`docs/evidence-confidence-ledger.md`](docs/evidence-confidence-ledger.md) when a capability's
live verification or confidence level matters.

## Choose the surface

### CLI

Use the CLI for human-in-the-loop work, reproducible shell automation, readable previews, and exact
commands. Installed use:

```bash
robinhood-cli --help
```

Source-tree use after `pnpm build`:

```bash
node cli/dist/cli-entry.js --help
```

Tax mechanics and structure routing use the same main binary:

```bash
robinhood-cli tax
robinhood-cli tax wash-sales
robinhood-cli tax strategy wheel
robinhood-cli tax strategy "covered call" --account-context taxable --json
robinhood-cli tax status --json
```

The dedicated `robinhood-tax` binary accepts the same arguments without the leading `tax`.

### MCP

Use MCP when an agent client needs typed discovery and structured results. The selected profile
controls the visible tool set. **Call `tools/list`; never rely on a hard-coded tool count.** A missing
tool can mean the server is stale, the profile excludes it, or the build was not restarted. Load
[`knowledge/mcp-operations.md`](knowledge/mcp-operations.md) for setup and diagnosis.

For tax strategy questions, read `tax-strategy-routing` and `tax-reference` with
`robinhood_knowledge`, then collect live facts through the named account tools. A knowledge read and
a brokerage read are separate operations.

### Importable API

Use package exports when an application or test needs structured data without parsing CLI text:

```ts
import { placeEquityOrder } from "@zaydiscold/robinhood-cli";
import { getTaxReference } from "@zaydiscold/robinhood-cli/tax-reference";
import { getTaxStrategyGuide } from "@zaydiscold/robinhood-cli/tax-strategy";
```

Do not recreate order bodies, account ownership checks, write gates, retries, caps, deduplication,
redaction, or evidence logic in another adapter. **CLI, MCP, scripts, and package APIs must share
business logic.**

## Intent router

| User intent | First surface | Focused module |
| --- | --- | --- |
| What accounts exist or what can this account do? | `accounts`, `account-pulse`, `buying-power` | [`knowledge/accounts.md`](knowledge/accounts.md) |
| What do I own? | `positions`, `options positions`, `options holdings` | [`knowledge/accounts.md`](knowledge/accounts.md) |
| Why am I up or down today or after hours? | `portfolio --day` or `portfolio --after-hours` | [`knowledge/cli-routing.md`](knowledge/cli-routing.md) |
| Quote or research a ticker | `quote`, `stock profile`, `news`, `ratings`, `earnings` | `knowledge/signals.md` |
| Price or analyze a multi-leg option structure | `options strategy-quote`, `options workbench` | `knowledge/multi-leg.md`, `knowledge/greeks.md` |
| Roll or defend an option | `options roll-plan` | `knowledge/rolling.md` |
| Build or manage a wheel | `wheel` | `knowledge/wheel.md` |
| Buy or sell stock | `buy` or `sell`, dry-run first | [`knowledge/execution-safety.md`](knowledge/execution-safety.md) |
| Review open or completed orders | `orders open`, `order-status`, `order-watch` | [`knowledge/execution-safety.md`](knowledge/execution-safety.md) |
| Cancel one or all open orders | `cancel` or `panic` | [`knowledge/execution-safety.md`](knowledge/execution-safety.md) |
| Manage recurring investments | `recurring` subcommands | [`knowledge/accounts.md`](knowledge/accounts.md) |
| Change DRIP, PDT, lending, sweep, or expiration settings | `settings` subcommands | [`knowledge/accounts.md`](knowledge/accounts.md) |
| Research a tax rule | `robinhood-cli tax <topic>` | [`knowledge/tax-reference.md`](knowledge/tax-reference.md) |
| Research tax mechanics of a named structure | `robinhood-cli tax strategy <id-or-alias>` | [`knowledge/tax-strategy-routing.md`](knowledge/tax-strategy-routing.md) |
| Combine tax rules with live account facts | tax research first, then named account reads | [`knowledge/tax.md`](knowledge/tax.md) |
| Inspect lots or build a non-sending lot-aware plan | `tax-lots list` or `tax-lots plan-sell` | [`knowledge/tax.md`](knowledge/tax.md) |
| Harvest a loss | strategy guide, exact lots, then 61-day acquisition review | [`knowledge/tax-loss-harvesting.md`](knowledge/tax-loss-harvesting.md) |
| Download statements or tax forms | `documents list` or `documents download` | [`knowledge/tax.md`](knowledge/tax.md) |
| Inspect an unwrapped endpoint | `brokerage describe`, `brokerage plan`, then `brokerage execute` | `knowledge/cli-routing.md` |
| Add or verify a route | generated map and evidence workflow | `docs/undocumented-surface.md` |

## Account discovery and scope

A login can expose several taxable, retirement, crypto, and other account classes. The plain
`accounts/` endpoint can under-report. Use the maintained account surface, then preserve the selected
account explicitly through each subsequent read, plan, and write.

Before an account-scoped mutation:

1. Enumerate owned accounts.
2. Match the user's description to account type, nickname, and relevant holdings.
3. Echo the selected account label and masked tail.
4. Refuse an unowned, malformed, missing, or ambiguous account.
5. Re-run account capability and buying-power checks when the action depends on them.
6. Respect any configured account allow-list.

Never assume that the account holding an existing position is also the intended account for a new
position. Never expose full account numbers in share-safe output, logs, examples, or client reference
identifiers.

## Read and analysis contract

For an account question:

```text
intent
  -> choose maintained surface
  -> resolve account and instrument identifiers
  -> perform a live read or local reference lookup
  -> preserve missing and partial data
  -> report timestamp, account scope, source, and limitations
```

Use dollar-weighted results when position size matters. A percentage leaderboard can overstate a tiny
lot and hide the position driving actual P&L.

Preserve these states distinctly:

- observed
- inferred
- stale
- partial
- missing
- not evaluated
- unsupported
- blocked

Do not turn `null`, an empty string, an absent Greek, or a failed read into numeric zero. Do not turn
an empty broker response into proof that an outside fact does not exist.

## Options and strategy contract

Before discussing or planning an option action:

1. Classify the economic structure and whether risk is defined or undefined.
2. Resolve exact option instrument IDs for every leg.
3. Verify expiration, strike, call or put, side, position effect, ratio, and quantity.
4. Read current bid, ask, mark, liquidity, and any available Greeks.
5. Show Greek-input completeness. A partial package Greek is not a complete package Greek.
6. Check account capability, collateral, buying power, assignment, exercise, and settlement.
7. Build the exact non-sending body.
8. Obtain exact approval only after the body and risks are resolved.

Do not infer naked exposure from loose wording. Do not use ticker, strike, or human-readable OCC text
where an exact option instrument ID is required. Do not treat a strategy label as a tax
classification.

## Raw brokerage executor

Prefer maintained commands. When raw execution is necessary:

```bash
robinhood-cli brokerage describe "<route substring>" --json
robinhood-cli brokerage plan "<route substring>" --method GET --json
robinhood-cli brokerage execute "<route substring>" \
  --method GET \
  --query-param key=value \
  --json
```

The raw CLI **does support repeatable `--query-param key=value` flags**. Query values are appended
after the mapped route is selected. Do not embed arbitrary query text to evade route selection.

When one URL supports several verbs, pass `--method`. Method is part of the safety identity. A write
method must not inherit a read route's risk level. An inferred mutation remains non-sending until the
route and request contract have sufficient evidence.

## Live-write contract

`ROBINHOOD_ALLOW_LIVE_WRITE=1` is the process-level capability switch. Without it, mutations are
planned but not sent. Keep the switch inline for one CLI invocation rather than permanently exporting
it.

A live mutation requires all of the following:

- the user explicitly requested this exact action
- the owned account is resolved and echoed
- the exact instrument or contracts are resolved
- side, position effect, quantity, price or notional, TIF, and session are known
- account capability, collateral, buying power, and configured caps are checked
- a dry-run of the exact action is shown or summarized
- no recent duplicate or unresolved prior outcome blocks the action
- the route and method are eligible for live execution
- the process switch is enabled

Defense-in-depth controls should include an account allow-list, a per-order maximum, and a process or
session maximum. Run `doctor` before an armed session. Missing guardrails are not harmless
configuration trivia.

After sending:

1. Preserve the client reference and broker order ID without exposing private identifiers.
2. Re-read order history.
3. Report `evidence.confirmed` separately from HTTP status.
4. If outcome is unknown, do not resend the original order.
5. Log the action and intent after verification.
6. For lot-aware sales, verify the selected or closed lots separately.

See [`docs/write-operations.md`](docs/write-operations.md) for the detailed mutation contract.

## Tax and legal-mechanics research contract

Tax research has two lanes that must not be collapsed.

### Rule lane

Use [`knowledge/tax-reference.md`](knowledge/tax-reference.md), generated from the versioned source
catalog, for source-backed federal mechanics. Separate:

1. **primary law or regulation**
2. **IRS guidance or reporting instruction**
3. **broker-platform behavior**
4. **planning inference**

State the jurisdiction and review date. Link material claims to official sources. Do not use a broker
help page as controlling federal law. Do not hard-code rate comparisons without the return year and
complete taxpayer facts.

### Structure lane

Use [`knowledge/tax-strategy-routing.md`](knowledge/tax-strategy-routing.md) or:

```bash
robinhood-cli tax strategy <id-or-alias> --json
```

The strategy guide returns required facts, maintained broker reads, linked rule topics, red flags,
and stop conditions. Its output contract must preserve:

```text
known broker facts
user-supplied and external facts
missing material facts
official rule topics
broker-platform behavior
planning inference
not evaluated
sources
mutation status: not authorized
```

### Account-fact lane

Only after routing should an agent read lots, history, options events, recurring purchases, settings,
dividends, or documents. Robinhood cannot determine spouse activity, other brokers, elections,
return-wide carryovers, or every substantially identical position.

A tax-reference read never authorizes a trade. A tax-strategy guide never determines a filing result.
Neither supplies consent for a sale, roll, exercise, assignment response, lot selection, or account
change.

Automatically stop and recommend qualified professional review when a material question depends on:

- substantially identical property without a clear controlling answer
- qualified-covered-call status with incomplete contract or stock facts
- a mixed straddle or election
- a conversion transaction or box-spread financing characterization
- a constructive sale
- missing or transferred basis
- cross-broker, spouse, IRA, or Roth IRA activity
- personalized rates, carryovers, netting, state law, or filing positions

## Agent response contracts

### Account read

Include account label and masked tail, timestamp, live or local source, known values, missing values,
and any degraded account reads.

### Strategy analysis

Include exact position structure, position-weighted dollar exposure, quote timestamp, Greek coverage,
scenario assumptions, liquidity limitations, and what is not evaluated.

### Dry-run

Include exact account, instrument or contracts, side, effect, quantity, price or maximum notional,
TIF, session, route confidence, and the statement `NOT EXECUTED`.

### Live result

Include requested action, broker status, order ID in share-safe form, order-history evidence,
remaining uncertainty, and whether any follow-up read or lot verification is required.

### Tax research

Include strategy and account context, jurisdiction, review date, known facts, missing facts, evidence
lanes, not-evaluated items, official sources, and `tradeAuthorized: false`.

## Failure modes that must stop the workflow

Stop rather than guessing when:

- the account is missing, ambiguous, malformed, or not owned
- an exact option instrument cannot be resolved
- quote, book, price, or quantity is invalid
- a write route is inferred, deprecated, or insufficiently verified
- account capability, collateral, or buying-power checks fail
- the pending-order deduplication read fails before a live send
- a recent same-side duplicate exists and the user has not explicitly overridden it
- notional caps or account allow-list rules block the action
- an earlier order outcome is unknown
- a package Greek is partial but is being presented as complete
- tax basis, contract classification, related positions, elections, or cross-account facts are
  material and unavailable
- the requested conclusion would require financial, legal, or tax facts the repository cannot know

Do not bypass a stop condition because the requested action sounds routine.

## Verification checklist

Before answering or acting, verify:

- [ ] Current CLI or MCP surface was discovered, not assumed.
- [ ] Account scope is explicit and owned.
- [ ] Instrument or contract identity is exact.
- [ ] Read timestamps and degraded states are preserved.
- [ ] Missing values remain missing.
- [ ] Strategy and position effect are classified.
- [ ] Tax rule lane and account-fact lane are separated when relevant.
- [ ] Mutation remains dry-run unless exact approval and all live gates are satisfied.
- [ ] No unresolved duplicate or unknown prior outcome exists.
- [ ] Order history, not HTTP status, is used as evidence.
- [ ] Share-safe output removes account, credential, signed URL, order-reference, and private-note data.
- [ ] Any selected or closed tax lots are verified after a fill.

## Maintainer rules

1. Keep one canonical implementation for auth, routing, write policy, account ownership, caps,
   deduplication, idempotency, order construction, redaction, and evidence.
2. Add functionality to the shared engine before adding adapter-specific behavior.
3. Keep CLI help, MCP schemas, package exports, capability registry, and focused modules aligned.
4. Never create a second direct brokerage write client in a script.
5. Validate external payloads at boundaries and preserve unknown fields honestly.
6. Make generated API-map and tax-reference drift fail CI.
7. Treat documentation contradictions as product defects.
8. Keep this skill between the configured size bounds. Move implementation details into
   [`AGENTS.md`](AGENTS.md), focused depth into [`knowledge/`](knowledge/README.md), and architecture
   into [`docs/cli-mcp-architecture.md`](docs/cli-mcp-architecture.md).
9. Re-run build, quality, full tests, and package-boundary checks after changing a public surface.
10. Never weaken dry-run, account scope, exact approval, evidence, or privacy invariants to make a
    new feature easier to demo.
