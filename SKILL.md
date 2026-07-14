---
name: robinhood-cli
description: >
  Use for live Robinhood account reads, portfolio and position analysis, quotes, options research,
  dry-run or explicitly approved orders, recurring investments, account settings, Robinhood CLI/MCP
  operation, endpoint research, market-signal sourcing, and the operator's Ball Knowledge ledger.
  Covers brokerage, options, crypto, watchlists, account discovery, write gates, and order evidence.
version: 2.1.0
author: Zayd (@zaydiscold)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [robinhood, trading, finance, api, mcp, brokerage, crypto, stocks, options, due-diligence]
    related_skills: []
---

# Robinhood CLI + MCP

> **REAL-MONEY TOOL.** This control plane can place or cancel real trades and change a live
> Robinhood account on the owner's behalf. Tell the user once at the start of an autonomous trading
> session. Reads and dry-runs may proceed. Before any state change, obtain explicit approval for the
> exact operation. If account, side, effect, quantity, or price is unclear, stop and confirm.

This file is the compact router and safety contract. `CLAUDE.md` is a symlink to it. Do not load the
whole repository into context: select one focused reference from [the knowledge index](knowledge/README.md).
Use [AGENTS.md](AGENTS.md) only when a complete API and raw-order reference is actually needed.

## Non-negotiable operating contract

1. **Prefer a first-class command or MCP tool.** It already performs the joins, query handling,
   typing, account scoping, and safety checks. Use raw `brokerage execute` only for an unwrapped route.
2. **Read, classify, preview, approve, gate, send, verify.** Never skip from intent to execution.
3. **Resolve the account at runtime and pass it explicitly.** Never hardcode an account number or
   assume the UI/default account is the one the user means.
4. **Classify options precisely.** Sell-to-close, covered call, cash-secured put, credit spread, and
   naked short exposure are different orders. Never infer undefined-risk exposure from vague wording.
5. **Report money questions in dollars, weighted by position size.** A percentage leaderboard is not
   portfolio attribution. Use `portfolio` for day or after-hours P&L.
6. **Writes are dry-run by default.** A write is live only while
   `ROBINHOOD_ALLOW_LIVE_WRITE=1` is in that process's environment. Prefer an inline, one-command
   scope; never persist the switch in a shell profile. `--dry-run` / `dryRun:true` always forces preview.
7. **Order history is the only execution proof.** A review page, click, HTTP status, agent log, or
   dry-run body is not proof. Confirm the order in `orders/` or `options/orders/` with its actual
   state and ID. If no record exists, report the action as non-executed.

Read [execution-safety.md](knowledge/execution-safety.md) before every write. For a conversational
trade request, follow [the broker-call playbook](knowledge/playbooks/broker-call.md) end to end.

## Progressive disclosure

| Need | Load this, and only this |
|---|---|
| Cold-start operating model or failure diagnosis | [agent operating intelligence](docs/agent-operating-intelligence-2026-06-04.md) |
| Accounts, balances, buying power, cash/margin/IRA capabilities | [accounts](knowledge/accounts.md) |
| Any live write, cancel, settings change, or rejected order | [execution safety](knowledge/execution-safety.md) |
| CLI route matching, command families, map edits, auth, build footguns | [CLI and route operations](knowledge/cli-routing.md) |
| MCP discovery, profiles, registration, response discipline | [MCP operations](knowledge/mcp-operations.md) |
| Wheel / building toward 100 shares | [wheel](knowledge/wheel.md) / [position building](knowledge/position-building.md) |
| Rolling an option | [rolling](knowledge/rolling.md) |
| Spreads, condors, calendars, multi-leg orders | [multi-leg](knowledge/multi-leg.md) |
| Greeks or scenario P&L | [Greeks](knowledge/greeks.md) |
| Dividends | [dividend investing](knowledge/dividend-investing.md) |
| Tax, §1256, wash sales, harvesting | [tax](knowledge/tax.md) / [tax-loss harvesting](knowledge/tax-loss-harvesting.md) |
| Market sessions, ticks, spreads, stale quotes, settlement | [market mechanics](knowledge/market-mechanics.md) |
| News, X/Reddit, institutional sources, Ball Knowledge | [signals](knowledge/signals.md) |
| Complete raw API/order-body reference | [AGENTS.md](AGENTS.md) |

