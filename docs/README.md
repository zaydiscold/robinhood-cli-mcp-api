# Robinhood CLI Docs

This directory is public, sanitized, and meant to be read by agents. Do not
gitignore the whole directory: `SKILL.md`, `AGENTS.md`, the README, and the MCP
tools all depend on these files as the operational record.

Private experiments and S-tier research belong in the gitignored `info/` folder
at the repo root (e.g. `info/robinhood-research/`, `info/webhook-lab/`). That
folder stays local and is never pushed.

## Start Here

| File | Use it for |
|------|------------|
| `auth.md` | Browser-session bearer auth, token refresh, and local `.env` behavior |
| `write-operations.md` | The dry-run/live-write gate and mutation rules |
| `account-settings-capability-map-2026-06-03.md` | Account-page surfaces: funding, recurring, DRIP, cash sweep, stock lending, margin, futures, event contracts |
| `account-context-routing-2026-06-02.md` | Browser `?account_number=` routing behavior |
| `security-research-account-number-context-routing-2026-06-03.md` | Security-research notes for account-number context routing |
| `options-quantitative-playbook-2026-06-03.md` | Greeks, pricing, spread math, and strategy posture |
| `options-strategy-execution-smoke-2026-06-03.md` | Dry-run strategy quote smoke evidence |
| `live-write-verification-2026-06-03.md` | Live recurring pause/resume round-trip + DRIP write-method correction (405) |
| `options-contract-navigation-2026-06-03.md` | Exact-contract API resolution and account-pinned chain navigation |
| `stock-page-profile-2026-06-03.md` | Stock detail page endpoint mapping |
| `browser-capture-2026-05-26.md` | Older browser capture notes |
| `undocumented-surface.md` | Route discoveries that differ from public docs |
| `tos-notes.md` | Risk and terms notes |

## Naming Rule

Future docs should use short operational names when possible. Keep dated names
only when the date is evidence, for example browser captures or smoke-test
results.

## Release Rule

Public docs must not include account numbers, balances, bearer tokens, cookies,
live order IDs, bank details, or private webhook payloads. If a doc needs those
to reproduce a finding, keep the private material in the gitignored `info/`
folder and link only to sanitized commands or route templates here.
