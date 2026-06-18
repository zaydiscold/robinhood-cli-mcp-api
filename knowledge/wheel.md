# The Wheel — operational module

> **When to load this:** the user mentions the Wheel, cash-secured puts, "I got assigned — now
> what?", covered calls as an income loop, or asks "where am I in the wheel?". This module is the
> operational layer: stages, the repo's `wheel` command, and the exact dry-run command per leg.
> Background math and sentiment live in the deep-dive (linked at the bottom). Descriptive, not
> prescriptive — risk and sizing are the operator's call.

## The loop

A continuous short-premium income loop on a single underlying the operator is willing to own.
Two single-leg short credit positions joined by share assignment:

```
 (flat)                                  (own 100 sh/contract)
  Sell CSP  ──assigned at Kp──►  Sell Covered Call
  (short put) ◄──called away at Kc──  (short call)
   └ expires/BTC → keep credit, resell    └ expires/BTC → keep credit, resell
```

- **CSP assigned →** you buy 100 sh/contract at `Kp`; **effective basis = Kp − put_credit**.
- **CC assigned →** shares called away at `Kc`; **full-turn P&L = put_credit + call_credit + (Kc − Kp)**, all × 100.
- Most turns are the "expires worthless" sub-loop: keep the credit, resell the same leg.
- Both legs are +theta / −vega / short-gamma. The true max loss is **owning the stock to zero,
  less cumulative credits** — in dollars, that floor is `(Kp − credits) × 100` per contract.

## First-class tooling: `wheel` / `robinhood_wheel`

```bash
node cli/dist/index.js wheel                    # scan every wheel-relevant symbol, all accounts
node cli/dist/index.js wheel HPE --account <N>  # one symbol, one account
node cli/dist/index.js wheel --json
```

Read-only. It classifies the stage from **live account evidence** (shares + short puts + short
calls per account) and emits the **literal next-leg dry-run command**. MCP equivalent:
`robinhood_wheel`. With no position it runs in discussion mode.

### Stage classification (what the command returns)

| Stage | Evidence | Next leg the tool suggests |
|---|---|---|
| `not-started` | no shares, no wheel legs | sell a CSP (leg 1) — emits the `cash-secured-short-put` dry-run |
| `cash-secured-put-open` | short put(s), <100 shares | manage the put: expire → resell; assigned → leg 2; tested → `roll-plan` |
| `csp-plus-shares` | short put(s) AND ≥100 shares | manage the put; the shares can carry a CC in parallel |
| `shares-uncovered` | ≥100 shares, no short call | sell a covered call (leg 3) — strike at/above basis noted |
| `covered-call-open` | shares fully covering short call(s) | manage the call: expire → resell; assigned → restart at leg 1; tested → roll |
| `sub-100-shares` | 1–99 shares | not wheelable at this size; accumulate or start a fresh CSP |
| `short-call-undercovered` | short calls > shares/100 | **HAZARD — see below** |

### The undercovered-short-call hazard

If short calls exceed share coverage (contracts × 100 > shares held in the SAME account), that is
**not a wheel state** — it is naked/undercovered, undefined-risk exposure. The classifier flags it
as a blocker and refuses to suggest a next leg until the exposure is reviewed. Never normalize it.
Coverage is a hard pre-build check: 100 shares per contract, same account, verified before quoting.

## Account-type gating

| Account | Wheel fit | Constraint |
|---|---|---|
| `cash` | CSP + CC both fine | collateral must be **settled** cash; rolls are T+1 staged ("kosher roll", see `rolling.md`); good-faith violations if you open on unsettled proceeds |
| `margin` | full wheel + same-day rolls | GTC opens gated by **overnight** buying power, not regular BP |
| `ira_roth` | natural fit (premium untaxed) | CSP must be fully cash-secured, CC fully covered; no margin/naked; no tax-loss harvesting; cross-account wash vs a taxable account permanently disallows the taxable loss |

Read the account first (`accounts` / `robinhood_accounts`) and state the constraint before planning.

## Exact dry-run sequence per leg

Always enumerate the chain first — option UUIDs are random v4 and must be enumerated, never guessed:

```bash
node cli/dist/index.js options expirations <SYM> --json
node cli/dist/index.js options enumerate <SYM> --expiration <YYYY-MM-DD> --type put   # or call
```

**Leg 1 — CSP (entry, credit):**