The dated studies under `docs/` are evidence and background, not cold-start material. When a focused
module and a dated live verification disagree, prefer current API evidence, report the discrepancy,
and update the stale documentation.

## Preflight

Run this before an account-specific operation:

```bash
date
node cli/dist/index.js --help >/dev/null
node scripts/equity-buy.mjs --preflight
node cli/dist/index.js brokerage routes --json \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])"
```

- `--preflight` is the lightweight auth check. On failure, run `pnpm auth:refresh` and retry once.
- The date controls expirations, market sessions, after-hours interpretation, and staged cash rolls.
- The route count is live and intentionally not hardcoded.
- If built output is missing or stale: `pnpm --filter @zaydiscold/robinhood-cli build` and
  `pnpm --filter @zaydiscold/robinhood-cli-mcp build`.
- Auth comes from `ROBINHOOD_BROKERAGE_TOKEN` in the gitignored repo-root `.env`. Never print or
  include tokens, account numbers, balances, or raw private responses in shareable artifacts.

## Intent router

| User intent | First move | Focused reference |
|---|---|---|
| What do I own? | `accounts`, then `positions --account <N>` and `options positions --account <N>` | [accounts](knowledge/accounts.md) |
| What am I down today / after hours? | `portfolio --day` / `portfolio --after-hours` | [CLI routing](knowledge/cli-routing.md) |
| Quote one or more symbols | `quote AAPL NVDA --json` | [market mechanics](knowledge/market-mechanics.md) |
| Open orders / cancel everything | `orders open`; preview `panic` before any gated cancel | [execution safety](knowledge/execution-safety.md) |
| Buy or sell equity | `pretrade`, then `buy` / `sell` dry-run | [broker call](knowledge/playbooks/broker-call.md) |
| Inspect an owned option | `options holdings`, then `options inspect` | [multi-leg](knowledge/multi-leg.md) |
| Price or place an option | `options enumerate`, `options strategy-quote`, `pretrade` | [multi-leg](knowledge/multi-leg.md) |
| Roll an option | `options roll-plan --mode auto` | [rolling](knowledge/rolling.md) |
| Wheel / assigned / covered call | `wheel [symbol]` | [wheel](knowledge/wheel.md) |
| Risk or scenario analysis | `risk`, `exposure`, `whatif` | [Greeks](knowledge/greeks.md) |
| Upcoming expirations, earnings, ex-dividend dates | `calendar`; use `options-events` for assignments/exercises | [market mechanics](knowledge/market-mechanics.md) |
| Returns over time | `performance` (`perf`) | [CLI routing](knowledge/cli-routing.md) |
| Dividends or total income | `dividends`; `income` adds option premium | [dividend investing](knowledge/dividend-investing.md) |
| Statements or 1099s | `documents` | [accounts](knowledge/accounts.md) |
| Margin use / buying power | `margin`; `buying-power --account <N>` | [accounts](knowledge/accounts.md) |
| Search, news, ratings, earnings, movers | `brokerage search`, `news`, `ratings`, `earnings`, `movers` | [signals](knowledge/signals.md) |
| Watchlists / basket buy | `watchlist list|items`; preview `watchlist buy` | [CLI routing](knowledge/cli-routing.md) |
| Recurring investments | `recurring list|pause|resume`; preview changes first | [execution safety](knowledge/execution-safety.md) |
| Account settings | Read `settings show`; consult capability map before any change | [settings capability map](docs/account-settings-capability-map-2026-06-03.md) |
| MCP setup / missing tool | Inspect live `tools/list`, profile, and server environment | [MCP operations](knowledge/mcp-operations.md) |
| Unwrapped or undocumented route | `brokerage describe`, then a dry-run plan | [CLI routing](knowledge/cli-routing.md) |
| Review completed trades | `review`; attach a lesson with `review note` | [signals](knowledge/signals.md) |

## The 80/20 commands

Run from the repository root. The installed `robinhood-cli` command and
`node cli/dist/index.js` should resolve to the same built entrypoint.

