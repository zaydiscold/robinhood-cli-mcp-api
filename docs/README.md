# Robinhood CLI documentation

Start with the task you are doing. The [project README](../README.md) covers installation and the
first account read; the [command reference](command-reference.md) routes everyday work to the
maintained CLI. Agents should read [SKILL.md](../SKILL.md), then one focused
[knowledge module](../knowledge/README.md), rather than loading this entire library.

## Find the right guide

| I want to… | Start here |
| --- | --- |
| Install, connect, and run a first read | [Project README](../README.md), [authentication](auth.md) |
| Inspect accounts, positions, performance, or risk | [Command reference](command-reference.md), [accounts module](../knowledge/accounts.md), [margin intelligence](margin-call-intelligence.md) |
| Understand what the analytics measure | [Portfolio-read reliability audit](reliability-audit-2026-10-27.md), [options exposure analytics](options-exposure-analytics.md) |
| Connect an agent or choose its tool catalog | [MCP README](../mcp/README.md), [MCP operations](../knowledge/mcp-operations.md) |
| Plan an option strategy or roll | [Multi-leg module](../knowledge/multi-leg.md), [rolling module](../knowledge/rolling.md), [execution safety](../knowledge/execution-safety.md) |
| Prepare an account change and verify its result | [Write contract](write-operations.md), [execution safety](../knowledge/execution-safety.md) |
| Deposit, transfer, or withdraw | [Deposit module](../knowledge/deposits.md), [internal transfers](../knowledge/internal-transfers.md), [withdrawals](withdrawals.md) |
| Inspect tax lots or research tax mechanics | [Tax module](../knowledge/tax.md), [tax strategy routing](../knowledge/tax-strategy-routing.md) |
| Extend the CLI, MCP, or API map | [Architecture](cli-mcp-architecture.md), [maintainer guide](../AGENTS.md), [route research](undocumented-surface.md) |
| Check how well a capability is evidenced | [Evidence-confidence ledger](evidence-confidence-ledger.md), then the dated receipt it cites |

## How to read this library

Maintained operational guides describe the current contract; dated research and verification notes
record what was observed at a particular time. A dated audit is not a promise that every conclusion
still holds. Runtime CLI `--help`, MCP `tools/list`, package exports, and generated contracts resolve
interface questions; report discrepancies rather than silently choosing a convenient source.

Public documentation must be sanitized. Keep credentials, account identifiers, balances, live order
IDs, bank details, screenshots, and raw responses in the operator's private workflow. Optional
operator templates live in [`templates/operator/`](../templates/operator/); personal entries are not
part of installation. See [local encryption](local-encryption.md) before handling a source checkout's
protected `local/` files.

## Maintained operating and implementation guides

| File | Use |
| --- | --- |
| [`command-reference.md`](command-reference.md) | Maintained task-to-command reference and specialist workflow links |
| [`reliability-audit-2026-10-27.md`](reliability-audit-2026-10-27.md) | Dated portfolio-read discrepancies, fixes, reproduction steps, and remaining accounting limits |
| [`cli-mcp-architecture.md`](cli-mcp-architecture.md) | Shared engine, CLI/MCP adapters, route-map flow, and maintenance invariants |
| [`write-operations.md`](write-operations.md) | Dry-run and live-write contract |
| [`evidence-confidence-ledger.md`](evidence-confidence-ledger.md) | Evidence tier for capability families |
| [`auth.md`](auth.md) | Browser-session auth, local environment loading, and refresh behavior |
| [`undocumented-surface.md`](undocumented-surface.md) | Route discoveries that differ from public documentation |
| [`tos-notes.md`](tos-notes.md) | Terms and access-risk notes |
| [`../ROADMAP.md`](../ROADMAP.md) | Current product goals |

## Dated agent and MCP design evidence

| File | Use |
| --- | --- |
| [`mcp-efficiency-upgrade-2026-07-14.md`](mcp-efficiency-upgrade-2026-07-14.md) | MCP discovery budgets, profiles, and implementation criteria |
| [`safety-and-workflow-features-2026-07-10.md`](safety-and-workflow-features-2026-07-10.md) | Doctor, order watch, options workbench, snapshots, share-safe output, and MCP profiles |
| [`agent-operating-intelligence-2026-06-04.md`](agent-operating-intelligence-2026-06-04.md) | Dated operating-intelligence study and failure-mode framework |
| [`skill-progressive-disclosure-2026-07-14.md`](skill-progressive-disclosure-2026-07-14.md) | Historical skill-size audit. It is not the current size contract; `scripts/check-skill-integrity.py` is authoritative |
| [`authenticated-api-map-capture-2026-07-14.md`](authenticated-api-map-capture-2026-07-14.md) | Sanitized CDP capture and merge methodology |

Runtime truth is CLI `--help`, MCP `tools/list`, package exports, and generated maps. Dated documents
are evidence, not automatically the current interface.

## Account and service discovery evidence

