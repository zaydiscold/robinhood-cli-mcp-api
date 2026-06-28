# Rolling options — operational module

> **When to load this:** the user says "roll", "roll out/up/down", "defend my CSP/CC", "my short
> is tested", or any close-one-leg-open-another request — especially on a **cash account**, where
> the kosher roll (T+1 staging) is mandatory. This module gives the variants, the net-credit math,
> the exact `options roll-plan` invocations, and the tax flags to surface. Descriptive, not
> prescriptive — whether a roll is worth taking is the operator's call.

## What a roll is

A roll is **not a primitive** — it is *close the existing leg + open a replacement* on the same
underlying. Close a short = buy-to-close (`side: buy, position_effect: close`); close a long =
sell-to-close. Then mirror-open the new leg (`position_effect: open`).

| Variant | Strike | Expiry | Canonical use |
|---|---|---|---|
| Roll **out** | same | later | buy time/theta; defend a tested short |
| Roll **up** | higher | same | short call: raise the cap as stock rises |
| Roll **down** | lower | same | short put: cut assignment risk |
| Roll **up-and-out** | higher | later | CC defense — let a winner run, still net credit |
| Roll **down-and-out** | lower | later | CSP defense — the Wheel's core income move |

**Net math (repo engine):** `net = closeContribution + openContribution`, each leg contributing
`+limit` if selling, `−limit` if buying; `direction = net >= 0 ? "credit" : "debit"`.
**Net credit** = paid to extend (never adds capital at risk to stay open). **Net debit** = paying
to delay — a flag, not a forbidden move (see "when rolling is the wrong move").

## ATOMIC native roll (the DEFAULT) vs the KOSHER ROLL (cash only)

`roll-plan` is **account-type-aware** (`--mode auto`, the default). It detects the account class and
picks the model — **do not** default everything to kosher (that was a bug, fixed 2026-06-23).

**Margin / IRA → ATOMIC native roll (default).** One `options/orders/` order with TWO legs — exactly
what the real "Roll this position" button POSTs: `legs[0]`=`{side:sell,position_effect:close}` on the
held contract, `legs[1]`=`{side:buy,position_effect:open}` on the new one, ONE **net** `direction`,
ONE **net** `price`, `form_source:"strategy_roll"`. `roll-plan` emits this as **`rollOrder`** — the ONE
body to send; the `closeOrder`/`openOrder` it also prints are informational only.

```bash
node cli/dist/index.js options roll-plan --account <N> --symbol <SYM> --type call \
  --close-expiration <OLD_D> --close-strike <OLD_K> \
  --open-expiration <NEW_D> --open-strike <NEW_K> \
  --close-pricing-mode mid --open-pricing-mode mid --json   # → rollOrder (strategy_roll)
```

**Cash account → KOSHER roll (mandatory, auto-selected).** Options proceeds settle **T+1**. Funding a
same-day open on unsettled cash = **good-faith violation** (3/yr → 90-day settled-only restriction). The
model is: **close today → settle overnight → open next business day**, the open re-quoted and re-gated as
a fresh task. `auto` selects this when the account is cash; force it anywhere with `--mode kosher`
(or `--cash-account`). The open carries `notBeforeDate = next business day` + `requiresFreshChecks`
(settled cash/BP after the close, fresh bid/ask/Greeks, same account/symbol/expiration/strike), and a
`roll-ledger` tip so the staged open survives a session gap.

**Net pricing (both modes):** the net uses the per-leg pricing modes. Default close `safe-sell-probe`
makes the net an intentionally un-fillable probe — pass `--close-pricing-mode mid --open-pricing-mode
mid` for a realistic sendable net. The dry-run net is not a fill estimate; requote before any live order.

**Known gap:** `nextBusinessDay()` skips weekends but **not market holidays** — sanity-check the staged
`notBeforeDate` against the exchange calendar.