```bash
# Discover and understand
robinhood-cli accounts --json
robinhood-cli recipes "after hours"
robinhood-cli brokerage describe "portfolios/{account_number}/" --json

# Portfolio and market reads
robinhood-cli portfolio --day --json
robinhood-cli positions --account <ACCOUNT_NUMBER> --json
robinhood-cli quote AAPL NVDA --json
robinhood-cli history --account <ACCOUNT_NUMBER> --json
robinhood-cli orders open --account <ACCOUNT_NUMBER> --json

# Options: enumerate UUIDs before pricing or ordering
robinhood-cli options positions --account <ACCOUNT_NUMBER> --json
robinhood-cli options expirations AAPL --json
robinhood-cli options enumerate AAPL --expiration <YYYY-MM-DD> --json
robinhood-cli options chain AAPL --expiration <YYYY-MM-DD> --width 6 --json
robinhood-cli options strategy-quote call-debit-spread \
  --account <ACCOUNT_NUMBER> --symbol AAPL --expiration <YYYY-MM-DD> \
  --leg long_call=<STRIKE> --leg short_call=<STRIKE> --json

# Risk, events, and research
robinhood-cli risk --account <ACCOUNT_NUMBER> --json
robinhood-cli whatif --account <ACCOUNT_NUMBER> --spot-pct -10 --json
robinhood-cli calendar --account <ACCOUNT_NUMBER> --json
robinhood-cli news AAPL --json
```

Prefer purpose-built commands. Raw route execution is a fallback:

```bash
robinhood-cli brokerage execute "portfolios/{account_number}/" \
  --param account_number=<ACCOUNT_NUMBER> --json --full
```

Raw query values use repeatable `--query-param key=value`; they are not embedded into the route match.
Every raw write must specify `--method POST|PATCH|PUT|DELETE`. See
[CLI and route operations](knowledge/cli-routing.md) before using this escape hatch.

## Account discovery and ownership

`accounts/` can under-report. The complete account graph comes from the transfer service, exposed by
the first-class `accounts` command / `robinhood_accounts` tool. When debugging the raw API:

```bash
robinhood-cli brokerage execute \
  "bonfire.robinhood.com/transfer/accounts/" --json --full
```

For every account-scoped action:

1. Enumerate current accounts.
2. Resolve the user's intended account by type, nickname, and holdings; do not infer from order.
3. Read its capabilities and buying power.
4. Pass the resolved account explicitly on every subsequent call.
5. Before a write, echo the account label/type plus the proposed symbol, side/effect, quantity,
   order type, limit/notional, time-in-force, and estimated buying-power or collateral impact.

Cash, margin, IRA, crypto, and futures accounts have different capabilities and settlement models.
Load [accounts](knowledge/accounts.md); do not reason from the nickname.

## Live-write lifecycle

The normal lifecycle is deliberately repetitive:

1. **Read account truth:** accounts, positions, open orders, buying power, and relevant quotes.
2. **Classify:** exact asset, strategy, side, `position_effect`, quantity, account capability, and
   whether the request is a close, roll, covered/secured open, defined-risk open, or naked exposure.
3. **Enumerate:** resolve instrument and option UUIDs from live data; never guess an identifier.
4. **Pretrade:** run the first-class `pretrade` guard for buying power, collateral, marketability,
   min-tick, and account support. Treat BLOCK as a stop, not an advisory.
5. **Preview:** build the dry-run order and show the essential resolved fields, not a huge raw payload.
6. **Confirm:** obtain explicit approval for that exact preview. Approval for research or a prior order
   does not authorize a new write. Material repricing, quantity, account, or leg changes require reconfirmation.
7. **Send once:** scope `ROBINHOOD_ALLOW_LIVE_WRITE=1` to the single command. Preserve the same
   `ref_id` when retrying after a 429; a new one can duplicate an order.
8. **Verify:** read equity and options order history. Report order ID, state, fills, average price,
   rejection/cancel reason, and any resulting position/cash change. Never translate `201` into "filled."
9. **Record:** append the execution and intent to the trading log through the shared engine where supported.

Example shape only—do not reuse without a fresh dry-run and exact approval:

```bash
# preview
robinhood-cli buy --symbol AAPL --account <ACCOUNT_NUMBER> --amount 25 --dry-run --json

# after exact approval, live for this process only
ROBINHOOD_ALLOW_LIVE_WRITE=1 \
  robinhood-cli buy --symbol AAPL --account <ACCOUNT_NUMBER> --amount 25 --json

# prove what happened
robinhood-cli orders open --account <ACCOUNT_NUMBER> --json
robinhood-cli history --account <ACCOUNT_NUMBER> --json
```