| File | Use |
| --- | --- |
| [`account-settings-capability-map-2026-06-03.md`](account-settings-capability-map-2026-06-03.md) | Funding, recurring, DRIP, sweep, lending, margin, futures, and event-contract surfaces |
| [`account-context-routing-2026-06-02.md`](account-context-routing-2026-06-02.md) | Browser `account_number` routing observations |
| [`security-research-account-number-context-routing-2026-06-03.md`](security-research-account-number-context-routing-2026-06-03.md) | Security notes for account context routing |
| [`account-service-reads-2026-08-04.md`](account-service-reads-2026-08-04.md) | Rewards, inbox, IPO, sweep-rate, and Gold-fee read contracts |
| [`ipo-access-and-24-hour-contract-map-2026-08-08.md`](ipo-access-and-24-hour-contract-map-2026-08-08.md) | IPO readiness and 24-hour equity-order evidence boundaries |
| [`stock-page-profile-2026-06-03.md`](stock-page-profile-2026-06-03.md) | Stock-detail endpoint map |

## Dated options research and execution evidence

| File | Use |
| --- | --- |
| [`options-quantitative-playbook-2026-06-03.md`](options-quantitative-playbook-2026-06-03.md) | Pricing, Greeks, payoff, and scenario math |
| [`options-strategies-knowledge-base-2026-06-03.md`](options-strategies-knowledge-base-2026-06-03.md) | Strategy catalog and payoff posture |
| [`options-strategy-order-templates-2026-06-03.md`](options-strategy-order-templates-2026-06-03.md) | Per-strategy leg templates |
| [`options-greeks-strategy-research-2026-06-02.md`](options-greeks-strategy-research-2026-06-02.md) | Greek research and heuristics |
| [`options-contract-navigation-2026-06-03.md`](options-contract-navigation-2026-06-03.md) | Exact-contract API resolution and navigation |
| [`strategy-deep-dive-the-wheel-2026-06-04.md`](strategy-deep-dive-the-wheel-2026-06-04.md) | Wheel mechanics and failure modes |
| [`strategy-deep-dive-rolling-options-2026-06-04.md`](strategy-deep-dive-rolling-options-2026-06-04.md) | Rolling mechanics, cash-account constraints, and dated research |
| [`live-write-verification-2026-06-03.md`](live-write-verification-2026-06-03.md) | Historical live mutation evidence |

## Tax research and tax-lot operation

Start every active tax question with the generated
[`../knowledge/tax-reference.md`](../knowledge/tax-reference.md) or `robinhood-tax`. It is the
maintained source catalog and separates primary law, IRS guidance, broker behavior, and planning
inference.

| File | Use |
| --- | --- |
| [`tax-aware-options-strategies.md`](tax-aware-options-strategies.md) | Options-tax mechanics and the CLI/API/MCP workflow |
| [`tax-lot-intelligence-and-exact-lot-selling.md`](tax-lot-intelligence-and-exact-lot-selling.md) | Open-lot inventory, stable-ID planning, selected/closed reads, and live submission boundary |
| [`tax-lot-strategy-playbook.md`](tax-lot-strategy-playbook.md) | Educational curriculum and planning caveats |
| [`index-options-1256-conclusion-2026-06-04.md`](index-options-1256-conclusion-2026-06-04.md) | Dated Robinhood index-option product evidence |

Narrative tax docs must not contradict the generated catalog. They also must not hard-code changing
rate comparisons, convert Robinhood estimates into law, or present box-spread, QCC, wash-sale,
straddle, or constructive-sale conclusions as automatic.

## Historical market context and audits

| File | Use |
| --- | --- |
| [`futures-fx-commodities-surface-2026-06-04.md`](futures-fx-commodities-surface-2026-06-04.md) | Dated asset-class surface findings |
| [`institutional-outlook-2026-06-04.md`](institutional-outlook-2026-06-04.md) | Dated institutional regime research, not current gospel |
| [`release-notes-2026-06-04.md`](release-notes-2026-06-04.md) | Historical release notes |
| [`COMPREHENSIVE-AUDIT-2026-06-18.md`](COMPREHENSIVE-AUDIT-2026-06-18.md) | Historical hardening audit; current issues and roadmap supersede completed items |

Operator memory is separate from public product documentation. Optional local files such as
`ball-knowledge.md`, `trading-log.md`, and `trade-notes.md` record the operator's theses, intent, and
lessons; [templates](../templates/operator/) show their shape without publishing personal entries.
The [signals module](../knowledge/signals.md) defines source-quality and memory rules. Memory is
context, not current account truth or standing authorization.

## Archive and naming rules

Use short operational names when a document is maintained. Keep a date in the filename when the date
is part of the evidence, such as a browser capture, live verification, market outlook, or historical
audit.

[`archive/`](archive/) holds historical plans and superseded material; [`evidence-receipts/`](evidence-receipts/) holds structured verification evidence. Completed plans and obsolete captures are candidates for archiving after their maintained replacement and inbound links have been checked. Do not move a document merely because its filename contains a date. If an archived or dated
document conflicts with a maintained module, generated contract, or runtime surface, report the
discrepancy and use the newer authority.

## Release rules

Before publishing documentation changes:

1. verify all local links
2. remove private identifiers and credentials
3. distinguish live, captured, generated, inferred, and historical evidence
4. update review dates for time-sensitive claims
5. update generated sources rather than hand-editing generated output
6. run `pnpm quality`

<!-- Zayd Khan // cold // www.zayd.wtf -->