**Evidence rule:** for a KOSHER roll, confirm the close **filled** in order history (`options/orders/` —
the only proof, failure mode #20) before relying on the open. An ATOMIC roll is one order: it fills or it
doesn't, atomically.

**Native roll surface (no page-load needed):** `options/maximum_rollable_quantity/{option_id}_L1/` →
`options/orders/collateral/?order={json}` → `bonfire:options/orders/review` → `options/orders/`. Full
captured body + field notes: `docs/native-option-roll-surface-2026-06-23.md`.

## Rolling CSPs and CCs for credit

- **CC tested (stock rallied):** roll **up-and-out** — the extra expiration's extrinsic funds the
  higher strike while still clearing a net credit, avoiding a call-away below market.
- **CSP tested (stock fell):** roll **down-and-out** — defer/avoid assignment and lower the
  eventual basis. Track **cumulative credit across the whole roll chain**, not just this roll:
  assigned-basis = new_strike − total_net_credit_collected.
- **Greeks delta of a roll out (ATM scaling):** per-day theta shrinks (~`sqrt(T1/T2)`), vega grows
  (~`sqrt(T2/T1)` — more short-vega exposure), gamma shrinks (you step out of the high-gamma
  terminal zone). Surface these alongside the net.
- **Calendar-roll via strategy-quote** (long-leg or same-strike duration rolls):

```bash
node cli/dist/index.js options strategy-quote call-calendar-roll --account <N> --symbol <SYM> \
  --expiration <OLD_D> --leg close_call=<OLD_K> --leg open_call=<NEW_K> \
  --param close_call_expiration=<OLD_D> --param open_call_expiration=<NEW_D> \
  --pricing-mode mid --json
```

(`put-calendar-roll` mirrors it with `close_put` / `open_put`.)

## Assignment and ex-dividend awareness

An **ITM short call with extrinsic value < the upcoming dividend** is a prime early-assignment
candidate **the night before ex-div** — the shares are called away before the planned roll
executes, voiding the roll. Check the ex-div calendar against any ITM short call you plan to
roll; roll *before* ex-div to keep shares. (Index options SPX/XSP/NDX/RUT/VIX are European-style
and immune.)

## Tax flags to surface (taxable accounts; details in `knowledge/tax.md`)

- **Wash sale on the LOSING leg** — the central trap: buy-to-close at a loss + re-open a
  substantially identical option within the 61-day window disallows the loss (IRC §1091).
  Consensus read: danger zone is rolling a loser at the **same strike + near expiration**;
  changing strike or expiration generally helps, but there is **no IRS bright line** — flag it,
  don't adjudicate it. Only the losing leg matters; winning rolls have no wash issue. Disallowed
  loss is deferred into the new leg's basis, not destroyed.
- **Short-option rolls are always short-term** (§1233) — premium cannot be aged into LTCG.
- **QCC taint:** rolling a CC **up** to chase can push it ITM/deep-ITM → suspends/resets the
  *stock's* LTCG clock; a re-written call with ≤30 days of life fails the QCC >30-day test.
- **§1256 escape hatch:** rolling SPX/XSP/NDX/RUT/VIX legs is materially cleaner — 60/40 on every
  closed leg regardless of holding period, and **no wash-sale rule at all** (marked-to-market).
- **IRA:** no in-account wash/holding-period consequence (and no harvesting); the live risk is the
  cross-account trap — a substantially identical re-open in the IRA **permanently** disallows a
  taxable-account loss. IRAs can't roll on margin/naked.

## When rolling is the wrong move (surface, don't decide)

1. **Rolling for a debit to avoid realizing a loss** — converts a closed loss into a bigger open
   one plus more time at risk (#1 ranked failure mode).
2. **Chasing a runaway short** — each successive roll yields a shrinking credit, then a forced
   debit; the credit chain is bounded while the adverse move is not.
3. **Credit only available far out (90–120+ days)** — the market is pricing real downside and the
   collateral is trapped; the practitioner stop-rule. Surface the net, the change in capital at
   risk, and whether the strike move keeps pace — then do what the operator asks.
4. **Perpetual rolling masking a dead thesis** — each roll must be re-justified fresh.

Log every roll to `trading-log.md` with the THREAD (what you're rolling *from*: prior leg, strike,
DTE, cumulative credit in dollars).

## Deep dives

- `docs/strategy-deep-dive-rolling-options-2026-06-04.md` — variants, decision rules, the full quantitative anatomy (extrinsic sqrt-T law, roll-vs-close EV inequality, break-even tenor).
- `docs/tax-aware-options-strategies.md` — wash sale, QCC, §1256 in depth.
- `docs/options-strategy-order-templates-2026-06-03.md` — closing/inverting legs on multi-leg rolls.
- `knowledge/wheel.md` — the wheel context most rolls live in; `knowledge/tax.md` — the tax edges.
