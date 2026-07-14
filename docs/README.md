# Robinhood CLI Docs

This directory is public, sanitized, and meant to be read by agents. Do not
gitignore the whole directory: `SKILL.md`, `AGENTS.md`, the README, and the MCP
tools all depend on these files as the operational record.

Private experiments and S-tier research belong in the gitignored `info/` folder
at the repo root (e.g. `info/robinhood-research/`, `info/webhook-lab/`). That
folder stays local and is never pushed.

## Start Here

| File                                                                                              | Use it for                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli-mcp-architecture.md`                                                                         | How CLI and MCP share one engine, request flow, route-map rules, maintenance invariants, and improvement backlog                                                                                                                     |
| `mcp-efficiency-upgrade-2026-07-14.md`                                                            | Usage-backed MCP token audit, target profiles, payload budgets, test plan, failure modes, and implementation criteria                                                                                                                |
| `skill-progressive-disclosure-2026-07-14.md`                                                      | Section-by-section map from the former 30.5k-token skill handbook to the compact router and focused knowledge modules                                                                                                                |
| `authenticated-api-map-capture-2026-07-14.md`                                                     | Read-only Chrome/CDP coverage, value-free request/response shapes, sanitization contract, and reproducible merge pipeline                                                                                                            |
| `auth.md`                                                                                         | Browser-session bearer auth, token refresh, and local `.env` behavior                                                                                                                                                                |
| `write-operations.md`                                                                             | The dry-run/live-write gate and mutation rules                                                                                                                                                                                       |
| `safety-and-workflow-features-2026-07-10.md`                                                      | Doctor, durable order watch, options workbench, portfolio snapshots, share-safe output, MCP schemas/profiles                                                                                                                         |
| `account-settings-capability-map-2026-06-03.md`                                                   | Account-page surfaces: funding, recurring, DRIP, cash sweep, stock lending, margin, futures, event contracts                                                                                                                         |
| `account-context-routing-2026-06-02.md`                                                           | Browser `?account_number=` routing behavior                                                                                                                                                                                          |
| `security-research-account-number-context-routing-2026-06-03.md`                                  | Security-research notes for account-number context routing                                                                                                                                                                           |
| `options-quantitative-playbook-2026-06-03.md`                                                     | Greeks, pricing, spread math, and strategy posture                                                                                                                                                                                   |
| `options-strategies-knowledge-base-2026-06-03.md`                                                 | The strategy catalog (CSP/CC/Wheel/spreads/condors/rolling…) with payoff + Greek posture                                                                                                                                             |
| `options-strategy-order-templates-2026-06-03.md`                                                  | Hard per-strategy leg templates (side/position_effect/ratio) so you can't botch the legs                                                                                                                                             |
| `options-greeks-strategy-research-2026-06-02.md`                                                  | Greeks deep research + the aggressive-vs-defined-risk scoring heuristic                                                                                                                                                              |
| `tax-aware-options-strategies.md`                                                                 | Tax angles: CC rolling/deferral, qualified-covered-call taint, §1256 60/40, wash sale, constructive sale                                                                                                                             |
| `strategy-deep-dive-the-wheel-2026-06-04.md` / `strategy-deep-dive-rolling-options-2026-06-04.md` | Advanced multi-lens deep dives (mechanics/Greeks/tax/sentiment/failure modes) + dissertation-level Quant appendices                                                                                                                  |
| `docs/archive/options-strategy-execution-smoke-2026-06-03.md`                                     | Dry-run strategy quote smoke evidence (archived)                                                                                                                                                                                     |
| `live-write-verification-2026-06-03.md`                                                           | Live recurring pause/resume round-trip + DRIP write-method correction (405)                                                                                                                                                          |
| `options-contract-navigation-2026-06-03.md`                                                       | Exact-contract API resolution and account-pinned chain navigation                                                                                                                                                                    |
| `stock-page-profile-2026-06-03.md`                                                                | Stock detail page endpoint mapping                                                                                                                                                                                                   |
| `docs/archive/browser-capture-2026-05-26.md`                                                      | Older browser capture notes (archived)                                                                                                                                                                                               |
| `agent-operating-intelligence-2026-06-04.md`                                                      | **Boot-smart KB** — read first: cardinal rule, account/order/signal-sourcing decision frameworks, failure→fix tree, roadmap                                                                                                          |
| `index-options-1256-conclusion-2026-06-04.md`                                                     | RH **does** offer cash-settled §1256 index options (SPX/SPXW/XSP/NDX/VIX/RUT) — hidden from search, live under `options/chains/?underlying_symbol=`                                                                                  |
| `futures-fx-commodities-surface-2026-06-04.md`                                                    | Futures read-only (ceres TLS-walled), no spot FX, commodities via ETF proxies only                                                                                                                                                   |
| `institutional-outlook-2026-06-04.md`                                                             | Major-firm regime view (BlackRock/Vanguard/JPM/GS/MS year-ahead + 5–10yr CMAs) — info layer that _frames_ attention, not gospel; refresh each cycle                                                                                  |
| `release-notes-2026-06-04.md`                                                                     | Changelog: signal-sourcing doctrine, Ball Knowledge ledger, order-evidence rule, and the session's safety/command work                                                                                                               |
| `COMPREHENSIVE-AUDIT-2026-06-18.md`                                                               | 2026-06-18 hardening-sprint audit synthesis (38 prioritized fixes, B+ grade). The detailed per-track reports (parity, doc-contradictions, MCP best-practices, financial-tools gaps, master plan) are archived under `docs/archive/`. |
| `undocumented-surface.md`                                                                         | Route discoveries that differ from public docs                                                                                                                                                                                       |
| `tos-notes.md`                                                                                    | Risk and terms notes                                                                                                                                                                                                                 |

**Repo-root files (not under `docs/`):**

| File                                                                                              | Use it for                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../ball-knowledge.md`                                                                            | **Ball Knowledge** — the operator's living, append-only investing-memory ledger (themes, tickers, sources, hunches). Read on finance tasks; canonical operating rules in `../knowledge/signals.md`. |
| `../trading-log.md`                                                                               | **Trading log** — append-only execution + **intent** history (the strategy thread / "what we're rolling from"). Canonical operating rules in `../knowledge/signals.md`.                             |
| `../knowledge/signals.md`                                                                         | Source-quality and due-diligence doctrine: X/Reddit pulse, RH confirmer, institutional/academic validation, Ball Knowledge, and execution-evidence rules                                            |
| `strategy-deep-dive-the-wheel-2026-06-04.md` / `strategy-deep-dive-rolling-options-2026-06-04.md` | Advanced multi-perspective deep dives (mechanics, Greeks, tax, current sentiment, decision rules, failure modes) extending the strategy KB                                                          |

## Naming Rule

Future docs should use short operational names when possible. Keep dated names
only when the date is evidence, for example browser captures or smoke-test
results.

## Release Rule

Public docs must not include account numbers, balances, bearer tokens, cookies,
live order IDs, bank details, or private webhook payloads. If a doc needs those
to reproduce a finding, keep the private material in the gitignored `info/`
folder and link only to sanitized commands or route templates here.

<!-- Zayd Khan // cold // www.zayd.wtf -->
