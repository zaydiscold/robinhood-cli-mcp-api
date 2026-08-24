# knowledge/: focused operating modules

This directory is the task-specific layer between the concise [`SKILL.md`](../SKILL.md) router and
the long-form [`docs/`](../docs/README.md) research library. Load the smallest module that matches
the user's request. Do not ingest every module by default.

## Progressive disclosure

| Layer | Source | Use |
| --- | --- | --- |
| 0: operating contract | [`SKILL.md`](../SKILL.md) | Safety invariants, surface selection, and intent routing |
| 1: focused module | `knowledge/*.md` | Commands, decision rules, and task-specific failure modes |
| 2: generated reference | [`tax-reference.md`](tax-reference.md) and generated API maps | Versioned claims or machine contracts that prose must not contradict |
| 3: deep research | [`docs/*.md`](../docs/README.md) | Dated evidence, methodology, and longer analysis |
| 4: maintainer reference | [`AGENTS.md`](../AGENTS.md) | Auth, route details, implementation, and raw examples |
| runtime truth | CLI `--help`, MCP `tools/list`, package exports | What the current installed build actually exposes |

Use this precedence when sources conflict:

```text
current runtime
> generated contract
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

For **every tax question**, load [`tax-reference.md`](tax-reference.md) first. It is generated from a
versioned source catalog and separates primary law, IRS guidance, Robinhood behavior, and planning
inference.

| Module | Load when | Main surfaces |
| --- | --- | --- |
| [`tax-reference.md`](tax-reference.md) | Any question about wash sales, Section 1256, QCCs, exercise, boxes, constructive sales, lots, or broker estimates | `robinhood-tax`, importable tax-reference API, MCP knowledge |
| [`tax.md`](tax.md) | The question combines tax mechanics with live Robinhood accounts, lots, history, settings, or documents | `tax-lots`, `documents`, `history`, `recurring`, `settings` |
| [`tax-loss-harvesting.md`](tax-loss-harvesting.md) | The user is considering a loss sale or replacement exposure | 61-day control workflow and lot evidence |

Tax reference reads are educational and never authorize a sale. Live account facts and state-changing
actions remain separate surfaces with separate consent.

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
- preserve missing, partial, stale, and unverified states
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
6. update narrative modules only if the operating explanation changed

Do not expand [`SKILL.md`](../SKILL.md) into a second `AGENTS.md`. Keep the skill as the binding router
and place depth here or in `docs/`.
