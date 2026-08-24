# Robinhood CLI documentation index

This directory contains public, sanitized, long-form evidence and implementation notes. It is the
third progressive-disclosure layer after [`../SKILL.md`](../SKILL.md) and the focused
[`../knowledge/`](../knowledge/README.md) modules.

Do not load every document into an agent context. Start with the skill, load one focused knowledge
module, and open a deep document only when the module points here.

Private captures, credentials, account values, and unsanitized experiments belong outside the public
repository or in the repository's protected local workflow. Public docs must never contain tokens,
account numbers, balances, live order IDs, bank details, or private webhook payloads.

## Core operating contracts

| File | Use |
| --- | --- |
| [`cli-mcp-architecture.md`](cli-mcp-architecture.md) | Shared engine, CLI/MCP adapters, route-map flow, and maintenance invariants |
| [`write-operations.md`](write-operations.md) | Dry-run and live-write contract |
| [`evidence-confidence-ledger.md`](evidence-confidence-ledger.md) | Evidence tier for capability families |
| [`auth.md`](auth.md) | Browser-session auth, local environment loading, and refresh behavior |
| [`undocumented-surface.md`](undocumented-surface.md) | Route discoveries that differ from public documentation |
| [`tos-notes.md`](tos-notes.md) | Terms and access-risk notes |
| [`../ROADMAP.md`](../ROADMAP.md) | Current product goals |

## Agent and MCP design

| File | Use |
| --- | --- |
| [`mcp-efficiency-upgrade-2026-07-14.md`](mcp-efficiency-upgrade-2026-07-14.md) | MCP discovery budgets, profiles, and implementation criteria |
| [`safety-and-workflow-features-2026-07-10.md`](safety-and-workflow-features-2026-07-10.md) | Doctor, order watch, options workbench, snapshots, share-safe output, and MCP profiles |
| [`agent-operating-intelligence-2026-06-04.md`](agent-operating-intelligence-2026-06-04.md) | Dated operating-intelligence study and failure-mode framework |
| [`skill-progressive-disclosure-2026-07-14.md`](skill-progressive-disclosure-2026-07-14.md) | Historical skill-size audit. It is not the current size contract; `scripts/check-skill-integrity.py` is authoritative |
| [`authenticated-api-map-capture-2026-07-14.md`](authenticated-api-map-capture-2026-07-14.md) | Sanitized CDP capture and merge methodology |

Runtime truth is CLI `--help`, MCP `tools/list`, package exports, and generated maps. Dated documents
are evidence, not automatically the current interface.

## Accounts, settings, and service reads

| File | Use |
| --- | --- |
| [`account-settings-capability-map-2026-06-03.md`](account-settings-capability-map-2026-06-03.md) | Funding, recurring, DRIP, sweep, lending, margin, futures, and event-contract surfaces |
| [`account-context-routing-2026-06-02.md`](account-context-routing-2026-06-02.md) | Browser `account_number` routing observations |
| [`security-research-account-number-context-routing-2026-06-03.md`](security-research-account-number-context-routing-2026-06-03.md) | Security notes for account context routing |
| [`account-service-reads-2026-08-04.md`](account-service-reads-2026-08-04.md) | Rewards, inbox, IPO, sweep-rate, and Gold-fee read contracts |
| [`ipo-access-and-24-hour-contract-map-2026-08-08.md`](ipo-access-and-24-hour-contract-map-2026-08-08.md) | IPO readiness and 24-hour equity-order evidence boundaries |
| [`stock-page-profile-2026-06-03.md`](stock-page-profile-2026-06-03.md) | Stock-detail endpoint map |

## Options mechanics and execution

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

## Market and research context

| File | Use |
| --- | --- |
| [`futures-fx-commodities-surface-2026-06-04.md`](futures-fx-commodities-surface-2026-06-04.md) | Dated asset-class surface findings |
| [`institutional-outlook-2026-06-04.md`](institutional-outlook-2026-06-04.md) | Dated institutional regime research, not current gospel |
| [`release-notes-2026-06-04.md`](release-notes-2026-06-04.md) | Historical release notes |
| [`COMPREHENSIVE-AUDIT-2026-06-18.md`](COMPREHENSIVE-AUDIT-2026-06-18.md) | Historical hardening audit; current issues and roadmap supersede completed items |

Operator memory lives at the repository root:

- [`../ball-knowledge.md`](../ball-knowledge.md): dated theses and source leads
- [`../trading-log.md`](../trading-log.md): execution and intent history
- [`../knowledge/signals.md`](../knowledge/signals.md): binding source-quality and memory rules

Memory is context, not current fact, account truth, or standing authorization.

## Archive and naming rules

Use short operational names when a document is maintained. Keep a date in the filename when the date
is part of the evidence, such as a browser capture, live verification, market outlook, or historical
audit.

Completed implementation plans and obsolete captures belong under `archive/`. If an archived or dated
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
