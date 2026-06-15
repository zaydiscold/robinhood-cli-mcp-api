# Accounts — types, selection, buying power

> **When to load this:** before ANY account-scoped operation — reads that must hit the right
> account, writes of any kind, capability questions ("can my IRA do spreads?"), or buying-power
> sizing. Wrong account is the #1 money-loss risk in this tool; this module is the discipline
> that removes it.

## Capability gating by account type

Read `account.type` / `brokerage_account_type` first and **state what the account can and cannot
do before planning a write** (the first-class `accounts` command annotates this):

| Account type | Can | Cannot / caution |
|---|---|---|
| `cash` | buy/sell, cash-secured puts, covered calls, debit spreads | no margin borrowing, no naked/undefined-risk shorts; margin-style rolls won't work (use the kosher roll — `knowledge/rolling.md`); T+1 settlement; good-faith violations on unsettled-cash opens |
| `margin` (individual) | all of the above + margin, same-day rolls, spreads needing BP | **PDT lifted on RH — no $25k day-trade cap** (FINRA Reg Notice 26-10, eff. 2026-06-04; dynamic intraday margin, standard $2,000 margin minimum); maintenance margin still applies |
| `ira_roth` | long options, defined-risk spreads, covered calls, CSPs | no margin, no naked shorts; no tax-loss harvesting (`knowledge/tax.md`) |

When a requested action is impossible for the account type, **say so and stop** — e.g. "this is a
cash account; it can't roll on margin; rolling here is close-now / open-next-business-day with
settled cash."

## Discovery: `transfer/accounts/` is the only complete graph

The bare `accounts/` endpoint **under-reports** — in a live session it showed ~2 of the 5 trading
accounts. The complete list (numbers, types, deposit/recurring eligibility, labels) comes only
from:

```bash
node cli/dist/index.js accounts --json        # first-class, capability-annotated (preferred)
node cli/dist/index.js brokerage execute "bonfire.robinhood.com/transfer/accounts/" --json --full
# MCP: robinhood_accounts
```

Notes from the live graph: funding-only accounts (`ach`/`dcf`) are NOT trading accounts;
"Agentic"-nicknamed accounts are ordinary accounts that may sit near $0 — **a nickname implies
nothing about funding or priority**. Read buying power to find the funded accounts. **Never
hardcode account numbers; never assume which is "primary."** Writes work against any owned
account by number — under-reporting doesn't block you, it hides options and lets you act on a
default you didn't choose.

## `?account_number=` — the universal selector

Almost every Robinhood surface is account-scoped, and the bare endpoints + web UI default to the
*individual* account, not the one you intend.

- Web URLs: append `?account_number=<ACCT>` (verified to force per-account settings pages).
- API routes: pass the `{account_number}` path/param segment. The route resolver is alias-aware
  (legacy `{num}`/`{account}` still substitute) — prefer `{account_number}` in new work.
- `/accounts/` (no id) = all accounts (incompletely); `/accounts/{account_number}/` or
  `?account_number=` = one account. Per-account fallback reads:
  `accounts/{account_number}/`, `portfolios/{account_number}/`,
  `positions/?account_number={account_number}&nonzero=true`.
- Per-account `portfolios/{account_number}/` quirk: `equity_previous_close` is "0" — use
  **`adjusted_equity_previous_close`** (the `portfolio` command already does).
- **Before any write, echo the resolved `account_number` + nickname** and confirm it is the
  intended account (full echo contract in `knowledge/execution-safety.md`).

## Buying power is NOT one number

The headline balance is a mirage. On a **margin account, `cash` can be negative — that is the
margin loan**, `equity` is net liquidation value, and the spendable figure is a small
buying-power number that splits by purpose. On a margin account `equity` is the net liquidation
value, `cash` can be **negative** (the margin loan), and the actual `buying_power` is typically a
small fraction of either — read it live with `portfolio` / `margin`; never infer it from the headline.

Read the family before sizing any order:

```bash
node cli/dist/index.js buying-power --account <N>      # first-class breakdown + margin health
# Raw pathway:
#   accounts/{acct}/                 -> buying_power + margin_balances:
#       day_trade_buying_power       (intraday)
#       overnight_buying_power       (GATES GTC option opens held overnight)
#       cash_held_for_options_collateral  (locked behind short puts/CSPs)
#   bonfire.../accounts/{acct}/currency_buying_power/USD/  (canonical spendable USD)
#   portfolios/{acct}/               -> equity, market_value, withdrawable_amount,
#       excess_margin (negative = can't open more on margin), excess_maintenance (margin-call cushion)
```

Rules that follow:

- **GTC option opens are gated by OVERNIGHT buying power**, not regular BP — a GTC buy-to-open
  can 400 "not enough overnight buying power" while regular BP looks fine. Predict it; don't
  discover it from the reject.
- Sells/closes need no buying power (you're delivering, not paying).
- Before a live options order, state **which** buying-power figure gates the order, in dollars.
- Covered call needs 100 shares in the SAME account; CSP needs the settled cash — verify before
  building, not after a reject.

## PDT and settlement, current state

- **PDT is lifted on Robinhood:** FINRA eliminated the PDT designation, the day-trade count, and
  the $25k minimum (Reg Notice 26-10, effective 2026-06-04) and RH implemented it — margin
  accounts day-trade freely within dynamic intraday margin. (Buys alone never counted; only round
  trips did.) Legacy PDT-protection toggles/fields may still appear in settings/API responses.
- **Cash accounts unchanged:** PDT never applied, but **T+1 settlement** and **good-faith
  violations** still do — selling/spending unsettled funds can flag it (3/yr → 90-day
  settled-only restriction).

## Deep dives

- `docs/agent-operating-intelligence-2026-06-04.md` §2 — the account model, wrong-account trap, and the live buying-power walkthrough.
- `SKILL.md` — "Account-Aware Capabilities", "`?account_number=` universal selector", failure modes #1/#9/#16.
- `TODO.md` (carried-over notes) — margin/settings endpoints pending live verification; the masked portfolio snapshot.
- `knowledge/execution-safety.md` — the account-echo contract before any send.
