# rolls.md — pending kosher-roll ledger

<!-- Zayd Khan // cold // www.zayd.wtf -->

```
PURPOSE:  PENDING cash-account roll intents ONLY. A kosher roll is a TWO-DAY trade — close the old
          leg today, open the replacement next business day with SETTLED cash (T+1, no good-faith
          violation) — and agent sessions die between the legs. The staged intent lives here so the
          next session (CLI `roll-ledger list` or MCP robinhood_roll_ledger) picks the open leg
          back up instead of orphaning it.
LIFECYCLE: `roll-ledger add` (or `options roll-plan --cash-account`'s tip command) appends an entry;
          `roll-ledger done <symbol>` REMOVES it once the open leg fills or the plan is dropped and
          logs the completion to trading-log.md. Completed/cancelled entries do NOT accumulate —
          the completing command cleans them out; this file stays small and current.
RULES:    Check at session start. rolls.md is intent bookkeeping, NOT execution evidence — brokerage
          order history (orders/, options/orders/) remains the only proof either leg executed.
```

Entry format (parser contract — keep it exact):

### PENDING | SYMBOL | opened YYYY-MM-DD
- closed leg: <contract, qty, sold/bought @ $X.XX, order-id>
- intended open leg: <expiration/strike/type, target price or 'fresh quote Monday'>
- earliest open date: <YYYY-MM-DD — next business day after the close>
- account: …<last4>
- notes: <anything the next session should know>

### PENDING | F | opened 2026-06-10 (EXAMPLE)
- closed leg: 1x F $11 put 2026-06-12, bought-to-close @ $0.18, order-id n/a
- intended open leg: F $11 put 2026-06-19 sell-to-open, fresh quote Monday
- earliest open date: 2026-06-11
- account: …0000
- notes: example entry — the parser ignores anything marked EXAMPLE in the header; copy the shape, not the trade
