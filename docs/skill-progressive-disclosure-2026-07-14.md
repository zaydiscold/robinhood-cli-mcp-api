# SKILL.md progressive-disclosure map — 2026-07-14

## What changed

`SKILL.md` was converted from a 1,627-line, 30,536-token combined handbook into a compact router and
real-money operating contract. The router retains the safety warning, preflight, intent mapping,
80/20 commands, complete account discovery rule, write gate, confirmation lifecycle, and order-history
evidence rule. Deep material is loaded only when the active task needs it.

This change removes duplicated prompt cost; it does not remove the underlying operational knowledge.
`CLAUDE.md` remains a symlink to `SKILL.md`.

## Where each former section lives now

| Former `SKILL.md` material | Canonical location after the split |
|---|---|
| Real-money notice, productive-operator rules, quick scan | `SKILL.md` non-negotiable operating contract |
| Progressive-disclosure model and task navigation | `SKILL.md` progressive disclosure + intent router; `knowledge/README.md` |
| Capability catalog and 80/20 surface | `SKILL.md` 80/20; `knowledge/cli-routing.md`; live CLI help and MCP `tools/list` |
| Complete account selector, account types, buying power | `SKILL.md` account discovery; `knowledge/accounts.md` |
| Ranked failure modes and write rules | `SKILL.md` lifecycle/guards; `knowledge/execution-safety.md` |
| Quick start, auth, preflight, route/query patterns, build footguns | `SKILL.md` preflight; `knowledge/cli-routing.md`; `docs/auth.md` |
| Options Greeks, scenario math, quantitative review | `knowledge/greeks.md`; `docs/options-quantitative-playbook-2026-06-03.md` |
| Strategy classification and multi-leg topology | `knowledge/multi-leg.md`; `docs/options-strategy-order-templates-2026-06-03.md` |
| Roll behavior and cash/margin/IRA dispatch | `knowledge/rolling.md`; `docs/native-option-roll-surface-2026-06-23.md` |
| Wheel and position-building strategy | `knowledge/wheel.md`; `knowledge/position-building.md` |
| Tax, §1256, wash sales, harvesting | `knowledge/tax.md`; `knowledge/tax-loss-harvesting.md` |
| Signal sourcing, Ball Knowledge, trading log | `knowledge/signals.md`; `ball-knowledge.md`; `trading-log.md` |
| Browser verification and endpoint-research method | `knowledge/cli-routing.md`; `docs/undocumented-surface.md` |
| MCP registration, tools, profiles, and safety | `knowledge/mcp-operations.md`; live `tools/list` |
| One-shot recipes | `SKILL.md` intent router/80/20; focused knowledge modules; `AGENTS.md` raw reference |
| Full raw route and order-body examples | `AGENTS.md` |

### Exact former-heading crosswalk

This crosswalk makes the move auditable at the old section boundary rather than relying only on the
broader topic summary above.

| Former heading | Current canonical destination |
|---|---|
| What this is / Agent Quick Scan | `SKILL.md` real-money notice + non-negotiable contract |
| Table of Contents / Navigation by Task / When to Use | `SKILL.md` frontmatter, progressive disclosure, and intent router |
| Skill Operating Model | `SKILL.md` progressive disclosure; `knowledge/README.md` |
| Capability Catalog | `SKILL.md` 80/20; `knowledge/cli-routing.md`; live CLI help and MCP `tools/list` |
| Strategy & tax knowledge | `knowledge/{wheel,position-building,rolling,multi-leg,greeks,tax,tax-loss-harvesting,dividend-investing}.md` |
| `?account_number=` universal selector | `SKILL.md` account discovery; `knowledge/accounts.md` |
| Failure modes | `SKILL.md` high-value guards; `knowledge/execution-safety.md` |
| Quick Start / Auth / Agent Preflight | `SKILL.md` preflight; `knowledge/cli-routing.md`; `docs/auth.md` |
| CLI Usage 80/20 / Current Read-Write Surface | `SKILL.md` 80/20; `knowledge/cli-routing.md` |
| Critical Query Patterns / Account Context and Strategy Maps | `knowledge/cli-routing.md`; `knowledge/accounts.md`; `knowledge/multi-leg.md` |
| Browser Verification Rule | `knowledge/cli-routing.md` account-aware web verification |
| Options Greeks and Strategy Math | `knowledge/greeks.md`; `docs/options-quantitative-playbook-2026-06-03.md` |
| Options Strategy Classification | `knowledge/multi-leg.md`; `docs/options-strategy-order-templates-2026-06-03.md` |
| Quant Review Heuristics / Options Review Contract | `knowledge/greeks.md`; `knowledge/playbooks/broker-call.md` |
| Options CLI/API Playbook / Chain Builder State | `knowledge/multi-leg.md`; `AGENTS.md` options sections |
| Exact Contract Navigation Rules | `docs/options-contract-navigation-2026-06-03.md`; `knowledge/cli-routing.md` |
| Route Matching Gotchas / Skill Maintenance Rules | `knowledge/cli-routing.md` raw matching + route maintenance |
| Operating Playbook | `SKILL.md` intent router; the task-selected knowledge module |
| Portfolio loss attribution | `SKILL.md` 80/20; `knowledge/cli-routing.md` portfolio attribution |
| Worked Build: Iron Condor | `knowledge/multi-leg.md`; `AGENTS.md` raw worked examples |
| Account-Aware Capabilities / PDT | `knowledge/accounts.md` |
| Live Write and Order Lifecycle | `SKILL.md` lifecycle; `knowledge/execution-safety.md`; broker-call playbook |
| Equity buying | `knowledge/execution-safety.md`; `knowledge/market-mechanics.md`; broker-call playbook |
| Options order gotchas / UUID enumeration / owned-contract inspection | `knowledge/execution-safety.md`; `knowledge/multi-leg.md`; CLI `options enumerate/holdings/inspect` |
| Sentiment and deep-link pipeline / Signal sourcing | `knowledge/signals.md`; `knowledge/cli-routing.md` browser verification |
| Ball Knowledge / Trading log | `knowledge/signals.md`; `ball-knowledge.md`; `trading-log.md` |
| Research Methodology | `knowledge/cli-routing.md`; `docs/undocumented-surface.md` |
| MCP Server / Registration / MCP Tools / Safety Gates | `knowledge/mcp-operations.md`; live `tools/list` |
| Accounts | `SKILL.md` account discovery; `knowledge/accounts.md` |
| Cross-Machine Infrastructure | `knowledge/cli-routing.md` auth/build and cross-machine footguns; `docs/auth.md` |
| Common Pitfalls: route map, portfolio, watchlists, writes, crypto | `knowledge/cli-routing.md`; `knowledge/execution-safety.md`; `knowledge/market-mechanics.md` |
| One-Shot Recipes | `SKILL.md` intent/80-20; task module; `AGENTS.md` raw reference |
| Day/After-Hours P&L | `knowledge/cli-routing.md` portfolio attribution |
| Verification Checklist / Agent Rules | `SKILL.md` verification; CLI/MCP modules' diagnostic sections |

## Maintenance rule

Keep `SKILL.md` between 4,000 and 6,000 `o200k_base` tokens. Add durable topic-specific knowledge to
one focused `knowledge/*.md` module, and link it from the router/index. Do not grow the router with a
new tool-by-tool catalog: live help, the capability registry, and MCP `tools/list` are authoritative.

Verify the budget with:

```bash
python3 scripts/check-skill-token-budget.py
```

The script uses `tiktoken`'s `o200k_base` encoding and fails with installation guidance if the module
is absent. Local Markdown links are checked separately during documentation verification.
