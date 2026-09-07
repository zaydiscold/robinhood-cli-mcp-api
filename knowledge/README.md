# knowledge/: focused operating modules

This directory is the task-specific layer between the concise [`SKILL.md`](../SKILL.md) router and
the long-form [`docs/`](../docs/README.md) research library. Load the smallest module that matches
the user's request. Do not ingest every module by default.

## Progressive disclosure

| Layer | Source | Use |
| --- | --- | --- |
| 0: operating contract | [`SKILL.md`](../SKILL.md) | Safety invariants, surface selection, and intent routing |
| 1: focused module | `knowledge/*.md` | Commands, decision rules, and task-specific failure modes |
| 2: machine-backed reference | [`tax-reference.md`](tax-reference.md), [`tax-strategy-routing.md`](tax-strategy-routing.md), and generated API maps | Versioned claims, strategy-to-rule contracts, or machine contracts that prose must not contradict |
| 3: deep research | [`docs/*.md`](../docs/README.md) | Dated evidence, methodology, and longer analysis |
| 4: maintainer reference | [`AGENTS.md`](../AGENTS.md) | Auth, route details, implementation, and raw examples |
| runtime truth | CLI `--help`, MCP `tools/list`, package exports | What the current installed build actually exposes |

Use this precedence when sources conflict:

```text
current runtime
> generated or validated machine contract
> primary evidence
> focused module
> dated deep research
> legacy prose
```

Report a discrepancy instead of silently selecting the sentence that makes an action easier.

## Start here by intent

### Account, portfolio, and execution

| Module | Load when | Main surfaces |
| --- | --- | --- |
| [`accounts.md`](accounts.md) | Account discovery, account class, buying power, or capability questions | `accounts`, `account-pulse`, `buying-power` |
| [`execution-safety.md`](execution-safety.md) | Before any write or when an order path behaves unexpectedly | `buy`, `sell`, `cancel`, `panic`, `orders open`, `order-status` |
| [`cli-routing.md`](cli-routing.md) | A command, route, build, auth, or raw executor path is unclear | first-class CLI, `brokerage describe/plan/execute` |
| [`mcp-operations.md`](mcp-operations.md) | MCP setup, profiles, missing tools, or stale server diagnosis | `tools/list`, profile-specific MCP surface |
| [`market-mechanics.md`](market-mechanics.md) | Order types, spreads, sessions, T+1, halts, OTC, or adjusted options | quote, order, and session reads |
| [`playbooks/broker-call.md`](playbooks/broker-call.md) | A conversational trade idea must become a verified action | full parse-to-evidence workflow |

### Options and strategy structure

| Module | Load when | Main surfaces |
| --- | --- | --- |
| [`multi-leg.md`](multi-leg.md) | Verticals, condors, butterflies, calendars, diagonals, straddles, or strangles | `options strategy-quote`, strategy plan |
| [`greeks.md`](greeks.md) | Net Greeks, scenario P&L, units, or incomplete Greek inputs | `options workbench`, exposure analytics |
| [`rolling.md`](rolling.md) | Rolling or defending an option, especially in a cash account | `options roll-plan`, roll ledger |
| [`wheel.md`](wheel.md) | Wheel, CSP, assignment, covered-call loop, or next-leg state | `wheel` |
| [`position-building.md`](position-building.md) | Building toward a strategy with partial shares or capital | shares, recurring, CSP, PMCC, laddering |

### Tax mechanics and tax-aware account facts

For **every material tax claim**, load [`tax-reference.md`](tax-reference.md). It is generated from a
versioned source catalog and separates primary law, IRS guidance, Robinhood behavior, and planning
inference.

When the user names a **strategy or structure**, load [`tax-strategy-routing.md`](tax-strategy-routing.md)
first. It maps the strategy to required facts, maintained Robinhood reads, linked rule topics, red
flags, and stop conditions without selecting a trade or determining a filing result.

| Module | Load when | Main surfaces |
| --- | --- | --- |
| [`tax-strategy-routing.md`](tax-strategy-routing.md) | Covered call, CSP, wheel, roll, loss harvest, Section 1256 index option, box, collar, dividend capture, short sale, or specific-lot structure | `robinhood-cli tax strategy`, importable tax-strategy API, MCP knowledge plus named account reads |
| [`tax-reference.md`](tax-reference.md) | Any question about wash sales, Section 1256, QCCs, exercise, boxes, constructive sales, lots, dividend holding periods, short sales, or broker estimates | `robinhood-cli tax`, importable tax-reference API, MCP knowledge |
| [`tax.md`](tax.md) | The question combines tax mechanics with live Robinhood accounts, lots, history, settings, or documents | `tax-lots`, `documents`, `history`, `recurring`, `settings` |
| [`tax-loss-harvesting.md`](tax-loss-harvesting.md) | The user is considering a loss sale or replacement exposure | 61-day control workflow and lot evidence |

Tax research reads are educational and never authorize a sale, roll, assignment response, exercise,
lot selection, or account change. Live account facts and state-changing actions remain separate
surfaces with separate consent.

### Research, income, and operator context

| Module | Load when | Main surfaces |
| --- | --- | --- |
| [`signals.md`](signals.md) | Due diligence, news, sentiment, source quality, or operator memory | news, ratings, earnings, Ball Knowledge |
| [`dividend-investing.md`](dividend-investing.md) | Dividend cadence, sustainability, dates, DRIP, or income | `dividends`, `income`, `settings` |

## Module contract

Every focused module should:

- say when to load it
- identify live, local, generated, and inferred evidence separately
- prefer maintained first-class surfaces over raw routes
- preserve account scope and timestamps
- preserve missing, partial, stale, unverified, and not-evaluated states
- use dollar-weighted analysis where position size matters
- keep mutations dry-run by default
- require exact user approval for a resolved state-changing action
- treat order history as the only proof an order happened
- link to generated or primary sources instead of duplicating changing claims

A module must not:

- create a second order engine
- hard-code an MCP tool count
- contradict CLI `--help` or MCP `tools/list`
- present app estimates as federal tax law
- turn tax or strategy research into standing trade authorization
- infer a filing result from a strategy name or product label
- imply that an HTTP success proves execution
- erase uncertainty by converting missing values to zero

## Maintenance

When a command or tool changes:

1. update the shared implementation and capability registry
2. update CLI help and MCP schemas
3. update the smallest affected module
4. update deep docs only when the longer explanation changed
5. run `pnpm quality`, `pnpm build`, and `pnpm test:built`

When a tax claim changes:

1. edit [`tax-reference.json`](tax-reference.json)
2. assign the correct evidence lane and certainty
3. use a primary or official source where available
4. run `pnpm generate:tax-reference`
5. commit the generated [`tax-reference.md`](tax-reference.md)
6. align [`tax-strategies.json`](tax-strategies.json) when a linked strategy is affected
7. update narrative modules only if the operating explanation changed

When a tax strategy workflow changes:

1. edit [`tax-strategies.json`](tax-strategies.json)
2. link only source-backed topic and source IDs from the tax-reference catalog
3. preserve required facts, broker reads, red flags, and stop conditions
4. update [`tax-strategy-routing.md`](tax-strategy-routing.md) when the public inventory or contract changes
5. add focused API and CLI tests

Do not expand [`SKILL.md`](../SKILL.md) into a second `AGENTS.md`. Keep the skill as the binding router
and place depth here or in `docs/`.