```bash
node cli/dist/index.js options strategy-quote cash-secured-short-put \
  --account <N> --symbol <SYM> --expiration <YYYY-MM-DD> \
  --leg short_put=<STRIKE> --pricing-mode safe-sell-probe --json
```

Order body it fills: `direction: credit`, leg `{side: sell, position_effect: open, ratio_quantity: 1}`.
"Cash-secured" is **not** a body flag — it is a collateral fact (`strike × 100 × n` settled cash,
checked against `bonfire.../currency_buying_power/USD/`). Same legs as a naked put; only the
collateral check distinguishes them.

**Leg 2 — assignment:** a clearing event, no order. Verify it in order history / positions, then
log the new basis (`Kp − credit`) to `trading-log.md` with the wheel THREAD.

**Leg 3 — Covered call (credit):**

```bash
node cli/dist/index.js options strategy-quote covered-call \
  --account <N> --symbol <SYM> --expiration <YYYY-MM-DD> \
  --leg short_call=<STRIKE> --pricing-mode safe-sell-probe --json
```

Coverage (100 sh/contract, same account) is a hard blocker the quote verifies. Discipline note the
tool surfaces: a strike **at/above basis** keeps an assignment profitable in dollars; below basis
locks a loss if called.

**Tested leg — roll instead of close/assign:**

```bash
node cli/dist/index.js options roll-plan --account <N> --symbol <SYM> --type put \
  --close-expiration <OLD_D> --close-strike <OLD_K> \
  --open-expiration <NEW_D> --open-strike <NEW_K> [--cash-account] --json
```

`--cash-account` stages the open to the next business day (settled cash). Full roll mechanics in
`knowledge/rolling.md`.

All of the above are dry-run; a live send additionally needs
`ROBINHOOD_ALLOW_LIVE_WRITE=1` (the single master switch) and the confirmation contract (`knowledge/playbooks/broker-call.md`).

## Management levers (community-cited; levers with tradeoffs, NOT mandates)

- **Delta ≈ 0.15–0.30** on the short leg: the dial between income mode (lower) and acquisition mode (higher). ~0.30 delta ≈ roughly 30% assignment odds (delta slightly understates true prob; see `greeks.md`).
- **30–45 DTE** entry; **close at 50–75% of max profit and/or at 21 DTE** to exit the high-gamma final weeks.
- **Roll vs assignment vs close** at a tested short: roll down-and-out for a **net credit** to defer and lower basis; take assignment if the shares are wanted; close if the willingness-to-own thesis broke.
- Compare candidates by **annualized return on committed collateral in dollars**, not raw credit or percent moves. A put-credit-spread is more capital-efficient but cannot be assigned into shares — it is not a Wheel entry.

## Failure modes (condensed)

1. **Falling stock after assignment** — the signature failure; the CC premium after a drop is a thin cushion, not a hedge.
2. **Capped upside** — called away below market; structural cost of the strategy.
3. **Ex-dividend early assignment** — ITM short call with extrinsic < dividend gets assigned the night before ex-div; check the calendar before holding/rolling an ITM CC.
4. **Illiquid strikes / low IV entries** — wide spreads and thin credit for the same assignment risk.
5. **Wheeling a name you wouldn't own** — converts the loop into naked-put speculation with a benign label.
6. **Cash-account settlement traps** — same-day roll on unsettled cash = good-faith violation; use `--cash-account` staging.
7. **Wash sale** — selling shares at a loss then writing a new CSP on the same name within 30 days can disallow the loss (see `tax.md`).

Log every leg to `trading-log.md` with the wheel THREAD (CSP → assignment → CC → roll) so the next
decision knows what it is rolling from.

## Deep dives

- `docs/strategy-deep-dive-the-wheel-2026-06-04.md` — full study: Greeks by leg, quant decision rules, VRP math appendix, tax, practitioner sentiment, failure modes.
- `docs/options-strategies-knowledge-base-2026-06-03.md` — the Wheel in the full strategy menu.
- `docs/tax-aware-options-strategies.md` — wash sale, QCC taint, IRA angles.
- `knowledge/rolling.md` — defending tested legs; `knowledge/tax.md` — the tax edges.
- `knowledge/position-building.md` — not wheelable yet (sub-100 shares, thin cash)? The accumulation / CSP-entry / PMCC paths to get there.