Cancels, recurring changes, watchlist edits/buys, DRIP/settings mutations, and crypto writes follow the
same lifecycle. Funding, transfers, ACH links, withdrawals, margin/account-type changes, and unverified
settings routes require a fresh route/body capture plus exact approval; a route-map entry alone does not
prove first-class support.

## High-value failure guards

- **Wrong account:** the largest risk. Explicit account on every operation; confirmation before writes.
- **Wrong HTTP method:** routes can share a URL. Raw writes always specify the method and must return a
  write-shaped result, not a list.
- **Wrong option contract:** bulk-enumerate the target expiration before quoting or ordering.
- **Ambiguous short option:** ask whether it is sell-to-close, covered/secured, spread, or naked.
- **Coverage/collateral:** verify 100 shares for each covered call and cash for each CSP in the same account.
- **Roll mode:** `auto` uses an atomic native two-leg roll for margin/IRA and staged T+1 "kosher" flow for
  cash. Never manually swap these models. Read [rolling](knowledge/rolling.md).
- **Option ticks:** read the chain's `min_ticks`; a syntactically valid price can still be invalid.
- **GTC option opens:** check overnight buying power, not only regular buying power.
- **OTC/non-fractional equity:** dollar-notional may be impossible; use supported whole-share limit flow.
- **Pending dedup/idempotency:** inspect open orders first. On 429, honor server timing and reuse `ref_id`.
- **Recurring `--all`:** pause targets active schedules; resume targets paused schedules. Report actual changes.
- **DRIP:** use verified PATCH routes, never infer a write from a GET-only enrollment route.
- **Watchlists:** reads require `owner_type=custom`; rename uses `display_name`.
- **Route-map edits:** runtime reads the built copy. Rebuild and verify after source changes.
- **Crypto:** official crypto trading uses API-key/Ed25519 signing, not the brokerage bearer token.
- **Sensitive output:** redact tokens, account identifiers, balances, document URLs, and private raw evidence.

The complete ranked checklist and error recovery rules live in
[execution-safety.md](knowledge/execution-safety.md) and
[the error-code reference](docs/error-code-reference-2026-06-11.md).

## MCP operating rules

MCP and CLI share the same engine and write gate. Use MCP for compact typed calls, but do not assume the
tool roster from prose: the connected server's `tools/list` is authoritative and profiles intentionally
expose different subsets. Start narrow and move to a broader profile only when the task needs it.

- Use `robinhood_accounts` before account-scoped tools.
- Prefer `robinhood_portfolio`, `robinhood_positions`, `robinhood_options_*`, and other typed tools over
  `robinhood_brokerage_execute`.
- Request filters, limits, and summaries first; retrieve full/raw payloads only when necessary.
- Reads run live. Writes remain dry-run without `ROBINHOOD_ALLOW_LIVE_WRITE=1` in the server environment.
- `dryRun:true` forces preview even on a write-enabled server.
- Reload/reconnect after changing the server build or profile, then inspect `tools/list` again.

Registration, profile selection, discovery troubleshooting, and tool-family routing live in
[MCP operations](knowledge/mcp-operations.md).

## Research and maintenance

When adding an undocumented route: capture authenticated evidence, redact secrets, classify risk
conservatively, add the route to the source map, rebuild, verify the built map, and document what was
found, exact reproduction steps/tools, why it matters, raw sanitized evidence, and reproducibility in
[undocumented-surface.md](docs/undocumented-surface.md). Never silently broaden a write classification.

For finance research, use live community signal (X/Reddit) as the fast pulse, Robinhood news/ratings/
earnings as the account-aware confirmer, and institutional/academic sources for slower validation.
Treat [Ball Knowledge](ball-knowledge.md) as operator context, not authority. Treat brokerage order
history—not the prose trading ledger—as execution truth. See [signals](knowledge/signals.md).

The section-by-section destination record for this router split is in the
[progressive-disclosure map](docs/skill-progressive-disclosure-2026-07-14.md).

## Verification checklist

- CLI and MCP builds complete.
- Preflight says auth is live.
- `accounts` returns the current complete account graph.
- A harmless quote and one account-scoped read succeed.
- `tools/list` reflects the intended MCP profile after reload.
- A write without the environment gate returns a dry-run/blocked plan.
- No live write is used merely to test the gate.
- `python3 scripts/check-skill-token-budget.py` passes.
- Every local Markdown link in this router resolves.

<!-- Zayd Khan // cold // www.zayd.wtf -->
